# Architectural rules are enforced by tools, not by review

The repo's design rules — the frontend layering, the `NEXT_PUBLIC_` credential split, the
naming conventions, the coverage floor — were written down in `CLAUDE.md`,
`docs/wiki/ARCHITECTURE.md` and `docs/wiki/SECURITY.md` and enforced by nothing. That
worked while the tree was small and one person was reading every diff, and it visibly
stopped working before then: `DetailsModal.tsx` reached 2,742 lines and
`src/app/app/page.tsx` 2,229, each one arriving twenty lines at a time under a rule
("keep modules focused") that no build step could see being broken. A rule enforced only
by attention decays at exactly the rate attention does, and the failure is silent.

We decided to sort every design rule into **Gated** (a tool fails the build), **Reviewed**
(a human checklist item) or **Advisory** (reported, not blocking), with a deliberate bias
toward Gated, and to wire the Gated ones into CI. `dependency-cruiser`
(`frontend/.dependency-cruiser.cjs`) now holds the layering, forbids circular imports, and
stops anything outside `src/app/api/**` from importing `firebaseAdmin.ts` or
`adminAuth.ts`. An ESLint `no-restricted-syntax` selector covers the same credential
boundary from the other side, refusing any non-`NEXT_PUBLIC_` `process.env` read in a
client-reachable module. ESLint also carries the size and complexity ceilings
(`complexity` 15, `max-lines` 500, `max-lines-per-function` 150) and the expressible
subset of the naming conventions via `@typescript-eslint/naming-convention`. `jscpd`
holds duplication at 3% of tokens. Vitest thresholds and Stryker already held coverage
and test effectiveness; they are now documented as gates rather than as habits. Semgrep
joins `security.yml` alongside CodeQL for pattern-level findings, advisory until its
first-run backlog is triaged, because it has no Windows binary and could not be dry-run
locally before landing. The full mapping lives in `docs/wiki/CODE-QUALITY.md`.

The awkward part is the baseline. The ceilings were chosen to be useful going forward,
not to be satisfied by the current tree, so thirteen existing files exceed them. Setting
each ceiling to whatever the worst file happens to be would have made the gate green and
worthless. Instead the offenders are listed by name in `eslint.config.mjs` with their
measurements in a comment, dated 2026-08-06, and the standing rule is that the lists only
ever get shorter — a change that pushes a new file over a ceiling gets split, not added
to the list. This trades a clean config for an honest one: the debt is visible, countable,
and attached to the specific files that carry it, rather than diffused into a threshold
nobody remembers choosing.

What we explicitly did not do is try to gate judgment. "Is this the right abstraction",
"is the seam in the right place", "is this duplication actually wrong" stay in a PR
review checklist, because encoding them as heuristics produces a linter that people learn
to suppress, and a suppressed rule is worse than an unwritten one — it looks enforced. The
point of moving the mechanical rules into tools is precisely to spend reviewer attention
on the rules that need a person.
