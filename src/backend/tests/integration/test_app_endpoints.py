"""Integration tests for core API endpoints and middleware."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_health_endpoint_payload(client: TestClient) -> None:
    """Health endpoint should return status, environment, and version."""
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert "environment" in payload
    assert payload["version"] == "0.1.0"


@pytest.mark.integration
def test_root_endpoint_payload(client: TestClient) -> None:
    """Root endpoint should expose API navigation metadata."""
    response = client.get("/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "Welcome to Fit-Ready-IQ API"
    assert payload["docs"] == "/docs"
    assert payload["health"] == "/health"


@pytest.mark.integration
def test_cors_preflight_returns_allowed_origin(client: TestClient) -> None:
    """CORS middleware should allow configured local frontend origins."""
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
