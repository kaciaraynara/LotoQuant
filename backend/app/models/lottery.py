from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Date, DateTime, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class DrawResult(Base):
    __tablename__ = "draw_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    modality = Column(String(32), nullable=False, index=True)
    contest_number = Column(Integer, nullable=False)
    draw_date = Column(Date, nullable=False)
    numbers = Column(JSON, nullable=False)
    secondary_numbers = Column(JSON, nullable=True)
    extra_label = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("modality", "contest_number", name="uq_modality_contest"),
        Index("ix_modality_contest_desc", "modality", contest_number.desc()),
    )


class DailyCalibration(Base):
    """Armazena os parâmetros estatísticos calibrados diariamente por modalidade."""
    __tablename__ = "daily_calibrations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    modality = Column(String(32), nullable=False, unique=True)
    reference_contest = Column(Integer, nullable=False)
    calibrated_at = Column(DateTime, default=datetime.utcnow)
    thresholds = Column(JSON, nullable=False)
    number_weights = Column(JSON, nullable=False)