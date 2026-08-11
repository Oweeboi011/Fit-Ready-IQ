# Fit-Ready-IQ Code Quality Guide

## 1. What this document is for

Fit-Ready-IQ has a lot of design rules — layering, the credential split, naming, the
polyline convention, coverage floors — spread across `CLAUDE.md`,
[`ARCHITECTURE.md`](ARCHITECTURE.md), [`SECURITY.md`](SECURITY.md) and
[`CONTRIBUTING.md`](CONTRIBUTING.md). A rule that lives only in prose is a rule that
gets broken on a Friday afternoon and rediscovered in review three weeks later.

This document sorts those rules into three enforcement classes and says, for each one,
which tool holds the line.

| Class        | Meaning                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| **Gated**    | A tool fails the build. No human judgment involved, no arguing with it.     |
| **Reviewed** | A checklist item a human confirms in PR review. Not mechanically decidable. |
| **Advisory** | Reported, tracked, and visible — but does not block a merge.                |

The bias is toward **Gated**. Anything a machine can decide should not be spending a
reviewer's attention, because reviewer attention is the scarce resource and it should
be pointed at design, not at counting lines.

See [ADR 0002](../adr/0002-mechanical-code-quality-gates.md) for why the split is drawn
where it is.

---

## 2. The decision table

| Decision type                                                      | Gate-able?              | Enforced by                                                                              | Class            |
| ------------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------- | ---------------- |
| Layering / dependency direction (`lib` ⊥ `components` ⊥ `app`)     | **Yes — deterministic** | `dependency-cruiser` (`lib-is-innermost`, `components-do-not-import-pages`)              | Gated            |
| No circular dependencies                                           | **Yes**                 | `dependency-cruiser` (`no-circular`)                                                     | Gated            |
| Forbidden imports (Admin SDK outside route handlers)               | **Yes**                 | `dependency-cruiser` (`server-only-modules`, `no-firebase-admin-package-outside-server`) | Gated            |
| Server secrets never read from client-reachable modules            | **Yes**                 | ESLint `no-restricted-syntax` (`process.env` selector)                                   | Gated            |
| What a module may expose or reach into                             | **Yes**                 | `dependency-cruiser` (`no-orphans`, `no-dev-dep-in-src`, `not-to-unresolvable`)          | Gated            |
| Cyclomatic complexity / file size / function length ceilings       | **Yes**                 | ESLint (`complexity`, `max-lines`, `max-lines-per-function`, `max-depth`, `max-params`)  | Gated            |
| Code duplication threshold                                         | **Yes**                 | `jscpd` (3% of tokens)                                                                   | Gated            |
| Test coverage floor                                                | **Yes**                 | Vitest / v8 thresholds in `vitest.config.ts`                                             | Gated            |
| Test effectiveness — do the tests assert the rule?                 | **Yes — mutation**      | Stryker (`stryker.config.json`), break threshold 70%                                     | Gated            |
| Dangerous / insecure patterns                                      | **Yes**                 | `npm audit --audit-level=high`, `pip-audit`, gitleaks, CodeQL                            | Gated            |
| Pattern-level insecure code (`eval`, `dangerouslySetInnerHTML`, …) | **Yes**                 | Semgrep (`p/typescript`, `p/react`, `p/secrets`, `p/owasp-top-ten`)                      | Advisory¹        |
| Naming conventions                                                 | **Partly**              | ESLint `@typescript-eslint/naming-convention` where expressible; else review             | Gated + Reviewed |
| Commit message shape                                               | **Yes**                 | commitlint (`config-conventional`) via the Husky `commit-msg` hook                       | Gated            |
| Formatting                                                         | **Yes**                 | Prettier via `lint-staged` on the `pre-commit` hook                                      | Gated            |
| "Right abstraction" / cohesion / pattern choice                    | **No — judgment**       | PR review checklist (§6)                                                                 | Reviewed         |

¹ Semgrep runs with `continue-on-error: true` until its first-run findings are triaged.
See §5.3.

---

## 3. Running the gates

Everything runs from `src/frontend/`.

```bash
npm run quality      # lint + type-check + lint:deps + lint:dup — the whole gate set
```

Individually:

