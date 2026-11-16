from datetime import date
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import User, PlanTier, PLAN_LIMITS

bearer_scheme = HTTPBearer()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(creds.credentials)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado.")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inativo.")

    # Reseta contador diário automaticamente na virada do dia
    today = date.today()
    if user.last_usage_date != today:
        user.daily_generations_used = 0
        user.last_usage_date = today
        db.commit()

    return user


def check_generation_quota(user: User, modality: str, requested_qty: int, db: Session) -> dict:
    tier = PlanTier(user.plan_tier)
    if user.subscription_status != "active" and tier != PlanTier.FREE:
        tier = PlanTier.FREE

    rules = PLAN_LIMITS[tier]

    if not rules["all_modalities"] and modality not in ("lotofacil", "megasena"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Modalidade exclusiva para assinantes Pro ou Elite.",
        )

    if user.daily_generations_used + requested_qty > rules["daily_generations"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite diário do plano {tier.value.upper()} atingido ({rules['daily_generations']} jogos/dia).",
        )

    return rules
