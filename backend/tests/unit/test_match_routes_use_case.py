"""Unit tests for MatchRoutesUseCase's orchestration and ranking logic."""

from uuid import uuid4

import pytest

from src.application.use_cases.match_routes_use_case import MatchRoutesUseCase
from src.domain.entities import Route, User
from src.domain.interfaces import IActivityRepository, IRouteRepository, IUserRepository
from src.domain.services import RouteMatchingService
from src.domain.value_objects import Coordinates, FitnessScore, RouteDifficulty

USER_ID = uuid4()
ORIGIN = Coordinates(latitude=47.6, longitude=-121.3)


class FakeRouteRepository(IRouteRepository):
    def __init__(self, routes: list[Route]) -> None:
        self._routes = routes

    async def get_by_id(self, id):
        return next((r for r in self._routes if r.id == id), None)

    async def save(self, entity):
        return entity

    async def delete(self, id):
        return True

    async def search_nearby(
        self,
        coordinates,
        radius_meters,
        activity_type=None,
        max_difficulty=None,
        limit=20,
    ):
        return self._routes[:limit]

    async def search_by_bounds(
        self, min_lat, max_lat, min_lon, max_lon, activity_type=None
    ):
        return self._routes

    async def get_by_name(self, name):
        return [r for r in self._routes if r.name == name]


class FakeActivityRepository(IActivityRepository):
    async def get_by_id(self, id):
        return None

    async def save(self, entity):
        return entity

    async def delete(self, id):
        return True

    async def get_by_user(self, user_id, limit=50, offset=0):
        return []

    async def get_by_date_range(self, user_id, start_date, end_date):
        return []

    async def get_by_external_id(self, external_id, platform):
        return None

    async def save_batch(self, activities):
        return activities


class FakeUserRepository(IUserRepository):
    def __init__(self, user: User | None) -> None:
        self._user = user

    async def get_by_id(self, id):
        return self._user

    async def save(self, entity):
        return entity

    async def delete(self, id):
        return True

    async def get_by_email(self, email):
        return self._user

    async def get_by_strava_id(self, strava_id):
        return self._user

    async def update(self, user):
        return user


class FixedFitnessScoreCalculator:
    """Always returns a fitness score of 50, regardless of activities."""

    def calculate_fitness_score(
        self, activities, user_age=None, user_max_hr=None
    ) -> FitnessScore:
        return FitnessScore(total_score=50.0, experience_level="intermediate")


class NamedDifficultyCalculator:
    """Maps route name -> preset difficulty score, so route-matching outcomes
    (READY/ALMOST_READY/NOT_READY/OVERQUALIFIED) are deterministic per test."""

    SCORES_BY_NAME = {
        "Ready Route": 50.0,
        "Overqualified Route": 20.0,
        "Almost Route": 60.0,
        "Not Ready Route B": 80.0,
        "Not Ready Route A": 100.0,
    }

    def calculate_difficulty(self, route: Route) -> RouteDifficulty:
        score = self.SCORES_BY_NAME[route.name]
        return RouteDifficulty.from_score(
            score=score,
            elevation_factor=0.0,
            distance_factor=0.0,
            technical_factor=0.0,
            grade_factor=0.0,
        )


def make_route(name: str) -> Route:
    return Route(id=uuid4(), name=name, activity_type="hike", distance=10000.0)


@pytest.fixture
def use_case_factory():
    def _make(routes: list[Route], user: User | None):
        return MatchRoutesUseCase(
            route_repository=FakeRouteRepository(routes),
            activity_repository=FakeActivityRepository(),
            user_repository=FakeUserRepository(user),
            fitness_calculator=FixedFitnessScoreCalculator(),
            difficulty_calculator=NamedDifficultyCalculator(),
            matching_service=RouteMatchingService(),
        )

    return _make


@pytest.mark.unit
@pytest.mark.asyncio
async def test_ranks_ready_and_overqualified_before_not_ready(use_case_factory) -> None:
    routes = [
        make_route("Not Ready Route A"),
        make_route("Almost Route"),
        make_route("Overqualified Route"),
        make_route("Not Ready Route B"),
        make_route("Ready Route"),
    ]
    user = User(id=USER_ID)
    use_case = use_case_factory(routes, user)

    results = await use_case.execute(
        user_id=USER_ID, coordinates=ORIGIN, radius_meters=20000, limit=20
    )

    assert [r.route.name for r in results] == [
        "Ready Route",
        "Overqualified Route",
        "Almost Route",
        "Not Ready Route B",
        "Not Ready Route A",
    ]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_raises_when_user_not_found(use_case_factory) -> None:
    use_case = use_case_factory([make_route("Ready Route")], user=None)

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(user_id=USER_ID, coordinates=ORIGIN, radius_meters=5000)
