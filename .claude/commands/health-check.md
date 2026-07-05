Run a quick health check of the project's current state and surface anything that looks off.

Check the following in parallel and report findings:

1. **Git state** — any uncommitted changes, untracked files, or branch divergence from origin
2. **Workflow status** — run `gh run list --limit 5` to show recent CI results
3. **Open PRs** — run `gh pr list` to show any open pull requests
4. **npm audit** — check for high/critical vulnerabilities in frontend/
5. **Type errors** — note if `frontend/tsconfig.tsbuildinfo` is stale (check mtime vs source files)
6. **Secrets check** — verify `.env.local` exists in frontend/ and `.env` is not accidentally populated

Present results as a brief status board: green (ok), yellow (worth checking), red (action needed). One line per item.
