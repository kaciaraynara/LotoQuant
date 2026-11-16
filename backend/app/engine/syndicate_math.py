from typing import Dict, List, Optional
import numpy as np
from scipy.stats import chisquare
from app.core.modalities import ModalitySpec, EngineType


class SyndicateMathEngine:
    """
    Motor de Engenharia de Sindicato:
    - Teste de Qui-Quadrado (Chi2) para auditoria de entropia/viés mecânico
    - Índice de Antipopularidade (evita rateio humano: datas 1-31, múltiplos de 5, simetrias)
    - Cálculo de Valor Esperado (EV) e Critério de Kelly Fracionado
    """

    def __init__(self, spec: ModalitySpec, historical_draws: List[List[int]]):
        self.spec = spec
        self.draws = historical_draws

    def audit_chi_square(self) -> Dict:
        """Executa teste Qui-Quadrado sobre todo o histórico disponível."""
        if len(self.draws) < 15 or self.spec.engine_type == EngineType.COLUMN_POSITIONAL:
            return {
                "chi2_stat": 0.0,
                "p_value": 1.0,
                "status": "AMOSTRA_INSUFICIENTE",
                "anomalies": [],
            }

        universe_size = self.spec.max_number - self.spec.min_number + 1
        counts = np.zeros(universe_size, dtype=np.float64)
        for d in self.draws:
            for n in d:
                idx = n - self.spec.min_number
                if 0 <= idx < universe_size:
                    counts[idx] += 1

        total_balls = counts.sum()
        expected = np.full(universe_size, total_balls / universe_size)
        stat, p_val = chisquare(counts, f_exp=expected)

        # Desvio padrão binomial teórico: sqrt(N * p * (1 - p))
        p_ball = self.spec.drawn_count / universe_size
        std_dev = np.sqrt(len(self.draws) * p_ball * (1.0 - p_ball))

        anomalies = []
        for idx, obs in enumerate(counts):
            z = (obs - expected[idx]) / max(std_dev, 1e-6)
            if abs(z) >= 2.5:
                anomalies.append({
                    "number": self.spec.min_number + idx,
                    "observed": int(obs),
                    "expected": round(float(expected[idx]), 1),
                    "z_sigma": round(float(z), 2),
                })

        anomalies.sort(key=lambda x: abs(x["z_sigma"]), reverse=True)
        return {
            "chi2_stat": round(float(stat), 2),
            "p_value": round(float(p_val), 4),
            "total_draws_audited": len(self.draws),
            "status": "ANOMALIA_DETECTADA" if p_val < 0.05 else "ENTROPIA_NORMAL",
            "anomalies": anomalies[:6],
        }

    def antipopularity_score(self, numbers: List[int]) -> Dict:
        """
        Mede o quanto uma combinação foge dos padrões humanos mais apostados
        (datas de aniversário 01-31, múltiplos de 5, sequências aritméticas e bordas).
        Quanto maior o score (0-100%), menor a chance de dividir o prêmio.
        """
        if not numbers:
            return {"score": 50.0, "crowd_risk": "MÉDIO", "notes": []}

        k = len(numbers)
        penalties = 0.0
        notes = []

        # 1. Concentração em datas de aniversário (01 a 31)
        if self.spec.max_number > 31:
            birthday_ratio = sum(1 for n in numbers if n <= 31) / k
            expected_ratio = 31.0 / self.spec.max_number
            if birthday_ratio > expected_ratio + 0.15:
                penalties += (birthday_ratio - expected_ratio) * 45.0
                notes.append("Excesso de dezenas de calendário (01-31)")

        # 2. Múltiplos de 5 (muito marcados visualmente no volante)
        mult5_ratio = sum(1 for n in numbers if n % 5 == 0) / k
        if mult5_ratio > 0.28:
            penalties += (mult5_ratio - 0.20) * 40.0
            notes.append("Alta concentração em múltiplos de 5")

        # 3. Sequências consecutivas longas (ex: 01-02-03-04)
        sorted_n = sorted(numbers)
        max_run = 1
        cur_run = 1
        for i in range(1, k):
            if sorted_n[i] == sorted_n[i - 1] + 1:
                cur_run += 1
                max_run = max(max_run, cur_run)
            else:
                cur_run = 1
        if max_run >= 4 and self.spec.drawn_count < 15:
            penalties += 18.0
            notes.append(f"Sequência visual óbvia ({max_run} seguidas)")

        # 4. Terminações repetidas (ex: 07, 17, 27, 37)
        endings = [n % 10 for n in numbers]
        max_same_ending = max(endings.count(d) for d in set(endings))
        if max_same_ending >= 4 and self.spec.drawn_count < 15:
            penalties += 15.0
            notes.append("Muitas dezenas com mesmo dígito final")

        score = round(max(15.0, min(99.5, 96.0 - penalties)), 1)
        risk = "BAIXO (Ideal)" if score >= 80 else ("MÉDIO" if score >= 60 else "ALTO (Risco de Rateio)")
        return {"score": score, "crowd_risk": risk, "notes": notes}

    def evaluate_ev_and_kelly(
        self,
        estimated_jackpot: float,
        ticket_cost: float,
        bankroll: float,
        antipopularity_pct: float,
        num_tickets: int = 1,
    ) -> Dict:
        """
        Calcula o Valor Esperado (EV) considerando o prêmio acumulado e o fator de rateio,
        além da fração recomendada pelo Critério de Kelly Fracionado (1/4 Kelly).
        """
        # Probabilidades inversas aproximadas do prêmio principal (1 em N)
        odds_map = {
            "lotofacil": 3_268_760,
            "megasena": 50_063_860,
            "quina": 24_040_016,
            "lotomania": 11_372_635,
            "duplasena": 15_890_700,
            "timemania": 26_472_637,
            "diadesorte": 2_629_575,
            "maismilionaria": 238_360_500,
            "supersete": 10_000_000,
        }
        # Retorno médio esperado das faixas secundárias como fração do custo do bilhete
        secondary_return_ratio = {
            "lotofacil": 0.34,
            "lotomania": 0.28,
            "diadesorte": 0.31,
            "timemania": 0.26,
            "megasena": 0.14,
            "quina": 0.19,
            "duplasena": 0.21,
            "maismilionaria": 0.18,
            "supersete": 0.22,
        }

        inv_odds = odds_map.get(self.spec.slug, 10_000_000)
        p_jackpot = 1.0 / inv_odds

        # Quanto maior a antipopularidade, menor a divisão esperada do pote principal
        expected_winners = max(1.0, (100.0 - antipopularity_pct) / 18.0)
        effective_jackpot = estimated_jackpot / expected_winners

        sec_ev = ticket_cost * secondary_return_ratio.get(self.spec.slug, 0.20)
        total_ev_per_ticket = (p_jackpot * effective_jackpot) + sec_ev - ticket_cost
        ev_ratio = total_ev_per_ticket / max(ticket_cost, 0.01)

        # Critério de Kelly fracionado (0.25x) com teto de segurança de 5% da banca por concurso
        if total_ev_per_ticket > 0:
            raw_kelly = total_ev_per_ticket / max(effective_jackpot, 1.0)
            recommended_fraction = min(0.05, max(0.002, raw_kelly * 0.25))
            signal = "EV+ (ATAQUE RECOMENDADO)"
        else:
            # Em concursos regulares (EV negativo), recomenda apenas exposição mínima recreativa/estudo
            recommended_fraction = 0.005
            signal = "EV- (AGUARDAR ACUMULADO)"

        recommended_budget = round(bankroll * recommended_fraction, 2)
        recommended_tickets = max(1, int(recommended_budget // max(ticket_cost, 0.5)))

        return {
            "signal": signal,
            "ev_per_ticket": round(total_ev_per_ticket, 4),
            "ev_pct": round(ev_ratio * 100, 2),
            "estimated_split_winners": round(expected_winners, 1),
            "kelly_fraction_pct": round(recommended_fraction * 100, 2),
            "recommended_budget": recommended_budget,
            "recommended_tickets": recommended_tickets,
        }
