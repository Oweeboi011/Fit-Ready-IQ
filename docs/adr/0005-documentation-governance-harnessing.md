# Documentation governance and harnessing

`docs/solution-plan/SOLUTION-PLAN.md` was dated 2026-06-27 and claimed "Status: Active — source of truth for all development" while two accepted ADRs (0003, 0004 — both 2026-08-11) redefined the core data model without it being updated to match, and both of those ADRs' own path references were wrong the day they were written. A parallel audit of every other doc in the repo found 13+ stale `frontend/`/`backend/` paths left over from the `src/` restructure, three docs still describing a branch flow that had already changed, a wiki page (`AI.md`) that was silently an empty directory instead of a file, and two more wiki pages (`DATA.md`, `USER-FLOW.md`) that were 0-byte stubs of unknown age. None of this was caught by CI, because nothing checks documentation currency — ADR-0002 already sorts every *code* design rule into Gated/Reviewed/Advisory tiers and wires the Gated ones into CI, and that discipline has held: the layering rules, the credential boundary, the size ceilings have not drifted the way the docs did.

We are extending that same ratchet to documentation, as an explicit rule rather than an implicit expectation. It cannot be fully Gated — there is no tool that can verify a Mermaid diagram matches the code it describes — but it can be made Reviewed with a concrete trigger, the same way ADR-0002 treats naming conventions as "partly gated, partly reviewed" rather than leaving the whole thing to attention. Attention is what let five weeks and two ADRs pass unnoticed.

## The rule

Any PR that changes branch flow, directory structure, or a data model that an ADR or wiki doc describes must update that doc in the **same PR**, not a follow-up one. `SOLUTION-PLAN.md` Section 14.3's "documentation cascade" diagram already gestured at this; this ADR makes it a stated rule with an owner (the PR author, checked by the reviewer) rather than a diagram nobody is accountable to.

Concretely:

- **Every new ADR** must (a) get a row in `docs/adr/README.md`, and (b) cross-reference `SOLUTION-PLAN.md` if it changes the roadmap or data model. This is the specific gap that caused this audit — ADR-0003 and ADR-0004 shipped without either.
- **A restructure or branch-flow change** (the kind that touches `.claude/CLAUDE.md`) must be grepped across `docs/` for the old paths/flow before the PR is considered done, not caught later by a dedicated audit. The check itself is mechanical (`grep -rn "frontend/" docs/ | grep -v "src/frontend"` and the equivalent for the old branch-flow phrasing) even though deciding *which* docs need it is not.
- **`docs/wiki/CONTRIBUTING.md` Section 8.2**'s reviewer checklist gets one more line: does this PR's change require a docs update per this ADR? Reusing the existing checklist rather than creating a parallel one.

## Reuse over rebuild

`docs/wiki/DEAD-CODE-AUDIT.md`, produced alongside this ADR, is the model for how deferred-but-real infrastructure should be documented going forward: the backend's Strava/Garmin/Coros/Google-Maps/Komoot API clients are unreferenced today, real work, and explicitly recommended to stay rather than be deleted reflexively. The same instinct applies to documentation structure — the existing shape (`SOLUTION-PLAN.md` as living roadmap, `docs/adr/` for point-in-time decisions, `docs/wiki/` for reference docs, `.claude/CLAUDE.md` for agent-facing conventions) is sound. This ADR does not propose replacing it, consolidating it into fewer files, or adding a new documentation system — it adds the one thing that was missing, which is a stated trigger for keeping the existing structure in sync with itself.

## Consequences

- New ADRs take slightly longer to write — a cross-reference check against `SOLUTION-PLAN.md` before merge — in exchange for not needing a five-agent audit to find the drift months later.
- `docs/adr/README.md` (added alongside this ADR) needs a new row every time an ADR is written; skipping it is now a reviewable defect, not just an oversight.
- This does not catch everything. A doc can still go stale if the reviewer misses it — this is Reviewed, not Gated, because no tool exists yet to verify a Mermaid diagram against the code it describes. A future enhancement (see `SOLUTION-PLAN.md` Section 15.3) could add a lighter mechanical check — for example, failing CI if a PR touches `src/backend/` or changes a Firestore `.collection()` call without also touching `docs/wiki/DATA.md` — without requiring full semantic verification.
- `docs/wiki/AI.md` existing as a silently-empty directory for an unknown period is the sharpest example of what this rule would not have caught by itself — that failure mode needs the lighter mechanical check above (file-exists, non-empty), not just a PR-review reminder, since an empty file passes a human skim as easily as it fails a `grep`.
