"""Tests for the logging processor chain.

The case that matters is the one that motivated it: an httpx error, stringified
into an ordinary-looking ``error`` field, carrying the API key in a URL query
string. Everything else here guards the edges around that.
"""

import logging

import httpx
import pytest

from src.config.logging import (
    REDACTED,
    configure_logging,
    resolve_level,
    scrub_secrets,
)


def scrub(**fields: object) -> dict:
    """Runs the processor the way structlog would."""
    return scrub_secrets(None, "info", dict(fields))  # type: ignore[arg-type]


class TestUrlCredentialScrubbing:
    """The leak this module exists to stop."""

    def test_redacts_key_from_a_real_httpx_error(self) -> None:
        # Built exactly as GoogleMapsClient does: credential as a query param,
        # then raise_for_status().
        request = httpx.Request(
            "GET",
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": "Manila", "key": "AIzaSy-SUPER-SECRET-KEY"},
        )
        try:
            httpx.Response(403, request=request).raise_for_status()
        except httpx.HTTPStatusError as exc:
            message = str(exc)

        assert "AIzaSy-SUPER-SECRET-KEY" in message, "precondition: httpx does leak it"

        scrubbed = scrub(error=message)
        assert "AIzaSy-SUPER-SECRET-KEY" not in scrubbed["error"]
        assert REDACTED in scrubbed["error"]

    def test_keeps_the_diagnostic_part_of_the_message(self) -> None:
        scrubbed = scrub(
            error="Client error '403 Forbidden' for url 'https://x/y?key=SECRET'"
        )
        assert "403 Forbidden" in scrubbed["error"]

    @pytest.mark.parametrize(
        "param", ["key", "api_key", "apikey", "access_token", "token", "password"]
    )
    def test_redacts_each_credential_query_parameter(self, param: str) -> None:
        scrubbed = scrub(error=f"failed for url 'https://x/y?a=1&{param}=SECRETVALUE'")
        assert "SECRETVALUE" not in scrubbed["error"]

    def test_leaves_ordinary_query_parameters_alone(self) -> None:
        scrubbed = scrub(error="failed for url 'https://x/y?address=Manila&key=S'")
        assert "address=Manila" in scrubbed["error"]


class TestFieldRedaction:
    def test_redacts_by_field_name(self) -> None:
        assert scrub(api_key="abc")["api_key"] == REDACTED
        assert scrub(access_token="abc")["access_token"] == REDACTED
        assert scrub(authorization="Bearer x")["authorization"] == REDACTED
        assert scrub(client_secret="x")["client_secret"] == REDACTED

    def test_redacts_nested_fields(self) -> None:
        out = scrub(request={"headers": {"Authorization": "Bearer live"}})
        assert out["request"]["headers"]["Authorization"] == REDACTED

    def test_leaves_ordinary_fields_intact(self) -> None:
        out = scrub(event="geocode_error", status=403, count=2)
        assert out == {"event": "geocode_error", "status": 403, "count": 2}

    def test_truncates_a_very_long_string(self) -> None:
        out = scrub(error="x" * 2000)
        assert len(out["error"]) < 600
        assert "chars]" in out["error"]

    def test_bounds_lists(self) -> None:
        assert len(scrub(items=list(range(100)))["items"]) == 20

    def test_stops_at_a_depth_limit(self) -> None:
        # Strings are leaves and return before the depth check, so the guard is
        # only reached by genuinely nested *containers* — which is what it is
        # there for.
        out = scrub(a={"b": {"c": {"d": {"e": {"f": {"g": "deep"}}}}}})
        assert "depth limit" in str(out)

    def test_terminates_on_a_cyclic_structure(self) -> None:
        # The reason the depth guard exists: a self-referencing dict would
        # otherwise recurse until the stack gave out, taking the request with it.
        cyclic: dict = {"name": "x"}
        cyclic["self"] = cyclic
        assert "depth limit" in str(scrub(payload=cyclic))


class TestLevelResolution:
    """LOG_LEVEL was previously decorative — structlog did no filtering."""

    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("DEBUG", logging.DEBUG),
            ("info", logging.INFO),
            ("  WARNING  ", logging.WARNING),
            ("ERROR", logging.ERROR),
        ],
    )
    def test_resolves_known_levels(self, name: str, expected: int) -> None:
        assert resolve_level(name) == expected

    def test_falls_back_to_info_for_nonsense(self) -> None:
        assert resolve_level("chatty") == logging.INFO
        assert resolve_level("") == logging.INFO

    def test_configure_applies_the_filter(self, capsys: pytest.CaptureFixture) -> None:
        import structlog

        configure_logging("ERROR")
        log = structlog.get_logger()
        log.info("should_not_appear")
        log.error("should_appear")

        out = capsys.readouterr().out
        assert "should_not_appear" not in out
        assert "should_appear" in out

    def test_configure_emits_json_with_scrubbing(
        self, capsys: pytest.CaptureFixture
    ) -> None:
        import json

        import structlog

        configure_logging("INFO")
        structlog.get_logger().error(
            "geocode_error", error="for url 'https://x/y?key=LEAKED'"
        )

        line = capsys.readouterr().out.strip().splitlines()[-1]
        parsed = json.loads(line)
        assert parsed["event"] == "geocode_error"
        assert parsed["level"] == "error"
        assert "LEAKED" not in line

    @pytest.fixture(autouse=True)
    def _restore_default_config(self):
        """Other tests share the global structlog config; put it back."""
        yield
        configure_logging("INFO")
