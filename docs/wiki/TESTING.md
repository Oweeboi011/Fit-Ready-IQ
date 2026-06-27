# Fit-Ready-IQ Testing Guide

## 1. Overview

This document describes the complete testing strategy for Fit-Ready-IQ, covering all testing layers from unit tests to production validation. The project uses a multi-layer testing approach to ensure code quality, integration reliability, and performance under load before any change reaches production.

Testing is a mandatory quality gate -- all relevant tests must pass before merging to `main` and triggering a Vercel deployment.

### Testing Philosophy

- **Test at the right level** -- Unit tests for logic, E2E for user flows, load tests for capacity.
- **Fast feedback** -- Unit tests run in < 2 seconds. Developers get immediate signal.
- **Production-like validation** -- E2E tests run against a real browser. Post-deploy checks verify live endpoints.
- **No flaky tests** -- Tests must be deterministic. External API calls are mocked in unit tests.
- **Quality of tests** -- Mutation tests verify that your test suite actually catches bugs, not just executes code.

---

## 2. Test Architecture

### 2.1 Testing Layers

```mermaid
graph TB
    subgraph Layers["Testing Pyramid"]
        direction TB
        Unit["Unit Tests<br/>(Vitest + pytest)<br/>Fast, isolated, many"]
        Mutation["Mutation Tests<br/>(Stryker)<br/>Validates test quality"]
        Integration["Integration Tests<br/>(pytest)<br/>API route + DB validation"]
        E2E["End-to-End Tests<br/>(Playwright)<br/>Full browser flows"]
        Load["Performance Tests<br/>(Autocannon + Locust)<br/>Throughput + latency"]
    end

    subgraph Gates["Quality Gates"]
        Lint["Lint (ESLint)"]
        TypeCheck["Type-check (tsc)"]
        Build["Build (Next.js)"]
        Audit["Security (npm audit)"]
    end

    Unit --> Mutation
    Mutation --> Integration
    Integration --> E2E
    E2E --> Load

    Gates --> Unit

    style Unit fill:#d1fae5
    style Mutation fill:#e0e7ff
    style Integration fill:#dbeafe
    style E2E fill:#fef3c7
    style Load fill:#fee2e2
```

### 2.2 Test Stack

| Layer | Frontend | Backend |
| --- | --- | --- |
| **Unit** | Vitest | pytest (with `@pytest.mark.unit`) |
| **Mutation** | Stryker (vitest-runner) | -- |
| **Integration** | (via E2E) | pytest (with `@pytest.mark.integration`) |
| **E2E** | Playwright (Chromium) | -- |
| **Load** | Autocannon | Locust |
| **Mocking** | Vitest mocks | pytest fixtures |
| **Coverage** | Vitest coverage (v8) | pytest-cov |

---

## 3. Frontend Unit Tests (Vitest)

### 3.1 Running Tests

```bash
cd frontend

# Run all unit tests
npm run test:unit

# Run with coverage report
npm run test:unit -- --coverage

# Run specific test file
npx vitest run src/lib/gpxParser.test.ts

# Run in watch mode (during development)
npx vitest --watch
```

### 3.2 Current Test Coverage

| Test File | Tests | What It Validates |
| --- | --- | --- |
| `src/lib/activityTypes.test.ts` | 4 | Activity type definitions, persistence helpers, type guards |
| `src/lib/decodePolyline.test.ts` | 2 | Google polyline encoding/decoding accuracy |
| `src/lib/gpxParser.test.ts` | 1 | GPX XML parsing, track point extraction, elevation data |

**Total: 7 tests passing** (target: 20+ by Phase 1, 50+ by Phase 6)

### 3.3 Coverage Thresholds

Coverage is enforced by Vitest for the three core library files (`activityTypes.ts`, `gpxParser.ts`, `polylineDecoder.ts`). The build fails in CI if any threshold is not met:

| Metric | Threshold |
| --- | --- |
| Statements | 85% |
| Functions | 85% |
| Lines | 85% |
| Branches | 50% |

Run `npm run test:unit -- --coverage` locally to see the coverage report before pushing.

### 3.4 Test File Conventions

```mermaid
flowchart LR
    Source["src/lib/gpxParser.ts"] --> Test["src/lib/gpxParser.test.ts"]
    Source2["src/lib/activityTypes.ts"] --> Test2["src/lib/activityTypes.test.ts"]
    Source3["src/lib/polylineDecoder.ts"] --> Test3["src/lib/decodePolyline.test.ts"]
```