| Command                 | Gate                                              | Config                    |
| ----------------------- | ------------------------------------------------- | ------------------------- |
| `npm run lint`          | ESLint: ceilings, naming, credential split, React | `eslint.config.mjs`       |
| `npm run type-check`    | `tsc --noEmit`                                    | `tsconfig.json`           |
| `npm run lint:deps`     | dependency-cruiser: layering, cycles, boundaries  | `.dependency-cruiser.cjs` |
| `npm run lint:dup`      | jscpd: duplication                                | `.jscpd.json`             |
| `npm run test:unit`     | Vitest + coverage floor                           | `vitest.config.ts`        |
| `npm run test:mutation` | Stryker                                           | `stryker.config.json`     |
| `npm run graph:deps`    | Mermaid dependency graph (diagnostic, not a gate) | `.dependency-cruiser.cjs` |

---

## 4. The architectural rules in detail

### 4.1 Layering

The frontend has four layers. Dependencies point inward only:

```
src/app/api/**     route handlers  — server only; may use the Admin SDK
src/app/**         pages, layouts  — client; may use components and lib
src/components/**  UI              — may use lib
src/lib/**         domain, adapters, hooks — may use nothing above it
```

`dependency-cruiser` enforces the two edges that actually matter:

- `lib-is-innermost` — `src/lib/` may not import from `src/app/` or `src/components/`.
  The moment a parser imports a React component it stops being testable in isolation,
  and `gpxParser.ts`, `polylineDecoder.ts` and `activityTypes.ts` are exactly the
  modules the mutation suite depends on being cheap to run.
- `components-do-not-import-pages` — importing a page or route handler from a component
  inverts the layering and drags server modules into the client bundle.

### 4.2 The credential boundary

This is the rule with the sharpest teeth, because breaking it leaks a credential rather
than merely making the code ugly. Two tools cover it from different angles:

**dependency-cruiser** (`server-only-modules`) stops anything outside `src/app/api/**`
from importing `src/lib/firebaseAdmin.ts` or `src/lib/adminAuth.ts`. The former holds
the Firebase service account; the latter holds the `ADMIN_EMAILS` allowlist, which is
deliberately not a `NEXT_PUBLIC_` variable — shipping the list of admin addresses to
every browser hands an attacker the exact accounts worth phishing.

**ESLint** (`no-restricted-syntax`) stops client-reachable modules under
`src/components/` and `src/lib/` from reading any `process.env` key that is not prefixed
`NEXT_PUBLIC_`.

Unit tests are exempt from both. They run in Node under Vitest, never reach a browser
bundle, and are how the credential logic gets tested at all.

When you add a new server-only module under `src/lib/`, add it to **both** lists — the
`SERVER_ONLY` array in `.dependency-cruiser.cjs` and the one in `eslint.config.mjs`. They
are intentionally duplicated rather than shared, because a `.cjs` config and an ESM
config cannot cleanly import from each other; the comment in each points at the other.

### 4.3 Size and complexity ceilings

| Rule                     | Ceiling | Applies to                      |
| ------------------------ | ------- | ------------------------------- |
| `complexity`             | 15      | any function                    |
| `max-lines`              | 500     | any file (blanks/comments free) |
| `max-lines-per-function` | 150     | any function                    |
| `max-depth`              | 4       | nested blocks                   |
| `max-nested-callbacks`   | 4       | callbacks                       |
| `max-params`             | 5       | any function                    |

These are proxies, not truth. A 160-line function is not automatically bad and a
140-line one is not automatically fine. What the ceiling buys is that crossing it becomes
a deliberate act with a paper trail, instead of something that happens 20 lines at a time
over six months — which is exactly how `DetailsModal.tsx` reached 2,742 lines.

Test files are exempt from the length rules: a test file describes scenarios, and its
length tracks the number of cases, not the complexity of a design.

---

## 5. The baseline, and the ratchet

### 5.1 What the baseline is

The ceilings landed on a codebase that already violated them. Rather than lower the
ceiling to whatever the worst file happens to be — which gates nothing — the existing
offenders are listed explicitly in `eslint.config.mjs` as `LEGACY_OVERSIZED` and
`LEGACY_COMPLEX`, with the measurement recorded in a comment.

Baseline taken **2026-08-06**:

