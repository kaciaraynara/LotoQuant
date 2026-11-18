from datetime import date
from typing import List, Optional
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.modalities import MODALITIES, get_frame_numbers
from app.models.lottery import DailyCalibration, DrawResult
from app.models.user import User, DailyPick, PlanTier, PLAN_LIMITS
from app.api.deps import get_current_user, check_generation_quota
from app.engine.vectorized_gen import VectorizedGenerator
from app.engine.covering_matrices import CoveringMatrixEngine
from app.engine.syndicate_math import SyndicateMathEngine
from app.services.daily_pipeline import DailyPipelineService

router = APIRouter(prefix="/engine", tags=["Motor Estatístico & Gerador"])


class GenerateRequest(BaseModel):
    modality: str
    quantity: int = Field(default=3, ge=1, le=30)
    bet_size: Optional[int] = None
    fixed_numbers: Optional[List[int]] = None
    excluded_numbers: Optional[List[int]] = None


class ClosingRequest(BaseModel):
    modality: str
    selected_numbers: List[int]
    guarantee_hits: int
    condition_hits: int
    max_tickets: int = Field(default=15, ge=2, le=50)


class BacktestRequest(BaseModel):
    modality: str
    numbers: List[int]


class SyndicateEvalRequest(BaseModel):
    modality: str
    estimated_jackpot: float = 5000000.0
    ticket_cost: float = 3.0
    bankroll: float = 500.0
    antipopularity_pct: float = 85.0


class PostDrawAuditRequest(BaseModel):
    modality: str
    bet_numbers: List[int]
    target_contest: Optional[int] = None
    apply_learning: bool = False


class BatchBetItem(BaseModel):
    id: str
    modality: str
    numbers: List[int]
    target_contest: Optional[int] = None


class AutoBatchCheckRequest(BaseModel):
    bets: List[BatchBetItem]
    auto_train: bool = True


def _recalibrate_modality_weights(db: Session, modality: str) -> bool:
    if modality not in MODALITIES:
        return False
    spec = MODALITIES[modality]
    cal = db.execute(select(DailyCalibration).where(DailyCalibration.modality == modality)).scalar_one_or_none()
    recent_rows = db.execute(
        select(DrawResult.numbers)
        .where(DrawResult.modality == modality)
        .order_by(DrawResult.contest_number.desc())
        .limit(25)
    ).scalars().all()

    if not cal or len(recent_rows) < 5:
        return False

    recent_draws = list(reversed(recent_rows))
    weights = dict(cal.number_weights or {})
    universe = range(spec.min_number, spec.max_number + 1)
    last_3 = set(n for d in recent_draws[-3:] for n in d)
    last_draw = set(recent_draws[-1])

    for n in universe:
        freq_25 = sum(1 for d in recent_draws if n in d) / len(recent_draws)
        streak = 0
        for d in reversed(recent_draws):
            if n in d:
                streak += 1
            else:
                break
        delay = 0
        for d in reversed(recent_draws):
            if n not in d:
                delay += 1
            else:
                break

        # Impulso extra para vizinhos (+-1) das dezenas que saíram no último concurso (rotação de globo)
        neighbor_boost = 0.08 if ((n - 1 in last_draw) or (n + 1 in last_draw)) and (n not in last_draw) else 0.0

        score = (0.45 * freq_25) + (0.30 * min(delay / 5.0, 1.0)) + (0.17 if n in last_3 else 0.0) + neighbor_boost
        if streak >= 4:
            score *= 0.70
        weights[str(n)] = round(float(np.clip(score, 0.15, 0.96)), 4)

    sums = [sum(d) for d in recent_draws[-15:]]
    evens = [sum(1 for x in d if x % 2 == 0) for d in recent_draws[-15:]]
    repeats = [len(set(recent_draws[i]) & set(recent_draws[i - 1])) for i in range(1, len(recent_draws))]

    new_thresh = dict(cal.thresholds or {})
    new_thresh["sum"] = [int(np.percentile(sums, 20)), int(np.percentile(sums, 80))]
    new_thresh["even"] = [int(np.percentile(evens, 20)), int(np.percentile(evens, 80))]
    if repeats:
        new_thresh["repeat"] = [int(np.percentile(repeats, 20)), int(np.percentile(repeats, 80))]
    new_thresh["last_draw"] = recent_draws[-1]

    cal.number_weights = weights
    cal.thresholds = new_thresh
    db.commit()
    return True


