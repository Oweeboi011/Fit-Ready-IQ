"""FastAPI application entry point."""

import hashlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

import sentry_sdk
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .config.logging import configure_logging
from .config.settings import get_settings
from .infrastructure.database.connection import initialize_firebase
from .presentation.routes import routes

settings = get_settings()

# Structured logging, including the redaction that stops API keys reaching the
# logs via stringified httpx errors. See src/config/logging.py.
configure_logging(settings.log_level)

logger = structlog.get_logger()

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        # Explicit rather than relying on the default. Sentry attaches request
        # headers, cookies and client IP when this is on, and this service
        # handles Firebase bearer tokens on every authenticated call — an
        # accidental flip would ship them to a third party.
        send_default_pii=False,
    )


def rate_limit_key(request: Request) -> str:
    """Bucket requests per authenticated user, falling back to client IP.

    Keying purely on IP puts everyone behind one corporate NAT or mobile carrier
    gateway into a single bucket, so one heavy user throttles a whole office. The
    bearer token identifies the caller far more precisely, so use it when present.

    The raw token is never used as the key — it is a live credential and keys end
    up in logs and metrics. The uid is not extracted here either, because that
    would mean verifying the token twice per request; the opaque token digest is
    enough to tell two callers apart, which is all a limiter needs.
    """
    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return "user:" + hashlib.sha256(token.strip().encode()).hexdigest()[:32]
    return "ip:" + (get_remote_address(request) or "unknown")


# The limits come from settings so an operator can tune them per environment
# without a deploy. `slowapi` reads them as strings in its own grammar.
limiter = Limiter(
    key_func=rate_limit_key,
    default_limits=[
        f"{settings.rate_limit_per_minute}/minute",
        f"{settings.rate_limit_per_hour}/hour",
    ],
    # Rate-limit state lives in process memory by default, which means each
    # worker enforces its own share and the effective limit multiplies by the
    # worker count. Point RATE_LIMIT_STORAGE_URI at Redis in any deployment
    # running more than one worker, or the limit is not the number you set.
    storage_uri=settings.rate_limit_storage_uri,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan events."""
    # Startup
    logger.info("starting_application", environment=settings.environment)

    initialize_firebase()
    logger.info(
        "firebase_initialized",
        project_id=settings.firebase_project_id,
        emulator=settings.firebase_use_emulator,
    )

    yield

    # Shutdown
    logger.info("shutting_down_application")


# The interactive docs publish the full API surface — every route, every schema,
# every field name — to anyone who asks. That is exactly what you want while
# building and exactly what you do not want facing the internet, so they are on
# everywhere except production.
_docs_enabled = settings.environment != "production"

# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="Adventure readiness platform connecting fitness tracking to route analysis",
    version="0.1.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
    lifespan=lifespan,
)

# Configure CORS.
#
# `allow_credentials=True` alongside a "*" origin is a combination browsers
# reject outright, so a deployment that set CORS_ORIGINS=* would not get a
# permissive API — it would get one where every credentialed cross-origin call
# silently fails. Refuse the combination at startup instead of shipping it.
if "*" in settings.cors_origins:
    raise RuntimeError(
        "CORS_ORIGINS must list explicit origins: a wildcard cannot be combined "
        "with credentialed requests, and browsers will reject every such response."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Rate limiting. `slowapi` was a declared dependency with no limiter attached,
# so RATE_LIMIT_PER_MINUTE / _PER_HOUR were settings that did nothing.
#
# SlowAPIMiddleware applies the default limits to every route, so a new endpoint
# is covered the moment it is added rather than whenever someone remembers the
# decorator. Health and root are exempted below — an uptime probe polling
# /health must not be able to exhaust the budget for real traffic.
app.state.limiter = limiter


def _on_rate_limit_exceeded(request: Request, exc: Exception) -> Response:
    """Adapter around slowapi's handler.

    Starlette types exception handlers as taking the base `Exception`, while
    slowapi's handler is annotated for `RateLimitExceeded` specifically. That is
    sound at runtime — the handler is only ever invoked for the exception class
    it is registered against — but the signatures do not unify, so mypy rejects
    passing it directly. Narrowing here keeps the gate honest instead of
    reaching for a blanket type: ignore.
    """
    assert isinstance(exc, RateLimitExceeded)
    return cast(Response, _rate_limit_exceeded_handler(request, exc))


app.add_exception_handler(RateLimitExceeded, _on_rate_limit_exceeded)
app.add_middleware(SlowAPIMiddleware)


@app.get("/health", tags=["Health"])
@limiter.exempt
async def health_check(request: Request) -> JSONResponse:
    """Health check endpoint for monitoring.

    Exempt from rate limiting: a monitor polling this every 15 seconds must not
    be able to consume the budget that real requests need.
    """
    return JSONResponse(
        content={
            "status": "healthy",
            "environment": settings.environment,
            "version": "0.1.0",
        }
    )


@app.get("/", tags=["Root"])
@limiter.exempt
async def root(request: Request) -> dict[str, str]:
    """Root endpoint with API information."""
    return {
        "message": "Welcome to Fit-Ready-IQ API",
        # Pointing at /docs when they are switched off just sends people to a 404.
        "docs": "/docs" if _docs_enabled else "disabled",
        "health": "/health",
        "version": "0.1.0",
    }


app.include_router(routes.router, prefix="/api/routes", tags=["Routes"])

# Additional routers, not yet built:
# from .presentation.routes import auth, fitness, itinerary
# app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
# app.include_router(fitness.router, prefix="/api/fitness", tags=["Fitness"])
# app.include_router(itinerary.router, prefix="/api/itinerary", tags=["Itinerary"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