| File                                     | Why it is exempt                                  |
| ---------------------------------------- | ------------------------------------------------- |
| `src/app/app/page.tsx`                   | 818 lines; `Home` is 626 lines — down from 2,229/1,911 after PR #56 pulled the places pipeline, auth/Strava hooks and the sidebar/header/map JSX into `src/lib/` and `src/components/` |
| `src/components/DetailsModal.tsx`        | 2,742 lines                                       |
| `src/components/MapView.tsx`             | 834 lines                                         |
| `src/app/admin/settings/page.tsx`        | 661 lines                                         |
| `src/components/ConnectDevicesModal.tsx` | 524 lines                                         |
| `src/components/ProfileModal.tsx`        | 472 lines                                         |
| `src/components/RouteFilter.tsx`         | one 217-line component function                   |
| `src/components/ChatBot.tsx`             | one 187-line component function                   |
| `src/app/page.tsx`                       | `LandingPage`, 190 lines — see below              |
| `src/app/api/strava/sync/route.ts`       | `POST` complexity 40                              |
| `src/app/api/weather/route.ts`           | three handlers at complexity 16 / 23 / 19         |
| `src/lib/appleHealthParser.ts`           | `parseAppleHealthXml` complexity 24               |
| `src/app/api/chat/route.ts`              | `POST` complexity 17                              |

### 5.2 The rule about the baseline

**The lists only ever get shorter.** Do not add a file to them. If a change pushes a new
file over a ceiling, the answer is to split the function, not to widen the list. If you
genuinely believe an exemption is warranted, that is a design discussion for the PR, and
it needs a comment saying why.

`src/app/page.tsx` is the cheapest entry to clear — `LandingPage` is 190 lines of mostly
flat JSX. Lifting the hero, feature grid and footer into `src/components/marketing/`
removes it. It was in flight when the gates landed, which is why it is listed at all.

### 5.3 Semgrep is advisory for now

Semgrep ships no supported Windows binary, so its ruleset could not be dry-run against
this repo before it landed in `security.yml`. The job runs with `continue-on-error: true`
and uploads SARIF to the GitHub Security tab. Once the first PR's findings are triaged,
drop that line and add **Semgrep** to the required checks in branch protection.

---

## 6. What stays in human review

These do not reduce to a rule, and pretending otherwise produces a linter that everyone
learns to silence. The PR checklist:

- **Is this the right abstraction?** Does the new module have one reason to change, or
  did it absorb two unrelated ones because they happened to be edited together?
- **Does the name say what it does?** ESLint checks casing; only a person can tell you
  that `handleData` is not a name.
- **Is the seam in the right place?** Would a caller have to reach past this interface to
  do something reasonable?
- **Is duplication here actually wrong?** jscpd flags token-identical blocks. Two things
  that look the same but change for different reasons should stay apart; the gate is a
  ceiling on accidental copy-paste, not a mandate to deduplicate everything.
- **Do the tests assert behaviour or just execute it?** Stryker gives a number; whether
  the surviving mutants matter is a judgment call.
- **Does the change respect the polyline convention?** Decoded polylines are `[lng, lat]`
  (GeoJSON order). Nothing mechanical catches a swap — only the map looking wrong.

---

## 7. Adding a new gate

1. Prove the rule is deterministic. If you cannot write down the failing case without
   using the word "usually", it belongs in §6, not here.
2. Run the tool against the current tree **before** wiring it in. If it fails, decide
   consciously: fix, or baseline with a dated comment.
3. Add the script to `src/frontend/package.json` and to the `quality` script.
4. Add the step to `.github/workflows/ci.yml` (or `security.yml` for security tools).
5. Add the row to §2 here, and — if it changes how the repo is developed — record an ADR
   under [`docs/adr/`](../adr/).
6. Add the check to branch protection on `main` once it has been green for a few PRs.

---

## 8. Related documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — the layering these rules encode
- [SECURITY.md](SECURITY.md) — the credential split §4.2 enforces
- [TESTING.md](TESTING.md) — coverage and mutation thresholds in context
- [CONTRIBUTING.md](CONTRIBUTING.md) — naming conventions and commit format
- [ADR 0002](../adr/0002-mechanical-code-quality-gates.md) — why gated over reviewed
