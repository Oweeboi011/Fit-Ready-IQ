"""Domain service behaviour: fitness scoring, route difficulty, and matching.

These went untested long enough for `calculate_fitness_score` to crash on every
non-empty input (naive/aware datetime comparison) without anything noticing.
The first test class exists primarily so that cannot happen again.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.domain.entities import Activity, Route
from src.domain.services import (
    FitnessScoreCalculator,
    RouteDifficultyCalculator,
    RouteMatchingService,
)
from src.domain.value_objects import FitnessScore, ReadinessStatus, RouteDifficulty


def activity(
    days_ago: float = 1,
    activity_type: str = "run",
    distance: float = 10000.0,
    duration: int = 3600,
    hr: float | None = 150.0,
) -> Activity:
    """An activity `days_ago` in the past, with a timezone-aware start date."""
    return Activity(
        id=uuid4(),
        user_id=uuid4(),
        activity_type=activity_type,
        start_date=datetime.now(UTC) - timedelta(days=days_ago),
        distance=distance,
        duration=duration,
        average_heart_rate=hr,
    )


def route(**kwargs) -> Route:
    defaults = dict(
        id=uuid4(),
        name="Test Route",
        activity_type="hike",
        distance=10000.0,
        elevation_gain=500.0,
        max_grade=10.0,
        avg_grade=5.0,
        technical_rating=3,
        surface_types=["dirt"],
    )
    defaults.update(kwargs)
    return Route(**defaults)


class TestFitnessScoreCalculatorRegression:
    def test_scores_timezone_aware_activities_without_crashing(self):
        """The regression that motivated this file.

        Activity.start_date is timezone-aware; the service compared it against
        a naive `datetime.utcnow()`, so this raised TypeError for any non-empty
        list — the entire fitness score was dead on arrival.
        """
        result = FitnessScoreCalculator().calculate_fitness_score([activity()])
        assert 0.0 <= result.total_score <= 100.0

    def test_recent_activity_actually_counts_toward_volume(self):
        """Guards the same bug from the other side: a crash-free but always-zero
        volume score would pass the test above and still be wrong."""
        result = FitnessScoreCalculator().calculate_fitness_score(
            [activity(days_ago=d) for d in (1, 3, 5, 7)]
        )
        assert result.volume_score is not None
        assert result.volume_score > 0


class TestFitnessScoreCalculator:
    def setup_method(self):
        self.calc = FitnessScoreCalculator()

    def test_no_activities_scores_zero_and_reads_beginner(self):
        result = self.calc.calculate_fitness_score([])
        assert result.total_score == 0.0
        assert result.experience_level == "beginner"

    def test_score_is_bounded_to_0_100(self):
        # Absurd volume must not produce a score above 100.
        huge = [
            activity(days_ago=i * 0.1, distance=100000.0, duration=36000)
            for i in range(60)
        ]
        result = self.calc.calculate_fitness_score(huge, user_age=30, user_max_hr=190)
        assert 0.0 <= result.total_score <= 100.0

    def test_activities_outside_the_window_do_not_count_as_volume(self):
        stale = self.calc.calculate_fitness_score([activity(days_ago=200)])
        assert stale.volume_score == 0.0

    def test_more_training_scores_at_least_as_high_as_less(self):
        light = self.calc.calculate_fitness_score([activity(days_ago=1)])
        heavy = self.calc.calculate_fitness_score(
            [activity(days_ago=i) for i in range(1, 20)]
        )
        assert heavy.total_score >= light.total_score

    def test_consistency_does_not_collapse_across_a_year_boundary(self):
        """Weeks were keyed on ISO week number alone, so week 1 of the new year
        landed in the same bucket as week 1 of the old one. Two activities in
        genuinely different weeks must be counted as two weeks."""
        # Build activities either side of a New Year, inside an 8-week window.
        base = datetime.now(UTC)
        acts = [
            Activity(
                id=uuid4(),
                user_id=uuid4(),
                activity_type="run",
                start_date=base - timedelta(days=d),
                distance=10000.0,
                duration=3600,
            )
            for d in (1, 8, 15, 22, 29, 36, 43, 50)
        ]
        result = self.calc.calculate_fitness_score(acts)
        # Eight activities spread one per week across eight weeks is highly
        # consistent; a bucket collision would depress this.
        assert result.consistency_score is not None
        assert result.consistency_score > 50

    @pytest.mark.parametrize("activity_type", ["run", "hike", "bike", "rock_climb"])
    def test_handles_every_activity_type(self, activity_type):
        result = self.calc.calculate_fitness_score(
            [activity(activity_type=activity_type)]
        )
        assert 0.0 <= result.total_score <= 100.0

    def test_handles_activities_with_no_heart_rate(self):
        result = self.calc.calculate_fitness_score([activity(hr=None)])
        assert 0.0 <= result.total_score <= 100.0

    def test_zero_duration_does_not_divide_by_zero(self):
        result = self.calc.calculate_fitness_score([activity(duration=0, distance=0.0)])
        assert 0.0 <= result.total_score <= 100.0


class TestRouteDifficultyCalculator:
    def setup_method(self):
        self.calc = RouteDifficultyCalculator()

    def test_returns_a_bounded_score(self):
        result = self.calc.calculate_difficulty(route())
        assert 0.0 <= result.score <= 100.0

    def test_a_harder_route_scores_higher(self):
        easy = self.calc.calculate_difficulty(
            route(
                distance=2000.0,
                elevation_gain=50.0,
                max_grade=2.0,
                avg_grade=1.0,
                technical_rating=1,
                surface_types=["dirt"],
            )
        )
        hard = self.calc.calculate_difficulty(
            route(
                distance=40000.0,
                elevation_gain=2500.0,
                max_grade=30.0,
                avg_grade=15.0,
                technical_rating=5,
                surface_types=["rock", "scree"],
            )
        )
        assert hard.score > easy.score

    def test_zero_distance_does_not_divide_by_zero(self):
        result = self.calc.calculate_difficulty(route(distance=0.0))
        assert 0.0 <= result.score <= 100.0

    @pytest.mark.parametrize("activity_type", ["hike", "rock_climb", "bike"])
    def test_weights_every_activity_type(self, activity_type):
        result = self.calc.calculate_difficulty(route(activity_type=activity_type))
        assert 0.0 <= result.score <= 100.0

    def test_technical_surfaces_raise_the_score(self):
        plain = self.calc.calculate_difficulty(route(surface_types=[]))
        rocky = self.calc.calculate_difficulty(route(surface_types=["rock", "boulder"]))
        assert rocky.score > plain.score

    def test_surface_matching_ignores_case(self):
        lower = self.calc.calculate_difficulty(route(surface_types=["rock"]))
        upper = self.calc.calculate_difficulty(route(surface_types=["ROCK"]))
        assert lower.score == upper.score

    def test_extreme_input_stays_bounded(self):
        result = self.calc.calculate_difficulty(
            route(
                distance=500000.0,
                elevation_gain=20000.0,
                max_grade=90.0,
                avg_grade=60.0,
                technical_rating=5,
                surface_types=["rock", "scree", "boulder", "technical"],
            )
        )
        assert result.score <= 100.0


class TestRouteMatchingService:
    def setup_method(self):
        self.svc = RouteMatchingService()

    def _match(self, fitness: float, difficulty: float):
        return self.svc.match_user_to_route(
            FitnessScore(total_score=fitness, experience_level="intermediate"),
            RouteDifficulty.from_score(
                score=difficulty,
                elevation_factor=0.0,
                distance_factor=0.0,
                technical_factor=0.0,
                grade_factor=0.0,
            ),
        )

    @pytest.mark.parametrize(
        "fitness,difficulty,expected",
        [
            (90.0, 40.0, ReadinessStatus.OVERQUALIFIED),  # gap -50
            (60.0, 60.0, ReadinessStatus.READY),  # gap 0
            (60.0, 64.0, ReadinessStatus.READY),  # gap 4, inside the +5 band
            (60.0, 70.0, ReadinessStatus.ALMOST_READY),  # gap 10
            (60.0, 80.0, ReadinessStatus.NOT_READY),  # gap 20
            (20.0, 95.0, ReadinessStatus.NOT_READY),  # gap 75
        ],
    )
    def test_readiness_bands(self, fitness, difficulty, expected):
        assert self._match(fitness, difficulty).readiness == expected

    def test_a_ready_route_needs_no_training(self):
        assert self._match(60.0, 60.0).training_weeks_needed == 0

    def test_a_bigger_gap_never_needs_less_training(self):
        near = self._match(60.0, 70.0).training_weeks_needed
        far = self._match(20.0, 95.0).training_weeks_needed
        assert far >= near

    def test_gap_is_difficulty_minus_fitness(self):
        assert self._match(40.0, 70.0).gap == pytest.approx(30.0)

    def test_every_verdict_carries_a_recommendation(self):
        for fitness, difficulty in [
            (90.0, 40.0),
            (60.0, 60.0),
            (60.0, 70.0),
            (20.0, 95.0),
        ]:
            assert self._match(fitness, difficulty).recommendation.strip()

    def test_confidence_stays_within_its_declared_range(self):
        for fitness, difficulty in [(90.0, 10.0), (50.0, 50.0), (10.0, 99.0)]:
            assert 0.5 <= self._match(fitness, difficulty).confidence <= 1.0

    def test_a_wild_mismatch_lowers_confidence(self):
        close = self._match(50.0, 55.0).confidence
        wild = self._match(10.0, 99.0).confidence
        assert wild < close

    def test_component_scores_raise_confidence(self):
        difficulty = RouteDifficulty.from_score(
            score=50.0,
            elevation_factor=0.0,
            distance_factor=0.0,
            technical_factor=0.0,
            grade_factor=0.0,
        )
        bare = self.svc.match_user_to_route(
            FitnessScore(total_score=50.0, experience_level="intermediate"), difficulty
        )
        detailed = self.svc.match_user_to_route(
            FitnessScore(
                total_score=50.0,
                experience_level="intermediate",
                vo2max_score=60.0,
                volume_score=55.0,
            ),
            difficulty,
        )
        assert detailed.confidence > bare.confidence


class TestServicesComposeEndToEnd:
    def test_activities_to_a_readiness_verdict(self):
        """The whole chain the /best-fit endpoint depends on."""
        fitness = FitnessScoreCalculator().calculate_fitness_score(
            [activity(days_ago=i) for i in range(1, 15)], user_age=35, user_max_hr=185
        )
        difficulty = RouteDifficultyCalculator().calculate_difficulty(route())
        match = RouteMatchingService().match_user_to_route(fitness, difficulty)

        assert isinstance(match.readiness, ReadinessStatus)
        assert match.recommendation
        assert 0.5 <= match.confidence <= 1.0
