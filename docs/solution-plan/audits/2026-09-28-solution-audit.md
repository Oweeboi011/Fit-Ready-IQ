# Solution audit — Fit-Ready-IQ (2026-09-26, delta 2026-09-28)

Two passes. A full audit on 2026-09-26 found six P0s and roughly forty P1/P2 findings across the
API, client, Firebase rules, backend, CI and docs, and set out eight remediation phases. A delta
audit on 2026-09-28 checked what phases 1–5 had actually closed, found what they introduced, and
covered what the first pass skipped: toolchain runs, cost, privacy, observability and the delivery
pipeline itself.

Severity: **P0** exploitable now, or a legal/data promise broken · **P1** real defect · **P2**
hardening or hygiene.

## The finding that mattered most

**None of it had shipped.** The fix for a critical Next.js RCE (GHSA-2xp9-vwfh-vxw4, `next`
16.0.0–16.3.2, reachable because the app uses `next/image`) sat on its own branch with no pull
request. Phases 2–4 were pushed but had no PRs either, and CI only runs on PRs into or pushes to
`main`/`develop` — so none of that code had been through lint, tests, E2E, the rules tests or the
secret scan. Production was also unmonitored: `uptime.yml` had failed on every run since it was
added, because the `PRODUCTION_URL` variable was never set.

Fixes on a branch are not fixes. The phases now land in order through PRs (#83 is phase 1).

## Findings and status

### P0

| Finding | Status |
|---|---|
| `next@16.3.0` critical RCE; `sharp` high | Fixed in phase 1 (PR #83), **not yet merged** |
| Rate limits bypassable with a random bearer token | Fixed (phase 2): keyed by verified uid, IP otherwise |
| Chat transcripts saved with `user_id: null`, so export and erasure never found them | Fixed (phase 2) for signed-in chats; signed-out chats are no longer stored at all (`c62c48b`) |
| Chat sessions could be re-owned by anyone holding the id | Fixed (phase 2): owner written once at create |
| Shared places cache writable by any account, unvalidated | Fixed (phase 3); the owner exemption that let one account hold a cell indefinitely closed in `d14863d` |
| Trail length was the distance from the viewer, and difficulty and readiness were built on it | Fixed (phase 4); remaining invented values — "technical" gear from altitude, "Beginner" for unrated, "–h" climb time, forecast "unavailable" while loading, zero directions — fixed in `f5c86dd` |

### P1 found or confirmed on 2026-09-28

| Finding | Status |
|---|---|
| A Strava sync running during account deletion wrote activities back into the erased tree; the manifest write recreated the user document | Fixed `ff72c02`: tokens revoked and deleted first, every write re-checks the connection in the same transaction |
| A token refresh finishing after a disconnect recreated the connection; concurrent refreshes could disconnect a user | Fixed `ff72c02`: refresh lease, compare-and-set write |
| Account deletion never revoked the grant at Strava | Fixed `ff72c02` |
| `DELETE /api/admin/cache` with an empty `gridKey` purged every region | Fixed `5114a2c` |
| Chat model context taken from the client, so a caller could write the assistant's turns | Fixed `c62c48b` |
| Weather and the Firebase probe returned upstream error text to callers | Fixed `5114a2c` |
| A corrupt advisories file silently became "no source connected" | Fixed `5114a2c` |
| Undo after save repeated the save; Disconnect removed nothing | Fixed `75f97dd` |
| Strava refresh overwrote GPX imports made while it ran | Fixed `75f97dd` |
| Export and deletion had no way in from the UI | Fixed `ed36d30` (Profile → Your data) |
| No privacy policy (required by Google sign-in and the Strava API agreement) | `/privacy` added `ed36d30` — **needs owner review and a contact address** |
| Signing out left activities, chat and location in the browser | Fixed `f5c86dd` |
| Places cache on the device ignored location, showing the previous area's places | Fixed `b7ced42` |
| Refused requests still cost a Firestore write each; unsalted keys and fail-open were silent | Fixed `970c988` |
| `CODEOWNERS` named a GitHub account that does not exist, so no rule ever applied | Fixed `37e7fb6` |
| Backend Docker image could not build (Poetry 1.7 vs a Poetry 2 lock) | Fixed `37e7fb6` (not built locally — no Docker here) |
| Owner-writable, unbounded `activities` / `training_*` / `itineraries` in rules | Closed to client writes `d14863d` (no client writes them) |
| Pricing says Garmin/COROS/Apple Health "sync" | Fixed `ed36d30` — they are imports |
| Nested buttons in list cards and search results | Fixed `b54e8d4` |

### Open — needs the owner

- **Merge #83**, then the phase 2–5 PRs in order. E2E is a required check and currently fails
  with `BillingNotEnabledMapError`: the Google Cloud project behind the CI Maps key has billing
  off. Every E2E run has failed since at least August.
- **Set `PRODUCTION_URL`** and **`RATE_LIMIT_SALT`** in production; add `Firestore Rules` to the
  required checks; set per-day quotas on the browser Maps key.
- **E2E uses production secrets**, including the Firebase private key. Move it to a test Firebase
  project behind a GitHub Environment.
- **Privacy page**: legal review and a contact address.
- **Pricing and paywall**: `hasEntitlement` is never called, so everything is free for everyone;
  the save limit and trial are not enforced. The copy promises less than users get, never more —
  wiring the paywall is a product decision.
- **Semgrep**: 30 blocking findings already on `main` (not a required check).

### Deferred, with reasons

- **Action SHA pinning** — Dependabot now bumps actions on `develop`; pinning is worth doing in
  one reviewed pass.
- **ruff rule expansion, import-linter, backend rate-limit key** — the backend is not deployed and
  its tests could not be run locally (no Poetry for this Python). Change it with CI watching.
- **CSP enforcement with nonces**, **offline support**, **splitting DetailsModal/MapView** — larger
  pieces of work, unchanged from the 2026-09-26 plan.
- **ChatBot aborting on close** — dropped: Gemini bills the call regardless, and the reply is more
  useful in the transcript than discarded.
- **`storage.rules` deployment** — deliberately not in `firebase.json`: Storage is not provisioned
  and a storage target breaks deploy.
- **Continuing erasure past a failed step** — the route stops before deleting the Auth account on
  purpose, so a partial failure can be retried; only its misleading message was fixed.

## Verification

On the branch at `721436c`: `tsc --noEmit` clean; ESLint 0 errors; 652 unit tests passing across
51 files; coverage above the 85% gate with the tested route handlers now measured; `next build`
succeeds with `/` and `/privacy` static. Not run locally: Playwright (needs the live keys), the
Firestore rules tests (need Java), backend pytest/ruff/mypy (need Poetry), and `docker build`.
Those run in CI once the PRs are open.
