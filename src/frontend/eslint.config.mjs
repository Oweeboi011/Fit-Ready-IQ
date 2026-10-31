import coreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

/**
 * Baseline of files that already exceeded the ceilings when the gates went in
 * (2026-08-06). Exempting them lets the rules be errors everywhere else;
 * shrinking these two lists is the ratchet.
 *
 * Do not add entries — see docs/guides/harness.md and
 * docs/adr/0002-mechanical-code-quality-gates.md.
 */
const LEGACY_OVERSIZED = [
  // 818 lines, `Home` 626 — down from 2,229/1,911 after extracting the
  // places pipeline, auth/Strava hooks and JSX (header, sidebar, map area)
  // into src/lib/ and src/components/. What is left is state/effect
  // wiring that is not yet worth splitting further; see PR #56.
  'src/app/app/page.tsx',
  'src/app/admin/settings/page.tsx', // 661
  'src/components/DetailsModal.tsx', // 2742
  'src/components/MapView.tsx', // 834
  'src/components/ConnectDevicesModal.tsx', // 524
  'src/components/ProfileModal.tsx', // 472
  'src/components/ChatBot.tsx', // one 187-line component function
  'src/components/RouteFilter.tsx', // one 217-line component function
  // In flight when the gate landed rather than genuinely old: LandingPage is a
  // 190-line JSX function. It is the cheapest entry to clear — lift the hero,
  // feature grid and footer into src/components/marketing/ and delete this line.
  'src/app/page.tsx',
];

/**
 * Modules under src/lib/ that are server-only despite living in a directory the
 * client also imports from. They are allowed to read non-public env vars. Keep
 * this in step with SERVER_ONLY in .dependency-cruiser.cjs, which stops anything
 * client-reachable from importing them in the first place.
 */
const SERVER_ONLY = [
  'src/lib/firebaseAdmin.ts',
  'src/lib/adminAuth.ts',
  'src/lib/serverAuth.ts',
  'src/lib/rateLimit.ts',
  'src/lib/auditLog.ts',
  'src/lib/logger.ts',
  'src/lib/stravaTokens.ts',
  'src/lib/rateLimitRules.ts',
];

const LEGACY_COMPLEX = [
  'src/app/api/chat/route.ts', // POST: 17
  'src/app/api/strava/sync/route.ts', // POST: 40
  'src/app/api/weather/route.ts', // buildSummary 16, fetchGoogleWeather 23, fetchOpenWeather 19
  'src/lib/appleHealthParser.ts', // parseAppleHealthXml: 24
];

const config = [
  {
    ignores: [
      '.next/**',
      // Stryker's sandbox holds instrumented copies of src, whose injected
      // conditionals trip rules-of-hooks by the hundred.
      '.stryker-tmp/**',
      'coverage/**',
      'reports/**',
      'node_modules/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...coreWebVitals,
  {
    // Scoped to source files: the react-hooks plugin is only registered by
    // eslint-config-next for these, and an unscoped override would fail
    // resolution against root-level config files such as .dependency-cruiser.cjs.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // New in the react-hooks v6 rules that ship with Next 16. A synchronous
      // setState in an effect costs an extra render. Where one is genuinely the
      // right place — restoring browser storage after mount, resetting a hook
      // to idle — it carries an inline disable that says why. A new site
      // without a reason fails the build.
      'react-hooks/set-state-in-effect': 'error',
    },
  },

  // ── Icon accessibility ─────────────────────────────────────────────────────
  // This UI is icon-dense, and a lucide icon renders a bare <svg> that screen
  // readers either announce as noise or, on an icon-only button, as nothing at
  // all. The convention is: every decorative icon carries aria-hidden="true",
  // and every control whose only child is an icon carries its own aria-label.
  // `title` does not count — it is not announced reliably and never appears on
  // touch. The jsx-a11y plugin is already registered by eslint-config-next, so
  // this adds no dependency.
  {
    files: ['src/**/*.tsx'],
    rules: {
      // `control-has-associated-label` only looks inside the element, so it
      // cannot see a sibling <label htmlFor>. Form fields are therefore handed
      // to `label-has-associated-control`, which is the rule that does understand
      // that association — the pair covers every control between them, and
      // neither is weakened.
      'jsx-a11y/control-has-associated-label': [
        'error',
        { ignoreElements: ['input', 'select', 'textarea'] },
      ],
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
    },
  },

  // ── Size and complexity ceilings ───────────────────────────────────────────
  // Mechanical proxies for "this module has stopped being one idea". They do not
  // prove a design is good; crossing one reliably means it is worth a look.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', 4],
      'max-nested-callbacks': ['error', 4],
      'max-params': ['error', 5],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  {
    files: LEGACY_OVERSIZED,
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    files: [...LEGACY_OVERSIZED, ...LEGACY_COMPLEX],
    rules: {
      complexity: 'off',
      'max-depth': 'off',
    },
  },
  {
    // Test files describe scenarios; length there is not a design smell.
    files: ['src/**/*.test.{ts,tsx}', 'tests/**/*.{ts,js}'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
    },
  },

  // ── Naming conventions ─────────────────────────────────────────────────────
  // The subset of the naming rules in .claude/CLAUDE.md that a linter can
  // actually express. Casing of ordinary variables is left to review.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: { parser: tseslint.parser },
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['interface', 'typeAlias', 'enum', 'class'],
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
          prefix: ['T', 'K', 'V', 'U'],
        },
        {
          selector: ['classProperty', 'classMethod'],
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
      ],
    },
  },

  // ── Banned APIs and the shared primitives ──────────────────────────────────
  // Each of these has a house replacement that already does the job properly;
  // the ban is what makes reaching for the replacement the path of least
  // resistance. See docs/guides/harness.md.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      // window.confirm/alert/prompt block the tab and cannot be styled or
      // focus-managed. Use ConfirmDialog.
      'no-alert': 'error',
      // A modal dialog needs the focus trap, Escape, scroll lock and focus
      // restore that Modal.tsx already implements. Build on Modal instead.
      'react/forbid-dom-props': [
        'error',
        {
          forbid: [
            {
              propName: 'aria-modal',
              message: 'Modal dialogs go through src/components/Modal.tsx.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/Modal.tsx'],
    rules: { 'react/forbid-dom-props': 'off' },
  },
  {
    // Server logs go through logger.ts: one JSON line per event, redacted, with
    // a request id. A raw console call can serialise an Authorization header.
    // All of src/lib, not just SERVER_ONLY: shared modules (weatherWindow,
    // advisories, …) run inside route handlers too. Client hooks and the
    // browser-only Maps helper are the exceptions.
    files: ['src/app/api/**/*.ts', 'src/lib/**/*.ts'],
    ignores: [
      'src/lib/logger.ts',
      'src/lib/use[A-Z]*.ts', // hooks; not userDataFootprint.ts, which is server-side
      'src/lib/mapsGeometry.ts',
      'src/**/*.test.ts',
    ],
    rules: {
      'no-console': 'error',
    },
  },

  // ── Credential split ───────────────────────────────────────────────────────
  // Only NEXT_PUBLIC_* may be read outside a route handler. Anything else read
  // from a client module is inlined into the browser bundle by Next's build.
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    ignores: [...SERVER_ONLY, 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!=/^NEXT_PUBLIC_/]",
          message:
            'Client-reachable modules may only read NEXT_PUBLIC_* env vars. Move the ' +
            'server-side secret behind a route handler under src/app/api/.',
        },
      ],
    },
  },
];

export default config;
