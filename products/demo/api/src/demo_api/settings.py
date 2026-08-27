from functools import lru_cache

from pydantic import AnyHttpUrl, Field, field_validator
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
    # JWKS endpoint for asymmetric (ES256/RS256) verification — the PRIMARY path on ALL
    # environments. Derived from supabase_url; kept explicit so it can be overridden per env.
    supabase_jwks_url: str | None = Field(default=None)
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

    # --- Observability (Phase 8) ---
    sentry_dsn: str | None = Field(default=None)  # unset => Sentry init is a no-op
    release: str | None = Field(default=None)  # e.g. git SHA; set by the deploy env
    log_level: str = Field(default="INFO")

    # An UNSET optional is None; an empty env line must mean the same thing.
    #
    # Without this, `SUPABASE_JWKS_URL=` in a .env is the empty string, not None — and every
    # guard in the codebase asks `is not None`. So an empty line passed straight through:
    # jwks_url returned "" instead of DERIVING the endpoint from supabase_url, auth.py tried to
    # fetch a JWK set from "", and every authenticated request 401'd with a confusing signature
    # error while the configuration that would have worked sat one field away.
    #
    # It was real enough to earn a CLAUDE.md gotcha telling people not to leave those lines
    # blank. A stamped product's .env is written by hand, so "do not type that" is not a control.
    # Coercing here removes the whole class instead: blank means unset, everywhere, and the
    # derivation and fallbacks behave exactly as they do when the line is absent.
    @field_validator(
        "supabase_url",
        "supabase_jwks_url",
        "supabase_jwt_secret",
        "supabase_service_role_key",
        "sentry_dsn",
        "release",
        mode="before",
    )
    @classmethod
    def _blank_is_unset(cls, value: object) -> object:
        return None if isinstance(value, str) and value.strip() == "" else value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def jwks_url(self) -> str | None:
        """Resolved JWKS endpoint: explicit override first, else derived from supabase_url."""
        if self.supabase_jwks_url is not None:
            return self.supabase_jwks_url
        if self.supabase_url is not None:
            return f"{str(self.supabase_url).rstrip('/')}/auth/v1/.well-known/jwks.json"
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values from env
