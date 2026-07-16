"""Integration test for GET /api/routes/best-fit.

Uses FastAPI dependency_overrides to stand in for Firebase auth and the
Firestore-backed use case, rather than minting real Firebase emulator tokens
or seeding Firestore documents — this exercises routing, request validation,
and response serialization end-to-end without new emulator test fixtures.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.application.use_cases.match_routes_use_case import RouteMatchResult
from src.domain.entities import Route
from src.domain.value_objects import (
    DifficultyLevel,
    ReadinessStatus,
    RouteDifficulty,
    RouteMatch,
)
from src.main import app
from src.presentation.dependencies import get_current_user_id, get_match_routes_use_case


class StubUseCase:
    def __init__(self, results: list[RouteMatchResult]) -> None:
        self._results = results

    async def execute(self, **kwargs):
        return self._results


@pytest.fixture
def override_best_fit_dependencies():
    route = Route(
        id=uuid4(), name="Ridge Trail", activity_type="hike", distance=10000.0
    )
    difficulty = RouteDifficulty.from_score(
        score=55.0,
        elevation_factor=0.0,
        distance_factor=0.0,
        technical_factor=0.0,
        grade_factor=0.0,
    )
    match = RouteMatch(
        readiness=ReadinessStatus.READY,
        fitness_score=55.0,
        route_difficulty=55.0,
        gap=0.0,
        recommendation="You're ready for this route!",
        training_weeks_needed=0,
        confidence=0.9,
    )
    result = RouteMatchResult(route=route, difficulty=difficulty, match=match)

    app.dependency_overrides[get_current_user_id] = lambda: "test-firebase-uid"
    app.dependency_overrides[get_match_routes_use_case] = lambda: StubUseCase([result])

    yield route

    app.dependency_overrides.pop(get_current_user_id, None)
    app.dependency_overrides.pop(get_match_routes_use_case, None)


@pytest.mark.integration
def test_best_fit_routes_returns_ranked_matches(
    client: TestClient, override_best_fit_dependencies: Route
) -> None:
    route = override_best_fit_dependencies

    response = client.get(
        "/api/routes/best-fit",
        params={"lat": 47.6, "lon": -121.3, "radius_km": 10},
        headers={"Authorization": "Bearer fake-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["route_id"] == str(route.id)
    assert payload[0]["name"] == "Ridge Trail"
    assert payload[0]["readiness"] == "ready"
    assert payload[0]["difficulty_level"] == DifficultyLevel.HARD.value


@pytest.mark.integration
def test_best_fit_routes_requires_bearer_token(client: TestClient) -> None:
    app.dependency_overrides[get_match_routes_use_case] = lambda: StubUseCase([])
    try:
        response = client.get(
            "/api/routes/best-fit",
            params={"lat": 47.6, "lon": -121.3},
            headers={"Authorization": "Token not-a-bearer"},
        )
    finally:
        app.dependency_overrides.pop(get_match_routes_use_case, None)

    assert response.status_code == 401


@pytest.mark.integration
def test_best_fit_routes_validates_latitude_range(client: TestClient) -> None:
    app.dependency_overrides[get_current_user_id] = lambda: "test-firebase-uid"
    try:
        response = client.get(
            "/api/routes/best-fit",
            params={"lat": 200, "lon": -121.3},
            headers={"Authorization": "Bearer fake-token"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)

    assert response.status_code == 422
