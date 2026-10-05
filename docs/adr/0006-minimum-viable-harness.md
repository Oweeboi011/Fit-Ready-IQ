# A minimum viable harness: three stages, one tool per concern

ADR-0002 decided that rules are enforced by tools rather than by review. It left four gaps,
and a 2026-10 scan found each one already holding defects:

- **Nothing found dead code.** The only check was a hand-made snapshot (`DEAD-CODE-AUDIT.md`, since deleted).
  knip and vulture found five domain ports with no implementation, three entities with their
  Firestore documents, Storage helpers for a product with no Storage, and `stravaTokens.ts`
  redefining a type it should have imported.
- **Nothing held the backend's Clean Architecture.** CLAUDE.md asserted the layering, but no
  tool checked it. The rules happened to hold, but nothing would have caught a break.
- **Secrets were scanned only after a push.** gitleaks ran in CI, after the credential had
  already left the machine.
- **The backend linter checked style, not risk.** Ruff ran its defaults: no complexity, no
  bandit, no banned APIs.

We considered adopting a broad platform (SonarQube, a pre-commit framework with dozens of
hooks) and rejected it. Every extra step is a step people learn to skip, and a harness nobody
runs is worse than a small one everybody does. So the rule is **one tool per concern, at the
earliest stage that can afford it, and nothing that duplicates another gate**:

1. **Commit** (staged files, seconds): secretlint, ESLint/Prettier, ruff, commitlint.
2. **PR** (required): `npm run quality` (ESLint, tsc, dependency-cruiser, jscpd, **knip**, the
   docs check), tests and build, plus ruff (with `S`, `B`, `C90`, `ERA`, `TID251`), mypy,
   **import-linter**, **vulture** and pytest, with gitleaks, audits and CodeQL alongside.
3. **Scheduled or conditional:** Stryker, the weekly security re-scan, the uptime probe, and
   Semgrep (advisory).

Choices worth remembering:

- **secretlint, not gitleaks, at commit**, because it installs with `npm install` and needs no
  binary on a Windows machine. gitleaks stays in CI over the full history, so a skipped hook
  still fails the merge.
- **import-linter, not a hand-written test**, because its contracts are declarative and live
  in `pyproject.toml` beside the code they constrain. It also runs under pytest, so a local
  test run catches a layering break.
- **vulture at 80% confidence only.** At 60% it reports every FastAPI route and pydantic field
  as unused. A gate that cries wolf gets disabled, so the 60% tier is a review aid.
- **jscpd extended to Python** rather than adding pylint for its duplicate checker: one tool,
  one config, one threshold.
- **Scripts are the interface.** CI and local runs both
  call `npm run quality` and `poetry run`, so a new gate is added in one place.

The cost: knip and vulture need their entry points declared (`knip.jsonc`, the vulture
`ignore_names`), and a new framework convention can produce false positives until it is
declared. That is a small, visible cost, and it beats an invisible one.

Related to: ADR-0002 (refines it), ADR-0007.
