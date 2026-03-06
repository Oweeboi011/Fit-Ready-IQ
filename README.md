# Fit-Ready-IQ

Adventure readiness platform that connects fitness tracking data to route analysis, providing personalized readiness assessments, training programs, gear recommendations, and complete itineraries for hiking and biking adventures.

## Overview

Fit-Ready-IQ is a comprehensive web application that helps outdoor enthusiasts prepare for their next adventure by:
- Syncing fitness data from Strava, COROS, Garmin, and Komoot
- Discovering nearby hiking and biking routes with detailed difficulty analysis
- Comparing your fitness level against route requirements
- Generating personalized training programs to close fitness gaps
- Providing weather forecasts, gear recommendations, and safety alerts
- Creating complete adventure itineraries with logistics planning

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER DEVICES                             │
│                  (Mobile, Tablet, Desktop)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTPS
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                   NEXT.JS FRONTEND (Port 3000)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  Dashboard   │  │  Route Maps  │  │  Itinerary Builder  │  │
│  │  Components  │  │  (Mapbox GL) │  │  Training Programs  │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
│         React Query + Zustand State Management                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ REST API
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                  FASTAPI BACKEND (Port 8000)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PRESENTATION LAYER                          │   │
│  │  Routes | Middleware | Controllers | Validators         │   │
│  └────────────────────┬────────────────────────────────────┘   │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │            APPLICATION LAYER                             │   │
│  │  Use Cases | Services | Business Logic                  │   │
│  └────────────────────┬────────────────────────────────────┘   │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │                 DOMAIN LAYER                             │   │
│  │  Entities | Value Objects | Interfaces | Services       │   │
│  └────────────────────┬────────────────────────────────────┘   │
│  ┌────────────────────▼────────────────────────────────────┐   │
│  │            INFRASTRUCTURE LAYER                          │   │
│  │  API Clients | Database | Cache | External Services     │   │
│  └────────────────────┬────────────────────────────────────┘   │
└────────────────────────┼────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
┌───────▼────────┐  ┌───▼────────┐  ┌───▼──────────────┐
│   PostgreSQL   │  │   Redis    │  │  External APIs   │
│   + PostGIS    │  │   Cache    │  │  - Strava        │
│   Database     │  │            │  │  - Mapbox        │
│                │  │            │  │  - OpenWeather   │
└────────────────┘  └────────────┘  │  - OSM Overpass  │
                                    └──────────────────┘
```

## Tech Stack

### Backend
- **Python 3.11+** with FastAPI
- **PostgreSQL 15+** with PostGIS extension
- **Redis** for caching and rate limiting
- **SQLAlchemy** + GeoAlchemy2 for ORM
- **Poetry** for dependency management

### Frontend
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **React Query** for server state
- **Zustand** for client state
- **Mapbox GL** for interactive maps

### Infrastructure
- **Docker** + Docker Compose for local development
- **Azure** for production deployment
- **GitHub Actions** for CI/CD

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Git installed
- (Optional) Python 3.11+, Node.js 20+, PostgreSQL 15+

### 1. Clone Repository
```bash
git clone https://github.com/Oweeboi011/Fit-Ready-IQ.git
cd Fit-Ready-IQ
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys:
# - STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET
# - MAPBOX_ACCESS_TOKEN (required for map display)
# - GOOGLE_MAPS_API_KEY
# - OPENWEATHER_API_KEY
# - JWT_SECRET_KEY (generate secure key)

# Configure frontend environment
cd frontend
cp .env.example .env.local
# Add your Mapbox token: NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
cd ..
```

### 3. Start Services
```bash
docker-compose up -d
```

This starts:
- PostgreSQL with PostGIS on port 5432
- Redis on port 6379
- FastAPI backend on port 8000
- Next.js frontend on port 3000

### 4. Access Application
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **API Health**: http://localhost:8000/health

## Development Setup

### Backend (Python FastAPI)
```bash
cd backend

# Install dependencies
poetry install

# Activate virtual environment
poetry shell

# Run migrations
poetry run alembic upgrade head

