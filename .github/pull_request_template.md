## Summary

<!-- What does this PR do? 1-3 bullets. -->
-

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Docs / config / CI

## Test plan

- [ ] `npm run quality` and `npm run test:unit` pass (`src/frontend`)
- [ ] Backend gates pass, if `src/backend/` changed (see `docs/guides/harness.md`)
- [ ] Manual smoke test for changed behavior

## Review (judgment the gates cannot make)

- [ ] One reason to change per module; new behaviour arrives behind an existing seam
- [ ] Docs this change makes untrue are updated in this PR (ADR-0005)
- [ ] New user-scoped collection? Added to `userDataFootprint.ts`, `firestore.rules` and the rules tests

## Notes for reviewer

<!-- Trade-offs, follow-ups, anything non-obvious. Delete if empty. -->
