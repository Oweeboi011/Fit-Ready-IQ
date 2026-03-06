# Fit-Ready-IQ Backend API

FastAPI backend service implementing Clean Architecture and SOLID principles for the Fit-Ready-IQ adventure readiness platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐   │
│  │ Controllers│  │ Middleware │  │  API Routes         │   │
│  │ (FastAPI)  │  │ (Auth, etc)│  │  (REST Endpoints)   │   │
│  └────────────┘  └────────────┘  └─────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Application Layer                          │
│  ┌─────────────────┐  ┌──────────────────────────────┐     │
│  │   Use Cases     │  │      Services                │     │
│  │  - Sync Data    │  │  - Fitness Analysis          │     │
│  │  - Match Route  │  │  - Route Matching            │     │
│  │  - Generate     │  │  - Training Program Gen      │     │
│  └─────────────────┘  └──────────────────────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     Domain Layer                             │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │   Entities   │  │ Value Objects │  │  Interfaces    │  │
│  │  - User      │  │ - FitnessScore│  │  - IRepository │  │
│  │  - Route     │  │ - Coordinates │  │  - IAPIClient  │  │
│  │  - Activity  │  │ - Difficulty  │  │                │  │
│  └──────────────┘  └───────────────┘  └────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                 Infrastructure Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ API Clients │  │  Database    │  │  External APIs   │  │
│  │  - Strava   │  │  - Postgres  │  │  - Mapbox        │  │
│  │  - Komoot   │  │  - PostGIS   │  │  - OpenWeather   │  │
│  │             │  │  - Redis     │  │                  │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **FastAPI**: Modern async web framework
- **SQLAlchemy + GeoAlchemy2**: ORM with geospatial support
- **PostgreSQL + PostGIS**: Database with spatial extensions
- **Redis**: Caching and rate limiting
- **Pydantic**: Data validation and settings management
- **httpx**: Async HTTP client for external APIs
- **pytest**: Testing framework

## Getting Started

### Prerequisites

- Python 3.11+
- Poetry (dependency management)
- PostgreSQL 15+ with PostGIS extension
- Redis

### Installation

1. Install dependencies:
```bash
poetry install
```

2. Copy environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run database migrations:
```bash
poetry run alembic upgrade head
```

4. Start development server:
```bash
poetry run uvicorn src.main:app --reload
```

API will be available at http://localhost:8000

### Using Docker

```bash
# From project root
docker-compose up backend
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Project Structure

```
backend/
├── src/
│   ├── domain/               # Business logic and entities
│   │   ├── entities/         # Core business objects
│   │   ├── value_objects/    # Immutable value types
│   │   ├── interfaces/       # Abstract interfaces
│   │   └── services/         # Domain services
│   ├── application/          # Use cases and application services
│   │   ├── use_cases/        # Business operations
│   │   └── services/         # Application-level services
│   ├── infrastructure/       # External concerns
│   │   ├── api_clients/      # External API integrations
│   │   ├── database/         # Database and repositories
│   │   └── cache/            # Caching implementation
│   ├── presentation/         # API layer
│   │   ├── routes/           # FastAPI endpoints
│   │   ├── controllers/      # Request handlers
│   │   ├── middleware/       # HTTP middleware
│   │   └── schemas/          # Pydantic models
│   ├── config/               # Configuration
│   └── main.py               # Application entry point
├── tests/                    # Test suite
├── alembic/                  # Database migrations
└── pyproject.toml            # Dependencies and config
```

## Testing

```bash
# Run all tests
poetry run pytest

# With coverage
poetry run pytest --cov=src

# Specific test file
poetry run pytest tests/unit/test_fitness_scoring.py
```

## Code Quality

```bash
# Format code
poetry run black src tests

# Sort imports
poetry run isort src tests

# Type checking
poetry run mypy src

# Linting
poetry run pylint src
```

## Development Guidelines

- Follow PEP 8 style guide
- Use type hints for all functions
- Write docstrings for public APIs
- Maintain test coverage above 80%
- Keep layers independent (dependency inversion)
- Use dependency injection for external services

## Environment Variables

See `.env.example` for required configuration.

## License

MIT
