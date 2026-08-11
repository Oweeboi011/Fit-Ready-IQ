"""Unit tests for application settings helpers."""

import pytest

from src.config.settings import Settings


@pytest.mark.unit
def test_parse_cors_origins_from_comma_separated_string() -> None:
    """CORS origins should parse from a single comma-separated environment value."""
    settings = Settings(
        firebase_project_id="fit-ready-iq-test",
        strava_client_id="strava-id",
        strava_client_secret="strava-secret",
        strava_redirect_uri="http://localhost:8000/auth/strava/callback",
        mapbox_access_token="mapbox-token",
        openweather_api_key="weather-key",
        cors_origins="http://localhost:3000, https://example.com",
    )

    assert settings.cors_origins == ["http://localhost:3000", "https://example.com"]


@pytest.mark.unit
def test_parse_cors_origins_from_list() -> None:
    """CORS origins should preserve list values as-is."""
    origins = ["http://localhost:3000", "https://example.com"]
    settings = Settings(
        firebase_project_id="fit-ready-iq-test",
        strava_client_id="strava-id",
        strava_client_secret="strava-secret",
        strava_redirect_uri="http://localhost:8000/auth/strava/callback",
        mapbox_access_token="mapbox-token",
        openweather_api_key="weather-key",
        cors_origins=origins,
    )

    assert settings.cors_origins == origins
