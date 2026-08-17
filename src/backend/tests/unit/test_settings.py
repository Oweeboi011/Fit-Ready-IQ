"""Unit tests for application settings helpers."""

import pytest

from src.config.settings import Settings


@pytest.mark.unit
def test_parse_cors_origins_from_comma_separated_string() -> None:
    """CORS origins should parse from a single comma-separated environment value."""
    settings = Settings(
        firebase_project_id="fit-ready-iq-test",
        cors_origins="http://localhost:3000, https://example.com",
    )

    assert settings.cors_origins == ["http://localhost:3000", "https://example.com"]


@pytest.mark.unit
def test_parse_cors_origins_from_list() -> None:
    """CORS origins should preserve list values as-is."""
    origins = ["http://localhost:3000", "https://example.com"]
    settings = Settings(
        firebase_project_id="fit-ready-iq-test",
        cors_origins=origins,
    )

    assert settings.cors_origins == origins


@pytest.mark.unit
def test_only_firebase_project_id_is_required() -> None:
    """Settings must construct from the one value the app actually reads.

    Five required settings — the three `strava_*`, `mapbox_access_token` and
    `openweather_api_key` — were never read by anything, yet their absence
    raised a ValidationError before the app served a single request. The setup
    docs worked around it by telling people to leave the values blank. This
    asserts the workaround is no longer needed, so nobody reintroduces a
    required setting without a caller.
    """
    settings = Settings(firebase_project_id="fit-ready-iq-test")

    assert settings.firebase_project_id == "fit-ready-iq-test"
    # Defaults still apply for everything else.
    assert settings.log_level == "INFO"
    assert settings.rate_limit_storage_uri == "memory://"


@pytest.mark.unit
def test_removed_settings_are_gone() -> None:
    """The unused settings stay removed.

    Named explicitly rather than counted, so re-adding one is a deliberate act
    that updates this list — not something that slips back in with a copied
    config block.
    """
    for field in (
        "strava_client_id",
        "strava_client_secret",
        "strava_redirect_uri",
        "strava_webhook_verify_token",
        "mapbox_access_token",
        "openweather_api_key",
        "openweather_base_url",
        "osm_overpass_url",
        "hiking_project_api_key",
        "cache_activities_ttl",
        "cache_routes_ttl",
        "cache_weather_ttl",
    ):
        assert field not in Settings.model_fields, (
            f"{field} is back in Settings. If something now reads it, that is "
            f"fine — update this test. If nothing does, remove it again."
        )
