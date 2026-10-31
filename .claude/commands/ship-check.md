Pre-ship readiness check for the current branch. Run before opening a PR.

Check all of the following from `src/frontend/` and report a punch list:

1. `npm run quality` — lint, types, layering, duplication, dead code, docs: must be clean
2. Backend, if `src/backend/` changed — `poetry run ruff check . && poetry run mypy src/ && poetry run lint-imports && poetry run vulture && poetry run pytest`
3. `npm run test:unit` — all tests must pass, coverage thresholds met (85% statements/functions/lines)
4. `npm run build` — must succeed (use dummy env vars if real ones aren't set)
5. `npm audit --audit-level=high` — no high/critical vulnerabilities
6. Git status — no uncommitted changes that belong in this PR
7. Branch — confirm we're NOT on `main` or `develop` directly
8. Docs — check if any changed files in `src/app/api/` or `src/lib/` need a doc update in `docs/guides/` (run `npm run lint:docs`)

For any failing check, show the exact error and the one-line fix. For passing checks, just show a checkmark and the key metric (e.g., "✓ 7 tests, 91% coverage").
