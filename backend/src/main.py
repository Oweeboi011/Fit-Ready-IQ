"""FastAPI application entry point."""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config.settings import get_settings
from .infrastructure.database.connection import engine
from .infrastructure.database.models import Base

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("starting_application", environment=settings.environment)

    # Create database tables (in production, use Alembic migrations)
    if settings.environment == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            logger.info("database_tables_created")

    yield

    # Shutdown
    logger.info("shutting_down_application")
    await engine.dispose()


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="Adventure readiness platform connecting fitness tracking to route analysis",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring."""
    return JSONResponse(
        content={"status": "healthy", "environment": settings.environment, "version": "0.1.0"}
    )


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Welcome to Fit-Ready-IQ API",
        "docs": "/docs",
        "health": "/health",
        "version": "0.1.0",
    }


# Import and include routers (will be created)
# from .presentation.routes import auth, fitness, routes, itinerary
# app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
# app.include_router(fitness.router, prefix="/api/fitness", tags=["Fitness"])
# app.include_router(routes.router, prefix="/api/routes", tags=["Routes"])
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
