from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "LotoQuant Engine"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/lotoquant"
    SECRET_KEY: str = "dev-secret-key"
    CAIXA_SYNC_BACKFILL: int = 250

    class Config:
        env_file = ".env"


settings = Settings()