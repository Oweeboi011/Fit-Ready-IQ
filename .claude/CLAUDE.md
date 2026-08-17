# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fit-Ready-IQ is an outdoor fitness platform that combines route discovery (mountains, trails, campsites), Strava integration, GPX import, AI-powered chat, and real-time weather. The production surface is a **Next.js 16 App Router** frontend deployed on Vercel. A **FastAPI Python backend** exists in `src/backend/` but is not yet deployed.

## Commands

### Frontend (all run from `src/frontend/`)

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

### Backend (run from `src/backend/`)

```bash
poetry run uvicorn src.main:app --reload --port 8000
poetry run pytest                        # all tests
poetry run pytest tests/unit/test_foo.py # single test file
```

The dependencies live in Poetry's virtualenv, not in the system Python, so every
command needs the `poetry run` prefix — a bare `uvicorn` or `pytest` reports
`No module named uvicorn` even though the package is installed.

Requires `src/backend/.env`, but only `FIREBASE_PROJECT_ID` has no default — copy
`.env.example` and set that one. It used to be six: the three `strava_*`,
`mapbox_access_token` and `openweather_api_key` were required and **read by
nothing**, so the app died on a Pydantic `ValidationError` unless you supplied
values it then ignored. They have been removed along with seven other unused
settings; weather and Strava belong to the Next routes, which hold their own
credentials.

Two consequences of `extra="forbid"`, which pydantic-settings applies by default:
a variable in `.env` that is *not* a settings field is a hard startup failure,
not dead weight — so removing a field means removing it from `.env` too. And
`CORS_ORIGINS` is the
exception: it is a `list[str]`, and pydantic-settings JSON-decodes complex types
straight from the dotenv file before any validator runs, so it must be a JSON
array (`["http://localhost:4790"]`), not the comma-separated form the
`parse_cors_origins` validator implies.

**Windows:** if Poetry was installed with `pip install --user`, `poetry.exe`
lands in `%APPDATA%\Python\Python312\Scripts`, which is not on `PATH` by default —
`poetry` is then "not recognised". Either add that directory to your user `PATH`,
or use `python -m poetry run ...` instead.

### Local dev with Firebase emulators

```bash
docker-compose up -d   # starts Firestore (8080), Auth (9099), Emulator UI (4000)
```

## Architecture

### Request flow

`/` is the marketing landing page (`src/app/page.tsx`, static). The map product lives at `/app` (`src/app/app/page.tsx`). Keep them separate — `/` must stay static and fast, since it is the only surface that converts visitors.

Browser → Next.js page → Next.js API routes (`src/app/api/`) → external services (Firestore, Strava, Google APIs, Gemini).

The FastAPI backend is not called by the frontend in production; it is planned for future phases.

### API routes and timeouts (set in `vercel.json`)

| Route | Purpose | Timeout |
|---|---|---|
| `/api/chat` | Gemini 2.5 Flash conversation, persisted to Firestore. History capped at 20 messages (first message anchored) to bound token cost. Rate-limited to 20/hour per caller. | 30 s |
| `/api/strava/exchange` | Server-side OAuth token exchange (keeps secret off client) | — |
| `/api/strava/activities` | Fetch activities from Strava API. Strava token travels in the `X-Strava-Token` header, never the query string. | — |
| `/api/strava/sync` | Sync the caller's Strava activities → Firestore. **Requires a Firebase ID token**; the destination `uid` comes from that token, never the body. | 60 s |
| `/api/places/cache` | Grid-based places cache (0.5° cells, 24 h TTL). GET is public; **POST requires a Firebase ID token** and caps each kind at 200 items. | 15 s |
| `/api/weather` | Google Weather (primary) → OpenWeather fallback. Rate-limited to 200/hour per caller. | 15 s |
| `/api/health` | Credential-presence checks only (no live API calls). `s-maxage=30, stale-while-revalidate=10`. | 15 s |
| `/api/admin/cache` | Inspect / purge places cache (batch 400 docs). Admin-gated. | 30 s |
| `/api/admin/strava-sync` | Strava sync status across users. Admin-gated. | — |
| `/api/admin/users` | Lists accounts from **Firebase Auth** (not Firestore, which omits anyone who has not yet synced or saved). Admin-gated, audited, capped at 1 000 with a `truncated` flag | — |
| `/api/admin/whoami` | Returns `{ isAdmin, role }` for the bearer token; lets the UI hide admin affordances without shipping the allowlist | — |
| `/api/account/export` | GDPR Art. 15 — every collection the caller owns, as one JSON document. Rate-limited to 5/hour | — |
| `/api/account/delete` | GDPR Art. 17 — erases the caller's data, then the Auth account. Requires `{"confirm":"DELETE"}`. Rate-limited to 5/hour | — |
| `/api/integrations/firebase` | Deep Firebase probe — actually writes to Firestore. Admin-gated; use `/api/health` for uptime monitoring. | 15 s |
| `/api/directions` | Google Routes API proxy for the planner (12 s upstream timeout). Rate-limited to 120/hour per caller. | — |
| `/api/advisories` | Scraped `data/advisories.json`, then `ADVISORY_FEED_URL`; never invents a closure | — |

