# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fit-Ready-IQ is an outdoor fitness platform that combines route discovery (mountains, trails, campsites), Strava integration, GPX import, AI-powered chat, and real-time weather. The production surface is a **Next.js 14 App Router** frontend deployed on Vercel. A **FastAPI Python backend** exists in `backend/` but is not yet deployed.

## Commands

### Frontend (all run from `frontend/`)

```bash
npm run dev          # Dev server on port 4790
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript (tsc --noEmit)
npm run format       # Prettier
npm run test:unit    # Vitest (unit tests)
npm run test:e2e     # Playwright (E2E tests)
```

Run a single Vitest test file:
```bash
npx vitest run src/lib/__tests__/gpxParser.test.ts
```

### Backend (run from `backend/`)

```bash
poetry run uvicorn src.main:app --reload --port 8000
pytest                            # all tests
pytest tests/unit/test_foo.py    # single test file
```

### Local dev with Firebase emulators

```bash
docker-compose up -d   # starts Firestore (8080), Auth (9099), Emulator UI (4000)
```

## Architecture

### Request flow

Browser → Next.js page (`src/app/page.tsx`) → Next.js API routes (`src/app/api/`) → external services (Firestore, Strava, Google APIs, Gemini).

The FastAPI backend is not called by the frontend in production; it is planned for future phases.

### API routes and timeouts (set in `vercel.json`)

| Route | Purpose | Timeout |
|---|---|---|
| `/api/chat` | Gemini 1.5 Flash conversation, persisted to Firestore | 30 s |
| `/api/strava/exchange` | Server-side OAuth token exchange (keeps secret off client) | — |
| `/api/strava/activities` | Fetch activities from Strava API | — |
| `/api/strava/sync` | Admin: sync Strava activities → Firestore | 60 s |
| `/api/places/cache` | Grid-based places cache (0.5° cells, 24 h TTL) | 15 s |
| `/api/weather` | Google Weather (primary) → OpenWeather fallback | 15 s |
| `/api/health` | Aggregate health check for all integrations | 15 s |
| `/api/admin/cache` | Inspect / purge places cache (batch 400 docs) | 30 s |
| `/api/admin/strava-sync` | Strava sync status across users | — |

### Firestore data model

```
users/{uid}/saved_places/{placeId}
users/{uid}/strava_activities/{actId}   # Admin SDK write-only
users/{uid}/strava_sync                 # sync manifest
places_cache/{gridKey}                  # shared, public read, 24 h TTL
activities/{actId}
routes/{routeId}
training_programs/{programId}
itineraries/{itineraryId}
_health/                                # health check documents
```

Places cache key = coordinates rounded to 0.5° so nearby users share cached results.

### Credential split

`NEXT_PUBLIC_*` variables are safe to expose to the browser. All other keys (`GEMINI_API_KEY`, `STRAVA_CLIENT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_KEY_JSON`, `FIREBASE_PRIVATE_KEY`) are server-side only and must never appear in client-side code.

Firebase Admin SDK tries credentials in this order: `FIREBASE_SERVICE_ACCOUNT_KEY_JSON` (full JSON) → `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` key pair → default application credentials.

### Key frontend files

- `src/app/page.tsx` — entire map UI, state management, filter logic, Strava/GPX integration (~79 KB)
- `src/components/MapView.tsx` — Google Maps with custom markers, polylines, OverlayView popups
- `src/components/ChatBot.tsx` — floating chat widget with Firestore session persistence
- `src/components/ConnectDevicesModal.tsx` — Strava OAuth + GPX drag-and-drop import
- `src/components/DetailsModal.tsx` — route/mountain details, elevation profiles, weather
- `src/lib/firebaseAdmin.ts` — Admin SDK init (server-side only)
- `src/lib/firebaseClient.ts` — client SDK init + Google auth
- `src/lib/gpxParser.ts` — GPX/TCX → activity objects (haversine, elevation gain, sport inference)
- `src/lib/polylineDecoder.ts` — precision-5 polyline decode → `[lng, lat]` pairs
- `src/lib/activityTypes.ts` — activity interfaces, localStorage persistence (`fri_activities` key), dedup
- `src/lib/useSavedPlaces.ts` — real-time Firestore listener hook for saved places

### Path aliases (`tsconfig.json`)

`@/*`, `@/components/*`, `@/lib/*`, `@/types/*`, `@/store/*` all resolve under `src/`.

### Polyline convention

Decoded polylines are stored as `[lng, lat]` pairs (GeoJSON order), not `[lat, lng]`.

## Testing

- **Unit tests:** Vitest with jsdom, 85% coverage threshold on statements/functions/lines. Reports in `coverage/`.
- **E2E tests:** Playwright (Chromium), 30 s timeout, 2 retries in CI, auto-starts dev server on port 4790.
- **Load tests:** `npm run test:load` (Autocannon).

## Environment variables

Copy `frontend/.env.example` to `frontend/.env.local`. Required keys that will break functionality if missing:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_FIREBASE_*` (6 keys)
- `FIREBASE_PROJECT_ID` + one of the Admin credential options above
- `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET`

Optional (graceful degradation): `GOOGLE_WEATHER_API_KEY`, `OPENWEATHER_API_KEY`.
