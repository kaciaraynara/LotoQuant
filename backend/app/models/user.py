from datetime import datetime, date
from enum import Enum
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, JSON, ForeignKey
from app.models.lottery import Base


class PlanTier(str, Enum):
    FREE = "free"
    PRO = "pro"
    ELITE = "elite"


PLAN_LIMITS = {
    PlanTier.FREE: {"daily_generations": 3, "allow_closing": False, "max_closing_pool": 0, "all_modalities": False},
    PlanTier.PRO: {"daily_generations": 50, "allow_closing": True, "max_closing_pool": 19, "all_modalities": True},
    PlanTier.ELITE: {"daily_generations": 9999, "allow_closing": True, "max_closing_pool": 22, "all_modalities": True},
}


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    plan_tier = Column(String(20), default=PlanTier.FREE.value, nullable=False)
    subscription_status = Column(String(30), default="active", nullable=False)  # active, past_due, canceled
    gateway_customer_id = Column(String(120), nullable=True)
    daily_generations_used = Column(Integer, default=0, nullable=False)
    last_usage_date = Column(Date, default=date.today, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DailyPick(Base):
    """Armazena os jogos de elite gerados automaticamente todo dia para as loterias do dia."""
    __tablename__ = "daily_picks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pick_date = Column(Date, nullable=False, index=True)
    modality = Column(String(32), nullable=False, index=True)
    target_contest = Column(Integer, nullable=False)
    games = Column(JSON, nullable=False)          # Lista dos Top 5 volantes calibrados
    top_pool = Column(JSON, nullable=False)       # Top dezenas ordenadas por score do dia
    created_at = Column(DateTime, default=datetime.utcnow)
