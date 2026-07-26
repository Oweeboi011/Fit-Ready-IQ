---
applyTo: "**/*.ts,**/*.tsx"
---

# Project coding standards for TypeScript and React

Apply the [general coding guidelines](./general-coding.instructions.md) to all code.

## TypeScript Guidelines

- Use TypeScript for all new code
- Follow functional programming principles where possible
- Use interfaces for data structures and type definitions
- Prefer immutable data (const, readonly)
- Use optional chaining (?.) and nullish coalescing (??) operators

## React Guidelines

- Use functional components with hooks
- Follow the React hooks rules (no conditional hooks)
- Use React.FC type for components with children
- Keep components small and focused
- Use CSS modules for component styling
- Develop reusable components when possible

## Test-Coverage Guidelines

### Tools

- Use **Vitest** for unit tests
- Use **@testing-library/react** for component tests
- Use **Playwright** for browser end-to-end tests

### Coverage Policy

| Metric     | Minimum (enforced in `vitest.config.ts`) |
| ---------- | ----------------------------------------- |
| Statements | 85 %                                       |
| Branches   | 50 %                                       |
| Functions  | 85 %                                       |
| Lines      | 85 %                                       |

- Enforce these thresholds in `vitest.config.ts`; CI must fail when unmet
- Reject merges that reduce overall coverage

### Test-Writing Rules

- Unit/component tests: put files in `__tests__/` or end with `.test.ts[x]`
- Playwright specs: place in `e2e/` and end with `.spec.ts`
- Prefer behavioural assertions; avoid snapshots unless output is static
- Mock external services and side-effects, not the unit under test
- Use **msw** for HTTP mocks in unit/component tests
- Do not commit `.only`, `.skip`, or focussed tests
- Keep tests deterministic; avoid real time, randomness, and live network calls

### Reporting

- Generate coverage in both `lcov` and `html` formats
- Upload the `lcov` report to the coverage service
- Exclude `coverage/` artefacts via `.gitignore`

## Linting and Formatting

- Use ESLint (`npm run lint`) and Prettier (`npm run format`) for linting and formatting
- Ensure all linting and formatting rules pass before submitting code
