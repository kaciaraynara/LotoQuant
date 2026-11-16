from itertools import combinations
from typing import Dict, List
import numpy as np
from app.core.modalities import ModalitySpec
from app.engine.scorer import AdherenceScorer


class CoveringMatrixEngine:
    """
    Constrói fechamentos combinatórios reduzidos (Covering Designs):
    Dado um conjunto selecionado de N dezenas fortes, encontra o menor subconjunto
    de volantes simples que garante pelo menos `guarantee_hits` acertos caso
    `condition_hits` dezenas sorteadas estejam dentro do grupo escolhido.
    """

    def __init__(self, spec: ModalitySpec, thresholds: Dict, weights: Dict[str, float]):
        self.spec = spec
        self.thresholds = thresholds
        self.weights = weights
        self.scorer = AdherenceScorer(spec, thresholds, weights)

    def build_closing(
        self,
        selected_numbers: List[int],
        guarantee_hits: int,
        condition_hits: int,
        max_tickets: int = 30,
    ) -> Dict:
        pool = sorted(list(set(selected_numbers)))
        bet_size = self.spec.default_bet_size

        if len(pool) <= bet_size:
            raise ValueError(f"Selecione mais de {bet_size} dezenas para montar um fechamento.")
        if len(pool) > 22:
            raise ValueError("Limite máximo de 22 dezenas para fechamento em tempo real.")

        # Universo de cenários possíveis a cobrir (subconjuntos de tamanho condition_hits)
        target_scenarios = list(combinations(pool, condition_hits))
        candidate_tickets = list(combinations(pool, bet_size))

        # Limita candidatos se a explosão combinatória for muito grande
        if len(candidate_tickets) > 4000:
            rng = np.random.default_rng(42)
            idx = rng.choice(len(candidate_tickets), size=4000, replace=False)
            candidate_tickets = [candidate_tickets[i] for i in idx]

        # Ordena candidatos pela aderência estatística para priorizar volantes equilibrados
        scored_candidates = [
            (ticket, self.scorer.score_bet(list(ticket)))
            for ticket in candidate_tickets
        ]
        scored_candidates.sort(key=lambda x: x[1], reverse=True)

        tickets_arr = np.array([t for t, _ in scored_candidates], dtype=np.int32)
        scenarios_arr = np.array(target_scenarios, dtype=np.int32)

        uncovered_mask = np.ones(len(scenarios_arr), dtype=bool)
        chosen_tickets: List[Dict] = []

        for idx, (ticket, adherence) in enumerate(scored_candidates):
            if not uncovered_mask.any() or len(chosen_tickets) >= max_tickets:
                break

            # Verifica quantos cenários ainda descobertos este volante cobre com >= guarantee_hits
            active_scenarios = scenarios_arr[uncovered_mask]
            matches = np.isin(active_scenarios, ticket).sum(axis=1)
            covered_now = matches >= guarantee_hits

            if covered_now.sum() > 0:
                chosen_tickets.append({
                    "numbers": [int(n) for n in ticket],
                    "adherence_score": adherence,
                })
                active_indices = np.where(uncovered_mask)[0]
                uncovered_mask[active_indices[covered_now]] = False

        coverage_pct = round(100.0 * (1.0 - (uncovered_mask.sum() / len(scenarios_arr))), 2)

        return {
            "modality": self.spec.slug,
            "pool_size": len(pool),
            "selected_pool": pool,
            "guarantee": f"{guarantee_hits} pontos se acertar {condition_hits} dezenas no grupo",
            "total_tickets": len(chosen_tickets),
            "mathematical_coverage_pct": coverage_pct,
            "tickets": chosen_tickets,
        }
