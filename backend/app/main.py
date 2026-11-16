from datetime import date
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.modalities import MODALITIES
from app.db.session import init_db, get_db
from app.workers.scheduler import start_scheduler, scheduler
from app.api.v1 import auth, generator, billing
from app.services.caixa_sync import CaixaSyncService
from app.engine.calibrator import DynamicCalibrator
from app.services.daily_pipeline import DailyPipelineService


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title=settings.APP_NAME,
    version="1.1.0",
    description="Motor Estatístico e Combinatório Multi-Loterias",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(generator.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "online", "service": settings.APP_NAME}


@app.post("/api/v1/admin/sync/{modality}", tags=["Administração"])
def sync_single_modality(modality: str, backfill: int = 60, db: Session = Depends(get_db)):
    if modality not in MODALITIES:
        raise HTTPException(status_code=404, detail="Modalidade inválida.")
    inserted = CaixaSyncService(db).sync_modality(modality, max_backfill=backfill)
    cal = DynamicCalibrator(db).calibrate_modality(modality)
    DailyPipelineService(db).generate_daily_pick_for_modality(modality, date.today())
    return {
        "modality": modality,
        "new_draws": inserted,
        "reference_contest": cal.reference_contest,
    }


@app.post("/api/v1/admin/run-pipeline", tags=["Administração"])
def trigger_pipeline(backfill: int = 60, db: Session = Depends(get_db)):
    pipeline = DailyPipelineService(db)
    return pipeline.run_full_daily_cycle(backfill=backfill)
