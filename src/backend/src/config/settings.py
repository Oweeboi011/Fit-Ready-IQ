"""Application configuration using Pydantic settings."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Every field here is read by something. Twelve were not, and five of those
    were *required* — `strava_client_id`, `strava_client_secret`,
    `strava_redirect_uri`, `mapbox_access_token` and `openweather_api_key` had
    no default, so the app died on a Pydantic ValidationError before serving
    anything unless you supplied values it then never read. That is why the
    setup docs told you to "leave the values blank": the workaround existed to
    satisfy configuration that did nothing.

    Removed with them: `strava_webhook_verify_token`, `openweather_base_url`,
    `osm_overpass_url`, `hiking_project_api_key` and the three `cache_*_ttl`
    values, none of which had a consumer either. Weather and Strava are handled
    entirely by the Next routes in `src/frontend/src/app/api/`, which read their
    own credentials; duplicating them here only made two sources of truth.

    Re-adding a setting is one line. Keeping an unused one that blocks startup
    is not free, so the bar for adding is a caller that reads it.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Fit-Ready-IQ"
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"

    # Firebase
    firebase_project_id: str
    # Path to service account JSON key file (local dev) OR JSON string (production/env var)
    firebase_service_account_key_path: str | None = None
    firebase_service_account_key_json: str | None = None
    firebase_storage_bucket: str | None = None  # e.g. "project-id.appspot.com"
    # Emulator settings for local development and testing
    firebase_use_emulator: bool = False
    firebase_emulator_host: str = "localhost"
    firebase_firestore_emulator_port: int = 8080
    firebase_auth_emulator_port: int = 9099
    firebase_storage_emulator_port: int = 9199

    # Rate limiting — enforced by slowapi, wired in src/main.py.
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000
    # In-memory by default: each worker then keeps its own counters, so the
    # effective limit is this number times the worker count. Point at Redis
    # (e.g. "redis://host:6379") for any multi-worker deployment.
    rate_limit_storage_uri: str = "memory://"

    # CORS
    #
    # The frontend dev server runs on 4790 (see src/frontend/package.json), not
    # Next's default 3000 — the old default here matched neither runtime, so a
    # local backend rejected every call the local frontend made.
    #
    # Note this is a `list[str]`, and pydantic-settings JSON-decodes complex
    # types straight from the dotenv file before any validator runs. In `.env`
    # it must therefore be a JSON array — `["http://localhost:4790"]` — not the
    # comma-separated form `parse_cors_origins` below accepts. That validator
    # still covers values passed programmatically or via a plain env var.
    cors_origins: list[str] = ["http://localhost:4790", "http://127.0.0.1:4790"]

    # Error tracking
    sentry_dsn: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()  # type: ignore
