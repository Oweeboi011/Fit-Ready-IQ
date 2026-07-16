"""Use case: rank nearby routes by how well they fit a user's current fitness."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from ...domain.entities import Route
from ...domain.interfaces import IActivityRepository, IRouteRepository, IUserRepository
from ...domain.services import (
    FitnessScoreCalculator,
    RouteDifficultyCalculator,
    RouteMatchingService,
)
from ...domain.value_objects import Coordinates, RouteDifficulty, RouteMatch

ACTIVITY_LOOKBACK_WEEKS = 8


@dataclass(frozen=True)
class RouteMatchResult:
    """A single ranked route paired with its computed difficulty and match."""

    route: Route
    difficulty: RouteDifficulty
    match: RouteMatch


class MatchRoutesUseCase:
    """Orchestrates fitness scoring, difficulty scoring, and matching across
    a set of candidate routes to produce a best-fit-first ranking."""

    def __init__(
        self,
        route_repository: IRouteRepository,
        activity_repository: IActivityRepository,
        user_repository: IUserRepository,
        fitness_calculator: FitnessScoreCalculator,
        difficulty_calculator: RouteDifficultyCalculator,
        matching_service: RouteMatchingService,
    ) -> None:
        self._route_repository = route_repository
        self._activity_repository = activity_repository
        self._user_repository = user_repository
        self._fitness_calculator = fitness_calculator
        self._difficulty_calculator = difficulty_calculator
        self._matching_service = matching_service

    async def execute(
        self,
        user_id: UUID,
        coordinates: Coordinates,
        radius_meters: float,
        activity_type: str | None = None,
        limit: int = 20,
    ) -> list[RouteMatchResult]:
        user = await self._user_repository.get_by_id(user_id)
        if user is None:
            raise ValueError(f"User {user_id} not found")

        end_date = datetime.now(UTC)
        start_date = end_date - timedelta(weeks=ACTIVITY_LOOKBACK_WEEKS)
        activities = await self._activity_repository.get_by_date_range(
            user_id, start_date=start_date, end_date=end_date
        )

        # The domain User entity does not carry age/max_heart_rate today, so
        # the calculator falls back to its built-in defaults for both.
        fitness_score = self._fitness_calculator.calculate_fitness_score(
            activities, user_age=None, user_max_hr=None
        )

        routes = await self._route_repository.search_nearby(
            coordinates,
            radius_meters,
            activity_type=activity_type,
            limit=limit,
        )

        results = []
        for route in routes:
            difficulty = self._difficulty_calculator.calculate_difficulty(route)
            match = self._matching_service.match_user_to_route(
                fitness_score, difficulty
            )
            results.append(
                RouteMatchResult(route=route, difficulty=difficulty, match=match)
            )

        return sorted(results, key=self._rank_key)

    @staticmethod
    def _rank_key(result: "RouteMatchResult") -> tuple[int, float, str]:
        """Ready/overqualified routes first (closest fitness gap first), then
        not-ready routes (soonest training time first); route name breaks ties."""
        if result.match.is_ready:
            return (0, abs(result.match.gap), result.route.name)
        return (1, float(result.match.training_weeks_needed), result.route.name)