- Test files live adjacent to source files with `.test.ts` suffix.
- Use `describe()` blocks to group related tests.
- Use `it()` or `test()` with descriptive names.
- Mock external dependencies (Google APIs, Firebase) -- never call real APIs in unit tests.

### 3.5 Writing New Unit Tests

When adding a new utility or library function:

```typescript
// src/lib/example.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from './example';

describe('myFunction', () => {
  it('should handle normal input', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('should handle edge case', () => {
    expect(myFunction('')).toBe('fallback');
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

---

## 4. Mutation Tests (Stryker)

Mutation testing validates the quality of your test suite, not just its coverage. Stryker introduces small faults (mutations) into source code -- for example, changing `>` to `>=`, removing a return value, or flipping a boolean -- and then runs the test suite. A mutation is "killed" if a test fails (good). A mutation "survives" if all tests still pass (bad -- the test suite missed a real bug).

**Why this matters:** A test that only executes code without making meaningful assertions can achieve 100% line coverage while catching zero bugs. Mutation tests close this gap.

### 4.1 Running Mutation Tests

```bash
cd frontend

# Run Stryker mutation tests
npm run test:mutation

# Or directly
npx stryker run
```

HTML report is generated at `frontend/reports/mutation/mutation.html`.

### 4.2 Configuration

Config file: `frontend/stryker.config.ts`

Target files (mutated):
- `src/lib/gpxParser.ts`
- `src/lib/polylineDecoder.ts`
- `src/lib/activityTypes.ts`

Test runner: Vitest (via `@stryker-mutator/vitest-runner`)

### 4.3 Thresholds

| Threshold | Value | Meaning |
| --- | --- | --- |
| `break` | 50% | CI fails -- mutation score is critically low |
| `low` | 60% | Warning -- score is below acceptable |
| `high` | 80% | Target -- score at this level is considered good |

The mutation score is the percentage of mutations that were killed by the test suite. A score below `break` (50%) causes the CI pipeline to fail.

### 4.4 When It Runs in CI

`mutation.yml` triggers on PRs to `main` when any file under `frontend/src/lib/**` has changed. It does not run on every push to keep CI fast -- it is a targeted gate for the library code that is most critical to test quality.

---

## 5. Backend Unit Tests (pytest)

### 5.1 Running Tests

```bash
cd backend

# Run unit tests only
poetry run pytest -m unit -v --tb=short

# Run all tests
poetry run pytest tests/ -v --tb=short

# Run with coverage
poetry run pytest tests/ --cov=src --cov-report=term-missing
```

### 5.2 Current Test Coverage

| Test File | Tests | What It Validates |
| --- | --- | --- |
| `tests/unit/test_settings.py` | 1 | Settings loading, env var parsing, defaults |
| `tests/unit/test_connection.py` | 1 | Database connection string construction |

### 5.3 Test Configuration

The backend test suite uses `tests/conftest.py` which sets environment variables **before** importing application modules to prevent real database connections during test collection:

```python
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-testing-only")
os.environ.setdefault("ENVIRONMENT", "test")
```

**Critical:** These must be set before `from src.main import app` to prevent the app from attempting a real DB connection at import time.

---

## 6. Integration Tests (Backend)

### 6.1 Running Tests

```bash
cd backend

# Integration tests only
poetry run pytest -m integration -v --tb=short
```

### 6.2 Current Coverage

| Test File | What It Validates |
| --- | --- |
| `tests/integration/test_app_endpoints.py` | API health endpoint, CORS headers |
| `tests/test_main.py` | FastAPI app startup, root route response |

### 6.3 Integration Test Pattern

```mermaid
sequenceDiagram
    participant Test as Test Function
    participant Client as TestClient
    participant App as FastAPI App
    participant Mock as Mocked Dependencies

    Test->>Client: GET /health
    Client->>App: HTTP request
    App->>Mock: (DB/API calls mocked)
    Mock-->>App: Mocked response
    App-->>Client: HTTP response
    Client-->>Test: Assert status + body
```

Integration tests use `httpx.AsyncClient` or `TestClient` with a `scope="module"` fixture (required for compatibility with httpx 0.27.x).

---

## 7. End-to-End Tests (Playwright)

### 7.1 Setup

```bash
cd frontend

# Install Playwright browsers (first time only)
npx playwright install chromium
```

### 7.2 Running Tests

```bash
cd frontend

# Run E2E tests
npm run test:e2e

# Run with UI (headed mode for debugging)
npx playwright test --headed

# Run specific test
npx playwright test e2e/home.spec.ts
```

### 7.3 Current E2E Coverage

| Spec File | What It Validates |
| --- | --- |
| `e2e/home.spec.ts` | Homepage loads, map container renders, key UI elements visible |

### 7.4 E2E Test Flow

```mermaid
flowchart TD
    A["Playwright launches Chromium"] --> B["Navigate to localhost:4790"]
    B --> C["Wait for page hydration"]
    C --> D["Assert map container visible"]
    D --> E["Assert key UI elements present"]
    E --> F{"All assertions pass?"}
    F -->|Yes| G["Test PASS"]
    F -->|No| H["Test FAIL + screenshot captured"]
```

### 7.5 Writing New E2E Tests

```typescript
// e2e/feature.spec.ts
import { test, expect } from '@playwright/test';

test('user can open route details', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid="map-container"]');
  await page.click('[data-testid="marker-mountain"]');
  await expect(page.locator('[data-testid="details-modal"]')).toBeVisible();
});
```

---

## 8. Performance and Load Tests

### 8.1 Frontend Load Test (Autocannon)

```bash
cd frontend

# Run with defaults
npm run test:load

# Custom configuration
LOAD_TEST_URL=http://localhost:4790 \
LOAD_TEST_CONNECTIONS=10 \
LOAD_TEST_DURATION=30 \
npm run test:load
```

| Variable | Default | Description |
| --- | --- | --- |
| `LOAD_TEST_URL` | `http://localhost:4790` | Target URL |
| `LOAD_TEST_CONNECTIONS` | `10` | Concurrent connections |
| `LOAD_TEST_DURATION` | `30` | Test duration in seconds |

**Script:** `frontend/tests/performance/load-test.js`

### 8.2 Backend Load Test (Locust)

```bash
cd backend

# Headless mode (CI-friendly)
poetry run locust -f tests/performance/locustfile.py \
  --host http://localhost:8000 \
  --users 25 \
  --spawn-rate 5 \
  --run-time 1m \
  --headless

# Web UI mode (interactive)
poetry run locust -f tests/performance/locustfile.py \
  --host http://localhost:8000
# Open http://localhost:8089
```

**Script:** `backend/tests/performance/locustfile.py`

### 8.3 Performance Baselines

| Metric | Current | Phase 1 Target | Phase 6 Target |
| --- | --- | --- | --- |
| Homepage load (p95) | ~3s | < 2s | < 1.5s |
| Chat response (p95) | ~2s | < 1.5s | < 1s |
| API health endpoint (p95) | < 100ms | < 50ms | < 50ms |
| Concurrent users supported | ~25 | ~50 | ~100 |

---

## 9. CI Pipeline Integration

Each workflow in GitHub Actions runs a specific subset of the test suite:

| Workflow | Tests Run | Trigger |
| --- | --- | --- |
| `ci.yml` | Lint + type-check + unit tests (Vitest) + build | PR to `develop`/`main`, push to `develop` |
| `e2e.yml` | Playwright E2E | PR to `main` |
| `mutation.yml` | Stryker mutation tests | PR to `main` when `frontend/src/lib/**` changed |
| `security.yml` | `npm audit` + gitleaks secret scan + CodeQL | PRs, push to `main`, weekly Monday |

```mermaid
flowchart TD
    A[PR to develop] --> B[ci.yml: lint + type-check + unit + build]
    B -->|passes| C[Merge to develop]
    C --> D[auto-pr.yml: creates PR to main]
    D --> E[ci.yml runs again on main PR]
    D --> F[e2e.yml: Playwright]
    D --> G[mutation.yml: Stryker]
    D --> H[security.yml: audit + gitleaks + CodeQL]
    E & F & G & H -->|all pass| I[Merge to main]
    I --> J[Vercel deploy]
```

---

## 10. Pre-Push Validation Sequence

### 10.1 Recommended Order

Run these commands in order before pushing any changes:

```mermaid
flowchart TD
    A["1. npm run lint"] --> B["2. npm run type-check"]
    B --> C["3. npm run build"]
    C --> D["4. npm run test:unit"]
    D --> E["5. npm run test:e2e"]
    E --> F["6. npm audit --audit-level=high"]
    F --> G{"All pass?"}
    G -->|Yes| H["Push to GitHub"]
    G -->|No| I["Fix and re-run"]
    I --> A
```

### 10.2 Full Command Reference

```bash
# Frontend validation (required)
cd frontend
npm run lint              # ESLint -- zero errors
npm run type-check        # TypeScript -- zero errors
npm run build             # Next.js -- zero errors
npm run test:unit         # Vitest -- all tests pass
npm run test:e2e          # Playwright -- all specs pass
npm audit --audit-level=high  # No high/critical vulnerabilities

# Backend validation (if backend/ files changed)
cd ../backend
poetry run ruff check .   # Linting -- zero errors
poetry run ruff format --check .  # Formatting -- zero violations
poetry run pytest tests/ -v --tb=short  # All tests pass
```

### 10.3 Quick Validation (Minimum)

For documentation-only or config-only changes:

```bash
cd frontend
npm run lint && npm run build
```

---

## 11. Post-Deployment Validation

After every production deployment to Vercel, manually verify these critical paths:

```mermaid
flowchart TD
    A["Deployment complete"] --> B["1. Homepage map loads"]
    B --> C["2. Markers appear on map"]
    C --> D["3. Detail modal opens on click"]
    D --> E["4. Chat returns AI response"]
    E --> F["5. GET /api/health returns status: healthy"]
    F --> G["6. Strava OAuth flow completes"]
    G --> H{"All pass?"}
    H -->|Yes| I["Deployment validated"]
    H -->|No| J["Rollback via Vercel dashboard"]
```

| Check | Endpoint/Action | Expected Result |
| --- | --- | --- |
| Map renders | Open homepage | Google Maps tiles + markers visible |
| Chat works | Send message | AI response returned |
| Health check | GET `/api/health` | `{ "status": "healthy" }` with all services green |
| Firebase connected | GET `/api/integrations/firebase` | `{ "connected": true, "firestoreWrite": true }` |
| Strava OAuth | Click "Connect Strava" | Redirect to Strava + callback success |
| Weather | GET `/api/weather?lat=14.5&lng=121.0` | Forecast JSON returned |

---

## 12. Test Environment Variables

### 12.1 Frontend Test Environment

Unit tests (Vitest) run without external dependencies. Mocks are used for Google Maps and Firebase.

E2E tests (Playwright) require a running dev server with these variables in `.env.local`:

| Variable | Required for E2E | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Yes | Real key needed for map rendering |
| `GEMINI_API_KEY` | Optional | Chat tests need this; skip chat tests if missing |
| `FIREBASE_PROJECT_ID` | Optional | Can use emulator if Docker running |

### 12.2 Backend Test Environment

Backend tests set their own environment via `conftest.py`:

| Variable | Test Value | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://test:test@localhost/test` | Prevents real DB connection |
| `JWT_SECRET_KEY` | `test-secret-key-for-testing-only` | Test token signing |
| `ENVIRONMENT` | `test` | Activates test-safe code paths |

---

## 13. Adding Tests for New Features

### 13.1 Decision Matrix

```mermaid
flowchart TD
    A["New code written"] --> B{What type?}
    B -->|Utility function| C["Unit test (Vitest)"]
    B -->|API route| D["Integration test (pytest) +<br/>E2E validation"]
    B -->|UI component| E["E2E test (Playwright)"]
    B -->|Data transformation| C
    B -->|External API integration| F["Unit test with mock +<br/>E2E smoke test"]
```

### 13.2 Test Naming Conventions

| Layer | Pattern | Example |
| --- | --- | --- |
| Unit (frontend) | `<module>.test.ts` | `gpxParser.test.ts` |
| Unit (backend) | `test_<module>.py` | `test_settings.py` |
| Integration | `test_<feature>_endpoints.py` | `test_app_endpoints.py` |
| E2E | `<feature>.spec.ts` | `home.spec.ts` |
| Load | `load-test.js` / `locustfile.py` | -- |

### 13.3 Coverage Goals

| Phase | Unit Tests | E2E Specs | Coverage Target |
| --- | --- | --- | --- |
| Current | 7 | 1 | Baseline (85% statements on lib/) |
| Phase 1 | 20+ | 3+ | > 60% statements (project-wide) |
| Phase 4 | 35+ | 5+ | > 75% statements |
| Phase 6 | 50+ | 8+ | > 85% statements |