### Firestore data model

```
users/{uid}/saved_places/{placeId}
users/{uid}/strava_activities/{actId}   # Admin SDK write-only
users/{uid}.strava_sync                 # sync manifest — a FIELD on the user doc, not a subcollection
places_cache/{gridKey}                  # shared, public read, 24 h TTL
activities/{actId}
routes/{routeId}
training_programs/{programId}
itineraries/{itineraryId}
chat_sessions/{sessionId}/messages/{id} # Admin SDK only; one doc per turn
rate_limits/{bucketId}                  # Admin SDK only; needs a TTL policy on `expiresAt`
audit_logs/{entryId}                    # Admin SDK only; append-only, 730-day TTL
_health/                                # health check documents
```

**Three collections need a Firestore TTL policy on `expiresAt` or they grow for
ever**: `rate_limits`, `chat_sessions` (plus its `messages` subcollection, at
*collection-group* scope — deleting a parent never touches a subcollection), and
`audit_logs`. The field is inert without the policy. See
`docs/runbooks/firestore-ttl.md`.

**Every route needs a rate-limit budget**, declared in `src/lib/rateLimitRules.ts`
rather than inline, so the set is enumerable. `rateLimitCoverage.test.ts` fails
the build if a route ships without one or an explicit, reasoned exemption.

**A user-scoped collection must be added to `src/lib/userDataFootprint.ts`** in
the same change. Export and erasure both walk that list; a collection missing
from it is data the product keeps after telling someone it was deleted.

Places cache key = coordinates rounded to 0.5° so nearby users share cached results.

**Security rules do not cascade into subcollections.** `match /users/{userId}` governs
the user document alone — every subcollection needs its own `match` block or it falls
through to the default deny. `saved_places` shipped without one, which silently denied
every bookmark write in production. When you add a subcollection the browser touches,
add its rule in the same change.

**A `uid` in a request body is not an identity.** Route handlers use the Admin SDK,
which bypasses these rules entirely, so any route that writes user-scoped data must
take the uid from `requireUser(request)` in `src/lib/serverAuth.ts` — never from the
body or a query parameter.

### Client-side caching

To avoid redundant paid API calls:

- **Weather + photos** (`DetailsModal.tsx`): module-level `weatherCache` (30 min TTL) and `photosCache` (session lifetime).
- **Reverse geocode** (`page.tsx`): `sessionStorage` with 24 h TTL and 0.1° coordinate grid (`fri_geocode_*` key).
- **Last user location** (`page.tsx`): persisted to `localStorage` (`fri_last_location`) and restored on page load so the map focuses instantly. Restore it in an effect, never in a `useState` initializer — reading storage during render makes the server and client disagree on first paint and React discards the server tree.

### Admin access

