/**
 * Architectural gates for the Next.js frontend.
 *
 * The rules here encode the layering described in docs/wiki/ARCHITECTURE.md and
 * the credential split in CLAUDE.md. Anything expressible as "module A may not
 * reach module B" belongs in this file rather than in a review checklist —
 * see docs/adr/0002-mechanical-code-quality-gates.md.
 *
 * Layers, outermost first:
 *
 *   src/app/api/**   route handlers   (server only — may use the Admin SDK)
 *   src/app/**       pages/layouts    (client — may use components + lib)
 *   src/components/** UI              (may use lib)
 *   src/lib/**       domain + adapters (may use nothing above it)
 *
 * Dependencies point inward only.
 */

/**
 * Modules that touch server-only credentials. Nothing outside a route handler
 * (or another server-only module) may import them. Keep this in step with the
 * matching list in eslint.config.mjs.
 */
const SERVER_ONLY = ['src/lib/firebaseAdmin\\.ts', 'src/lib/adminAuth\\.ts'];

/**
 * Route handlers, the server-only modules themselves, and unit tests. Tests run in
 * Node under Vitest and never reach a browser bundle, so importing a server-only
 * module from one is safe — and is how the credential logic gets tested at all.
 */
const MAY_IMPORT_SERVER_ONLY = `(^src/app/api/|^(${SERVER_ONLY.join('|')})$|\\.test\\.tsx?$)`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'Circular imports make module init order load-bearing and defeat tree shaking. ' +
        'Extract the shared piece into src/lib/ instead.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },

    {
      name: 'lib-is-innermost',
      comment:
        'src/lib/ is the innermost layer: parsers, adapters and hooks. It must not ' +
        'reach back out into React components or app routes, or it stops being ' +
        'testable in isolation.',
      severity: 'error',
      from: { path: '^src/lib/' },
      to: { path: '^src/(app|components)/' },
    },

    {
      name: 'components-do-not-import-pages',
      comment:
        'Components are reusable leaves. Importing a page or route handler inverts ' +
        'the layering and drags server-side modules into the client bundle.',
      severity: 'error',
      from: { path: '^src/components/' },
      to: { path: '^src/app/' },
    },

    {
      name: 'server-only-modules',
      comment:
        'firebaseAdmin.ts initialises the Firebase Admin SDK from FIREBASE_PRIVATE_KEY / ' +
        'FIREBASE_SERVICE_ACCOUNT_KEY_JSON, and adminAuth.ts reads the ADMIN_EMAILS ' +
        'allowlist. Both may only be imported by route handlers under src/app/api/ or by ' +
        'each other. Importing them anywhere else risks bundling a service-account ' +
        'credential — or the list of accounts worth phishing — into client JavaScript.',
      severity: 'error',
      from: { pathNot: MAY_IMPORT_SERVER_ONLY },
      to: { path: `^(${SERVER_ONLY.join('|')})$` },
    },

    {
      name: 'no-firebase-admin-package-outside-server',
      comment:
        'Same rule, one level down: reach for the firebase-admin package only from a ' +
        'route handler or a server-only module, and preferably only through ' +
        'src/lib/firebaseAdmin.ts.',
      severity: 'error',
      from: { pathNot: MAY_IMPORT_SERVER_ONLY },
      to: { dependencyTypes: ['npm'], path: '^firebase-admin' },
    },

    {
      name: 'no-orphans',
      comment:
        'A module nothing imports is either dead code or a missing wire-up. Config and ' +
        'type declaration files are exempt.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)[.][^/]+[.](cjs|mjs|js|ts)$', // dotfiles
          '[.]d[.]ts$',
          '(^|/)tsconfig[.]json$',
          '(^|/)(babel|webpack|next|postcss|tailwind|vitest|playwright)[.]config[.](js|cjs|mjs|ts)$',
          '^src/app/', // Next.js discovers pages/routes by convention, not by import
        ],
      },
      to: {},
    },

    {
      name: 'no-dev-dep-in-src',
      comment:
        'A devDependency reached from src/ will be missing at runtime in the Vercel build.',
      severity: 'error',
      from: { path: '^src/', pathNot: '[.](test|spec)[.](ts|tsx)$' },
      to: { dependencyTypes: ['npm-dev'] },
    },

    {
      name: 'no-deprecated-core',
      comment: 'Node core modules that have been deprecated for years.',
      severity: 'error',
      from: {},
      to: {
        dependencyTypes: ['core'],
        path: '^(punycode|domain|constants|sys|_linklist|_stream_wrap)$',
      },
    },

    {
      name: 'not-to-unresolvable',
      comment: 'An import that does not resolve is a build failure waiting to happen.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(\\.next|\\.stryker-tmp|coverage|reports|out|node_modules)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
