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
    strava_access_token: Optional[str] = None  # Encrypted at rest
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
    distance: float = 0.0  # metres
    duration: int = 0  # seconds
    elevation_gain: float = 0.0  # metres
    elevation_loss: float = 0.0  # metres

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
    distance: float  # metres
    elevation_gain: float = 0.0  # metres
    elevation_loss: float = 0.0  # metres
    max_elevation: Optional[float] = None
    min_elevation: Optional[float] = None

    # Grade data
    max_grade: float = 0.0  # percentage
    avg_grade: float = 0.0  # percentage

    # Terrain
    surface_types: list[str] = Field(default_factory=list)
    technical_rating: int = 1  # 1–5

    # Location
    location_name: Optional[str] = None
    start_location: GeoPoint
    encoded_polyline: Optional[str] = None

    # Difficulty
    estimated_duration: Optional[int] = None  # minutes
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
    readiness_status: Optional[str] = (
        None  # ready | almost_ready | not_ready | overqualified
    )
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