def _evaluate_single_audit(db: Session, modality: str, bet_numbers: List[int], target_contest: Optional[int] = None):
    spec = MODALITIES[modality]
    latest_row = db.execute(
        select(DrawResult)
        .where(DrawResult.modality == modality)
        .order_by(DrawResult.contest_number.desc())
        .limit(1)
    ).scalar_one_or_none()

    if not latest_row:
        return None

    # Se o concurso-alvo do bilhete ainda não aconteceu na Caixa, não marca 0 acerto falso
    if target_contest and target_contest > latest_row.contest_number:
        return {
            "status": "PENDING",
            "contest_number": target_contest,
            "draw_date": "Aguardando sorteio oficial",
            "drawn_numbers": [],
            "bet_numbers": sorted(bet_numbers),
            "hits_count": 0,
            "is_winner": False,
            "hits": [],
            "missed_bet": [],
            "missed_drawn": [],
            "near_misses": [],
            "comparison": {"bet_sum": sum(bet_numbers), "drawn_sum": 0, "bet_even": 0, "drawn_even": 0},
            "diagnostics": [f"Aguardando a Caixa sortear o Concurso #{target_contest} (último oficial: #{latest_row.contest_number})."],
        }

    draw_row = None
    if target_contest:
        draw_row = db.execute(
            select(DrawResult).where(
                DrawResult.modality == modality,
                DrawResult.contest_number == target_contest,
            )
        ).scalar_one_or_none()

    if not draw_row:
        draw_row = latest_row

    prev_draw_row = db.execute(
        select(DrawResult)
        .where(
            DrawResult.modality == modality,
            DrawResult.contest_number < draw_row.contest_number,
        )
        .order_by(DrawResult.contest_number.desc())
        .limit(1)
    ).scalar_one_or_none()

    drawn = sorted(draw_row.numbers)
    bet = sorted(bet_numbers)
    drawn_set = set(drawn)
    bet_set = set(bet)

    hits = sorted(list(bet_set & drawn_set))
    missed_bet = sorted(list(bet_set - drawn_set))
    missed_drawn = sorted(list(drawn_set - bet_set))
    near_misses = sorted([b for b in missed_bet if (b - 1 in missed_drawn) or (b + 1 in missed_drawn)])

    min_prize = {
        "lotofacil": 11, "megasena": 4, "quina": 2, "lotomania": 15,
        "diadesorte": 4, "timemania": 3, "duplasena": 3, "maismilionaria": 2, "supersete": 3,
    }.get(modality, 4)

    is_winner = len(hits) >= min_prize
    frame_set = get_frame_numbers(spec)

    # Escala proporcional (ex: Lotomania marca 50 e sorteia 20 -> divide por 2.5 para comparar justo)
    scale = len(bet) / max(len(drawn), 1)
    bet_sum_norm = round(sum(bet) / scale)
    drawn_sum = sum(drawn)
    bet_even_norm = round(sum(1 for n in bet if n % 2 == 0) / scale)
    drawn_even = sum(1 for n in drawn if n % 2 == 0)
    bet_frame_norm = round(len(bet_set & frame_set) / scale)
    drawn_frame = len(drawn_set & frame_set)

    bet_rep = round(len(bet_set & set(prev_draw_row.numbers)) / scale) if prev_draw_row else 0
    drawn_rep = len(drawn_set & set(prev_draw_row.numbers)) if prev_draw_row else 0

    diagnostics = []
    if is_winner:
        diagnostics.append(f"BILHETE PREMIADO! Você fez {len(hits)} acertos no concurso #{draw_row.contest_number}.")
    else:
        missing_to_prize = min_prize - len(hits)
        diagnostics.append(f"Faltaram {missing_to_prize} ponto(s) para premiação mínima ({min_prize} pts).")

    if abs(bet_sum_norm - drawn_sum) > 22:
        direction = "mais alta" if drawn_sum > bet_sum_norm else "mais baixa"
        diagnostics.append(f"Soma proporcional do sorteio ({drawn_sum}) veio {direction} que a aposta ({bet_sum_norm}).")
    if abs(bet_even_norm - drawn_even) >= 2:
        diagnostics.append(f"Pares proporcionais: aposta tinha {bet_even_norm}, sorteio trouxe {drawn_even}.")
    if near_misses:
        diagnostics.append(f"Passaram raspando por 1 número: {', '.join(f'{n:02d}' for n in near_misses)}.")
    if missed_drawn and len(missed_drawn) <= 15:
        diagnostics.append(f"Bolas sorteadas que ficaram de fora: {', '.join(f'{n:02d}' for n in missed_drawn)}.")

    return {
        "status": "AUDITED",
        "contest_number": draw_row.contest_number,
        "draw_date": str(draw_row.draw_date),
        "drawn_numbers": drawn,
        "bet_numbers": bet,
        "hits_count": len(hits),
        "is_winner": is_winner,
        "hits": hits,
        "missed_bet": missed_bet,
        "missed_drawn": missed_drawn,
        "near_misses": near_misses,
        "comparison": {
            "bet_sum": bet_sum_norm,
            "drawn_sum": drawn_sum,
            "bet_even": bet_even_norm,
            "drawn_even": drawn_even,
            "bet_frame": bet_frame_norm,
            "drawn_frame": drawn_frame,
            "bet_repeat": bet_rep,
            "drawn_repeat": drawn_rep,
        },
        "diagnostics": diagnostics,
    }


