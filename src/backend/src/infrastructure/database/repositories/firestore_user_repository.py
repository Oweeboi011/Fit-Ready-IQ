"""Firestore-backed implementation of IUserRepository."""

from uuid import UUID

from google.cloud.firestore_v1.async_client import AsyncClient
from google.cloud.firestore_v1.base_query import FieldFilter

from ....domain.entities import User
from ....domain.interfaces import IUserRepository
from ..mappers import document_to_user, user_to_document
from ..models import COLLECTION_USERS, UserDocument


class FirestoreUserRepository(IUserRepository):
    """Firestore-backed repository for User entities."""

    def __init__(self, db: AsyncClient) -> None:
        self._db = db
        self._collection = db.collection(COLLECTION_USERS)

    async def get_by_id(self, id: UUID) -> User | None:
        snapshot = await self._collection.document(str(id)).get()
        if not snapshot.exists:
            return None
        return document_to_user(UserDocument(**(snapshot.to_dict() or {})))

    async def save(self, entity: User) -> User:
        doc = user_to_document(entity)
        await self._collection.document(doc.id).set(doc.model_dump(mode="json"))
        return entity

    async def delete(self, id: UUID) -> bool:
        await self._collection.document(str(id)).delete()
        return True

    async def get_by_email(self, email: str) -> User | None:
        query = self._collection.where(filter=FieldFilter("email", "==", email)).limit(
            1
        )
        async for snapshot in query.stream():
            return document_to_user(UserDocument(**(snapshot.to_dict() or {})))
        return None

    async def get_by_strava_id(self, strava_id: str) -> User | None:
        query = self._collection.where(
            filter=FieldFilter("strava_id", "==", strava_id)
        ).limit(1)
        async for snapshot in query.stream():
            return document_to_user(UserDocument(**(snapshot.to_dict() or {})))
        return None

    async def update(self, user: User) -> User:
        return await self.save(user)
