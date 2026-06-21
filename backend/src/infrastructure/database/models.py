"""Pydantic document schemas for Firestore collections.

Each model maps to a Firestore collection of the same name (snake_case plural).
Geospatial points are stored as dicts with 'latitude' and 'longitude' keys,
compatible with Firestore GeoPoint. Route polylines are stored as encoded strings.
"""

from datetime import UTC, datetime
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _new_id() -> str:
    return str(uuid4())


# ---------------------------------------------------------------------------
# Shared value types
# ---------------------------------------------------------------------------


class GeoPoint(BaseModel):
    """Latitude/longitude pair stored as a Firestore GeoPoint-compatible dict."""

    latitude: float
    longitude: float


# ---------------------------------------------------------------------------
# Users  (collection: "users")
# ---------------------------------------------------------------------------


class UserDocument(BaseModel):
    """Firestore document schema for the 'users' collection."""

    id: str = Field(default_factory=_new_id)
    email: str
    username: str
    created_at: datetime = Field(default_factory=_now_utc)
    updated_at: Optional[datetime] = None

    # External platform connections
    strava_id: Optional[str] = None
    strava_access_token: Optional[str] = None   # Encrypted at rest
    strava_refresh_token: Optional[str] = None  # Encrypted at rest
    strava_token_expires_at: Optional[datetime] = None

    # User profile
    fitness_level: str = "beginner"
    max_heart_rate: Optional[int] = None
    age: Optional[int] = None
    weight_kg: Optional[float] = None

    # Firebase Auth UID (set after account creation)
    firebase_uid: Optional[str] = None


# ---------------------------------------------------------------------------
# Activities  (collection: "activities")
# ---------------------------------------------------------------------------


class ActivityDocument(BaseModel):
    """Firestore document schema for the 'activities' collection."""

    id: str = Field(default_factory=_new_id)
    user_id: str

    # External reference
    external_id: Optional[str] = None
    platform: str = "manual"

    # Activity details
    activity_type: str
    start_date: datetime
    name: Optional[str] = None
    description: Optional[str] = None

    # Metrics
    distance: float = 0.0         # metres
    duration: int = 0             # seconds
    elevation_gain: float = 0.0   # metres
    elevation_loss: float = 0.0   # metres

    # Heart rate
    average_heart_rate: Optional[float] = None
    max_heart_rate: Optional[float] = None

    # Power (cycling)
    average_power: Optional[float] = None
    normalized_power: Optional[float] = None

    # Training metrics
    training_load: Optional[float] = None
    calories: Optional[int] = None

    # Geospatial — stored as GeoPoint-compatible dicts
    start_location: Optional[GeoPoint] = None
    # Route geometry stored as encoded polyline for space efficiency
    encoded_polyline: Optional[str] = None

    created_at: datetime = Field(default_factory=_now_utc)


# ---------------------------------------------------------------------------
# Routes  (collection: "routes")
# ---------------------------------------------------------------------------


class RouteDocument(BaseModel):
    """Firestore document schema for the 'routes' collection."""

    id: str = Field(default_factory=_new_id)

    # Basic info
    name: str
    description: Optional[str] = None
    activity_type: str

    # Distance and elevation
    distance: float              # metres
    elevation_gain: float = 0.0  # metres
    elevation_loss: float = 0.0  # metres
    max_elevation: Optional[float] = None
    min_elevation: Optional[float] = None

    # Grade data
    max_grade: float = 0.0   # percentage
    avg_grade: float = 0.0   # percentage

    # Terrain
    surface_types: list[str] = Field(default_factory=list)
    technical_rating: int = 1  # 1–5

    # Location
    location_name: Optional[str] = None
    start_location: GeoPoint
    encoded_polyline: Optional[str] = None

    # Difficulty
    estimated_duration: Optional[int] = None   # minutes
    difficulty_score: Optional[float] = None
    difficulty_level: Optional[str] = None

    # Metadata
    source: str = "osm"  # osm | komoot | user
    external_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_now_utc)
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Training Programs  (collection: "training_programs")
# ---------------------------------------------------------------------------


class TrainingProgramDocument(BaseModel):
    """Firestore document schema for the 'training_programs' collection."""

    id: str = Field(default_factory=_new_id)
    user_id: str
    route_id: Optional[str] = None

    # Program details
    start_date: datetime
    end_date: Optional[datetime] = None
    weeks: int = 8
    sessions_per_week: int = 3

    # Fitness assessment
    current_fitness_score: Optional[float] = None
    target_fitness_score: Optional[float] = None

    # Status
    status: str = "not_started"  # not_started | in_progress | completed | paused

    created_at: datetime = Field(default_factory=_now_utc)
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Training Sessions  (collection: "training_sessions")
# ---------------------------------------------------------------------------


class TrainingSessionDocument(BaseModel):
    """Firestore document schema for the 'training_sessions' collection."""

    id: str = Field(default_factory=_new_id)
    program_id: str

    # Session details
    week: int
    session_number: int
    session_type: str  # endurance | interval | hill | recovery

    # Targets
    duration_minutes: Optional[int] = None
    distance_meters: Optional[float] = None
    intensity_zone: Optional[str] = None
    description: Optional[str] = None

    # Completion
    completed: bool = False
    completed_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Itineraries  (collection: "itineraries")
# ---------------------------------------------------------------------------


