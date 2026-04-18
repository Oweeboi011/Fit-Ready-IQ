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

### Deployed (Azure)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER DEVICES                            │
│                   (Mobile, Tablet, Desktop)                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼──────────────────────────────────┐
│             Azure Container Apps (serverless)                   │
│          Next.js 14 App Router — Port 3000                      │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │  MapView     │  │ DetailsModal  │  │   RouteFilter        │  │
│  │  Component   │  │  Component    │  │   ConnectDevices     │  │
│  └──────────────┘  └───────────────┘  └──────────────────────┘  │
│                                                                 │
│       Google Maps JS API + Places API + Elevation API           │
│       (API key baked into bundle at build time)                 │
└─────────────────────────────────────────────────────────────────┘

Supporting Azure Resources:
  Azure Container Registry       — stores frontend Docker image
  Azure Key Vault                — stores Maps API key (audit/rotation)
  Azure Log Analytics            — Container Apps telemetry
  User-Assigned Managed Identity — ACR pull + Key Vault read
```

### Local Development (backend not deployed)

```
┌──────────────────┐       ┌───────────────────────────────┐
│  Next.js 14      │       │  FastAPI Backend (Port 8000)  │
│  Port 3000       │──────►│  Python 3.11+, Pydantic v2    │
└──────────────────┘       │  SQLAlchemy 2.0 async         │
                           └────────────────┬──────────────┘
                                            │
                           ┌────────────────┴──────────────┐
                           │  Docker Compose (local only)  │
                           │  PostgreSQL    │  Redis       │
                           └───────────────────────────────┘
```

## Tech Stack

### Frontend (deployed to Azure)
- **Next.js 14** App Router, TypeScript
- **Tailwind CSS** (`slate-*` palette)
- **Google Maps JS API** — Places API, Elevation API
- **Lucide React** for icons

### Backend (local development only — not deployed)
- **Python 3.11+**, FastAPI, Pydantic v2
- **SQLAlchemy 2.0** async + asyncpg
- **PostgreSQL** + PostGIS, Redis (via Docker Compose)
- **Poetry** for dependency management

### Infrastructure
- **Azure Container Apps** (serverless, scale-to-zero) — frontend
- **Azure Container Registry** — Docker image storage
- **Azure Key Vault** — Maps API key storage and rotation
- **Azure Developer CLI (`azd`)** — provision and deploy
- **Docker Compose** — local backend services only

## Quick Start

### Prerequisites
- Node.js 20+
- Git
- A Google Maps API key (Maps JS API, Places API, Elevation API enabled)
- For backend dev: Python 3.11+, Poetry, Docker Desktop

### 1. Clone Repository
```bash
git clone https://github.com/Oweeboi011/Fit-Ready-IQ.git
cd Fit-Ready-IQ
```

### 2. Run Frontend Locally
```bash
cd frontend
npm install

# Create local env file
echo "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here" > .env.local

npm run dev
# App at http://localhost:3000
```

### 3. Run Backend Locally (optional)
```bash
# Start local Postgres + Redis
docker-compose up -d

cd backend
poetry install
poetry run alembic upgrade head
poetry run uvicorn src.main:app --reload
# API at http://localhost:8000
```

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
├── frontend/                  # Next.js 14 — DEPLOYED to Azure
│   ├── src/
│   │   ├── app/              # App Router (layout, page, globals.css)
│   │   └── components/       # MapView, DetailsModal, RouteFilter,
│   │                         # ConnectDevicesModal
│   ├── public/               # Static assets
│   ├── Dockerfile            # Multi-stage: deps → builder → runner
│   ├── next.config.js        # output: standalone, image domains
│   ├── tailwind.config.js    # slate-* palette
│   └── package.json
├── backend/                   # Python FastAPI — LOCAL DEV ONLY
│   ├── src/
│   │   ├── domain/           # Entities, interfaces, services, value objects
│   │   ├── infrastructure/   # API clients (Strava, Garmin, Google Maps...)
│   │   │   └── database/     # SQLAlchemy async models + connection
│   │   └── config/           # Settings via pydantic-settings
│   ├── tests/
│   └── pyproject.toml        # Poetry dependencies
├── infra/                     # Bicep IaC — provisioned via azd up
│   ├── main.bicep            # Orchestrator (targetScope: resourceGroup)
│   └── modules/              # ACR, Container App, Key Vault, Log Analytics
├── docs/                      # Documentation
├── azure.yaml                 # AZD service manifest
├── .dockerignore              # Excludes backend/node_modules from build context
├── docker-compose.yml         # Local Postgres + Redis for backend dev
└── .env.example               # Required env vars reference
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

Deployment is exclusively via **Azure Developer CLI (`azd`)**. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full guide.

### One-time setup
```bash
azd env new fit-ready-iq
azd env set AZURE_SUBSCRIPTION_ID <your-subscription-id>
azd env set AZURE_RESOURCE_GROUP rg-sample-fit-maps
azd env set AZURE_LOCATION eastus2
azd env set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY <your-maps-key>
azd env set GOOGLE_MAPS_API_KEY <your-maps-key>
```

### Provision + deploy
```bash
azd up          # provision infra + build + deploy
```

### Redeploy code only
```bash
azd deploy --all
```

### Resources provisioned
| Resource | Azure Service |
|---|---|
| Frontend | Azure Container Apps (Consumption, scale-to-zero) |
| Images | Azure Container Registry (Basic) |
| Secrets | Azure Key Vault (Standard) |
| Observability | Azure Log Analytics Workspace |
| Identity | User-Assigned Managed Identity |

## API Keys Required

### Google Maps API (Required for deployed app)
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Enable: Maps JavaScript API, Places API, Elevation API
3. Create an API key and (optionally) restrict to your Container App domain
4. Set via: `azd env set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY <key>`

> The key is baked into the Next.js bundle at build time via a `prepackage` hook.
> It is also stored in Azure Key Vault for audit and rotation.
> **Never commit the key** — `frontend/.env.production` is gitignored.

### Backend API keys (local dev only)
- **Strava**: `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`
- **Garmin / COROS**: file import (no public API)
- **Komoot**: partner API

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
