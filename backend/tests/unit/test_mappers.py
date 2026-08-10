"""Unit tests for domain entity <-> Firestore document mappers."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.domain.entities import Activity, Route, User
from src.infrastructure.database.mappers import (
    activity_to_document,
    document_to_activity,
    document_to_route,
    document_to_user,
    route_to_document,
    user_to_document,
)


@pytest.mark.unit
def test_route_round_trip() -> None:
    route = Route(
        id=uuid4(),
        name="Ridge Trail",
        description="A scenic ridge hike",
        activity_type="hike",
        distance=12000.0,
        elevation_gain=850.0,
        elevation_loss=850.0,
        max_elevation=2100.0,
        min_elevation=1250.0,
        max_grade=18.0,
        avg_grade=7.5,
        surface_types=["dirt", "rock"],
        technical_rating=3,
        location_name="Cascade Range",
        latitude=47.6,
        longitude=-121.3,
        geometry="encoded-polyline-string",
        estimated_duration=240,
        difficulty_score=62.5,
        created_at=datetime.now(UTC),
        source="osm",
    )

    doc = route_to_document(route)
    restored = document_to_route(doc)

    assert restored.id == route.id
    assert restored.name == route.name
    assert restored.activity_type == route.activity_type
    assert restored.distance == route.distance
    assert restored.elevation_gain == route.elevation_gain
    assert restored.latitude == route.latitude
    assert restored.longitude == route.longitude
    assert restored.geometry == route.geometry
    assert restored.difficulty_score == route.difficulty_score
    assert restored.source == route.source


@pytest.mark.unit
def test_activity_round_trip() -> None:
    activity = Activity(
        id=uuid4(),
        user_id=uuid4(),
        external_id="strava-123",
        platform="strava",
        activity_type="run",
        start_date=datetime.now(UTC),
        distance=8000.0,
        duration=2400,
        elevation_gain=120.0,
        average_heart_rate=145.0,
        max_heart_rate=172.0,
        average_power=None,
        normalized_power=None,
        training_load=85.0,
        calories=520,
    )

    doc = activity_to_document(activity)
    restored = document_to_activity(doc)

    assert restored.id == activity.id
    assert restored.user_id == activity.user_id
    assert restored.external_id == activity.external_id
    assert restored.activity_type == activity.activity_type
    assert restored.distance == activity.distance
    assert restored.duration == activity.duration
    assert restored.average_heart_rate == activity.average_heart_rate
    assert restored.training_load == activity.training_load


@pytest.mark.unit
def test_user_round_trip() -> None:
    user = User(
        id=uuid4(),
        email="athlete@example.com",
        username="trailrunner",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        strava_id="strava-uid-1",
        fitness_level="advanced",
    )

    doc = user_to_document(user)
    restored = document_to_user(doc)

    assert restored.id == user.id
    assert restored.email == user.email
    assert restored.username == user.username
    assert restored.strava_id == user.strava_id
    assert restored.fitness_level == user.fitness_level
