from datetime import date
from typing import List, Optional
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


@router.post("/post-draw-audit")
def post_draw_audit(body: PostDrawAuditRequest, db: Session = Depends(get_db)):
    if body.modality not in MODALITIES:
        raise HTTPException(status_code=404, detail="Modalidade inválida.")

    spec = MODALITIES[body.modality]
    draw_row = None
    if body.target_contest:
        draw_row = db.execute(
            select(DrawResult).where(
                DrawResult.modality == body.modality,
                DrawResult.contest_number == body.target_contest,
            )
        ).scalar_one_or_none()

    if not draw_row:
        draw_row = db.execute(
            select(DrawResult)
            .where(DrawResult.modality == body.modality)
            .order_by(DrawResult.contest_number.desc())
            .limit(1)
        ).scalar_one_or_none()

    if not draw_row:
        raise HTTPException(status_code=404, detail="Nenhum resultado oficial sincronizado para conferir.")

    drawn = sorted(draw_row.numbers)
    bet = sorted(body.bet_numbers)
    drawn_set = set(drawn)
    bet_set = set(bet)

    hits = sorted(list(bet_set & drawn_set))
    missed_bet = sorted(list(bet_set - drawn_set))
    missed_drawn = sorted(list(drawn_set - bet_set))

    # Dezenas que passaram raspando (+1 ou -1 de diferença)
    near_misses = sorted([
        b for b in missed_bet
        if (b - 1 in missed_drawn) or (b + 1 in missed_drawn)
    ])

    frame_set = get_frame_numbers(spec)
    bet_sum, drawn_sum = sum(bet), sum(drawn)
    bet_even = sum(1 for n in bet if n % 2 == 0)
    drawn_even = sum(1 for n in drawn if n % 2 == 0)
    bet_frame = len(bet_set & frame_set)
    drawn_frame = len(drawn_set & frame_set)

    diagnostics = []
    if abs(bet_sum - drawn_sum) > 25:
        direction = "mais alto" if drawn_sum > bet_sum else "mais baixo"
        diagnostics.append(f"Soma do sorteio ({drawn_sum}) veio {direction} que a aposta ({bet_sum}).")
    if abs(bet_even - drawn_even) >= 2:
        diagnostics.append(f"Equilíbrio de pares: aposta tinha {bet_even} pares, mas saíram {drawn_even}.")
    if abs(bet_frame - drawn_frame) >= 2:
        diagnostics.append(f"Moldura: aposta marcou {bet_frame} na borda, sorteio trouxe {drawn_frame}.")
    if len(near_misses) >= 3:
        diagnostics.append(f"{len(near_misses)} dezenas passaram raspando por 1 número ({', '.join(f'{n:02d}' for n in near_misses)}).")
    if not diagnostics:
        diagnostics.append("Estrutura do jogo muito bem alinhada ao comportamento real do sorteio.")

    # Treinamento adaptativo: reforça dezenas sorteadas que ficaram de fora e suaviza peso das que falharam
    trained = False
    if body.apply_learning:
        cal = db.execute(select(DailyCalibration).where(DailyCalibration.modality == body.modality)).scalar_one_or_none()
        if cal and cal.number_weights:
            weights = dict(cal.number_weights)
            for n in missed_drawn:
                key = str(n)
                weights[key] = round(min(0.98, float(weights.get(key, 0.5)) + 0.08), 4)
            for n in missed_bet:
                key = str(n)
                weights[key] = round(max(0.12, float(weights.get(key, 0.5)) - 0.05), 4)
            cal.number_weights = weights
            db.commit()
            trained = True

    return {
        "contest_number": draw_row.contest_number,
        "draw_date": str(draw_row.draw_date),
        "drawn_numbers": drawn,
        "bet_numbers": bet,
        "hits_count": len(hits),
        "hits": hits,
        "missed_bet": missed_bet,
        "missed_drawn": missed_drawn,
        "near_misses": near_misses,
        "comparison": {
            "bet_sum": bet_sum,
            "drawn_sum": drawn_sum,
            "bet_even": bet_even,
            "drawn_even": drawn_even,
            "bet_frame": bet_frame,
            "drawn_frame": drawn_frame,
        },
        "diagnostics": diagnostics,
        "trained": trained,
    }


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
