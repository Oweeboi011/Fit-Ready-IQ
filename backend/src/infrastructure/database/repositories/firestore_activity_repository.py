"""Firestore-backed implementation of IActivityRepository."""

from datetime import datetime
from uuid import UUID

from google.cloud.firestore_v1.async_client import AsyncClient
from google.cloud.firestore_v1.base_query import FieldFilter

from ....domain.entities import Activity
from ....domain.interfaces import IActivityRepository
from ..mappers import activity_to_document, document_to_activity
from ..models import COLLECTION_ACTIVITIES, ActivityDocument


class FirestoreActivityRepository(IActivityRepository):
    """Firestore-backed repository for Activity entities."""

    def __init__(self, db: AsyncClient) -> None:
        self._db = db
        self._collection = db.collection(COLLECTION_ACTIVITIES)

    async def get_by_id(self, id: UUID) -> Activity | None:
        snapshot = await self._collection.document(str(id)).get()
        if not snapshot.exists:
            return None
        return document_to_activity(ActivityDocument(**(snapshot.to_dict() or {})))

    async def save(self, entity: Activity) -> Activity:
        doc = activity_to_document(entity)
        await self._collection.document(doc.id).set(doc.model_dump(mode="json"))
        return entity

    async def delete(self, id: UUID) -> bool:
        await self._collection.document(str(id)).delete()
        return True

    async def get_by_user(
        self, user_id: UUID, limit: int = 50, offset: int = 0
    ) -> list[Activity]:
        query = (
            self._collection.where(filter=FieldFilter("user_id", "==", str(user_id)))
            .order_by("start_date", direction="DESCENDING")
            .offset(offset)
            .limit(limit)
        )
        return [
            document_to_activity(ActivityDocument(**(snapshot.to_dict() or {})))
            async for snapshot in query.stream()
        ]

    async def get_by_date_range(
        self, user_id: UUID, start_date: datetime, end_date: datetime
    ) -> list[Activity]:
        query = (
            self._collection.where(filter=FieldFilter("user_id", "==", str(user_id)))
            .where(filter=FieldFilter("start_date", ">=", start_date))
            .where(filter=FieldFilter("start_date", "<=", end_date))
        )
        return [
            document_to_activity(ActivityDocument(**(snapshot.to_dict() or {})))
            async for snapshot in query.stream()
        ]

    async def get_by_external_id(
        self, external_id: str, platform: str
    ) -> Activity | None:
        query = (
            self._collection.where(filter=FieldFilter("external_id", "==", external_id))
            .where(filter=FieldFilter("platform", "==", platform))
            .limit(1)
        )
        async for snapshot in query.stream():
            return document_to_activity(ActivityDocument(**(snapshot.to_dict() or {})))
        return None

    async def save_batch(self, activities: list[Activity]) -> list[Activity]:
        batch = self._db.batch()
        for activity in activities:
            doc = activity_to_document(activity)
            batch.set(self._collection.document(doc.id), doc.model_dump(mode="json"))
        await batch.commit()
        return activities
