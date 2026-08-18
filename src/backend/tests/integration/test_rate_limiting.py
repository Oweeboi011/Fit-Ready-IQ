"""Rate limiting behaviour.

`slowapi` was a declared dependency with no limiter attached for a long time, so
RATE_LIMIT_PER_MINUTE was a setting that did nothing. These tests exist so that
cannot silently become true again.
"""

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.main import _on_rate_limit_exceeded, app, rate_limit_key


def build_app(limit: str) -> FastAPI:
    """A miniature app wired exactly like src/main.py, but with a tiny limit.

    Rebuilt rather than reusing the real app so the test does not depend on the
    configured production limits, and so its counters cannot leak into other
    tests through slowapi's process-wide memory storage.
    """
    limiter = Limiter(
        key_func=rate_limit_key, default_limits=[limit], storage_uri="memory://"
    )
    test_app = FastAPI()
    test_app.state.limiter = limiter
    test_app.add_exception_handler(RateLimitExceeded, _on_rate_limit_exceeded)
    test_app.add_middleware(SlowAPIMiddleware)

    @test_app.get("/thing")
    async def thing(request: Request) -> dict[str, bool]:
        return {"ok": True}

    @test_app.get("/health")
    @limiter.exempt
    async def health(request: Request) -> dict[str, bool]:
        return {"ok": True}

    return test_app


class TestRateLimiting:
    def test_requests_within_the_limit_are_served(self):
        with TestClient(build_app("3/minute")) as client:
            for _ in range(3):
                assert client.get("/thing").status_code == 200

    def test_exceeding_the_limit_answers_429(self):
        with TestClient(build_app("3/minute")) as client:
            for _ in range(3):
                client.get("/thing")
            assert client.get("/thing").status_code == 429

    def test_health_is_exempt(self):
        """An uptime probe must not be able to exhaust the budget for real traffic."""
        with TestClient(build_app("2/minute")) as client:
            for _ in range(10):
                assert client.get("/health").status_code == 200

    def test_limits_apply_per_caller_not_globally(self):
        """Two different bearer tokens get their own budgets.

        Keying on IP alone would put a whole office behind one NAT into a single
        bucket, so one heavy user throttles everyone.
        """
        with TestClient(build_app("2/minute")) as client:
            for _ in range(2):
                client.get("/thing", headers={"Authorization": "Bearer token-a"})
            # Token A is now spent.
            spent = client.get("/thing", headers={"Authorization": "Bearer token-a"})
            assert spent.status_code == 429
            # Token B is untouched.
            fresh = client.get("/thing", headers={"Authorization": "Bearer token-b"})
            assert fresh.status_code == 200


class TestRateLimitKey:
    def _request(self, headers: dict[str, str]) -> Request:
        scope = {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": ("203.0.113.7", 1234),
        }
        return Request(scope)

    def test_authenticated_callers_are_keyed_by_token(self):
        key = rate_limit_key(self._request({"Authorization": "Bearer abc"}))
        assert key.startswith("user:")

    def test_the_raw_token_never_appears_in_the_key(self):
        """Keys reach logs and metrics; a live credential must not ride along."""
        key = rate_limit_key(
            self._request({"Authorization": "Bearer super-secret-token"})
        )
        assert "super-secret-token" not in key

    def test_the_same_token_maps_to_a_stable_key(self):
        a = rate_limit_key(self._request({"Authorization": "Bearer abc"}))
        b = rate_limit_key(self._request({"Authorization": "Bearer abc"}))
        assert a == b

    def test_different_tokens_map_to_different_keys(self):
        a = rate_limit_key(self._request({"Authorization": "Bearer abc"}))
        b = rate_limit_key(self._request({"Authorization": "Bearer xyz"}))
        assert a != b

    @pytest.mark.parametrize("header", ["", "Bearer", "Bearer   ", "Basic abc"])
    def test_falls_back_to_ip_without_a_usable_bearer_token(self, header):
        key = rate_limit_key(self._request({"Authorization": header} if header else {}))
        assert key.startswith("ip:")


class TestRealAppIsLimited:
    def test_the_shipped_app_has_a_limiter_installed(self):
        """Guards against the limiter being dropped from src/main.py again."""
        assert getattr(app.state, "limiter", None) is not None
