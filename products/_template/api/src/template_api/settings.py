from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Runtime ---
    environment: str = Field(default="local")  # local | staging | production
    api_port: int = Field(default=8000)

    # --- Database ---
    # Runtime app traffic goes over the Supabase pooler (transaction mode, 6543).
    database_url: str = Field(...)
    # Alembic migrations go over the DIRECT port (5432). Key ruling #4.
    database_migration_url: str = Field(...)

    # --- Auth (Supabase) ---
    supabase_url: AnyHttpUrl | None = Field(default=None)  # JWKS discovery base
    supabase_jwt_secret: str | None = Field(default=None)  # HS256 genuine fallback only
    jwt_audience: str = Field(default="authenticated")

    # --- CORS allowlist (comma-separated; web origin + app:// desktop + mobile) ---
    cors_origins: str = Field(default="http://localhost:8081,app://-")

    # --- Realtime broadcast (Phase 8; service-role HTTP call) ---
    supabase_service_role_key: str | None = Field(default=None)

    # --- Push (Expo Push API base) ---
    expo_push_url: str = Field(default="https://exp.host/--/api/v2/push/send")

    # --- Rate limits (slowapi) ---
    rate_limit_default: str = Field(default="100/minute")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values from env
