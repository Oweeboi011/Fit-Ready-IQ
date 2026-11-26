# Testing strategy

How the product is tested, what each layer is for, and where it is thin. The gates themselves
(lint, types, layering, duplication, dead code, docs) are in [harness.md](HARNESS.md); this page is
about tests. Commands are in [development.md](DEVELOPMENT.md).

## Principle

**Test where a defect would hurt a person, and make the cheapest layer that can catch it do so.**
This product tells someone whether a route is safe to attempt. A wrong number, a missed warning or
a leaked account matters more than a misaligned button, so the strictest layers sit on the logic
that decides those things: scoring, weather windows, difficulty, identity, rate limiting and
erasure.

## The layers

| Layer                 | Tool                     | Where                                              | Proves                                                          | Runs                       |
| --------------------- | ------------------------ | -------------------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| Unit                  | Vitest                   | `src/lib/*.test.ts`                                | Pure rules: parsers, scoring, difficulty, windows, ledger       | Every PR, every commit     |
| Component             | Vitest + Testing Library | `src/components/*.test.tsx`                        | A control behaves and is reachable by keyboard and role         | Every PR                   |
| API integration       | Vitest                   | `tests/integration/api/`                           | A route handler: auth, validation, rate limit, upstream failure | Every PR                   |
| Security rules        | Vitest + Firestore emu   | `tests/integration/firestore-rules/`               | A client can touch only what the rules allow                    | `Firestore Rules` CI job   |
| End to end            | Playwright               | `tests/e2e/`                                       | The product works in a real browser, on a discovery fixture     | Every PR (not forks)       |
| Mutation              | Stryker                  | `stryker.config.json`                              | The unit tests would fail if the rule were wrong                | PRs that change `src/lib/` |
| Load                  | Autocannon               | `tests/performance/`                               | Hot routes hold up and stay cached                              | Manual                     |
| Backend unit and more | pytest                   | `src/backend/tests/{unit,integration,performance}` | The undeployed FastAPI service                                  | Every PR                   |

## What each layer owns

- **Unit tests own the rules.** Anything with a number, a threshold or a "never" lives in a pure
  module so it can be tested without a browser or a network. An unknown value is tested as
  unknown, never as zero.
- **Component tests own interaction and accessibility**, not appearance. Query by role and name.
- **API integration tests own the contract of a route**: who may call it, what it refuses, what
  it says when an upstream fails. Upstreams are mocked; none of these tests touches the network.
- **E2E tests own the journeys** that no lower layer can see: the page loads, the map mounts, a
  modal traps focus. They are few on purpose, because they are the slowest and flakiest layer.
- **Mutation tests own the question "do the tests mean anything?"** Coverage says a line ran;
  a surviving mutant says nothing would notice it was wrong.

## Gates

- Coverage thresholds: 85% statements, functions and lines; 50% branches. Coverage is an
  **explicit allowlist** in `vitest.config.ts`, so a new module is measured only once someone
  adds it. Add a module in the same PR as its tests.
- Modules that decide what a person is told is safe are in the gate:
  `weatherWindow`, `routeDuration`, `readinessRecommender`, `ledger`, `mountainMetrics`,
  `elevationProfile`, as well as the identity gate, rate limiter and audit log.
- Mutation break threshold is 70%, high 80%.
- A new route needs a rate-limit rule (`rateLimitCoverage.test.ts` enforces it) and an
  integration test. A new user-scoped collection needs its footprint entry, its rule and a rules
  test.

## Rules for writing tests

1. Test behaviour through the public surface, not implementation. See the
   [tdd skill](../../.claude/skills/tdd/SKILL.md) for the red-green-refactor loop.
2. No sample data in the product, and none that reads like real data in a fixture: a fixture
   names its place `Fixture Peak`.
3. A bug fix lands with the test that would have caught it.
4. Do not add top-level `await import()` to test files other than `useSavedPlaces`: Stryker
   instruments the string and an empty-string mutant breaks module resolution.
5. A test that needs the network is a bug in the test.

## Known gaps

Tracked as GitHub issues labelled `testing`:

- Integration tests are missing for `account/export`, `admin/users`, `admin/whoami`,
  `admin/strava-sync`, `strava/exchange`, `strava/activities`, `strava/connection` and
  `integrations/firebase`.
- Mutation covers nine modules; `weatherWindow`, `routeDifficulty`, `readiness` and `routeClimb`
  decide safety output and are not mutated yet.
- No automated accessibility check: axe is not in the E2E suite.
- E2E has no journey for trips, GPX import or chat, and runs on one desktop viewport.
- No contract tests pin the shape of upstream answers (Waymarked Trails, OSRM, OpenTopoData,
  Komoot), so a silent upstream change is found by a user.
- Load tests are manual and there is no Lighthouse budget for `/`.
