import logging
from apscheduler.schedulers.background import BackgroundScheduler
from app.db.session import SessionLocal
from app.services.daily_pipeline import DailyPipelineService

logger = logging.getLogger("lotoquant.scheduler")
scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")


def scheduled_nightly_job():
    logger.info("Iniciando rotina noturna LotoQuant: sync + calibracao + palpites do dia...")
    db = SessionLocal()
    try:
        pipeline = DailyPipelineService(db)
        report = pipeline.run_full_daily_cycle(backfill=50)
        logger.info(f"Pipeline finalizado com sucesso: {report}")
    except Exception as exc:
        logger.error(f"Falha no pipeline diario: {exc}")
    finally:
        db.close()


def start_scheduler():
    # Roda todos os dias as 22:30 (apos apuracao oficial da Caixa) e reforco as 07:00
    scheduler.add_job(scheduled_nightly_job, "cron", hour=22, minute=30, id="nightly_sync", replace_existing=True)
    scheduler.add_job(scheduled_nightly_job, "cron", hour=7, minute=0, id="morning_refresh", replace_existing=True)
    scheduler.start()