`/admin/settings` and every `/api/admin/*` route are gated on the `ADMIN_EMAILS` allowlist (comma-separated, **server-side only**). API routes call `requireAdmin(request)`, which verifies a Firebase ID token from the `Authorization: Bearer` header and checks the email against the list. An empty or missing `ADMIN_EMAILS` denies everyone — the gate fails closed.

Two roles, ordered: `viewer` (read-only dashboards — cache freshness, sync
health) and `admin` (everything, including purges and the user directory).
Routes ask for the minimum they need via `requireRole(request, 'viewer')`;
`requireAdmin` is exactly `requireRole(request, 'admin')`. A role rides on the
`fri_role` Firebase custom claim, and `ADMIN_EMAILS` is the bootstrap that
**always outranks the claim**, so a misconfigured claim can never lock out the
last administrator. Claims travel inside the ID token, so a change takes effect
on the next refresh with no per-request lookup.

Every denied admin attempt is written to `audit_logs`, distinguishing "no role"
from "role insufficient" — a viewer reaching for a destructive endpoint is a
different event from a stranger knocking.

The client never sees the allowlist. `useAdminGate()` asks `/api/admin/whoami` and hides admin UI when the answer is no; that is presentation only, and the routes verify independently. Admin calls from the browser must go through `authedFetch` so the token is attached.

### Design system

One primary button treatment (`buttonPrimary` in `src/lib/ui.ts`), and never more than one per viewport — it marks the single action we most want. Navigation, tools and settings use `buttonGhost`. If a new button is neither the main action nor navigation, it is probably `buttonSecondary`.

### Credential split

`NEXT_PUBLIC_*` variables are safe to expose to the browser. All other keys (`GEMINI_API_KEY`, `STRAVA_CLIENT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_KEY_JSON`, `FIREBASE_PRIVATE_KEY`) are server-side only and must never appear in client-side code.

Firebase Admin SDK tries credentials in this order: `FIREBASE_SERVICE_ACCOUNT_KEY_JSON` (full JSON) → `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` key pair → default application credentials.

### Key frontend files

