"""Route matching endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ...application.use_cases import MatchRoutesUseCase
from ...domain.value_objects import Coordinates
from ..dependencies import (
    firebase_uid_to_user_id,
    get_current_user_id,
    get_match_routes_use_case,
)

logger = structlog.get_logger()

router = APIRouter()


class RouteMatchResponse(BaseModel):
    """A single ranked route with its fitness match assessment."""

    route_id: str
    name: str
    activity_type: str
    distance_km: float
    difficulty_score: float
    difficulty_level: str
    readiness: str
    fitness_score: float
    gap: float
    recommendation: str
    training_weeks_needed: int
    confidence: float


@router.get("/best-fit", response_model=list[RouteMatchResponse])
async def get_best_fit_routes(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(10.0, gt=0),
    activity_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
    use_case: MatchRoutesUseCase = Depends(get_match_routes_use_case),
) -> list[RouteMatchResponse]:
    """Rank nearby routes by how well they fit the caller's current fitness,
    best-fit first (ready routes with the smallest gap, then not-ready routes
    needing the least additional training)."""
    logger.info(
        "best_fit_routes_requested",
        user_id=user_id,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        activity_type=activity_type,
    )

    try:
        results = await use_case.execute(
            user_id=firebase_uid_to_user_id(user_id),
            coordinates=Coordinates(latitude=lat, longitude=lon),
            radius_meters=radius_km * 1000,
            activity_type=activity_type,
            limit=limit,
        )
    except ValueError as exc:
        # The message is logged, not returned. A ValueError raised deep in the
        # use case describes our internals ("no UserDocument for <uuid>"), which
        # tells the caller nothing they can act on and us rather more than we
        # meant to say.
        logger.warning("best_fit_routes_unavailable", user_id=user_id, reason=str(exc))
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No profile or route data available for this request.",
        ) from exc

    logger.info("best_fit_routes_computed", user_id=user_id, count=len(results))

    return [
        RouteMatchResponse(
            route_id=str(result.route.id),
            name=result.route.name,
            activity_type=result.route.activity_type,
            distance_km=result.route.distance / 1000,
            difficulty_score=result.difficulty.score,
            difficulty_level=result.difficulty.level.value,
            readiness=result.match.readiness.value,
            fitness_score=result.match.fitness_score,
            gap=result.match.gap,
            recommendation=result.match.recommendation,
            training_weeks_needed=result.match.training_weeks_needed,
            confidence=result.match.confidence,
        )
        for result in results
    ]
