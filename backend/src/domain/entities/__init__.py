"""Domain entities: Core business objects with identity."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
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
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    strava_id: Optional[str] = None
    fitness_level: str = "beginner"
    
    def update_fitness_level(self, level: str) -> None:
        """Update user's fitness level classification."""
        valid_levels = ["beginner", "intermediate", "advanced", "expert"]
        if level not in valid_levels:
            raise ValueError(f"Invalid fitness level. Must be one of: {valid_levels}")
        self.fitness_level = level
        self.updated_at = datetime.utcnow()


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
    external_id: Optional[str] = None
    platform: str = "manual"
    activity_type: str = "run"
    start_date: datetime = field(default_factory=datetime.utcnow)
    distance: float = 0.0  # meters
    duration: int = 0  # seconds
    elevation_gain: float = 0.0  # meters
    average_heart_rate: Optional[float] = None
    max_heart_rate: Optional[float] = None
    average_power: Optional[float] = None
    normalized_power: Optional[float] = None
    training_load: Optional[float] = None
    calories: Optional<int> = None
    
    @property
    def pace_per_km(self) -> Optional[float]:
        """Calculate pace in minutes per kilometer."""
        if self.distance > 0 and self.duration > 0:
            return (self.duration / 60) / (self.distance / 1000)
        return None
    
    @property
    def speed_kph(self) -> Optional[float]:
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
    max_elevation: Optional[float] = None  # meters
    min_elevation: Optional[float] = None  # meters
    max_grade: float = 0.0  # percentage
    avg_grade: float = 0.0  # percentage
    surface_types: list[str] = field(default_factory=list)
    technical_rating: int = 1  # 1-5
    location_name: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    geometry: Optional[str] = None  # GeoJSON LineString
    estimated_duration: Optional[int] = None  # minutes
    difficulty_score: Optional[float] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    source: str = "osm"


@dataclass
class TrainingProgram:
    """
    Training program entity for preparing for specific routes.
    
    Attributes:
        id: Unique identifier
        user_id: Target user
        route_id: Target route
        start_date: When program starts
        end_date: Program completion date
        weeks: Number of weeks
        sessions_per_week: Training frequency
        current_fitness_score: User's fitness at start
        target_fitness_score: Required fitness level
        status: Program status (not_started, in_progress, completed)
        created_at: Program creation timestamp
    """
    
    id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    route_id: UUID = field(default_factory=uuid4)
    start_date: datetime = field(default_factory=datetime.utcnow)
    end_date: Optional[datetime] = None
    weeks: int = 8
    sessions_per_week: int = 3
    current_fitness_score: float = 0.0
    target_fitness_score: float = 0.0
    status: str = "not_started"
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class TrainingSession:
    """
    Individual training session within a program.
    
    Attributes:
        id: Unique identifier
        program_id: Parent training program
        week: Week number in program
        session_number: Session within the week
        session_type: Type (endurance, interval, hill, recovery)
        duration_minutes: Target duration
        distance_meters: Target distance if applicable
        intensity_zone: Heart rate or power zone
        description: Detailed workout description
        completed: Whether session is done
        completed_at: Completion timestamp
    """
    
    id: UUID = field(default_factory=uuid4)
    program_id: UUID = field(default_factory=uuid4)
    week: int = 1
    session_number: int = 1
    session_type: str = "endurance"
    duration_minutes: int = 60
    distance_meters: Optional[float] = None
    intensity_zone: str = "zone2"
    description: str = ""
    completed: bool = False
    completed_at: Optional[datetime] = None
    
    def mark_completed(self) -> None:
        """Mark session as completed."""
        self.completed = True
        self.completed_at = datetime.utcnow()


@dataclass
class Itinerary:
    """
    Complete adventure itinerary with all planning details.
    
    Attributes:
        id: Unique identifier
        user_id: Owner
        route_id: Selected route
        planned_date: When adventure is scheduled
        readiness_status: Ready/Almost Ready/Not Ready
        fitness_score: User's current fitness score
        route_difficulty: Route difficulty score
        fitness_gap: Difference between fitness and difficulty
        weather_forecast: Weather conditions
        gear_checklist: Recommended gear items
        safety_alerts: Warnings and hazards
        estimated_start_time: Suggested start time
        estimated_finish_time: Suggested finish time
        created_at: Itinerary creation time
    """
    
    id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    route_id: UUID = field(default_factory=uuid4)
    planned_date: datetime = field(default_factory=datetime.utcnow)
    readiness_status: str = "unknown"
    fitness_score: float = 0.0
    route_difficulty: float = 0.0
    fitness_gap: float = 0.0
    weather_forecast: dict = field(default_factory=dict)
    gear_checklist: list[dict] = field(default_factory=list)
    safety_alerts: list[str] = field(default_factory=list)
    estimated_start_time: Optional[datetime] = None
    estimated_finish_time: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
