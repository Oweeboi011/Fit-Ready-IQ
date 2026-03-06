"""Database models using SQLAlchemy with PostGIS support."""

from datetime import datetime
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class UserModel(Base):
    """SQLAlchemy model for User entity."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # External platform connections
    strava_id = Column(String(100), unique=True, index=True)
    strava_access_token = Column(Text)  # Encrypted
    strava_refresh_token = Column(Text)  # Encrypted
    strava_token_expires_at = Column(DateTime)

    # User profile
    fitness_level = Column(String(20), default="beginner")
    max_heart_rate = Column(Integer)
    age = Column(Integer)
    weight_kg = Column(Float)

    # Relationships
    activities = relationship("ActivityModel", back_populates="user", cascade="all, delete-orphan")
    training_programs = relationship("TrainingProgramModel", back_populates="user")
    itineraries = relationship("ItineraryModel", back_populates="user")


class ActivityModel(Base):
    """SQLAlchemy model for Activity entity."""

    __tablename__ = "activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

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
    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

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
        UUID(as_uuid=True), ForeignKey("training_programs.id", ondelete="CASCADE"), nullable=False
    )

    # Session details
    week = Column(Integer, nullable=False)
    session_number = Column(Integer, nullable=False)
    session_type = Column(String(20), nullable=False)  # endurance, interval, hill, recovery

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
