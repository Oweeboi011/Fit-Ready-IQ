# Architecture Decision Records

The _why_ behind decisions that are expensive to reverse or easy to re-litigate by accident.
What the system is lives in [`../guides`](../guides/architecture.md); what it should become
lives in [`../solution-plan`](../solution-plan/SOLUTION-PLAN.md).

| #                                                                   | Decision                                                                                | Status                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [0001](0001-claude-code-as-canonical-agent-harness.md)              | Claude Code (`.claude/CLAUDE.md`) is the single agent guide; other agents get a pointer | Accepted                                        |
| [0002](0002-mechanical-code-quality-gates.md)                       | Rules are enforced by tools (Gated / Reviewed / Advisory), biased to Gated              | Accepted, refined by 0006                       |
| [0003](0003-trip-is-the-spine-and-safety-is-a-server-side-timer.md) | Trip is the central entity; safety is a server-side timer, not tracking                 | Accepted, not implemented                       |
| [0004](0004-routes-have-real-geometry.md)                           | A Route is a `[lng, lat]` line with metrics computed along it                           | Accepted, not implemented                       |
| [0005](0005-documentation-governance-harnessing.md)                 | A change updates the docs it makes untrue in the same PR                                | Accepted; "no consolidation" superseded by 0007 |
| [0006](0006-minimum-viable-harness.md)                              | Three harness stages, one tool per concern (knip, vulture, import-linter, secretlint)   | Accepted                                        |
| [0007](0007-docs-taxonomy.md)                                       | Docs live in three folders: guides (what), solution-plan (how), adr (why)               | Accepted                                        |

## Writing one

Write an ADR when a future contributor could reasonably reverse the decision without knowing
why it was made. If a tool can decide it, it belongs in a gate
([harness.md](../guides/harness.md)), not here.

- File name `NNNN-short-title.md`: the next number, never reused.
- Prose: the forces, the decision, what was rejected, and the cost. Aim for one screen.
- **Never edit an accepted ADR's reasoning.** Supersede it with a new one, and update the
  Status column for both.
- Add a row here. If it changes the roadmap or data model, update the
  [solution plan](../solution-plan/SOLUTION-PLAN.md) in the same PR.
