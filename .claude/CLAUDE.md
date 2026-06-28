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
npx vitest run src/lib/gpxParser.test.ts
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
- `src/components/ConnectDevicesModal.tsx` — Strava OAuth + GPX/Apple Health file import
- `src/components/DetailsModal.tsx` — route/mountain/campsite/activity details, elevation profiles, weather
- `src/lib/firebaseAdmin.ts` — Admin SDK init (server-side only)
- `src/lib/firebaseClient.ts` — client SDK init + Google/Apple auth (`signInWithGoogle`, `signInWithApple`)
- `src/lib/gpxParser.ts` — GPX/TCX → activity objects (haversine, elevation gain, sport inference)
- `src/lib/appleHealthParser.ts` — Apple Health export.xml → activity objects (Workout elements)
- `src/lib/polylineDecoder.ts` — precision-5 polyline decode → `[lng, lat]` pairs
- `src/lib/activityTypes.ts` — activity interfaces, localStorage persistence (`fri_activities` key), dedup. Sources: `strava | coros | garmin | komoot | apple_health`
- `src/lib/useSavedPlaces.ts` — real-time Firestore listener hook for saved places

### Path aliases (`tsconfig.json`)

`@/*`, `@/components/*`, `@/lib/*`, `@/types/*`, `@/store/*` all resolve under `src/`.

### Polyline convention

Decoded polylines are stored as `[lng, lat]` pairs (GeoJSON order), not `[lat, lng]`.

## Testing

- **Unit tests:** Vitest with jsdom, 85% coverage threshold on statements/functions/lines. Reports in `coverage/`.
- **E2E tests:** Playwright (Chromium), 30 s timeout, 2 retries in CI, auto-starts dev server on port 4790.
- **Mutation tests:** Stryker (`npm run test:mutation`), targets `src/lib/gpxParser.ts`, `polylineDecoder.ts`, `activityTypes.ts`. Break/low threshold 70%, high 80%. Note: `stryker.config.ts` has a pre-existing `Config` import error (upstream type issue) — safe to ignore.
- **Load tests:** `npm run test:load` (Autocannon).

### Cost / performance harnesses added (feature/solution-harnessing)

| Area | What changed |
|---|---|
| `/api/health` | Converted to credential-presence checks only (no live Firestore writes or Weather API calls). Cache header: `s-maxage=30, stale-while-revalidate=10`. |
| `/api/chat` | History capped at 20 messages (anchors first message) to bound Gemini token cost per call. |
| `DetailsModal.tsx` | Module-level `weatherCache` (30 min TTL) and `photosCache` (session lifetime) prevent redundant paid API calls when re-opening the same modal. |
| `page.tsx` | Reverse geocode cached in `sessionStorage` with 24 h TTL and 0.1° coordinate grid (`fri_geocode_*` key). Last known user location persisted to `localStorage` (`fri_last_location`) and restored on every page load so the map focuses instantly. |
| `agent-review.yml` | Uses Claude Haiku (`claude-haiku-4-5-20251001`), diff trimmed to 10 KB, max 1 024 output tokens (~$0.004/PR). |

## CI/CD Pipeline

### Branch flow

```
feature/* → main
```

- Direct pushes to `main` are blocked (set in GitHub branch protection).
- All feature branches open a PR directly to `main`.

### Workflows

| File | Triggers | What it does |
|---|---|---|
| `ci.yml` | PR to `main`, push to `main` | Lint + type-check + unit tests + build (frontend); ruff + mypy + pytest (backend) |
| `e2e.yml` | PR to `main` | Playwright E2E (uses real secrets from GitHub Secrets) |
| `mutation.yml` | PR to `main` when `src/lib/` changed | Stryker mutation tests |
| `security.yml` | PRs + push to `main` + weekly Monday | npm audit + gitleaks secret scan + CodeQL |
| `agent-review.yml` | PR open/synchronize | Posts AI review comment via Claude Haiku. Needs `ANTHROPIC_API_KEY` secret. Add `[skip review]` to PR title to suppress. |

### Required GitHub Secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | `agent-review.yml` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `e2e.yml` |
| `NEXT_PUBLIC_FIREBASE_*` (all 6) | `e2e.yml` |
| `GEMINI_API_KEY` | `e2e.yml` |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | `e2e.yml` |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | `e2e.yml` |

### Branch protection setup (one-time, GitHub UI)

**`main` branch:**
- Require status checks: `Frontend Quality`, `Backend Quality`, `Playwright E2E`, `Secret Scan`
- Enable merge queue (Settings → Branches → Edit → Merge queue)
- Require 1 approving review
- Dismiss stale reviews on new commits
- Restrict direct pushes

### Pre-commit hooks (Husky)

After cloning, run once from `frontend/`:
```bash
npm install   # installs husky, lint-staged, commitlint
```

Husky runs automatically after `npm install` via the `prepare` script.

- **pre-commit:** runs `lint-staged` (ESLint --fix + Prettier on staged `*.ts(x)` files)
- **commit-msg:** enforces Conventional Commits via `commitlint`

Commit format: `type(scope): subject` — types: `feat fix docs style refactor perf test chore revert ci build`

## Environment variables

Copy `frontend/.env.example` to `frontend/.env.local`. Required keys that will break functionality if missing:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_FIREBASE_*` (6 keys)
- `FIREBASE_PROJECT_ID` + one of the Admin credential options above
- `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET`

Optional (graceful degradation): `GOOGLE_WEATHER_API_KEY`, `OPENWEATHER_API_KEY`.

## Auth providers

Firebase Auth supports two sign-in methods. Both require the provider to be enabled in Firebase Console → Authentication → Sign-in method.

| Provider | Firebase | Setup note |
|---|---|---|
| Google | `GoogleAuthProvider` | Works on any domain in Firebase authorised-domain list |
| Apple | `OAuthProvider("apple.com")` | Also requires Apple Developer account with Sign in with Apple entitlement; add Firebase callback URL to Apple service ID |

## Activity sources

All sources are typed in `src/lib/activityTypes.ts`:

| Source key | Origin | Parser |
|---|---|---|
| `strava` | Strava OAuth sync | `/api/strava/activities` |
| `coros` | GPX/TCX file upload | `gpxParser.ts` |
| `garmin` | GPX/TCX file upload | `gpxParser.ts` |
| `komoot` | GPX/TCX file upload | `gpxParser.ts` |
| `apple_health` | Apple Health `export.xml` | `appleHealthParser.ts` |

Apple Health export: iPhone → Health → profile photo → Export All Health Data → extract zip → upload `export.xml` in the Connect Devices modal.