- `src/app/page.tsx` — marketing landing page: hero, features, pricing, trial CTA (server component)
- `src/app/app/page.tsx` — entire map UI, state management, filter logic, Strava/GPX integration (~79 KB)
- `src/components/marketing/` — landing-page client islands (`StartTrialButton`, `PricingTable`)
- `src/lib/plans.ts` — plan tiers, prices and entitlements; the single source for pricing copy and paywall checks
- `src/lib/ui.ts` — button vocabulary (`buttonPrimary` / `buttonSecondary` / `buttonGhost`)
- `src/lib/adminAuth.ts` — server-side admin gate and role vocabulary (`requireRole`, `requireAdmin`, `isAdminEmail`)
- `src/lib/serverAuth.ts` — identity gate (`requireUser`, `optionalUser`); the only acceptable source of a uid
- `src/lib/rateLimitRules.ts` — every rate-limit budget in the product, in one table
- `src/lib/auditLog.ts` — append-only audit trail for privileged and irreversible actions
- `src/lib/userDataFootprint.ts` — the single list of where user data lives; export and erasure both walk it
- `src/lib/useAdminGate.ts` — client hook that asks the server whether the user is an admin
- `src/components/MapView.tsx` — Google Maps with custom markers, polylines, OverlayView popups
- `src/components/NavDock.tsx` + `src/components/dock/` — the floating dock over the map: content tabs, weather, terrain, advisories, alerts, layers, quick links
- `src/components/Modal.tsx` — the one dialog shell (role, Escape, focus trap, focus restore, scroll lock). Every modal uses it
- `src/components/RoutePlanner.tsx` — waypoint planner with save/load and GPX export
- `src/components/MapDirections.tsx` — directions drawn on our own map
- `src/components/PhotoGallery.tsx` — place photos, with loading / empty / failed kept distinct
- `src/components/RoadmapModal.tsx` — in-app release roadmap, driven by `src/lib/roadmap.ts`
- `src/components/admin/` — admin modal: activity, cost, governance, caching, efficiency
- `src/components/ChatBot.tsx` — floating chat widget with Firestore session persistence
- `src/components/ConnectDevicesModal.tsx` — Strava OAuth + GPX/Apple Health file import
- `src/components/DetailsModal.tsx` — route/mountain/campsite/activity details and live weather
- `src/components/ProfileModal.tsx` — user profile display
- `src/components/RouteFilter.tsx` — filter controls, controlled by the page (never holds its own state)
- `src/lib/firebaseAdmin.ts` — Admin SDK init (server-side only)
- `src/lib/firebaseClient.ts` — client SDK init + Google/Apple auth (`signInWithGoogle`, `signInWithApple`)
- `src/lib/gpxParser.ts` — GPX → activity objects (haversine, elevation gain, sport inference). GPX only: it reads `<trkpt>`, which TCX does not use
- `src/lib/appleHealthParser.ts` — Apple Health export.xml → activity objects (Workout elements)
- `src/lib/polylineDecoder.ts` — precision-5 polyline decode → `[lng, lat]` pairs (test file is `decodePolyline.test.ts`)
- `src/lib/activityTypes.ts` — activity interfaces, localStorage persistence (`fri_activities` key), dedup. Sources: `strava | coros | garmin | komoot | apple_health`
- `src/lib/useSavedPlaces.ts` — real-time Firestore listener hook for saved places
- `src/lib/useUserLocation.ts` — the *only* geolocation call in the app. Reports `source` so a fallback is never drawn as the user's position
- `src/lib/routeDifficulty.ts` — difficulty from distance and ascent (NPS formula), with an `unknown` band
- `src/lib/fitnessScore.ts` — month-to-date fitness score, targets pro-rated across days elapsed
- `src/lib/ledger.ts` — lifetime and year-to-date totals plus personal bests, the record that survives the month rollover `fitnessScore` resets on
- `src/lib/readinessRecommender.ts` — bands scored routes into "ready" and "stretch". The ready band sorts by demand, not score: everything easy scores 100, so sorting by score surfaces the flattest walk
- `src/lib/weatherWindow.ts` — the soonest span worth going, scoped to a route's duration. A `warning` hour is disqualifying, never discounted
- `src/lib/routeDuration.ts` — Naismith ascent estimate, shared by the details view and the weather window so the two cannot disagree
- `src/lib/mapLayers.ts` — map layer vocabulary and persistence
- `src/lib/gpxBuilder.ts` — planner → GPX (round-trips through `gpxParser`)
- `src/lib/savedPlans.ts` — device-local planned routes
- `src/lib/usePlannerRoute.ts` — snaps planner waypoints to walking paths via `/api/directions`
- `src/lib/placeUrl.ts` — `?place=` deep links, used by Share and by reload restore
- `src/lib/roadmap.ts` — roadmap content, kept beside the code it describes

### Rules this codebase holds to

**Never render a number the data does not support.** Elevation, difficulty,
weather and advisories all have an explicit unknown state and use it. There is
no sample data anywhere: an invented trail closure or a guessed elevation is
worse than a blank, because it gets acted on.

**One primary action per viewport** (`src/lib/ui.ts`). Every button routes
through that vocabulary so it inherits the focus ring.

**Failures are sayable.** No silent catch. If a fetch fails the UI says which
one and offers a retry.

**Server-side logging goes through `src/lib/logger.ts`, never `console.*`.**
`createLogger(route, request)` emits one JSON object per line — matching the
backend's structlog output, so both halves of the product are queried the same
way — and carries a `request_id` taken from Vercel's `x-vercel-id`, so a user's
report can reach the line that recorded it.

Pass the caught value to `log.error(event, err)` rather than spreading it: the
logger redacts by key (anything matching token/secret/key/password/authorization/
cookie), bounds strings, and reduces an error to name/message/stack/cause. A raw
`console.error('...', err)` serialises whatever the error carries, which for a
fetch or firebase-admin error can include an `Authorization` header. Never log an
upstream response body directly — use `upstreamSnippet()`, which caps and
redacts it. Logs outlive the credentials they might quote.

