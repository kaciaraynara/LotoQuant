from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel


class EngineType(str, Enum):
    MATRIX_SINGLE = "matrix_single"
    DUPLA_SENA = "dupla_sena"
    DUAL_MATRIX = "dual_matrix"
    COLUMN_POSITIONAL = "positional"


class ModalitySpec(BaseModel):
    slug: str
    name: str
    api_slug: str
    engine_type: EngineType
    min_number: int
    max_number: int
    drawn_count: int
    default_bet_size: int
    max_bet_size: int
    rows: int
    cols: int
    draw_days: List[int]
    secondary_range: Optional[tuple[int, int]] = None
    secondary_drawn: Optional[int] = None


MODALITIES: Dict[str, ModalitySpec] = {
    "lotofacil": ModalitySpec(
        slug="lotofacil", name="Lotofácil", api_slug="lotofacil",
        engine_type=EngineType.MATRIX_SINGLE, min_number=1, max_number=25,
        drawn_count=15, default_bet_size=15, max_bet_size=20, rows=5, cols=5,
        draw_days=[0, 1, 2, 3, 4, 5],
    ),
    "megasena": ModalitySpec(
        slug="megasena", name="Mega-Sena", api_slug="megasena",
        engine_type=EngineType.MATRIX_SINGLE, min_number=1, max_number=60,
        drawn_count=6, default_bet_size=6, max_bet_size=20, rows=6, cols=10,
        draw_days=[1, 3, 5],
    ),
    "quina": ModalitySpec(
        slug="quina", name="Quina", api_slug="quina",
        engine_type=EngineType.MATRIX_SINGLE, min_number=1, max_number=80,
        drawn_count=5, default_bet_size=5, max_bet_size=15, rows=8, cols=10,
        draw_days=[0, 1, 2, 3, 4, 5],
    ),
    "lotomania": ModalitySpec(
        slug="lotomania", name="Lotomania", api_slug="lotomania",
        engine_type=EngineType.MATRIX_SINGLE, min_number=0, max_number=99,
        drawn_count=20, default_bet_size=50, max_bet_size=50, rows=10, cols=10,
        draw_days=[0, 2, 4],
    ),
    "duplasena": ModalitySpec(
        slug="duplasena", name="Dupla Sena", api_slug="duplasena",
        engine_type=EngineType.DUPLA_SENA, min_number=1, max_number=50,
        drawn_count=6, default_bet_size=6, max_bet_size=15, rows=5, cols=10,
        draw_days=[0, 2, 4],
    ),
    "timemania": ModalitySpec(
        slug="timemania", name="Timemania", api_slug="timemania",
        engine_type=EngineType.MATRIX_SINGLE, min_number=1, max_number=80,
        drawn_count=7, default_bet_size=10, max_bet_size=10, rows=8, cols=10,
        draw_days=[1, 3, 5],
    ),
    "diadesorte": ModalitySpec(
        slug="diadesorte", name="Dia de Sorte", api_slug="diadesorte",
        engine_type=EngineType.MATRIX_SINGLE, min_number=1, max_number=31,
        drawn_count=7, default_bet_size=7, max_bet_size=15, rows=4, cols=8,
        draw_days=[1, 3, 5],
    ),
    "maismilionaria": ModalitySpec(
        slug="maismilionaria", name="+Milionária", api_slug="maismilionaria",
        engine_type=EngineType.DUAL_MATRIX, min_number=1, max_number=50,
        drawn_count=6, default_bet_size=6, max_bet_size=12, rows=5, cols=10,
        draw_days=[2, 5], secondary_range=(1, 6), secondary_drawn=2,
    ),
    "supersete": ModalitySpec(
        slug="supersete", name="Super Sete", api_slug="supersete",
        engine_type=EngineType.COLUMN_POSITIONAL, min_number=0, max_number=9,
        drawn_count=7, default_bet_size=7, max_bet_size=21, rows=10, cols=7,
        draw_days=[0, 2, 4],
    ),
}


def get_frame_numbers(spec: ModalitySpec) -> set[int]:
    if spec.engine_type == EngineType.COLUMN_POSITIONAL:
        return set()
    frame = set()
    total_numbers = spec.max_number - spec.min_number + 1
    for idx in range(total_numbers):
        num = spec.min_number + idx
        row = idx // spec.cols
        col = idx % spec.cols
        if row == 0 or row == spec.rows - 1 or col == 0 or col == spec.cols - 1:
            frame.add(num)
    return frame
