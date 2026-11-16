from datetime import date, datetime
from typing import Dict, List
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.modalities import MODALITIES, EngineType
from app.models.lottery import DrawResult, DailyCalibration
from app.models.user import DailyPick
from app.services.caixa_sync import CaixaSyncService
from app.engine.calibrator import DynamicCalibrator
from app.engine.vectorized_gen import VectorizedGenerator


class DailyPipelineService:
    def __init__(self, db: Session):
        self.db = db

    def run_full_daily_cycle(self, backfill: int = 120) -> Dict:
        """
        1. Sincroniza resultados oficiais
        2. Recalibra faixas P15-P85 e pesos das dezenas
        3. Gera os Palpites Calibrados do Dia para as loterias que correm hoje
        """
        sync_service = CaixaSyncService(self.db)
        synced = sync_service.sync_all(max_backfill=backfill)

        calibrator = DynamicCalibrator(self.db)
        calibrated = calibrator.calibrate_all()

        today = date.today()
        weekday = today.weekday()  # 0=Seg ... 6=Dom
        generated_today = []

        for slug, spec in MODALITIES.items():
            if weekday not in spec.draw_days:
                continue
            pick = self.generate_daily_pick_for_modality(slug, today)
            if pick:
                generated_today.append(slug)

        return {
            "date": str(today),
            "synced_new_draws": synced,
            "calibrated_modalities": calibrated,
            "daily_picks_generated": generated_today,
        }

    def generate_daily_pick_for_modality(self, slug: str, target_date: date) -> DailyPick | None:
        cal = self.db.execute(
            select(DailyCalibration).where(DailyCalibration.modality == slug)
        ).scalar_one_or_none()
        if not cal:
            return None

        spec = MODALITIES[slug]
        draws = [
            r.numbers for r in self.db.execute(
                select(DrawResult.numbers).where(DrawResult.modality == slug)
            ).all()
        ]

        gen = VectorizedGenerator(spec, cal.thresholds, cal.number_weights, draws)
        elite_games = gen.generate(quantity=5, pool_size=75_000)

        # Ranking das dezenas mais fortes do dia
        if spec.engine_type != EngineType.COLUMN_POSITIONAL:
            ranked_nums = [
                int(k) for k, _ in sorted(
                    ((k, v) for k, v in cal.number_weights.items() if not k.startswith("sec_")),
                    key=lambda item: item[1],
                    reverse=True,
                )
            ]
        else:
            ranked_nums = []

        existing = self.db.execute(
            select(DailyPick).where(DailyPick.modality == slug, DailyPick.pick_date == target_date)
        ).scalar_one_or_none()

        if existing:
            existing.target_contest = cal.reference_contest + 1
            existing.games = elite_games
            existing.top_pool = ranked_nums[:20]
            pick = existing
        else:
            pick = DailyPick(
                pick_date=target_date,
                modality=slug,
                target_contest=cal.reference_contest + 1,
                games=elite_games,
                top_pool=ranked_nums[:20],
            )
            self.db.add(pick)

        self.db.commit()
        self.db.refresh(pick)
        return pick

    def backtest_game(self, slug: str, numbers: List[int]) -> Dict:
        """Confere um volante contra todo o histórico armazenado no banco."""
        spec = MODALITIES[slug]
        rows = self.db.execute(
            select(DrawResult).where(DrawResult.modality == slug).order_by(DrawResult.contest_number.desc())
        ).scalars().all()

        hit_distribution: Dict[int, int] = {}
        recent_hits = []
        bet_set = set(numbers)

        for r in rows:
            if spec.engine_type == EngineType.COLUMN_POSITIONAL:
                hits = sum(1 for a, b in zip(numbers, r.numbers) if a == b)
            else:
                hits = len(bet_set & set(r.numbers))

            hit_distribution[hits] = hit_distribution.get(hits, 0) + 1
            if len(recent_hits) < 10 and hits >= max(3, spec.drawn_count - 4):
                recent_hits.append({
                    "contest": r.contest_number,
                    "date": str(r.draw_date),
                    "hits": hits,
                })

        return {
            "modality": slug,
            "total_contests_checked": len(rows),
            "hit_distribution": dict(sorted(hit_distribution.items(), reverse=True)),
            "notable_matches": recent_hits,
        }
