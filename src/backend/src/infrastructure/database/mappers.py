"""Mappers between domain entities and Firestore document schemas."""

from uuid import UUID

from ...domain.entities import Activity, Route, User
from .models import ActivityDocument, GeoPoint, RouteDocument, UserDocument


def route_to_document(route: Route) -> RouteDocument:
    """Map a domain Route entity to its Firestore document schema."""
    return RouteDocument(
        id=str(route.id),
        name=route.name,
        description=route.description or None,
        activity_type=route.activity_type,
        distance=route.distance,
        elevation_gain=route.elevation_gain,
        elevation_loss=route.elevation_loss,
        max_elevation=route.max_elevation,
        min_elevation=route.min_elevation,
        max_grade=route.max_grade,
        avg_grade=route.avg_grade,
        surface_types=route.surface_types,
        technical_rating=route.technical_rating,
        location_name=route.location_name or None,
        start_location=GeoPoint(latitude=route.latitude, longitude=route.longitude),
        # Route.geometry is documented as GeoJSON while RouteDocument stores an
        # encoded polyline; passed through as-is until a decoder is added.
        encoded_polyline=route.geometry,
        estimated_duration=route.estimated_duration,
        difficulty_score=route.difficulty_score,
        source=route.source,
        created_at=route.created_at,
    )


def document_to_route(doc: RouteDocument) -> Route:
    """Map a Firestore RouteDocument back to a domain Route entity."""
    return Route(
        id=UUID(doc.id),
        name=doc.name,
        description=doc.description or "",
        activity_type=doc.activity_type,
        distance=doc.distance,
        elevation_gain=doc.elevation_gain,
        elevation_loss=doc.elevation_loss,
        max_elevation=doc.max_elevation,
        min_elevation=doc.min_elevation,
        max_grade=doc.max_grade,
        avg_grade=doc.avg_grade,
        surface_types=doc.surface_types,
        technical_rating=doc.technical_rating,
        location_name=doc.location_name or "",
        latitude=doc.start_location.latitude,
        longitude=doc.start_location.longitude,
        geometry=doc.encoded_polyline,
        estimated_duration=doc.estimated_duration,
        difficulty_score=doc.difficulty_score,
        created_at=doc.created_at,
        source=doc.source,
    )


def activity_to_document(activity: Activity) -> ActivityDocument:
    """Map a domain Activity entity to its Firestore document schema."""
    return ActivityDocument(
        id=str(activity.id),
        user_id=str(activity.user_id),
        external_id=activity.external_id,
        platform=activity.platform,
        activity_type=activity.activity_type,
        start_date=activity.start_date,
        distance=activity.distance,
        duration=activity.duration,
        elevation_gain=activity.elevation_gain,
        average_heart_rate=activity.average_heart_rate,
        max_heart_rate=activity.max_heart_rate,
        average_power=activity.average_power,
        normalized_power=activity.normalized_power,
        training_load=activity.training_load,
        calories=activity.calories,
    )


def document_to_activity(doc: ActivityDocument) -> Activity:
    """Map a Firestore ActivityDocument back to a domain Activity entity."""
    return Activity(
        id=UUID(doc.id),
        user_id=UUID(doc.user_id),
        external_id=doc.external_id,
        platform=doc.platform,
        activity_type=doc.activity_type,
        start_date=doc.start_date,
        distance=doc.distance,
        duration=doc.duration,
        elevation_gain=doc.elevation_gain,
        average_heart_rate=doc.average_heart_rate,
        max_heart_rate=doc.max_heart_rate,
        average_power=doc.average_power,
        normalized_power=doc.normalized_power,
        training_load=doc.training_load,
        calories=doc.calories,
    )


def user_to_document(user: User) -> UserDocument:
    """Map a domain User entity to its Firestore document schema."""
    return UserDocument(
        id=str(user.id),
        email=user.email,
        username=user.username,
        created_at=user.created_at,
        updated_at=user.updated_at,
        strava_id=user.strava_id,
        fitness_level=user.fitness_level,
    )


def document_to_user(doc: UserDocument) -> User:
    """Map a Firestore UserDocument back to a domain User entity."""
    return User(
        id=UUID(doc.id),
        email=doc.email,
        username=doc.username,
        created_at=doc.created_at,
        updated_at=doc.updated_at or doc.created_at,
        strava_id=doc.strava_id,
        fitness_level=doc.fitness_level,
    )