Event names are `snake_case` nouns describing what happened
(`strava_refresh_rejected`), not sentences, so they group.

### Cache versioning

`PLACES_CACHE_VERSION` in `src/app/app/page.tsx` gates both cache tiers. The
Firestore tier is shared across users, so an entry written before a field
changed meaning will otherwise feed every visitor to that region for 24 hours.
**Bump it whenever the shape or the meaning of a cached field changes.**

### Google APIs actually required

Legacy Places is enough for discovery, but these are separate enablements and
the app degrades honestly without them:

| API | Powers | Without it |
|---|---|---|
| Maps JavaScript | The map | Error page with a retry |
| Places (legacy) | Route/peak/campsite discovery | Empty lists with a retry |
| Elevation | Relief, difficulty banding | "Relief unknown", difficulty "Unrated" |
| **Routes** (not legacy Directions) | Directions, planner path snapping | Straight lines, labelled as such |

`GOOGLE_ROUTES_API_KEY` may hold a separate server-side key; it falls back to
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

### Advisories

`/api/advisories` reads `data/advisories.json` (written by `npm run
scrape:advisories`), then `ADVISORY_FEED_URL`. With neither it returns
`configured: false` and the UI says no source is connected — it never claims
trails are clear. Scraper sources live in `scripts/advisory-sources.json`
(copy the `.example`); it honours robots.txt and rate-limits itself.

### Polyline convention

Decoded polylines are stored as `[lng, lat]` pairs (GeoJSON order), not `[lat, lng]`.

### Backend architecture

The FastAPI backend (`src/backend/`) follows Clean Architecture — dependencies point inward only:

```
Infrastructure → Presentation → Application → Domain
```

| Layer | Path | Contains |
|---|---|---|
| Domain | `src/domain/` | Entities, value objects, interfaces (ports), domain services |
| Application | `src/application/` | Use cases (e.g. `match_routes_use_case.py`) |
| Presentation | `src/presentation/` | API routers, request/response models, dependency providers |
| Infrastructure | `src/infrastructure/` | Database adapters, external API clients |
| Config | `src/config/` | Pydantic settings via `settings.py` |

Do not import from outer layers into inner ones (domain has zero external imports).

## Testing

- **Unit tests:** Vitest with jsdom. Coverage thresholds: 85% statements/functions/lines, 50% branches. Reports in `coverage/`.
- **E2E tests:** Playwright (Chromium), 30 s timeout, 2 retries in CI, auto-starts dev server on port 4790.
- **Mutation tests:** Stryker (`npm run test:mutation`), config in `stryker.config.json`, targets `src/lib/gpxParser.ts`, `polylineDecoder.ts`, `activityTypes.ts`. Break/low threshold 70%, high 80%.
- **Load tests:** `npm run test:load` (Autocannon).

When writing tests for `useSavedPlaces.ts`, import the module after mocks are registered (use top-level `await import(...)` pattern). Do not add new top-level `await` imports to other test files — Stryker instruments string literals in dynamic imports and an empty-string mutant will break Vite's module resolver.

## CI/CD Pipeline

### Branch flow

```
feature/* → develop → main
```

- Direct pushes to `main` and `develop` are blocked (set in GitHub branch protection).
- Feature branches open a PR into `develop`. Once `develop` is green and ready to ship,
  open a PR from `develop` into `main` — that merge is the release.
- Both `main` and `develop` require the same status checks (`Frontend Quality`,
  `Backend Quality`, `Playwright E2E`, `Secret Scan`) and 1 approving review.

### Workflows

