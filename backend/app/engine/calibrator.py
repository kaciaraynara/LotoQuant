from datetime import datetime
from typing import Dict, List, Tuple
import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.modalities import MODALITIES, ModalitySpec, EngineType, get_frame_numbers
from app.models.lottery import DrawResult, DailyCalibration
from app.engine.signals import SignalAnalyzer

PRIMES = {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97}
FIBONACCI = {1, 2, 3, 5, 8, 13, 21, 34, 55, 89}


class DynamicCalibrator:
    def __init__(self, db: Session):
        self.db = db

    def calibrate_modality(self, slug: str) -> DailyCalibration:
        spec = MODALITIES[slug]
        rows = self.db.execute(
            select(DrawResult).where(DrawResult.modality == slug).order_by(DrawResult.contest_number.asc())
        ).scalars().all()

        if not rows:
            raise ValueError(f"Nenhum resultado encontrado no banco para '{slug}'.")

        draws_series: List[List[int]] = []
        for r in rows:
            draws_series.append(r.numbers)
            if spec.engine_type == EngineType.DUPLA_SENA and r.secondary_numbers:
                draws_series.append(r.secondary_numbers)

        thresholds = self._extract_thresholds(spec, draws_series)
        primary_series = [r.numbers for r in rows]
        number_weights = SignalAnalyzer(spec, primary_series).compute_weights()

        if spec.engine_type == EngineType.DUAL_MATRIX:
            trevos_series = [r.secondary_numbers for r in rows if r.secondary_numbers]
            number_weights.update(self._compute_secondary_weights(trevos_series, spec.secondary_range))

        latest_contest = rows[-1].contest_number
        thresholds["last_draw"] = rows[-1].numbers

        existing = self.db.execute(
            select(DailyCalibration).where(DailyCalibration.modality == slug)
        ).scalar_one_or_none()

        if existing:
            existing.reference_contest = latest_contest
            existing.calibrated_at = datetime.utcnow()
            existing.thresholds = thresholds
            existing.number_weights = number_weights
            calibration = existing
        else:
            calibration = DailyCalibration(
                modality=slug, reference_contest=latest_contest,
                calibrated_at=datetime.utcnow(), thresholds=thresholds,
                number_weights=number_weights,
            )
            self.db.add(calibration)

        self.db.commit()
        self.db.refresh(calibration)
        return calibration

    def _extract_thresholds(self, spec: ModalitySpec, draws: List[List[int]]) -> Dict:
        frame_set = get_frame_numbers(spec)
        sums, evens, frames, primes, fibs, repeats = [], [], [], [], [], []

        for idx, draw in enumerate(draws):
            draw_set = set(draw)
            sums.append(sum(draw))
            evens.append(sum(1 for n in draw if n % 2 == 0))
            if spec.engine_type != EngineType.COLUMN_POSITIONAL:
                frames.append(len(draw_set & frame_set))
                primes.append(len(draw_set & PRIMES))
                fibs.append(len(draw_set & FIBONACCI))
                if idx > 0:
                    repeats.append(len(draw_set & set(draws[idx - 1])))
            elif idx > 0 and len(draw) == len(draws[idx - 1]):
                repeats.append(sum(1 for a, b in zip(draw, draws[idx - 1]) if a == b))

        def p_bounds(arr: List[int], low: int = 15, high: int = 85) -> List[int]:
            if not arr:
                return [0, 0]
            return [int(np.floor(np.percentile(arr, low))), int(np.ceil(np.percentile(arr, high)))]

        result = {"sum": p_bounds(sums), "even": p_bounds(evens), "repeat": p_bounds(repeats, 10, 90)}
        if spec.engine_type != EngineType.COLUMN_POSITIONAL:
            result["frame"] = p_bounds(frames)
            result["prime"] = p_bounds(primes)
            result["fibonacci"] = p_bounds(fibs)
        return result

    def _compute_secondary_weights(self, series: List[List[int]], sec_range: Tuple[int, int]) -> Dict[str, float]:
        if not series:
            return {}
        low, high = sec_range
        recent = series[-20:]
        return {
            f"sec_{t}": round(0.5 * (sum(1 for d in recent if t in d) / len(recent)) + 0.5 * (sum(1 for d in series if t in d) / len(series)), 4)
            for t in range(low, high + 1)
        }

    def calibrate_all(self) -> List[str]:
        calibrated = []
        for slug in MODALITIES:
            try:
                self.calibrate_modality(slug)
                calibrated.append(slug)
            except ValueError:
                continue
        return calibrated
