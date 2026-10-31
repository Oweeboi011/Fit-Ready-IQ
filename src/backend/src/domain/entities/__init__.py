"""Domain entities: Core business objects with identity."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4


@dataclass
class User:
    """
    User entity representing an athlete using the platform.

    Attributes:
        id: Unique identifier
        email: User's email address
        username: Display name
        created_at: Account creation timestamp
        updated_at: Last update timestamp
        strava_id: Connected Strava account ID
        fitness_level: User's current fitness level (beginner/intermediate/advanced)
    """

    id: UUID = field(default_factory=uuid4)
    email: str = ""
    username: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    strava_id: str | None = None
    fitness_level: str = "beginner"

    def update_fitness_level(self, level: str) -> None:
        """Update user's fitness level classification."""
        valid_levels = ["beginner", "intermediate", "advanced", "expert"]
        if level not in valid_levels:
            raise ValueError(f"Invalid fitness level. Must be one of: {valid_levels}")
        self.fitness_level = level
        self.updated_at = datetime.now(UTC)


@dataclass
class Activity:
    """
    Activity entity representing a single workout or activity.

    Attributes:
        id: Unique identifier
        user_id: Owner of the activity
        external_id: ID from external platform (Strava, Garmin, etc.)
        platform: Source platform name
        activity_type: Type of activity (run, ride, hike, etc.)
        start_date: When the activity started
        distance: Distance in meters
        duration: Duration in seconds
        elevation_gain: Total elevation gain in meters
        average_heart_rate: Average HR during activity
        max_heart_rate: Maximum HR during activity
        average_power: Average power output in watts (cycling)
        normalized_power: Normalized power (cycling)
        training_load: Calculated training load/stress
        calories: Energy expenditure
    """

    id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    external_id: str | None = None
    platform: str = "manual"
    activity_type: str = "run"
    start_date: datetime = field(default_factory=lambda: datetime.now(UTC))
    distance: float = 0.0  # meters
    duration: int = 0  # seconds
    elevation_gain: float = 0.0  # meters
    average_heart_rate: float | None = None
    max_heart_rate: float | None = None
    average_power: float | None = None
    normalized_power: float | None = None
    training_load: float | None = None
    calories: int | None = None

    @property
    def pace_per_km(self) -> float | None:
        """Calculate pace in minutes per kilometer."""
        if self.distance > 0 and self.duration > 0:
            return (self.duration / 60) / (self.distance / 1000)
        return None

    @property
    def speed_kph(self) -> float | None:
        """Calculate average speed in km/h."""
        if self.distance > 0 and self.duration > 0:
            return (self.distance / 1000) / (self.duration / 3600)
        return None


@dataclass
class Route:
    """
    Route entity representing a hiking or biking route.

    Attributes:
        id: Unique identifier
        name: Route name/title
        description: Detailed description
        activity_type: Type of activity (hike, bike, run)
        distance: Total distance in meters
        elevation_gain: Total climbing in meters
        elevation_loss: Total descent in meters
        max_elevation: Highest point in meters
        min_elevation: Lowest point in meters
        max_grade: Steepest grade percentage
        avg_grade: Average grade percentage
        surface_types: Terrain types (trail, paved, gravel, etc.)
        technical_rating: Difficulty rating 1-5
        location_name: Geographic location name
        latitude: Starting point latitude
        longitude: Starting point longitude
        geometry: Route path geometry (LineString)
        estimated_duration: Estimated time in minutes
        difficulty_score: Calculated difficulty score
        created_at: When route was added
        source: Data source (osm, komoot, user-generated)
    """

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    activity_type: str = "hike"
    distance: float = 0.0  # meters
    elevation_gain: float = 0.0  # meters
    elevation_loss: float = 0.0  # meters
    max_elevation: float | None = None  # meters
    min_elevation: float | None = None  # meters
    max_grade: float = 0.0  # percentage
    avg_grade: float = 0.0  # percentage
    surface_types: list[str] = field(default_factory=list)
    technical_rating: int = 1  # 1-5
    location_name: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    geometry: str | None = None  # GeoJSON LineString
    estimated_duration: int | None = None  # minutes
    difficulty_score: float | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    source: str = "osm"
