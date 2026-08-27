from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FinanceIQ"
    environment: str = "development"
    debug: bool = False
    database_url: str
    # DDL owner role, used only by Alembic — the app itself connects via `database_url` as a
    # restricted, non-superuser role so Postgres row-level security actually applies to it.
    migration_database_url: str | None = None
    log_level: str = "INFO"

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120

    # Origins allowed to call the API from a browser — the Next.js dev server by default.
    cors_origins: list[str] = ["http://localhost:3000"]

    # The bill parser extracts PDF text locally (app/services/pdf_extraction.py) and sends it
    # to a free/cheap model via OpenRouter's OpenAI-compatible API (see
    # app/services/bill_parser_service.py) - always needs a real key, everywhere this runs.
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    parser_model: str = "openai/gpt-oss-120b"
    parser_retry_model: str = "nvidia/nemotron-3-super-120b-a12b:free"
    # Bill samples in data/ are French - see Dockerfile's tesseract-ocr-fra package.
    ocr_language: str = "fra"


settings = Settings()
