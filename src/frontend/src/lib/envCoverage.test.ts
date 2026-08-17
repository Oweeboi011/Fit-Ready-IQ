import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Keeps `.env.example` honest in both directions.
 *
 * The audit that prompted this found the drift had gone both ways at once:
 *
 *   - `NEXT_PUBLIC_STRAVA_CLIENT_ID` was read in the browser to build the Strava
 *     authorize URL and was in no example file at all, so anyone setting the
 *     project up from the docs got a Connect button that could not start.
 *   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` and `..._MESSAGING_SENDER_ID` were
 *     documented and set, and passed to nothing.
 *
 * Neither is the kind of mistake review catches, because nothing fails. This
 * does.
 */

const FRONTEND = path.join(__dirname, '..', '..');
const SRC = path.join(__dirname, '..');
const ENV_EXAMPLE = path.join(FRONTEND, '.env.example');

/**
 * Configuration read outside `src/`.
 *
 * `next.config.js` reads the CSP switches and populates the browser `env` block,
 * so four variables live only there — scanning `src/` alone reported them as
 * unused, which was the test being wrong rather than the config.
 */
const EXTRA_SOURCES = [path.join(FRONTEND, 'next.config.js')];

/**
 * Read by tooling rather than by the app, so they do not belong in the example
 * file a developer copies.
 */
const NOT_APP_CONFIG = new Set([
  'NODE_ENV', // set by Next and by the test runner
  'CI', // set by the CI provider; read by playwright.config.ts
  'E2E_BASE_URL', // Playwright only, documented in the e2e setup
  'VERCEL_URL', // injected by the platform
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

/** Every `process.env.X` the application code actually reads. */
function readVars(): Set<string> {
  const names = new Set<string>();
  for (const file of [...sourceFiles(SRC), ...EXTRA_SOURCES]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (!NOT_APP_CONFIG.has(match[1])) names.add(match[1]);
    }
  }
  return names;
}

/** Every variable declared in `.env.example`. */
function declaredVars(): Set<string> {
  const source = readFileSync(ENV_EXAMPLE, 'utf8');
  return new Set(Array.from(source.matchAll(/^([A-Z0-9_]+)=/gm), (m) => m[1]));
}

describe('.env.example', () => {
  it('finds variables at all, so a broken scan cannot pass silently', () => {
    expect(readVars().size).toBeGreaterThan(10);
    expect(declaredVars().size).toBeGreaterThan(10);
  });

  it('declares every variable the app reads', () => {
    const undeclared = [...readVars()].filter((name) => !declaredVars().has(name)).sort();
    expect(
      undeclared,
      `Read in src/ or next.config.js but missing from .env.example: ${undeclared.join(', ')}. ` +
        `Anyone setting the project up from the docs will not know to set these.`
    ).toEqual([]);
  });

  it('declares nothing the app no longer reads', () => {
    const unused = [...declaredVars()].filter((name) => !readVars().has(name)).sort();
    expect(
      unused,
      `Declared in .env.example but read nowhere in src/ or next.config.js: ${unused.join(', ')}. ` +
        `Remove it, or wire up whatever was meant to read it.`
    ).toEqual([]);
  });

  it('never gives a secret a NEXT_PUBLIC_ prefix', () => {
    // NEXT_PUBLIC_ is inlined into the browser bundle at build time, so this
    // prefix on a secret is not a leak waiting to happen — it is the leak.
    // STRAVA_CLIENT_ID is exempt: an OAuth client id travels in the authorize
    // URL and is public by design.
    const exposed = [...declaredVars()].filter(
      (name) =>
        name.startsWith('NEXT_PUBLIC_') &&
        /SECRET|PRIVATE|PASSWORD|SERVICE_ACCOUNT|CREDENTIAL/.test(name)
    );
    expect(exposed, `Secret-looking variables exposed to the browser: ${exposed}`).toEqual([]);
  });
});