@router.get("/modalities")
def list_modalities():
    return [
        {
            "slug": m.slug,
            "name": m.name,
            "min_number": m.min_number,
            "max_number": m.max_number,
            "default_bet_size": m.default_bet_size,
            "draw_days": m.draw_days,
        }
        for m in MODALITIES.values()
    ]


@router.get("/calibration/{modality}")
def get_calibration(modality: str, db: Session = Depends(get_db)):
    if modality not in MODALITIES:
        raise HTTPException(status_code=404, detail="Modalidade não encontrada.")
    cal = db.execute(select(DailyCalibration).where(DailyCalibration.modality == modality)).scalar_one_or_none()
    if not cal:
        raise HTTPException(status_code=404, detail="Calibração ainda não executada para esta modalidade.")

    last_draw_row = db.execute(
        select(DrawResult)
        .where(DrawResult.modality == modality)
        .order_by(DrawResult.contest_number.desc())
        .limit(1)
    ).scalar_one_or_none()

    draws = [
        r.numbers for r in db.execute(select(DrawResult.numbers).where(DrawResult.modality == modality)).all()
    ]
    chi2_report = SyndicateMathEngine(MODALITIES[modality], draws).audit_chi_square()

    return {
        "modality": cal.modality,
        "reference_contest": cal.reference_contest,
        "reference_date": str(last_draw_row.draw_date) if last_draw_row else None,
        "reference_numbers": last_draw_row.numbers if last_draw_row else cal.thresholds.get("last_draw", []),
        "source_status": "OFICIAL_CAIXA" if (last_draw_row and last_draw_row.extra_label != "BASE_CALIBRADA") else "MODELO_CALIBRADO",
        "calibrated_at": cal.calibrated_at,
        "thresholds": cal.thresholds,
        "number_weights": cal.number_weights,
        "chi2_audit": chi2_report,
    }


@router.post("/auto-check-batch")
def auto_check_batch(body: AutoBatchCheckRequest, db: Session = Depends(get_db)):
    results = {}
    trained_modalities = set()
    for item in body.bets:
        if item.modality not in MODALITIES:
            continue
        rep = _evaluate_single_audit(db, item.modality, item.numbers, item.target_contest)
        if rep:
            if body.auto_train and rep.get("status") == "AUDITED" and item.modality not in trained_modalities:
                if _recalibrate_modality_weights(db, item.modality):
                    trained_modalities.add(item.modality)
            rep["trained"] = item.modality in trained_modalities
            results[item.id] = rep
    return {"results": results, "trained_modalities": list(trained_modalities)}


