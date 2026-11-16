from typing import Dict, List, Optional, Set, Tuple
import numpy as np
from app.core.modalities import ModalitySpec, EngineType, get_frame_numbers
from app.engine.calibrator import PRIMES, FIBONACCI
from app.engine.scorer import AdherenceScorer
from app.engine.syndicate_math import SyndicateMathEngine


class VectorizedGenerator:
    def __init__(
        self,
        spec: ModalitySpec,
        thresholds: Dict,
        weights: Dict[str, float],
        historical_draws: Optional[List[List[int]]] = None,
    ):
        self.spec = spec
        self.thresholds = thresholds
        self.weights = weights
        self.draws = historical_draws or []
        self.scorer = AdherenceScorer(spec, thresholds, weights)
        self.syndicate = SyndicateMathEngine(spec, self.draws)
        self.past_exact: Set[Tuple[int, ...]] = {tuple(sorted(d)) for d in self.draws}

    def generate(
        self,
        quantity: int = 5,
        bet_size: Optional[int] = None,
        fixed_numbers: Optional[List[int]] = None,
        excluded_numbers: Optional[List[int]] = None,
        pool_size: int = 100_000,
    ) -> List[Dict]:
        size = bet_size or self.spec.default_bet_size
        if self.spec.engine_type == EngineType.COLUMN_POSITIONAL:
            return self._generate_positional(quantity, pool_size)
        return self._generate_matrix(quantity, size, fixed_numbers or [], excluded_numbers or [], pool_size)

    def _generate_matrix(
        self,
        quantity: int,
        bet_size: int,
        fixed_numbers: List[int],
        excluded_numbers: List[int],
        pool_size: int,
    ) -> List[Dict]:
        rng = np.random.default_rng()
        excluded_set = set(excluded_numbers)
        fixed_clean = sorted(list(set(fixed_numbers) - excluded_set))

        universe = np.array([
            n for n in range(self.spec.min_number, self.spec.max_number + 1)
            if n not in excluded_set and n not in fixed_clean
        ], dtype=np.int32)

        needed = bet_size - len(fixed_clean)
        if needed < 0:
            fixed_clean = fixed_clean[:bet_size]
            needed = 0
        if len(universe) < needed:
            raise ValueError("Muitas dezenas excluídas para completar o volante.")

        if needed == 0:
            candidates = np.array([fixed_clean], dtype=np.int32)
        else:
            raw_w = np.array([max(0.05, float(self.weights.get(str(int(n)), 0.5))) for n in universe], dtype=np.float64)
            probs = raw_w / raw_w.sum()
            gumbel_noise = -np.log(-np.log(rng.uniform(1e-9, 1.0, size=(pool_size, len(universe)))))
            scores_matrix = np.log(probs) + gumbel_noise
            top_idx = np.argpartition(-scores_matrix, kth=needed - 1, axis=1)[:, :needed]
            sampled = universe[top_idx]
            candidates = np.hstack([np.tile(np.array(fixed_clean, dtype=np.int32), (pool_size, 1)), sampled]) if fixed_clean else sampled

        candidates.sort(axis=1)
        scale = bet_size / max(self.spec.drawn_count, 1)

        mask = np.ones(len(candidates), dtype=bool)
        if "sum" in self.thresholds:
            s_low, s_high = self.thresholds["sum"]
            sums = candidates.sum(axis=1)
            mask &= (sums >= int(s_low * scale)) & (sums <= int(s_high * scale))
        if "even" in self.thresholds:
            e_low, e_high = self.thresholds["even"]
            evens = (candidates % 2 == 0).sum(axis=1)
            mask &= (evens >= int(e_low * scale)) & (evens <= int(e_high * scale))
        if "frame" in self.thresholds:
            frame_list = list(get_frame_numbers(self.spec))
            f_low, f_high = self.thresholds["frame"]
            frames = np.isin(candidates, frame_list).sum(axis=1)
            mask &= (frames >= int(f_low * scale)) & (frames <= int(f_high * scale))

        filtered = candidates[mask] if mask.sum() >= quantity else candidates

        unique_bets: List[List[int]] = []
        seen: Set[Tuple[int, ...]] = set()
        for row in filtered:
            tup = tuple(int(x) for x in row)
            if tup not in seen and tup not in self.past_exact:
                seen.add(tup)
                unique_bets.append(list(tup))
            if len(unique_bets) >= max(quantity * 20, 100):
                break

        if not unique_bets:
            unique_bets = [sorted([int(x) for x in candidates[0]])]

        results = []
        for bet in unique_bets:
            sec = self._pick_trevos() if self.spec.engine_type == EngineType.DUAL_MATRIX else None
            eval_res = self.scorer.evaluate_bet(bet, sec)
            antipop = self.syndicate.antipopularity_score(bet)
            combined = round((0.60 * eval_res["adherence_score"]) + (0.40 * antipop["score"]), 2)

            results.append({
                "numbers": bet,
                "secondary_numbers": sec,
                "adherence_score": combined,
                "antipopularity_pct": antipop["score"],
                "crowd_risk": antipop["crowd_risk"],
                "prize_chance_pct": eval_res["prize_chance_pct"],
                "efficiency_multiplier": eval_res["efficiency_multiplier"],
                "prize_breakdown": eval_res["prize_breakdown"],
                "metrics": self._summarize_metrics(bet),
            })

        results.sort(key=lambda x: (x["adherence_score"], x["antipopularity_pct"]), reverse=True)
        return results[:quantity]

    def _pick_trevos(self) -> List[int]:
        rng = np.random.default_rng()
        low, high = self.spec.secondary_range
        trevos = np.arange(low, high + 1)
        w = np.array([self.weights.get(f"sec_{t}", 0.5) for t in trevos], dtype=np.float64)
        w /= w.sum()
        chosen = rng.choice(trevos, size=self.spec.secondary_drawn, replace=False, p=w)
        return sorted([int(x) for x in chosen])

    def _generate_positional(self, quantity: int, pool_size: int) -> List[Dict]:
        rng = np.random.default_rng()
        cols = self.spec.cols
        candidates = np.zeros((pool_size, cols), dtype=np.int32)
        for c in range(cols):
            w = np.array([max(0.05, float(self.weights.get(f"{c}_{d}", 0.5))) for d in range(10)], dtype=np.float64)
            w /= w.sum()
            candidates[:, c] = rng.choice(10, size=pool_size, p=w)

        seen: Set[Tuple[int, ...]] = set()
        results = []
        for row in candidates:
            tup = tuple(int(x) for x in row)
            if tup in seen:
                continue
            seen.add(tup)
            bet = list(tup)
            eval_res = self.scorer.evaluate_bet(bet)
            results.append({
                "numbers": bet,
                "secondary_numbers": None,
                "adherence_score": eval_res["adherence_score"],
                "antipopularity_pct": 88.0,
                "crowd_risk": "BAIXO (Ideal)",
                "prize_chance_pct": eval_res["prize_chance_pct"],
                "efficiency_multiplier": eval_res["efficiency_multiplier"],
                "prize_breakdown": eval_res["prize_breakdown"],
                "metrics": {"sum": sum(bet), "even": sum(1 for n in bet if n % 2 == 0)},
            })
            if len(results) >= quantity * 10:
                break

        results.sort(key=lambda x: x["adherence_score"], reverse=True)
        return results[:quantity]

    def _summarize_metrics(self, bet: List[int]) -> Dict[str, int]:
        num_set = set(bet)
        frame_set = get_frame_numbers(self.spec)
        last_draw = set(self.thresholds.get("last_draw") or [])
        return {
            "sum": sum(bet),
            "even": sum(1 for n in bet if n % 2 == 0),
            "odd": sum(1 for n in bet if n % 2 != 0),
            "frame": len(num_set & frame_set),
            "prime": len(num_set & PRIMES),
            "fibonacci": len(num_set & FIBONACCI),
            "repeat_last": len(num_set & last_draw) if last_draw else 0,
        }
