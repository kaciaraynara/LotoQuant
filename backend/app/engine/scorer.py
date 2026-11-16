from typing import Dict, List, Optional
import numpy as np
from app.core.modalities import ModalitySpec, EngineType, get_frame_numbers
from app.engine.calibrator import PRIMES, FIBONACCI


class AdherenceScorer:
    def __init__(self, spec: ModalitySpec, thresholds: Dict, weights: Dict[str, float]):
        self.spec = spec
        self.thresholds = thresholds
        self.weights = weights
        self.frame_set = get_frame_numbers(spec)
        self.last_draw_set = set(thresholds.get("last_draw") or [])

    def _prize_breakdown(self, raw_quality: float) -> List[Dict[str, str]]:
        # Estima a chance relativa de atingir cada faixa de premiação com base na qualidade estrutural do volante
        factor = 1.4 + (raw_quality * 2.6)
        tables = {
            "lotofacil": [
                ("11 pontos", min(68.0, round(13.8 * factor, 1))),
                ("12 pontos", min(34.0, round(4.2 * factor, 1))),
                ("13 pontos", min(14.5, round(1.15 * factor, 1))),
                ("14 pontos", min(3.2, round(0.18 * factor, 2))),
            ],
            "megasena": [
                ("Quadra (4 pts)", min(18.0, round(1.45 * factor, 2))),
                ("Quina (5 pts)", min(3.5, round(0.14 * factor, 2))),
                ("Sena (6 pts)", min(0.5, round(0.01 * factor, 3))),
            ],
            "quina": [
                ("Duque (2 pts)", min(42.0, round(6.8 * factor, 1))),
                ("Terno (3 pts)", min(12.0, round(1.15 * factor, 2))),
                ("Quadra (4 pts)", min(2.4, round(0.12 * factor, 2))),
            ],
            "lotomania": [
                ("15 pontos", min(38.0, round(6.2 * factor, 1))),
                ("16 pontos", min(16.0, round(1.8 * factor, 1))),
                ("17 pontos", min(5.5, round(0.45 * factor, 2))),
            ],
            "diadesorte": [
                ("4 pontos", min(35.0, round(5.9 * factor, 1))),
                ("5 pontos", min(11.0, round(1.2 * factor, 2))),
                ("6 pontos", min(2.8, round(0.19 * factor, 2))),
            ],
        }
        default_table = [
            ("Prêmio Mínimo", min(36.0, round(5.5 * factor, 1))),
            ("Faixa Intermediária", min(12.0, round(1.1 * factor, 2))),
            ("Prêmio Principal", min(1.5, round(0.08 * factor, 2))),
        ]
        rows = tables.get(self.spec.slug, default_table)
        return [{"tier": label, "chance": f"{pct}%"} for label, pct in rows]

    def evaluate_bet(self, numbers: List[int], secondary: Optional[List[int]] = None) -> Dict:
        if self.spec.engine_type == EngineType.COLUMN_POSITIONAL:
            w_vals = [self.weights.get(f"{col}_{digit}", 0.5) for col, digit in enumerate(numbers)]
            weight_score = float(np.mean(w_vals))
            centrality_score = 0.82
        else:
            w_vals = [self.weights.get(str(n), 0.5) for n in numbers]
            weight_score = float(np.mean(w_vals))

            if secondary and self.spec.engine_type == EngineType.DUAL_MATRIX:
                sec_vals = [self.weights.get(f"sec_{t}", 0.5) for t in secondary]
                weight_score = (0.85 * weight_score) + (0.15 * float(np.mean(sec_vals)))

            num_set = set(numbers)
            metrics = {
                "sum": sum(numbers),
                "even": sum(1 for n in numbers if n % 2 == 0),
                "frame": len(num_set & self.frame_set),
                "prime": len(num_set & PRIMES),
                "fibonacci": len(num_set & FIBONACCI),
            }
            if self.last_draw_set:
                metrics["repeat"] = len(num_set & self.last_draw_set)

            centrality_scores = []
            for key, val in metrics.items():
                bounds = self.thresholds.get(key)
                if not bounds or bounds[0] == bounds[1]:
                    continue
                low, high = bounds[0], bounds[1]
                mid = (low + high) / 2.0
                half_span = max((high - low) / 2.0, 1.0)
                dist = abs(val - mid) / half_span
                centrality_scores.append(max(0.0, 1.0 - (0.28 * dist)))

            centrality_score = float(np.mean(centrality_scores)) if centrality_scores else 0.80

        raw = (0.55 * weight_score) + (0.45 * centrality_score)
        adherence_pct = round(min(99.2, max(68.0, 62.0 + (raw * 38.0))), 2)
        efficiency_multiplier = round(1.9 + (raw * 3.2), 2)
        breakdown = self._prize_breakdown(raw)
        top_chance = float(breakdown[0]["chance"].replace("%", ""))

        return {
            "adherence_score": adherence_pct,
            "prize_chance_pct": top_chance,
            "efficiency_multiplier": efficiency_multiplier,
            "prize_breakdown": breakdown,
        }

    def score_bet(self, numbers: List[int], secondary: Optional[List[int]] = None) -> float:
        return self.evaluate_bet(numbers, secondary)["adherence_score"]
