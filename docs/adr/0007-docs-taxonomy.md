# Three doc folders, each answering one question

By 2026-10 the repo held roughly 8,500 lines of Markdown, and most of it said the same things
in different ways. The wiki's architecture page still described a Firestore weather cache, a
Storage bucket and an unauthenticated API, none of which existed. The API reference opened by
saying routes need no authentication, then documented routes that require it. Three audits
sat at the top of `docs/` beside the material they audited. The Copilot instruction files
lived in `.github/instructions/`, a path Copilot never reads, and still carried another
project's Azure template.

ADR-0005 added a same-PR rule but chose explicitly not to consolidate. The rule was right, and
it was not enough: when the same fact lives in five files, the reviewer has to remember all
five, and nobody does.

We now keep **three folders, each answering one question**:

| Folder                | Question                                     | Holds                                                                   |
| --------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/guides/`        | What is it?                                  | architecture, api, harness, development, security, deployment, runbooks |
| `docs/solution-plan/` | How do we deliver it, and what should it do? | the plan, and audits measured against it                                |
| `docs/adr/`           | Why is it this way?                          | one decision per file, never edited after acceptance                    |

How the folders are kept honest:

- **Docs close to the code.** A fact the code already states is linked to, not copied:
  `rateLimitRules.ts` for budgets, `roadmap.ts` for item status, `.env.example` for variables,
  `pyproject.toml` and `eslint.config.mjs` for gate thresholds.
- **Deprecate aggressively.** A doc that a gate replaces is deleted (`DEAD-CODE-AUDIT.md` →
  knip/vulture). A doc whose findings are closed is deleted (`idp-audit`). Superseded
  instruction files are removed rather than left as stale pointers.
- **No boilerplate.** No "Overview" that restates the title, no "Related documents" list the
  links already make, and no phase Gantt charts of dates that have passed.
- **Markdown + Mermaid** for anything with structure. Diagrams are drawn at the level that
  survives refactoring (layers and flows, not files).

`npm run lint:docs` enforces the mechanical part: broken relative links, empty files, and
anything placed under `docs/` outside the three folders. Whether a diagram still matches the
code remains a review question (ADR-0005).

Root files stay at the root only where a tool or convention looks for them: `README.md`,
`SECURITY.md` (GitHub), `CONTEXT.md` (the domain-modeling and tdd skills),
`firebase.json`/`firestore.*` (the Firebase CLI) and `docker-compose.yml`.

Supersedes: ADR-0005's "does not propose consolidating" stance. Its same-PR rule stands.
Related to: ADR-0001, ADR-0006.