# Start development server
poetry run uvicorn src.main:app --reload
```

### Frontend (Next.js)
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### VS Code Debugging
Open project in VS Code and use launch configurations:
- **Python: FastAPI Backend** - Debug backend with breakpoints
- **Next.js: Frontend Dev** - Debug frontend
- **Full Stack: Backend + Frontend** - Debug both simultaneously

Press `F5` to start debugging.

## Project Structure

```
Fit-Ready-IQ/
├── backend/                    # Python FastAPI backend
│   ├── src/
│   │   ├── domain/            # Business logic (entities, value objects)
│   │   ├── application/       # Use cases and services
│   │   ├── infrastructure/    # External concerns (DB, APIs)
│   │   ├── presentation/      # FastAPI routes and controllers
│   │   └── config/            # Configuration management
│   ├── tests/                 # Test suite
│   ├── pyproject.toml         # Python dependencies
│   └── Dockerfile             # Container image
├── frontend/                  # Next.js frontend
│   ├── src/
│   │   ├── app/              # Next.js pages and layouts
│   │   ├── components/       # React components
│   │   ├── lib/              # Utilities and helpers
│   │   ├── store/            # State management
│   │   └── types/            # TypeScript definitions
│   ├── package.json          # Node dependencies
│   └── Dockerfile            # Container image
├── docs/                     # Comprehensive documentation
│   ├── ARCHITECTURE.md       # System design and patterns
│   ├── API.md                # API reference
│   ├── DEPLOYMENT.md         # Azure deployment guide
│   ├── SECURITY.md           # Security practices
│   ├── TROUBLESHOOTING.md    # Common issues
│   └── CONTRIBUTING.md       # Contribution guidelines
├── .vscode/                  # VS Code configuration
│   ├── launch.json           # Debug configurations
│   ├── tasks.json            # Build tasks
│   └── settings.json         # Editor settings
├── docker-compose.yml        # Local development stack
└── .env.example              # Environment template
```

## Key Features

### 1. Fitness Platform Integration
- **Strava**: OAuth 2.0 authentication, activity sync, athlete stats
- **Garmin/COROS**: File import (FIT/GPX) for devices without public APIs
- **Real-time sync**: Webhook support for instant activity updates

### 2. Route Discovery
- **Nearby search**: Find hiking/biking routes within specified radius
- **Geospatial queries**: PostGIS-powered proximity searches
- **Multiple sources**: OSM, Hiking Project API, user-generated
- **Interactive maps**: Mapbox GL with elevation profiles

### 3. Fitness Scoring
- **Multi-factor analysis**: VO2max estimation, training volume, consistency
- **Heart rate zones**: Intelligent intensity distribution analysis
- **Experience classification**: Beginner/Intermediate/Advanced/Expert
- **Progressive tracking**: Monitor improvements over time

### 4. Route Difficulty Calculation
- **Elevation analysis**: Total gain, max grade, climbing rate
- **Distance factors**: Non-linear scaling for longer routes
- **Technical rating**: Trail surface and difficulty classification
- **Activity-specific**: Different algorithms for hiking vs biking

### 5. Route Matching
- **Readiness assessment**: Ready/Almost Ready/Not Ready/Overqualified
- **Fitness gap analysis**: Quantify difference between fitness and difficulty
- **Training recommendations**: Weeks needed to prepare
- **Confidence scoring**: Assessment reliability indicator

### 6. Training Program Generation
- **Periodization**: Base/Build/Peak phases
- **Session types**: Endurance, interval, hill-specific, recovery
- **Progressive overload**: Gradual intensity increases
- **Customizable**: Adjustable duration and frequency

### 7. Complete Itinerary Planning
- **Weather forecasts**: Date-specific conditions
- **Gear recommendations**: Activity and weather-appropriate equipment
- **Safety alerts**: Hazards, trail conditions, warnings
- **Timing estimates**: Start/finish times based on fitness

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Clean Architecture implementation, design patterns, SOLID principles
- **[API.md](docs/API.md)** - Complete API reference with examples
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Azure deployment guide and infrastructure
- **[SECURITY.md](docs/SECURITY.md)** - Authentication, authorization, data protection
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[CONTRIBUTING.md](docs/CONTRIBUTING.md)** - Development workflow and standards

## Testing

### Backend Tests
```bash
cd backend
poetry run pytest -v --cov=src
```

### Frontend Tests
```bash
cd frontend
npm test
npm run test:e2e
```

## Deployment

### Azure Deployment
Refer to [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete guide.

Resources provisioned:
- Azure App Service (FastAPI backend)
- Azure Static Web Apps (Next.js frontend)
- Azure Database for PostgreSQL with PostGIS
- Azure Key Vault (secrets management)
- Azure Application Insights (monitoring)

```bash
# Deploy using Azure CLI
az deployment group create \
  --resource-group fit-ready-iq-rg \
  --template-file infrastructure/azure/main.bicep
```

## API Keys Required

### Strava API (Required)
1. Create app at https://www.strava.com/settings/api
2. Set callback URL to `http://localhost:3000/auth/callback/strava`
3. Copy Client ID and Secret to `.env`

### Mapbox API (Required)
1. Create account at https://www.mapbox.com
2. Generate access token
3. Add to `.env` as `MAPBOX_ACCESS_TOKEN`

### OpenWeather API (Required)
1. Sign up at https://openweathermap.org/api
2. Get free API key
3. Add to `.env` as `OPENWEATHER_API_KEY`

### Optional APIs
- **Komoot**: Partner API (requires application)
- **Hiking Project**: Free API key
- **Garmin**: Commercial partnership required

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for development workflow, code standards, and pull request process.

## License

MIT

## Support

For issues, questions, or contributions:
- **Issues**: https://github.com/Oweeboi011/Fit-Ready-IQ/issues
- **Discussions**: https://github.com/Oweeboi011/Fit-Ready-IQ/discussions

---

Built with Clean Architecture principles and SOLID design patterns for maintainability and scalability.
