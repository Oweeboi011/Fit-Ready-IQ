"""Firestore-backed implementation of IRouteRepository."""

from math import cos, radians
from uuid import UUID

from google.cloud.firestore_v1.async_client import AsyncClient
from google.cloud.firestore_v1.base_query import FieldFilter

from ....domain.entities import Route
from ....domain.interfaces import IRouteRepository
from ....domain.value_objects import Coordinates
from ..mappers import document_to_route, route_to_document
from ..models import COLLECTION_ROUTES, RouteDocument

# Approximate metres per degree of latitude, used for the bounding-box
# pre-filter. Longitude degrees are scaled by cos(latitude) since meridians
# converge toward the poles.
METERS_PER_DEGREE_LATITUDE = 111_000


class FirestoreRouteRepository(IRouteRepository):
    """Firestore-backed repository for Route entities."""

    def __init__(self, db: AsyncClient) -> None:
        self._db = db
        self._collection = db.collection(COLLECTION_ROUTES)

    async def get_by_id(self, id: UUID) -> Route | None:
        snapshot = await self._collection.document(str(id)).get()
        if not snapshot.exists:
            return None
        return document_to_route(RouteDocument(**(snapshot.to_dict() or {})))

    async def save(self, entity: Route) -> Route:
        doc = route_to_document(entity)
        await self._collection.document(doc.id).set(doc.model_dump(mode="json"))
        return entity

    async def delete(self, id: UUID) -> bool:
        await self._collection.document(str(id)).delete()
        return True

    async def search_nearby(
        self,
        coordinates: Coordinates,
        radius_meters: float,
        activity_type: str | None = None,
        max_difficulty: float | None = None,
        limit: int = 20,
    ) -> list[Route]:
        """Bounding-box pre-filter via Firestore, refined to an exact radius in Python."""
        lat_delta = radius_meters / METERS_PER_DEGREE_LATITUDE
        lon_scale = max(cos(radians(coordinates.latitude)), 1e-6)
        lon_delta = radius_meters / (METERS_PER_DEGREE_LATITUDE * lon_scale)

        candidates = await self.search_by_bounds(
            min_lat=coordinates.latitude - lat_delta,
            max_lat=coordinates.latitude + lat_delta,
            min_lon=coordinates.longitude - lon_delta,
            max_lon=coordinates.longitude + lon_delta,
            activity_type=activity_type,
        )

        results = []
        for route in candidates:
            route_coords = Coordinates(
                latitude=route.latitude, longitude=route.longitude
            )
            if coordinates.distance_to(route_coords) > radius_meters:
                continue
            if (
                max_difficulty is not None
                and (route.difficulty_score or 0) > max_difficulty
            ):
                continue
            results.append(route)

        return results[:limit]

    async def search_by_bounds(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        activity_type: str | None = None,
    ) -> list[Route]:
        # Firestore only supports range filters on one field per query without
        # a composite index, so latitude is filtered server-side and longitude
        # is refined in Python below.
        query = self._collection.where(
            filter=FieldFilter("start_location.latitude", ">=", min_lat)
        ).where(filter=FieldFilter("start_location.latitude", "<=", max_lat))

        if activity_type is not None:
            query = query.where(
                filter=FieldFilter("activity_type", "==", activity_type)
            )

        routes = []
        async for snapshot in query.stream():
            doc = RouteDocument(**(snapshot.to_dict() or {}))
            if not (min_lon <= doc.start_location.longitude <= max_lon):
                continue
            routes.append(document_to_route(doc))

        return routes

    async def get_by_name(self, name: str) -> list[Route]:
        query = self._collection.where(filter=FieldFilter("name", "==", name))
        return [
            document_to_route(RouteDocument(**(snapshot.to_dict() or {})))
            async for snapshot in query.stream()
        ]
