# Architecture Decision Records

This directory records decisions that are expensive to reverse or easy to accidentally re-litigate — the kind of thing a reviewer six months from now needs the *why*, not just the *what*, to evaluate a change against. Format and rationale for using ADRs at all: see ADR-0001.

Numbers are sequential and never reused, even if a later decision supersedes an earlier one — supersession is recorded in the newer ADR, the older one stays as history.

| # | Title | Status | Decision |
| --- | --- | --- | --- |
| [0001](0001-claude-code-as-canonical-agent-harness.md) | Claude Code is the canonical agent harness | Accepted | Claude Code (`.claude/CLAUDE.md`) is the single source of truth for agent-facing repo conventions; GitHub Copilot's instruction files are reduced to a thin pointer rather than a second, drifting copy. |
| [0002](0002-mechanical-code-quality-gates.md) | Architectural rules are enforced by tools, not by review | Accepted | Design rules are sorted into Gated (CI fails the build) / Reviewed (human checklist) / Advisory (reported only), biased toward Gated, and wired into `dependency-cruiser`, ESLint, `jscpd`, Vitest/Stryker, and Semgrep. |
| [0003](0003-trip-is-the-spine-and-safety-is-a-server-side-timer.md) | Trip is the spine, and safety is a server-side timer | Accepted, not yet implemented | Makes **Trip** the central entity (route/place + readiness + weather window + gear + emergency contact + resulting activity). Safety is a server-side dead-man's-switch, not client-side location tracking. |
| [0004](0004-routes-have-real-geometry.md) | Routes have real geometry, from three producers | Accepted, not yet implemented | A Route is an ordered `[lng, lat]` line with length/elevation computed along it, from OSM import, GPX upload, or user-drawn routes snapped via OpenRouteService — not a Google Places pin with fabricated metrics. |
| [0005](0005-documentation-governance-harnessing.md) | Documentation governance and harnessing | Accepted | Extends the Gated/Reviewed/Advisory ratchet from ADR-0002 to documentation: a PR that changes branch flow, directory structure, or a data model an ADR describes must update that doc in the same PR. |

## Related Audits

ADRs record decisions; audits record how far reality has moved toward them. `docs/ux-audit-2026-08-14.md` assesses the product against 0003 and 0004 in particular — both are Accepted but unimplemented, and that audit is where the consequences of the gap (and the unscoped notification-channel prerequisite for 0003's safety timer) are written down.

## When to Write One

Per ADR-0002's own precedent: if the decision is mechanically decidable, it belongs in a gate, not a document (see `docs/wiki/CODE-QUALITY.md`). Write an ADR when the decision is a judgment call that a future contributor could plausibly reverse without knowing why it was made — an entity model change (0003, 0004), a tooling/process stance (0001, 0002, 0005), a rejected alternative worth remembering.

Every new ADR must (a) get a row in this table, (b) cross-reference `docs/solution-plan/SOLUTION-PLAN.md` if it changes the roadmap or data model. See ADR-0005 for why this is now a stated rule rather than an implicit expectation.
