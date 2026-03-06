"""Application configuration using Pydantic settings."""

from functools import lru_cache
from typing import Optional

from pydantic import PostgresDsn, field_validator
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

    # Database
    database_url: PostgresDsn
    db_echo: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Security
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440  # 24 hours

    # Azure Key Vault (Production)
    azure_key_vault_url: Optional[str] = None
    azure_tenant_id: Optional[str] = None
    azure_client_id: Optional[str] = None
    azure_client_secret: Optional[str] = None

    # Strava API
    strava_client_id: str
    strava_client_secret: str
    strava_redirect_uri: str
    strava_webhook_verify_token: Optional[str] = None

    # External APIs
    mapbox_access_token: str
    openweather_api_key: str
    openweather_base_url: str = "https://api.openweathermap.org/data/2.5"

    # Route data sources
    osm_overpass_url: str = "https://overpass-api.de/api/interpreter"
    hiking_project_api_key: Optional[str] = None

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
