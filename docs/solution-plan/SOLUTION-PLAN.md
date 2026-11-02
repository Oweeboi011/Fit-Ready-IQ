# Solution plan

**What the product should do, and how it gets delivered.** What the product _is_ today lives in
[`docs/guides`](../guides/architecture.md). Why it was designed this way lives in
[`docs/adr`](../adr/README.md). Item-level status is kept next to the code in
`src/frontend/src/lib/roadmap.ts`, which drives the in-app roadmap, so this page names
outcomes and order rather than restating every ticket.

Revised 2026-11-02. Every earlier revision drifted from the code within weeks, so this one is
deliberately short.

## Problem

Outdoor athletes plan across AllTrails, Komoot, Strava and a weather app, and still have to
judge for themselves whether they are fit enough and when to go. Fit-Ready-IQ answers that in
one place: **this route, this athlete, this weather window.**

| Persona       | Decides on                               | Needs that set them apart                          |
| ------------- | ---------------------------------------- | -------------------------------------------------- |
| Mountaineer   | Summit, ascent, exposure, weather window | Acclimatisation, lightning and whiteout stop rules |
| Hiker         | Distance, ascent, campsites, water       | Campsite discovery, trail surface                  |
| Trail runner  | Vert per km, technicality, finish time   | Finish-time estimate                               |
| Ultra cyclist | Climbing, gradient, wind, resupply       | Gradient analysis, headwind forecast               |

Every persona sees the same product today; persona tailoring is planned.

## What it must do

These rules hold across every feature, and a feature that cannot meet them does not ship:

1. **No number the data does not support.** Unknown is a state, not a zero. No sample data.
2. **Readiness is gated by the limiting factor**, never averaged.
3. **Failures are sayable**, with a retry.
4. **User data is exportable and erasable**, through one footprint list.
5. **Every route is metered and every privileged act audited.**

| Capability                                                      | Status  | Next                                                          |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------- |
| Discover routes, peaks, campsites near you (OpenStreetMap, #86) | Done    | Climb measured from terrain along each route (#142)           |
| Elevation, difficulty (NPS formula), unknown band               | Done    | Difficulty for routes without an ascent tag (#142)            |
| Live weather, alerts, **weather window** for a route's duration | Done    | Persona alert thresholds                                      |
| Readiness score and "routes you're ready for"                   | Done    | Persona weighting                                             |
| Strava sync (server-held tokens), GPX and Apple Health import   | Done    | Garmin / COROS direct connect                                 |
| Planner with routing (OSRM), GPX export, plans synced (#23)     | Done    | —                                                             |
| Lifetime ledger and personal bests                              | Done    | —                                                             |
| Chat assistant with tools (#26)                                 | Done    | Ground answers in the Trip once it exists                     |
| Trip, check-in and server-side safety timer (ADR-0003)          | Pending | Needs a notification channel decision first                   |
| Paywall enforcement (`plans.ts` entitlements)                   | Pending | Owner decision: `hasEntitlement()` is not called anywhere yet |
| Installable / offline for the current Trip                      | Partial | Offline scope is the Trip only, which does not exist yet      |

## Order of work

```mermaid
flowchart LR
    A["Free providers (#86) ✓<br/>measured route length"] --> B["Climb from terrain<br/>(#142)"]
    B --> C["Persona scoring<br/>+ alert thresholds"]
    B --> D["Trip + safety timer<br/>ADR-0003"]
    D --> E["Grounded, tool-using chat<br/>(grounded in the Trip)"]
    C --> E
```

- **Geometry before Trip.** A Trip references a Route. Routes now carry a measured length
  (ADR-0004's first half, via OpenStreetMap); the climb along them is the remaining half (#142).
- **The backend stays undeployed** until a use case needs a second runtime. Trip runs in route
  handlers plus a scheduled function.
- **Field-level schemas are written with the first code that produces them**, not ahead of it.
- **Billing after Trip.** Pro is sold on readiness, which can score only routes with a known
  climb until #142 lands; wiring `hasEntitlement()` before then charges for a score most routes
  cannot yet have.

Open product questions (owner): is the Guide tier near-term or withdrawn until it exists? Does
the free tier keep readiness? How close must a track pass a summit before a peak is suggested?

## How it is delivered

```mermaid
flowchart LR
    I[Issue / ADR] --> B["feature/* from develop"] --> P["PR: harness stages 1–2"] --> D[develop] --> R["Release PR → main<br/>(merge commit)"] --> V[Vercel]
```

| Change                                | Needs                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Bug fix, refactor                     | PR + required checks + 1 review                                               |
| Feature                               | The above, plus a `roadmap.ts` entry and a guide updated if behaviour changed |
| Data model, external service, process | The above, plus an ADR                                                        |
| Security-relevant                     | The above, plus [security.md](../guides/security.md) updated                  |

**Definition of done:** the harness is green ([harness.md](../guides/harness.md)), docs touched
by the change are updated in the same PR, and a new user-scoped collection is in
`userDataFootprint.ts`, `firestore.rules` and the rules tests.

## Risks

| Risk                                                       | Mitigation                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Fixes sit on unmerged branches; CI only runs on PRs        | Land work in order through PRs. Don't stack more on an unreviewed branch    |
| Production unmonitored                                     | Set `PRODUCTION_URL` and `RATE_LIMIT_SALT`; `uptime.yml` then alerts        |
| Free upstreams (Waymarked Trails, Photon, OSRM) are shared | Edge-cached per cell; `ROUTING_API_URL` / `ELEVATION_API_URL` to self-host  |
| Overpass at capacity blocks route geometry (#142)          | Degrade to "climb unknown"; self-hosted Overpass is the durable fix         |
| Docs drift                                                 | `lint:docs` gate, same-PR rule (ADR-0005), three-folder taxonomy (ADR-0007) |
| `/privacy` lacks legal review and a contact address        | Owner action before launch                                                  |

## Success measures

Measured at each release, not estimated:

| Measure                                | Target  |
| -------------------------------------- | ------- |
| Time to first map render (p75, mobile) | < 2 s   |
| Places API calls per session           | < 25    |
| Chat p95 latency                       | < 1.5 s |
| Lighthouse performance, `/`            | > 90    |
| Mutation score, `src/lib`              | ≥ 80%   |
| `npm audit` high/critical              | 0       |

## Audits

Point-in-time assessments of reality against this plan. Each lists findings with their status.

- [2026-09-28 solution audit](audits/2026-09-28-solution-audit.md): security, privacy,
  delivery.
