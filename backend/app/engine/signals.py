from typing import Dict, List
import numpy as np
from app.core.modalities import ModalitySpec, EngineType


class SignalAnalyzer:
    def __init__(self, spec: ModalitySpec, draws_history: List[List[int]]):
        self.spec = spec
        self.draws = draws_history
        self.total_draws = len(draws_history)

    def compute_weights(self) -> Dict[str, float]:
        if self.total_draws < 10:
            universe = range(self.spec.min_number, self.spec.max_number + 1)
            return {str(n): 0.5 for n in universe}
        if self.spec.engine_type == EngineType.COLUMN_POSITIONAL:
            return self._compute_positional_weights()
        return self._compute_matrix_weights()

    def _compute_matrix_weights(self) -> Dict[str, float]:
        universe = list(range(self.spec.min_number, self.spec.max_number + 1))
        short_window = min(15, self.total_draws)
        med_window = min(50, self.total_draws)
        recent_short = self.draws[-short_window:]
        recent_med = self.draws[-med_window:]

        freq_short = {n: sum(1 for d in recent_short if n in d) / short_window for n in universe}
        freq_med = {n: sum(1 for d in recent_med if n in d) / med_window for n in universe}

        z_scores: Dict[int, float] = {}
        for n in universe:
            appearances = [idx for idx, d in enumerate(self.draws) if n in d]
            if not appearances:
                z_scores[n] = 2.0
                continue
            delay = (self.total_draws - 1) - appearances[-1]
            if len(appearances) >= 3:
                gaps = np.diff(appearances)
                mean_gap = float(np.mean(gaps))
                std_gap = float(np.std(gaps)) or 1.0
                z = (delay - mean_gap) / std_gap
                z_scores[n] = float(1.0 / (1.0 + np.exp(-z)))
            else:
                z_scores[n] = 0.5

        missing_in_cycle = self._get_current_cycle_missing(set(universe))
        raw_scores: Dict[int, float] = {}
        for n in universe:
            momentum = (0.6 * freq_short[n]) + (0.4 * freq_med[n])
            cycle_bonus = 0.25 if n in missing_in_cycle else 0.0
            raw_scores[n] = (0.45 * momentum) + (0.35 * z_scores[n]) + cycle_bonus

        min_s, max_s = min(raw_scores.values()), max(raw_scores.values())
        span = (max_s - min_s) or 1.0
        return {
            str(n): round(0.15 + 0.83 * ((raw_scores[n] - min_s) / span), 4)
            for n in universe
        }

    def _get_current_cycle_missing(self, universe: set[int]) -> set[int]:
        active_seen = set()
        for draw in reversed(self.draws):
            if active_seen | set(draw) == universe and active_seen:
                break
            active_seen.update(draw)
        return universe - active_seen

    def _compute_positional_weights(self) -> Dict[str, float]:
        weights: Dict[str, float] = {}
        short_window = min(20, self.total_draws)
        recent = self.draws[-short_window:]
        for col in range(self.spec.cols):
            col_scores = {}
            for digit in range(10):
                freq_all = sum(1 for d in self.draws if len(d) > col and d[col] == digit) / self.total_draws
                freq_rec = sum(1 for d in recent if len(d) > col and d[col] == digit) / short_window
                delay = 0
                for d in reversed(self.draws):
                    if len(d) > col and d[col] == digit:
                        break
                    delay += 1
                delay_factor = min(delay / 15.0, 1.0)
                col_scores[digit] = (0.5 * freq_rec) + (0.2 * freq_all) + (0.3 * delay_factor)
            min_s, max_s = min(col_scores.values()), max(col_scores.values())
            span = (max_s - min_s) or 1.0
            for digit in range(10):
                weights[f"{col}_{digit}"] = round(0.15 + 0.83 * ((col_scores[digit] - min_s) / span), 4)
        return weights