| File | Triggers | What it does |
|---|---|---|
| `ci.yml` | PR to `main`/`develop`, push to `main`/`develop` | Lint + type-check + unit tests + build (frontend); ruff + mypy + pytest (backend) |
| `e2e.yml` | PR to `main`/`develop` | Playwright E2E (uses real secrets from GitHub Secrets) |
| `mutation.yml` | PR to `main`/`develop` when `src/lib/` changed | Stryker mutation tests |
| `security.yml` | PRs + push to `main`/`develop` + weekly Monday | npm audit (`--audit-level=high`) + gitleaks secret scan + CodeQL |
| `agent-review.yml` | PR open/synchronize | Posts AI review comment via Claude Haiku. Needs `ANTHROPIC_API_KEY` secret. Add `[skip review]` to PR title to suppress. |
| `uptime.yml` | Every 15 min, manual dispatch | Curls `{PRODUCTION_URL}/api/health`; fails the run (no auto-notification beyond GitHub's own workflow-failure alerts) if it doesn't return 2xx. Needs `PRODUCTION_URL` repo variable. |

The AI review workflow uses `claude-haiku-4-5-20251001`, trims diffs to 10 KB, and caps output at 1 024 tokens (~$0.004/PR).

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

**`main` and `develop` branches (same rules on both):**
- Require status checks: `Frontend Quality`, `Backend Quality`, `Playwright E2E`, `Secret Scan`
- Enable merge queue (Settings → Branches → Edit → Merge queue)
- Require 1 approving review
- Dismiss stale reviews on new commits
- Restrict direct pushes

### Pre-commit hooks (Husky)

After cloning, run once from `src/frontend/`:
```bash
npm install   # installs husky, lint-staged, commitlint
```

Husky runs automatically after `npm install` via the `prepare` script.

- **pre-commit:** runs `lint-staged` (ESLint --fix + Prettier on staged `*.ts(x)` files)
- **commit-msg:** enforces Conventional Commits via `commitlint`

Commit format: `type(scope): subject` — types: `feat fix docs style refactor perf test chore revert ci build`

## Naming conventions

**TypeScript/React:** PascalCase for components and interfaces; camelCase for utilities, hooks, and variables; `ALL_CAPS` for constants; prefix private class members with `_`.

**Python:** snake_case for functions, variables, and files; PascalCase for classes; `ALL_CAPS` for constants; prefix private members with `_`.

## Environment variables

Copy `src/frontend/.env.example` to `src/frontend/.env.local`. Required keys that will break functionality if missing:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_FIREBASE_*` — **4 keys**, not 6: `API_KEY`, `AUTH_DOMAIN`,
  `PROJECT_ID`, `APP_ID`. `STORAGE_BUCKET` and `MESSAGING_SENDER_ID` were
  documented and set but never passed to `initializeApp`, because nothing uses
  Firebase Storage or FCM. Re-add them with the code that needs them.
- `FIREBASE_PROJECT_ID` + one of the Admin credential options above
- `NEXT_PUBLIC_STRAVA_CLIENT_ID` **and** `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET`.
  The client id is needed in both forms and this is easy to miss: the browser
  reads the `NEXT_PUBLIC_` one to build the authorize URL, so without it the
  Connect Strava button cannot start the flow. It was absent from `.env.example`
  entirely. The **secret** must never gain a `NEXT_PUBLIC_` prefix.

Optional (graceful degradation): `GOOGLE_WEATHER_API_KEY` and
`OPENWEATHER_API_KEY` — two *different* providers, not aliases; Google is tried
first and OpenWeather is the fallback. Also `GOOGLE_ROUTES_API_KEY`,
`OPENWEATHER_BASE_URL`, `ADVISORY_FEED_URL`, `LOG_LEVEL`, `CSP_ENFORCE_RESOURCES`,
`CSP_REPORT_URI`.

`envCoverage.test.ts` fails the build if `.env.example` and the code disagree in
either direction, and if a secret-looking name gains a `NEXT_PUBLIC_` prefix.

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
| `coros` | GPX file upload | `gpxParser.ts` |
| `garmin` | GPX file upload | `gpxParser.ts` |
| `komoot` | GPX file upload | `gpxParser.ts` |
| `apple_health` | Apple Health `export.xml` | `appleHealthParser.ts` |

Apple Health export: iPhone → Health → profile photo → Export All Health Data → extract zip → upload `export.xml` in the Connect Devices modal.
