# Docs

| Folder                                             | Answers                                          | Start with                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`guides/`](guides/architecture.md)                | **What is it?**                                  | [architecture](guides/architecture.md) · [api](guides/api.md) · [harness](guides/harness.md) · [development](guides/development.md) · [security](guides/security.md) · [deployment](guides/deployment.md) · [runbooks](guides/runbooks/firestore-ttl.md) |
| [`solution-plan/`](solution-plan/SOLUTION-PLAN.md) | **How do we deliver it, and what should it do?** | [the plan](solution-plan/SOLUTION-PLAN.md) · [audits](solution-plan/audits/2026-09-28-solution-audit.md)                                                                                                                                                 |
| [`adr/`](adr/README.md)                            | **Why is it this way?**                          | [index](adr/README.md)                                                                                                                                                                                                                                   |

Glossary: [`CONTEXT.md`](../CONTEXT.md). Agent guide: [`.claude/CLAUDE.md`](../.claude/CLAUDE.md).

Rules ([ADR-0007](adr/0007-docs-taxonomy.md)):

- **Close to the code.** Link to the file that states a fact; do not copy it.
- **Same PR.** A change updates every doc it makes untrue ([ADR-0005](adr/0005-documentation-governance-harnessing.md)).
- **Deprecate aggressively.** Delete a doc a gate has replaced, or whose findings are closed.
- **No boilerplate.** Markdown + Mermaid, one screen where possible.

`npm run lint:docs` (in `src/frontend`) fails on broken links, empty files and anything
outside these three folders.
