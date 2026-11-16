from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User, PlanTier

router = APIRouter(prefix="/billing", tags=["Assinaturas & Webhooks"])


class WebhookEvent(BaseModel):
    event: str          # PAYMENT_CONFIRMED, SUBSCRIPTION_CANCELED, PAYMENT_OVERDUE
    user_email: str
    plan_tier: str      # pro ou elite
    gateway_customer_id: str | None = None


@router.post("/webhook")
def payment_webhook(payload: WebhookEvent, db: Session = Depends(get_db)):
    """
    Endpoint para receber notificações automáticas do Asaas, Stripe ou Mercado Pago
    e liberar/suspender o plano do assinante em tempo real.
    """
    user = db.execute(select(User).where(User.email == payload.user_email)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Assinante não encontrado.")

    if payload.event == "PAYMENT_CONFIRMED":
        if payload.plan_tier not in (PlanTier.PRO.value, PlanTier.ELITE.value):
            raise HTTPException(status_code=400, detail="Plano inválido.")
        user.plan_tier = payload.plan_tier
        user.subscription_status = "active"
        if payload.gateway_customer_id:
            user.gateway_customer_id = payload.gateway_customer_id
    elif payload.event in ("SUBSCRIPTION_CANCELED", "PAYMENT_OVERDUE"):
        user.subscription_status = "canceled"
        user.plan_tier = PlanTier.FREE.value

    db.commit()
    return {"status": "processed", "user_email": user.email, "active_plan": user.plan_tier}
