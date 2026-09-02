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

    # The bill parser rasterizes each PDF page locally (app/services/pdf_extraction.py) and
    # sends the images to a vision-capable model via OpenRouter's OpenAI-compatible API (see
    # app/services/bill_parser_service.py) - always needs a real key, everywhere this runs.
    # Confirm these slugs are still live/free on OpenRouter before relying on them - free-tier
    # model availability and naming drifts over time.
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    parser_model: str = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
    parser_retry_model: str = "qwen/qwen3-vl-235b-a22b-instruct"


settings = Settings()
