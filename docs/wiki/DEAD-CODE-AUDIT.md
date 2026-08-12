# Fit-Ready-IQ Dead Code and Scaffolding Audit

## 1. Overview

This document is a point-in-time inventory of code that is exported but unused, and infrastructure that is built but not wired into a live path — plus a cross-reference to which open GitHub issues already have scaffolding toward them versus which are pure backlog. It is a **documentation-only audit**: nothing listed here was deleted or changed as part of producing this document. Where something looks unused, the recommendation says so explicitly rather than assuming removal is correct; per ADR-0005, "not currently used" and "safe to delete" are different questions, and this document only answers the first one.

Regenerate this by re-running the same checks (grep for each export across the tree, walk `main.py`'s router registration, grep for `TODO`/`FIXME`/`placeholder`) rather than trusting it as permanently current — it will drift the same way the rest of the docs did, which is exactly the failure mode ADR-0005 exists to catch earlier next time.

---

## 2. Frontend: Unused `src/lib/` Exports

Exports with zero references anywhere else in the tree, including their own `.test.ts` file. None of these are recommended for immediate removal — several are types that document a module's public contract even before something else consumes them. Treat this as a worklist for a future cleanup pass, not an action item.

| File | Export | Recommendation |
| --- | --- | --- |
| `lib/adminAuth.ts` | `AdminIdentity` (type) | Keep — documents the shape `requireAdmin` resolves to |
| `lib/advisories.ts` | `ADVISORY_KINDS`, `ADVISORY_MAX_AGE_DAYS`, `isAdvisory` | Keep — small module, low cost to leave |
| `lib/appleHealthParser.ts` | `AppleHealthWorkout` (type) | Keep — parser's public contract |
| `lib/detailsData.ts` | `MountainDetails`, `CampsiteDetails`, `ActivityDetails` (types) | Keep — only `RouteDetails`/`DetailsData` are consumed today, but these are the discriminated union's other members, not orphans |
| `lib/firebaseClient.ts` | `getIdToken` | Investigate — `authedFetch` is the consumer surface in practice; confirm `getIdToken` isn't meant to be called directly anywhere before removing |
| `lib/gpxBuilder.ts` | `BuildGpxOptions` (type) | Keep — consumers currently destructure inline rather than importing the type, but the type is the documented contract |
| `lib/gpxParser.ts` | `ParsedGpxActivity` (type) | Keep |
| `lib/mapLayers.ts` | `HIDDEN_LAYERS_KEY` | Keep — `readHiddenLayers`/`writeHiddenLayers` are the intended public surface; the key constant is incidental |
| `lib/placesGeometry.ts` | `SEARCH_RADIUS_KM` | Keep — used internally by `withinSearchRadius`, exported for testability |
| `lib/plans.ts` | `Entitlement` (type), `SELECTED_PLAN_KEY` | Keep |
| `lib/readiness.ts` | `TRAINING_WINDOW_WEEKS`, `ReadinessLevel`, `LimiterId`, `ReadinessFactor`, `RouteDemand` | Keep — these are `computeReadiness()`'s public API, documented in `docs/wiki/AI.md` Section 3 |
| `lib/roadmap.ts` | `RoadmapItem`, `RoadmapPhase` (types) | Keep — `ROADMAP`, `RoadmapNote`, `CONSIDERATIONS`, `CHALLENGES`, `RECOMMENDATIONS` are consumed by `RoadmapModal.tsx`; these two types are the shape they're built from |
| `lib/routeDifficulty.ts` | `DIFFICULTY_COLORS`, `isDifficulty` | Keep |
| `lib/stravaAuth.ts` | `StravaToken` (type) | Keep |
| `lib/trainingPlan.ts` | `PlanStatus`, `WeeklyTarget`, `TrainingPlan` (types) | Keep |
| `lib/useAdminGate.ts` | `AdminGateState` (type) | Keep |
| `lib/usePlannerRoute.ts` | `RouteMode` (type), `straightLineKm` | Investigate `straightLineKm` — appears called only within its own file per current grep; confirm before treating as dead |
| `lib/useSavedPlaces.ts` | `SavedPlaceType` (type) | Keep |
| `lib/useUserLocation.ts` | `UseUserLocationResult` (type) | Keep |
| `lib/weatherAlerts.ts` | `WeatherAlertKind`, `WeatherAlertSeverity` (types), `DEFAULT_ALERT_WINDOW_HOURS` | Keep |

### 2.1 Test-Only-Consumed Exports

These are used, but only from their own `.test.ts` — not dead, but narrower in practice than their export visibility suggests. No action recommended; flagged for awareness only.

`activityTypes.ts:SOURCE_COLORS`, `adminAuth.ts:isAdminEmail`, `plans.ts:{readSelectedPlan, getPlan, hasEntitlement}`, `radarLayer.ts:RadarFrame`, `readiness.ts:TRAINING_WINDOW_WEEKS`, `routeDifficulty.ts:difficultyRating`, `savedPlans.ts:{SAVED_PLANS_KEY, MAX_PLANS}`, `trainingPlan.ts:{WEEKLY_PROGRESSION, MAX_PLAN_WEEKS, weeksToClose}`, `useUserLocation.ts:{FALLBACK_LOCATION, LAST_LOCATION_KEY}`, `weatherAlertCache.ts:getWeatherAlertsNear`, `weatherAlerts.ts:classifyHour`.

### 2.2 Components

No dead components. Every `.tsx` under `src/frontend/src/components/` (including `sidebar/`, `dock/`, `map/`, `marketing/`, `admin/`) is imported by at least one other file.

---

## 3. Frontend: Legacy Lint-Gate Exemptions

`src/frontend/eslint.config.mjs`'s `LEGACY_OVERSIZED` and `LEGACY_COMPLEX` arrays list files exempted from the size/complexity gates ADR-0002 introduced. Per CODE-QUALITY.md Section 5.2, "the lists only ever get shorter" — this is the current state, verified to exactly match `docs/wiki/CODE-QUALITY.md` Section 5.1's baseline table (same files, same measurements, only cosmetic ordering differs):

**`LEGACY_OVERSIZED`:** `src/app/app/page.tsx` (818 lines, `Home` 626 — down from 2,229/1,911, see PR #56), `src/app/admin/settings/page.tsx` (661), `src/components/DetailsModal.tsx` (2,742), `src/components/MapView.tsx` (834), `src/components/ConnectDevicesModal.tsx` (524), `src/components/ProfileModal.tsx` (472), `src/components/ChatBot.tsx` (one 187-line function), `src/components/RouteFilter.tsx` (one 217-line function), `src/app/page.tsx` (`LandingPage`, 190 lines — the cheapest remaining entry to clear).

**`LEGACY_COMPLEX`:** `src/app/api/chat/route.ts` (`POST`: 17), `src/app/api/strava/sync/route.ts` (`POST`: 40), `src/app/api/weather/route.ts` (`buildSummary` 16, `fetchGoogleWeather` 23, `fetchOpenWeather` 19), `src/lib/appleHealthParser.ts` (`parseAppleHealthXml`: 24).

`app/app/page.tsx` is the one entry from this session's work that shrank substantially (3,239 -> 818) but not enough to clear the ceiling outright — it stays listed, honestly, rather than either being removed prematurely or left with a stale pre-refactor line count in its comment.

---

## 4. Backend: Wired vs. Orphaned Inventory

`src/backend/` (FastAPI, Clean Architecture) is not deployed and not called by the frontend in production. `main.py` registers exactly one router (`routes.router`, prefixed `/api/routes`), with a commented-out block for `auth`/`fitness`/`itinerary` routers that don't exist yet. The only end-to-end wired path is `GET /api/routes/best-fit` -> `MatchRoutesUseCase` -> `FitnessScoreCalculator`/`RouteDifficultyCalculator`/`RouteMatchingService` -> three Firestore repositories.

| File | Contents | Status |
| --- | --- | --- |
| `main.py` | FastAPI app, lifespan (Firebase init), CORS, `/health`, `/`, mounts `routes.router` | Wired (entry point) |
| `config/settings.py` | Pydantic `Settings` | Wired |
| `presentation/routes/routes.py` | `GET /best-fit` handler | Wired — the only live route |
| `presentation/dependencies.py` | Composition root | Wired |
| `application/use_cases/match_routes_use_case.py` | `MatchRoutesUseCase` | Wired |
| `domain/entities/__init__.py` | `User`, `Activity`, `Route`, `TrainingProgram`, `TrainingSession`, `Itinerary` | Partially wired — only `User`/`Activity`/`Route` are touched by the live path. `TrainingProgram`, `TrainingSession`, `Itinerary` have no repository, use case, or route referencing them. `Itinerary` specifically is the entity ADR-0003 renames to Trip when it goes live — see `docs/wiki/DATA.md` Section 2.2. |
| `domain/value_objects/__init__.py` | `ActivityType`, `DifficultyLevel`, `ReadinessStatus`, `Coordinates`, `FitnessScore`, `RouteDifficulty`, `RouteMatch`, `HeartRateZones` | Mostly wired via the match pipeline; `HeartRateZones` unreferenced outside this file |
| `domain/services/__init__.py` | `FitnessScoreCalculator`, `RouteDifficultyCalculator`, `RouteMatchingService` | Wired |
| `domain/interfaces/__init__.py` | `IRepository`, `IUserRepository`, `IActivityRepository`, `IRouteRepository`, `ITrainingProgramRepository`, `IItineraryRepository`, `IFitnessPlatformClient`, `IRoutingClient`, `IWeatherClient`, `IMapClient`, `ICacheService`, `IAuthService`, `IFileParser` | Only `IUserRepository`/`IActivityRepository`/`IRouteRepository` have concrete implementations. The rest are pure interface scaffolding with no implementation. |
| `infrastructure/database/*` (connection, mappers, models, three Firestore repositories) | Firestore access layer | Wired |
| `infrastructure/api_clients/strava/client.py` | `StravaAPIClient(IFitnessPlatformClient)` | Orphaned — exported but never constructed or injected. Distinct from the frontend's own, separate Strava integration under `src/frontend/src/app/api/strava/*`. |
| `infrastructure/api_clients/garmin/client.py` | `GarminFitParser(IFileParser)` | Orphaned |
| `infrastructure/api_clients/coros/client.py` | `CorosFitParser(IFileParser)` | Orphaned |
| `infrastructure/api_clients/google_maps/client.py` | `GoogleMapsClient` | Orphaned — never constructed or injected anywhere |
| `infrastructure/api_clients/komoot/client.py` | `KomootClient(IRoutingClient)` | Orphaned, and explicitly documented as such in its own module docstring: returns placeholder data pending Komoot partnership approval. This is deliberate deferral, not neglect — see Section 15.2 of `docs/solution-plan/SOLUTION-PLAN.md`. |

**Recommendation:** leave the orphaned scaffolding in place. Per ADR-0005's reuse-over-rebuild stance, this is exactly the kind of intentional-deferred infrastructure that should stay documented rather than deleted reflexively — standing up Strava/Garmin/Coros/Google-Maps/Komoot integrations on the backend is real, non-trivial work already done once; deleting it would mean redoing it from scratch if a future phase needs a second runtime for fitness-platform integrations after all.

---

## 5. TODO / FIXME / Placeholder Markers

Excluding UI `placeholder="..."` JSX attributes and test-mock `vi.stubGlobal` calls, which are not stub code:

- `src/backend/src/infrastructure/api_clients/komoot/client.py` (lines 5, 23-24, 70, 103) — documented placeholder pending partnership access (Section 4).
- `src/backend/src/main.py` (lines 96-100) — commented-out router mounts for `auth`, `fitness`, `itinerary`, none of which exist yet.
- `src/backend/tests/conftest.py` — stubs required Settings fields so the app can import during test collection; a legitimate test fixture, not application dead code.
- `src/frontend/src/app/api/advisories/route.ts` — a comment explaining the route deliberately never falls back to fabricated data; design rationale, not a stub.
- `src/frontend/src/lib/plans.ts` — a comment noting prices are placeholders pending a real pricing decision, not code needing implementation.
- No hits for `FIXME`, `XXX`, or `not wired up` anywhere in the repo.

**Net finding:** the only genuine "interface exists, implementation deferred" case is the Komoot client, already covered in Section 4. Everything else is test-double naming, UI copy, or historical/rationale comments — not dead code.

---

## 6. GitHub Issues Cross-Reference

What is already scaffolded toward the open backlog, so roadmap status (Section 5 of `docs/solution-plan/SOLUTION-PLAN.md`) reflects actual code state rather than the plan's own prior claims:

| Issue | Scaffolding Found |
| --- | --- |
| #20 GPX route builder | Largely built: `RoutePlanner.tsx` (waypoint UI, save/load/export), `gpxBuilder.ts`, `gpxParser.ts`, `usePlannerRoute.ts` (routes waypoints via `/api/directions`), `MapArea.tsx` wiring. Tests exist for the parser/builder pair. |
| #24 GPX export format | Implemented — `gpxBuilder.ts:buildGpx` produces the GPX XML; `RoutePlanner.tsx` triggers a client-side blob download. |
| #23 Data model for user-created routes | Implemented at the local-only level: `savedPlans.ts` (`SavedPlan` type, localStorage-backed, `MAX_PLANS` cap). No server-side/Firestore persistence exists yet — that gap is what the issue is actually asking to design, and ADR-0004's geometry model is the natural target shape once built. |
| #22 Route-snapping computation location | Already resolved server-side: `/api/directions` computes directions via Google's Routes API server-side, specifically to keep the key off the client (per its own doc comment). |
| #21 Route-snapping API choice | Already decided in code: Google Routes API, chosen over the deprecated legacy `DirectionsService`. The backend's `KomootClient` (`IRoutingClient`) remains an unused alternative, not the chosen path. |
| #25 Route-drawing UI/UX | `RoutePlanner.tsx` (add-on-tap, waypoint list, distance/ascent display), map click-to-add plumbing, `usePlannerRoute.ts` (live preview with straight-line fallback). |
| #31 Confirmation UX for save-route in ChatBot | Not scaffolded. No save/route/confirm logic exists in `ChatBot.tsx` or `/api/chat`. Pure backlog. |
| #26-#30 (agentic chat tool-use: data-access boundaries, "analyze route" semantics, tool execution location, function-calling support, route-drawing-via-chat UX) | Not scaffolded. `/api/chat` is a plain prompt-completion endpoint with no tool schema or tool loop — see `docs/wiki/AI.md` Section 2.2. |
| #34 Clean up set-state-in-effect sites | Directly documented in `eslint.config.mjs` — the `react-hooks/set-state-in-effect` rule is demoted to warn with a comment naming the nine affected sites, explicitly "tracked separately." This issue is that tracking. |

Issues #20/#21/#22/#24/#25 are substantially further along than `SOLUTION-PLAN.md`'s Phase 2 task table previously reflected — see that document's Section 5.4 for the corrected status.
