"""Value objects: Immutable objects defined by their attributes."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ActivityType(str, Enum):
    """Supported activity types."""

    RUN = "run"
    RIDE = "ride"
    HIKE = "hike"
    WALK = "walk"
    SWIM = "swim"
    SKI = "ski"
    OTHER = "other"


class DifficultyLevel(str, Enum):
    """Route difficulty classifications."""

    EASY = "easy"
    MODERATE = "moderate"
    HARD = "hard"
    EXPERT = "expert"


class ReadinessStatus(str, Enum):
    """User readiness for a route."""

    READY = "ready"
    ALMOST_READY = "almost_ready"
    NOT_READY = "not_ready"
    OVERQUALIFIED = "overqualified"


@dataclass(frozen=True)
class Coordinates:
    """
    Geographic coordinates value object.

    Attributes:
        latitude: Latitude in decimal degrees
        longitude: Longitude in decimal degrees
    """

    latitude: float
    longitude: float

    def __post_init__(self) -> None:
        """Validate coordinate ranges."""
        if not -90 <= self.latitude <= 90:
            raise ValueError(
                f"Latitude must be between -90 and 90, got {self.latitude}"
            )
        if not -180 <= self.longitude <= 180:
            raise ValueError(
                f"Longitude must be between -180 and 180, got {self.longitude}"
            )

    def distance_to(self, other: "Coordinates") -> float:
        """
        Calculate approximate distance to another coordinate in meters.
        Uses Haversine formula for great circle distance.
        """
        from math import asin, cos, radians, sin, sqrt

        R = 6371000  # Earth radius in meters

        lat1, lon1 = radians(self.latitude), radians(self.longitude)
        lat2, lon2 = radians(other.latitude), radians(other.longitude)

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        c = 2 * asin(sqrt(a))

        return R * c


@dataclass(frozen=True)
class FitnessScore:
    """
    Comprehensive fitness score value object.

    Attributes:
        total_score: Overall fitness score (0-100)
        vo2max_score: Cardiovascular capacity score
        volume_score: Training volume score
        consistency_score: Training consistency score
        intensity_score: Training intensity score
        experience_level: Beginner/Intermediate/Advanced/Expert
    """

    total_score: float
    vo2max_score: Optional[float] = None
    volume_score: Optional[float] = None
    consistency_score: Optional[float] = None
    intensity_score: Optional[float] = None
    experience_level: str = "intermediate"

    def __post_init__(self) -> None:
        """Validate score ranges."""
        if not 0 <= self.total_score <= 100:
            raise ValueError(
                f"Total score must be between 0 and 100, got {self.total_score}"
            )

    @property
    def grade(self) -> str:
        """Return letter grade for fitness score."""
        if self.total_score >= 90:
            return "A+"
        elif self.total_score >= 80:
            return "A"
        elif self.total_score >= 70:
            return "B"
        elif self.total_score >= 60:
            return "C"
        elif self.total_score >= 50:
            return "D"
        else:
            return "F"


@dataclass(frozen=True)
class RouteDifficulty:
    """
    Route difficulty assessment value object.

    Attributes:
        score: Numerical difficulty score (0-100)
        level: Classification (easy/moderate/hard/expert)
        elevation_factor: Contribution from elevation
        distance_factor: Contribution from distance
        technical_factor: Contribution from technical difficulty
        grade_factor: Contribution from steepness
    """

    score: float
    level: DifficultyLevel
    elevation_factor: float
    distance_factor: float
    technical_factor: float
    grade_factor: float

    def __post_init__(self) -> None:
        """Validate score range."""
        if not 0 <= self.score <= 100:
            raise ValueError(
                f"Difficulty score must be between 0 and 100, got {self.score}"
            )

    @classmethod
    def from_score(cls, score: float, **kwargs) -> "RouteDifficulty":
        """Create RouteDifficulty from score, auto-determining level."""
        if score < 25:
            level = DifficultyLevel.EASY
        elif score < 50:
            level = DifficultyLevel.MODERATE
        elif score < 75:
            level = DifficultyLevel.HARD
        else:
            level = DifficultyLevel.EXPERT

        return cls(score=score, level=level, **kwargs)


@dataclass(frozen=True)
class RouteMatch:
    """
    Result of matching user fitness to route difficulty.

    Attributes:
        readiness: User's readiness status
        fitness_score: User's fitness score
        route_difficulty: Route difficulty score
        gap: Difference (difficulty - fitness)
        recommendation: Text recommendation
        training_weeks_needed: Weeks of training required
        confidence: Confidence in assessment (0-1)
    """

    readiness: ReadinessStatus
    fitness_score: float
    route_difficulty: float
    gap: float
    recommendation: str
    training_weeks_needed: int
    confidence: float = 0.8

    def __post_init__(self) -> None:
        """Validate confidence range."""
        if not 0 <= self.confidence <= 1:
            raise ValueError(
                f"Confidence must be between 0 and 1, got {self.confidence}"
            )

    @property
    def is_ready(self) -> bool:
        """Check if user is ready for the route."""
        return self.readiness in [ReadinessStatus.READY, ReadinessStatus.OVERQUALIFIED]


@dataclass(frozen=True)
class HeartRateZones:
    """
    Heart rate training zones value object.

    Attributes:
        max_hr: Maximum heart rate
        zone1_min: Recovery zone minimum (50% max)
        zone1_max: Recovery zone maximum (60% max)
        zone2_min: Endurance zone minimum (60% max)
        zone2_max: Endurance zone maximum (70% max)
        zone3_min: Tempo zone minimum (70% max)
        zone3_max: Tempo zone maximum (80% max)
        zone4_min: Threshold zone minimum (80% max)
        zone4_max: Threshold zone maximum (90% max)
        zone5_min: VO2max zone minimum (90% max)
        zone5_max: VO2max zone maximum (100% max)
    """

    max_hr: int

    @property
    def zone1_min(self) -> int:
        return int(self.max_hr * 0.50)

    @property
    def zone1_max(self) -> int:
        return int(self.max_hr * 0.60)

    @property
    def zone2_min(self) -> int:
        return int(self.max_hr * 0.60)

    @property
    def zone2_max(self) -> int:
        return int(self.max_hr * 0.70)

    @property
    def zone3_min(self) -> int:
        return int(self.max_hr * 0.70)

    @property
    def zone3_max(self) -> int:
        return int(self.max_hr * 0.80)

    @property
    def zone4_min(self) -> int:
        return int(self.max_hr * 0.80)

    @property
    def zone4_max(self) -> int:
        return int(self.max_hr * 0.90)

    @property
    def zone5_min(self) -> int:
        return int(self.max_hr * 0.90)

    @property
    def zone5_max(self) -> int:
        return self.max_hr

    def get_zone(self, heart_rate: int) -> int:
        """Determine which zone a heart rate falls into (1-5)."""
        if heart_rate < self.zone1_min:
            return 0
        elif heart_rate <= self.zone1_max:
            return 1
        elif heart_rate <= self.zone2_max:
            return 2
        elif heart_rate <= self.zone3_max:
            return 3
        elif heart_rate <= self.zone4_max:
            return 4
        else:
            return 5
