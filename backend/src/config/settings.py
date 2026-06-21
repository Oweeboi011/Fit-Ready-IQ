"""Application configuration using Pydantic settings."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

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

    # Strava API
    strava_client_id: str
    strava_client_secret: str
    strava_redirect_uri: str
    strava_webhook_verify_token: str | None = None

    # External APIs
    mapbox_access_token: str
    openweather_api_key: str
    openweather_base_url: str = "https://api.openweathermap.org/data/2.5"

    # Route data sources
    osm_overpass_url: str = "https://overpass-api.de/api/interpreter"
    hiking_project_api_key: str | None = None

    # Rate limiting
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000

    # Cache TTL (seconds)
    cache_activities_ttl: int = 900  # 15 minutes
    cache_routes_ttl: int = 86400  # 24 hours
    cache_weather_ttl: int = 3600  # 1 hour

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

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
