"""Value object invariants.

These types are where the domain's validation lives — a Coordinates that accepts
a latitude of 200, or a FitnessScore that accepts 400, would let bad data travel
all the way to the API response before anyone noticed.
"""

import pytest

from src.domain.value_objects import (
    Coordinates,
    DifficultyLevel,
    FitnessScore,
    HeartRateZones,
    ReadinessStatus,
    RouteDifficulty,
    RouteMatch,
)


class TestCoordinates:
    @pytest.mark.parametrize(
        "lat,lon", [(0, 0), (90, 180), (-90, -180), (14.6, 121.0), (51.5, -0.12)]
    )
    def test_accepts_valid_coordinates(self, lat, lon):
        coords = Coordinates(latitude=lat, longitude=lon)
        assert coords.latitude == lat

    @pytest.mark.parametrize("lat", [90.1, -90.1, 200, -200])
    def test_rejects_out_of_range_latitude(self, lat):
        with pytest.raises(ValueError, match="Latitude"):
            Coordinates(latitude=lat, longitude=0)

    @pytest.mark.parametrize("lon", [180.1, -180.1, 400])
    def test_rejects_out_of_range_longitude(self, lon):
        with pytest.raises(ValueError, match="Longitude"):
            Coordinates(latitude=0, longitude=lon)

    def test_distance_to_self_is_zero(self):
        c = Coordinates(latitude=14.6, longitude=121.0)
        assert c.distance_to(c) == pytest.approx(0.0, abs=1e-6)

    def test_distance_is_symmetric(self):
        a = Coordinates(latitude=14.6, longitude=121.0)
        b = Coordinates(latitude=15.0, longitude=121.5)
        assert a.distance_to(b) == pytest.approx(b.distance_to(a))

    def test_one_degree_of_latitude_is_about_111_km(self):
        """A known physical value — catches a radians/degrees or radius slip."""
        a = Coordinates(latitude=0.0, longitude=0.0)
        b = Coordinates(latitude=1.0, longitude=0.0)
        assert a.distance_to(b) == pytest.approx(111_195, rel=0.01)

    def test_antipodal_points_are_half_the_circumference_apart(self):
        a = Coordinates(latitude=0.0, longitude=0.0)
        b = Coordinates(latitude=0.0, longitude=180.0)
        assert a.distance_to(b) == pytest.approx(20_015_086, rel=0.01)

    def test_is_immutable(self):
        c = Coordinates(latitude=1.0, longitude=2.0)
        with pytest.raises(Exception):
            c.latitude = 5.0  # type: ignore[misc]


class TestFitnessScore:
    @pytest.mark.parametrize("score", [0, 50, 100])
    def test_accepts_scores_in_range(self, score):
        assert FitnessScore(total_score=score).total_score == score

    @pytest.mark.parametrize("score", [-1, 101, 1000])
    def test_rejects_scores_out_of_range(self, score):
        with pytest.raises(ValueError, match="Total score"):
            FitnessScore(total_score=score)

    @pytest.mark.parametrize(
        "score,grade",
        [
            (95, "A+"),
            (90, "A+"),
            (85, "A"),
            (80, "A"),
            (75, "B"),
            (70, "B"),
            (65, "C"),
            (60, "C"),
            (55, "D"),
            (50, "D"),
            (49, "F"),
            (0, "F"),
        ],
    )
    def test_grade_boundaries(self, score, grade):
        assert FitnessScore(total_score=score).grade == grade


class TestRouteDifficulty:
    @pytest.mark.parametrize(
        "score,level",
        [
            (0, DifficultyLevel.EASY),
            (24.9, DifficultyLevel.EASY),
            (25, DifficultyLevel.MODERATE),
            (49.9, DifficultyLevel.MODERATE),
            (50, DifficultyLevel.HARD),
            (74.9, DifficultyLevel.HARD),
            (75, DifficultyLevel.EXPERT),
            (100, DifficultyLevel.EXPERT),
        ],
    )
    def test_level_boundaries(self, score, level):
        result = RouteDifficulty.from_score(
            score=score,
            elevation_factor=0.0,
            distance_factor=0.0,
            technical_factor=0.0,
            grade_factor=0.0,
        )
        assert result.level == level

    @pytest.mark.parametrize("score", [-1, 101])
    def test_rejects_scores_out_of_range(self, score):
        with pytest.raises(ValueError, match="Difficulty score"):
            RouteDifficulty.from_score(
                score=score,
                elevation_factor=0.0,
                distance_factor=0.0,
                technical_factor=0.0,
                grade_factor=0.0,
            )


class TestRouteMatch:
    def _match(self, readiness=ReadinessStatus.READY, confidence=0.8) -> RouteMatch:
        return RouteMatch(
            readiness=readiness,
            fitness_score=60.0,
            route_difficulty=60.0,
            gap=0.0,
            recommendation="ok",
            training_weeks_needed=0,
            confidence=confidence,
        )

    @pytest.mark.parametrize("confidence", [-0.1, 1.1])
    def test_rejects_confidence_outside_0_to_1(self, confidence):
        with pytest.raises(ValueError, match="Confidence"):
            self._match(confidence=confidence)

    @pytest.mark.parametrize(
        "readiness,expected",
        [
            (ReadinessStatus.READY, True),
            (ReadinessStatus.OVERQUALIFIED, True),
            (ReadinessStatus.ALMOST_READY, False),
            (ReadinessStatus.NOT_READY, False),
        ],
    )
    def test_is_ready_covers_every_status(self, readiness, expected):
        assert self._match(readiness=readiness).is_ready is expected


class TestHeartRateZones:
    def setup_method(self):
        self.zones = HeartRateZones(max_hr=200)

    @pytest.mark.parametrize(
        "hr,zone",
        [
            (50, 0),  # below zone 1
            (99, 0),  # just below 50% of 200
            (100, 1),  # 50%
            (120, 1),  # 60%, top of zone 1
            (121, 2),
            (140, 2),  # 70%
            (141, 3),
            (160, 3),  # 80%
            (161, 4),
            (180, 4),  # 90%
            (181, 5),
            (200, 5),  # max
            (250, 5),  # above max still reads as the top zone
        ],
    )
    def test_zone_boundaries(self, hr, zone):
        assert self.zones.get_zone(hr) == zone

    def test_zones_are_contiguous_and_ascending(self):
        """Each zone's minimum equals the previous zone's maximum — a gap would
        make some heart rate fall into no zone at all."""
        assert self.zones.zone1_max == self.zones.zone2_min
        assert self.zones.zone2_max == self.zones.zone3_min
        assert self.zones.zone3_max == self.zones.zone4_min
        assert self.zones.zone4_max == self.zones.zone5_min
        assert self.zones.zone5_max == self.zones.max_hr

    def test_every_heart_rate_up_to_max_lands_in_a_zone(self):
        for hr in range(0, 201):
            assert 0 <= self.zones.get_zone(hr) <= 5
