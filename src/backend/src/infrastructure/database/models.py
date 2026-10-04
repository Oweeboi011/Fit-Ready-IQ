"""Pydantic document schemas for Firestore collections.

Each model maps to a Firestore collection of the same name (snake_case plural).
Geospatial points are stored as dicts with 'latitude' and 'longitude' keys,
compatible with Firestore GeoPoint. Route polylines are stored as encoded strings.
"""

from datetime import UTC, datetime
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
    updated_at: datetime | None = None

    # External platform connections
    strava_id: str | None = None
    strava_access_token: str | None = None  # Encrypted at rest
    strava_refresh_token: str | None = None  # Encrypted at rest
    strava_token_expires_at: datetime | None = None

    # User profile
    fitness_level: str = "beginner"
    max_heart_rate: int | None = None
    age: int | None = None
    weight_kg: float | None = None

    # Firebase Auth UID (set after account creation)
    firebase_uid: str | None = None


# ---------------------------------------------------------------------------
# Activities  (collection: "activities")
# ---------------------------------------------------------------------------


class ActivityDocument(BaseModel):
    """Firestore document schema for the 'activities' collection."""

    id: str = Field(default_factory=_new_id)
    user_id: str

    # External reference
    external_id: str | None = None
    platform: str = "manual"

    # Activity details
    activity_type: str
    start_date: datetime
    name: str | None = None
    description: str | None = None

    # Metrics
    distance: float = 0.0  # metres
    duration: int = 0  # seconds
    elevation_gain: float = 0.0  # metres
    elevation_loss: float = 0.0  # metres

    # Heart rate
    average_heart_rate: float | None = None
    max_heart_rate: float | None = None

    # Cycling power
    average_power: float | None = None
    normalized_power: float | None = None

    # Training metrics
    training_load: float | None = None
    calories: int | None = None

    # Geospatial — stored as GeoPoint-compatible dicts
    start_location: GeoPoint | None = None
    # Route geometry stored as encoded polyline for space efficiency
    encoded_polyline: str | None = None

    created_at: datetime = Field(default_factory=_now_utc)


# ---------------------------------------------------------------------------
# Routes  (collection: "routes")
# ---------------------------------------------------------------------------


class RouteDocument(BaseModel):
    """Firestore document schema for the 'routes' collection."""

    id: str = Field(default_factory=_new_id)

    # Basic info
    name: str
    description: str | None = None
    activity_type: str

    # Distance and elevation
    distance: float  # metres
    elevation_gain: float = 0.0  # metres
    elevation_loss: float = 0.0  # metres
    max_elevation: float | None = None
    min_elevation: float | None = None

    # Grade data
    max_grade: float = 0.0  # percentage
    avg_grade: float = 0.0  # percentage

    # Terrain
    surface_types: list[str] = Field(default_factory=list)
    technical_rating: int = 1  # 1–5

    # Location
    location_name: str | None = None
    start_location: GeoPoint
    encoded_polyline: str | None = None

    # Difficulty
    estimated_duration: int | None = None  # minutes
    difficulty_score: float | None = None
    difficulty_level: str | None = None

    # Metadata
    source: str = "osm"  # osm | komoot | user
    external_id: str | None = None
    created_at: datetime = Field(default_factory=_now_utc)
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Training Programs  (collection: "training_programs")
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Training Sessions  (collection: "training_sessions")
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Itineraries  (collection: "itineraries")
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Collection name constants
# ---------------------------------------------------------------------------

COLLECTION_USERS = "users"
COLLECTION_ACTIVITIES = "activities"
COLLECTION_ROUTES = "routes"
