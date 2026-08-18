"""Composition root: FastAPI dependency providers wiring infrastructure
implementations to application use cases, and Firebase-auth extraction."""

from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import Header, HTTPException, status

from ..application.use_cases import MatchRoutesUseCase
from ..domain.services import (
    FitnessScoreCalculator,
    RouteDifficultyCalculator,
    RouteMatchingService,
)
from ..infrastructure.database.connection import get_firestore, verify_firebase_token
from ..infrastructure.database.repositories import (
    FirestoreActivityRepository,
    FirestoreRouteRepository,
    FirestoreUserRepository,
)


async def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """Extract and verify a Firebase ID token from the Authorization header.

    Expects `Authorization: Bearer <id_token>` and returns the Firebase uid,
    which is treated as the authoritative user id (UserDocument.id == uid).

    The header is declared optional so that omitting it answers 401 rather than
    FastAPI's 422: a missing credential is an authentication failure, and a 422
    tells a caller their request was malformed when it was simply unauthenticated.
    """
    if authorization is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    scheme, _, raw_token = authorization.partition(" ")
    # RFC 7235 says the auth scheme is case-insensitive; the frontend's
    # `requireUser` already treats it that way, and disagreeing would mean a
    # token that works against one runtime is rejected by the other.
    if scheme.lower() != "bearer" or not raw_token.strip():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    try:
        decoded = await verify_firebase_token(raw_token.strip())
    except Exception as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired token"
        ) from exc

    return str(decoded["uid"])


def firebase_uid_to_user_id(firebase_uid: str) -> UUID:
    """Deterministically derive a domain User.id (UUID) from a Firebase uid.

    Firebase uids are not valid UUID strings, but the domain User entity's id
    is typed as UUID, so callers/provisioning must consistently use this
    derivation rather than parsing the uid directly as a UUID.
    """
    return uuid5(NAMESPACE_URL, f"firebase-uid:{firebase_uid}")


def get_match_routes_use_case() -> MatchRoutesUseCase:
    db = get_firestore()
    return MatchRoutesUseCase(
        route_repository=FirestoreRouteRepository(db),
        activity_repository=FirestoreActivityRepository(db),
        user_repository=FirestoreUserRepository(db),
        fitness_calculator=FitnessScoreCalculator(),
        difficulty_calculator=RouteDifficultyCalculator(),
        matching_service=RouteMatchingService(),
    )