@router.post("/post-draw-audit")
def post_draw_audit(body: PostDrawAuditRequest, db: Session = Depends(get_db)):
    if body.modality not in MODALITIES:
        raise HTTPException(status_code=404, detail="Modalidade inválida.")

    rep = _evaluate_single_audit(db, body.modality, body.bet_numbers, body.target_contest)
    if not rep:
        raise HTTPException(status_code=404, detail="Nenhum resultado oficial sincronizado para conferir.")

    trained = _recalibrate_modality_weights(db, body.modality) if body.apply_learning else False
    rep["trained"] = trained
    return rep


@router.post("/syndicate-ev")
def evaluate_syndicate_ev(body: SyndicateEvalRequest):
    if body.modality not in MODALITIES:
        raise HTTPException(status_code=404, detail="Modalidade inválida.")
    engine = SyndicateMathEngine(MODALITIES[body.modality], [])
    return engine.evaluate_ev_and_kelly(
        estimated_jackpot=body.estimated_jackpot,
        ticket_cost=body.ticket_cost,
        bankroll=body.bankroll,
        antipopularity_pct=body.antipopularity_pct,
    )


@router.get("/daily-picks")
def get_daily_picks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    picks = db.execute(select(DailyPick).where(DailyPick.pick_date == date.today())).scalars().all()
    tier = PlanTier(user.plan_tier)
    response = []
    for p in picks:
        games_visible = p.games[:1] if tier == PlanTier.FREE else p.games
        response.append({
            "modality": p.modality,
            "target_contest": p.target_contest,
            "top_pool": p.top_pool[:10] if tier == PlanTier.FREE else p.top_pool,
            "games": games_visible,
        })
    return response


@router.post("/generate")
def generate_games(
    body: GenerateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.modality not in MODALITIES:
        raise HTTPException(status_code=404, detail="Modalidade inválida.")

    check_generation_quota(user, body.modality, body.quantity, db)

    cal = db.execute(select(DailyCalibration).where(DailyCalibration.modality == body.modality)).scalar_one_or_none()
    if not cal:
        raise HTTPException(status_code=400, detail="Base ainda não calibrada.")

    draws = [
        r.numbers for r in db.execute(select(DrawResult.numbers).where(DrawResult.modality == body.modality)).all()
    ]

    spec = MODALITIES[body.modality]
    gen = VectorizedGenerator(spec, cal.thresholds, cal.number_weights, draws)
    games = gen.generate(
        quantity=body.quantity,
        bet_size=body.bet_size,
        fixed_numbers=body.fixed_numbers,
        excluded_numbers=body.excluded_numbers,
    )

    user.daily_generations_used += body.quantity
    db.commit()

    return {
        "modality": body.modality,
        "reference_contest": cal.reference_contest + 1,
        "games": games,
    }


@router.post("/closing")
def generate_closing(
    body: ClosingRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tier = PlanTier(user.plan_tier)
    rules = PLAN_LIMITS[tier]
    if not rules["allow_closing"]:
        raise HTTPException(status_code=403, detail="Fechamentos combinatórios disponíveis apenas nos planos Pro e Elite.")
    if len(body.selected_numbers) > rules["max_closing_pool"]:
        raise HTTPException(status_code=403, detail=f"Seu plano permite fechamentos de até {rules['max_closing_pool']} dezenas.")

    cal = db.execute(select(DailyCalibration).where(DailyCalibration.modality == body.modality)).scalar_one_or_none()
    if not cal:
        raise HTTPException(status_code=400, detail="Base ainda não calibrada.")

    spec = MODALITIES[body.modality]
    engine = CoveringMatrixEngine(spec, cal.thresholds, cal.number_weights)
    return engine.build_closing(
        selected_numbers=body.selected_numbers,
        guarantee_hits=body.guarantee_hits,
        condition_hits=body.condition_hits,
        max_tickets=body.max_tickets,
    )


@router.post("/backtest")
def backtest_game(
    body: BacktestRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.modality not in MODALITIES:
        raise HTTPException(status_code=404, detail="Modalidade inválida.")
    pipeline = DailyPipelineService(db)
    return pipeline.backtest_game(body.modality, body.numbers)