class ItineraryDocument(BaseModel):
    """Firestore document schema for the 'itineraries' collection."""

    id: str = Field(default_factory=_new_id)
    user_id: str
    route_id: str

    # Planning details
    planned_date: datetime

    # Assessment
    readiness_status: Optional[str] = None  # ready | almost_ready | not_ready | overqualified
    fitness_score: Optional[float] = None
    route_difficulty: Optional[float] = None
    fitness_gap: Optional[float] = None

    # Additional data
    weather_forecast: Optional[dict[str, Any]] = None
    gear_checklist: Optional[dict[str, Any]] = None
    safety_alerts: list[str] = Field(default_factory=list)

    # Timing
    estimated_start_time: Optional[datetime] = None
    estimated_finish_time: Optional[datetime] = None

    created_at: datetime = Field(default_factory=_now_utc)
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Collection name constants
# ---------------------------------------------------------------------------

COLLECTION_USERS = "users"
COLLECTION_ACTIVITIES = "activities"
COLLECTION_ROUTES = "routes"
COLLECTION_TRAINING_PROGRAMS = "training_programs"
COLLECTION_TRAINING_SESSIONS = "training_sessions"
COLLECTION_ITINERARIES = "itineraries"



class ActivityModel(Base):
    """SQLAlchemy model for Activity entity."""

    __tablename__ = "activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # External reference
    external_id = Column(String(100), index=True)
    platform = Column(String(50), default="manual")

    # Activity details
    activity_type = Column(String(20), nullable=False, index=True)
    start_date = Column(DateTime, nullable=False, index=True)
    name = Column(String(255))
    description = Column(Text)

    # Metrics
    distance = Column(Float, default=0.0)  # meters
    duration = Column(Integer, default=0)  # seconds
    elevation_gain = Column(Float, default=0.0)  # meters
    elevation_loss = Column(Float, default=0.0)  # meters

    # Heart rate data
    average_heart_rate = Column(Float)
    max_heart_rate = Column(Float)

    # Power data (cycling)
    average_power = Column(Float)
    normalized_power = Column(Float)

    # Training metrics
    training_load = Column(Float)
    calories = Column(Integer)

    # Geospatial data
    start_location = Column(Geometry(geometry_type="POINT", srid=4326))
    route_geometry = Column(Geometry(geometry_type="LINESTRING", srid=4326))

    # Metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    # Relationships
    user = relationship("UserModel", back_populates="activities")

    # Indexes for common queries
    __table_args__ = ({"comment": "User activities from various platforms"},)


class RouteModel(Base):
    """SQLAlchemy model for Route entity."""

    __tablename__ = "routes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)

    # Basic info
    name = Column(String(255), nullable=False)
    description = Column(Text)
    activity_type = Column(String(20), nullable=False, index=True)

    # Distance and elevation
    distance = Column(Float, nullable=False)  # meters
    elevation_gain = Column(Float, default=0.0)  # meters
    elevation_loss = Column(Float, default=0.0)  # meters
    max_elevation = Column(Float)
    min_elevation = Column(Float)

    # Grade data
    max_grade = Column(Float, default=0.0)  # percentage
    avg_grade = Column(Float, default=0.0)  # percentage

    # Terrain
    surface_types = Column(ARRAY(String))
    technical_rating = Column(Integer, default=1)  # 1-5

    # Location
    location_name = Column(String(255), index=True)
    start_location = Column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    route_geometry = Column(Geometry(geometry_type="LINESTRING", srid=4326))

    # Difficulty
    estimated_duration = Column(Integer)  # minutes
    difficulty_score = Column(Float, index=True)
    difficulty_level = Column(String(20))

    # Metadata
    source = Column(String(50), default="osm")  # osm, komoot, user
    external_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(UTC))

    # Spatial index for fast nearby searches
    __table_args__ = ({"comment": "Hiking and biking routes"},)


class TrainingProgramModel(Base):
    """SQLAlchemy model for TrainingProgram entity."""

    __tablename__ = "training_programs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    route_id = Column(UUID(as_uuid=True), ForeignKey("routes.id"))

    # Program details
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime)
    weeks = Column(Integer, default=8)
    sessions_per_week = Column(Integer, default=3)

    # Fitness assessment
    current_fitness_score = Column(Float)
    target_fitness_score = Column(Float)

    # Status
    status = Column(String(20), default="not_started")

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("UserModel", back_populates="training_programs")
    route = relationship("RouteModel")
    sessions = relationship(
        "TrainingSessionModel", back_populates="program", cascade="all, delete-orphan"
    )


class TrainingSessionModel(Base):
    """SQLAlchemy model for TrainingSession entity."""

    __tablename__ = "training_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    program_id = Column(
        UUID(as_uuid=True),
        ForeignKey("training_programs.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Session details
    week = Column(Integer, nullable=False)
    session_number = Column(Integer, nullable=False)
    session_type = Column(
        String(20), nullable=False
    )  # endurance, interval, hill, recovery

    # Targets
    duration_minutes = Column(Integer)
    distance_meters = Column(Float)
    intensity_zone = Column(String(20))
    description = Column(Text)

    # Completion
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime)

    # Relationships
    program = relationship("TrainingProgramModel", back_populates="sessions")


class ItineraryModel(Base):
    """SQLAlchemy model for Itinerary entity."""

    __tablename__ = "itineraries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    route_id = Column(UUID(as_uuid=True), ForeignKey("routes.id"), nullable=False)

    # Planning details
    planned_date = Column(DateTime, nullable=False, index=True)

    # Assessment
    readiness_status = Column(String(20))
    fitness_score = Column(Float)
    route_difficulty = Column(Float)
    fitness_gap = Column(Float)

    # Additional data
    weather_forecast = Column(JSON)
    gear_checklist = Column(JSON)
    safety_alerts = Column(ARRAY(Text))

    # Timing
    estimated_start_time = Column(DateTime)
    estimated_finish_time = Column(DateTime)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("UserModel", back_populates="itineraries")
    route = relationship("RouteModel")
