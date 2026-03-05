# FitReady IQ

A cross-platform fitness readiness application that evaluates your fitness level and recommends suitable riding, hiking, and mountain routes.

## Overview

FitReady IQ integrates with leading fitness tracking platforms to analyse your training data, generate a personalised **Fitness Readiness Score (0–100)**, and match you with routes and gear appropriate to your current fitness level.

### Key Features

- **Multi-platform fitness data ingestion** – connects to Strava, Garmin Connect, and COROS via OAuth
- **Fitness Readiness Score** – weighted algorithm combining aerobic fitness (30%), recovery (25%), training load (20%), strength indicators (15%), and consistency (10%)
- **Route matching** – compares your readiness score against trail difficulty data from Google Maps Elevation API and Komoot
- **Gear recommendations** – suggests essential, recommended, and optional gear based on route difficulty and conditions
- **Cross-platform** – React web app + native Android app (Jetpack Compose)

## Repository Structure

```
.
├── backend/        # Node.js / Express REST API
├── frontend/       # React 18 web application
├── android/        # Native Android app (Kotlin + Jetpack Compose)
└── README.md
```

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Android Studio (for the Android app)

### Backend

```bash
cd backend
cp .env.example .env       # add your API keys
npm install
npm run dev                # development (nodemon, port 3001)
# or
npm start                  # production
```

### Web Frontend

```bash
cd frontend
cp .env.example .env.local  # set REACT_APP_API_URL
npm install
npm start                   # development server (port 3000)
npm run build               # production build
```

### Android App

Open the `android/` folder in Android Studio and run on an emulator or device.  
The app talks to `http://10.0.2.2:3001/api` (emulator localhost) by default.  
If no backend is reachable it falls back to realistic mock data automatically.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/auth/strava/url` | Get Strava OAuth URL |
| GET | `/api/auth/garmin/url` | Get Garmin OAuth URL |
| GET | `/api/auth/coros/url` | Get COROS OAuth URL |
| POST | `/api/auth/strava/callback` | Handle Strava OAuth callback |
| POST | `/api/auth/garmin/callback` | Handle Garmin OAuth callback |
| POST | `/api/auth/coros/callback` | Handle COROS OAuth callback |
| GET | `/api/fitness/summary` | Aggregated fitness data |
| GET | `/api/fitness/strava` | Strava activities |
| GET | `/api/fitness/garmin` | Garmin metrics |
| GET | `/api/fitness/coros` | COROS metrics |
| GET | `/api/score` | Current readiness score |
| POST | `/api/score/calculate` | Calculate score from provided data |
| GET | `/api/routes` | Recommended routes |
| POST | `/api/routes/match` | Match routes to fitness level |
| GET | `/api/gear?difficulty=moderate` | Gear recommendations |

## Environment Variables

See `backend/.env.example` and `frontend/.env.example` for the full list of required configuration values.

## Running Tests

```bash
cd backend && npm test
```

79 tests covering the scoring algorithm, gear recommendations, and route/maps services.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   React Web App │     │  Android App    │
│   (port 3000)   │     │  (Kotlin/Compose│
└────────┬────────┘     └────────┬────────┘
         │  REST / JSON          │
         └──────────┬────────────┘
                    ▼
         ┌──────────────────────┐
         │  Express API Server  │
         │     (port 3001)      │
         └──────┬───────────────┘
                │
    ┌───────────┼───────────────────────┐
    ▼           ▼           ▼           ▼
 Strava      Garmin       COROS    Google Maps
  API         API          API    / Komoot API
```
