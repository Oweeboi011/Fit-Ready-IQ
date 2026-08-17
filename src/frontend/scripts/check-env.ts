/**
 * Checks the repo-root `.env.local` against `.env.example` and against the rules
 * that make the difference between "populated" and "populated correctly".
 *
 * Written because four separate env mistakes got shipped in one afternoon, each
 * of which looked fine on inspection:
 *
 *   1. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` present but empty — the map failed and
 *      the file looked complete.
 *   2. the browser key pasted into `GOOGLE_ROUTES_API_KEY`, which is rejected
 *      server-side for carrying a referrer restriction.
 *   3. the server key pasted over `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — an
 *      unrestricted key compiled into the browser bundle, which is a spending
 *      liability rather than a broken feature.
 *   4. an edit that never saved, so a "done" change was still the old value.
 *
 * None of those are visible by reading the file, and three of them produce a
 * runtime failure whose message points somewhere else entirely. They are all
 * one comparison each, so this makes them one command.
 *
 * Deliberately offline: no Google calls, no gcloud, nothing billable. It reads
 * two files and compares strings, so it is safe in CI and on a fresh clone.
 *
 * Run with `npm run env:check`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
/** Defaults to the repo-root file; a path argument lets the checks be tested. */
const ENV_LOCAL = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO_ROOT, '.env.local');
const ENV_EXAMPLE = path.join(REPO_ROOT, '.env.example');

/**
 * Variables that break a feature outright when unset. Everything else in
 * `.env.example` is optional by design and degrades honestly.
 */
const REQUIRED = [
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'FIREBASE_PROJECT_ID',
  'GEMINI_API_KEY',
  'NEXT_PUBLIC_STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
  'ADMIN_EMAILS',
];

/**
 * Server-side variables that must NOT hold the browser key.
 *
 * `/api/directions` and `/api/weather` call Google server-to-server, which sends
 * no referer, so a referrer-restricted key is rejected with "Requests from
 * referer <empty> are blocked" — and the public key should be referrer
 * restricted. Sharing one key means one of the two uses is always broken.
 */
const SERVER_SIDE_GOOGLE_KEYS = ['GOOGLE_ROUTES_API_KEY', 'GOOGLE_WEATHER_API_KEY'];

/** Names that must never be exposed to the browser, however they are prefixed. */
const SECRET_SHAPED = /SECRET|PRIVATE|PASSWORD|SERVICE_ACCOUNT|CREDENTIAL/;

/** Values left over from copying the example file. */
const PLACEHOLDER = /^(YOUR_|your-|<|changeme)/i;

function parse(file: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [name, ...rest] = trimmed.split('=');
    values.set(name.trim(), rest.join('=').trim());
  }
  return values;
}

const problems: string[] = [];
const warnings: string[] = [];

if (!existsSync(ENV_LOCAL)) {
  console.error(`✖ No .env.local at the repo root. Copy .env.example to ${ENV_LOCAL}.`);
  process.exit(1);
}

const local = parse(ENV_LOCAL);
const example = parse(ENV_EXAMPLE);

// 1. Declared but absent — the file was copied before a variable was added.
for (const name of example.keys()) {
  if (!local.has(name)) warnings.push(`${name} is in .env.example but missing from .env.local`);
}

// 2. Present but empty, which reads as configured and is not.
for (const name of REQUIRED) {
  if (!local.has(name)) problems.push(`${name} is missing — a required variable`);
  else if (!local.get(name)) problems.push(`${name} is present but EMPTY`);
}

// 3. Still holding the example's placeholder.
for (const [name, value] of local) {
  if (value && PLACEHOLDER.test(value)) {
    problems.push(`${name} still holds a placeholder value from .env.example`);
  }
}

// 4. A secret exposed to the browser. The worst failure here, because it works.
for (const name of local.keys()) {
  if (name.startsWith('NEXT_PUBLIC_') && SECRET_SHAPED.test(name)) {
    problems.push(`${name} exposes a secret to the browser bundle — drop the NEXT_PUBLIC_ prefix`);
  }
}

// 5. The browser key reused server-side, or vice versa.
const browserKey = local.get('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
if (browserKey) {
  for (const name of SERVER_SIDE_GOOGLE_KEYS) {
    if (local.get(name) && local.get(name) === browserKey) {
      problems.push(
        `${name} is the same key as NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. ` +
          `These must differ: the browser key is HTTP-referrer restricted and is ` +
          `rejected server-side; an unrestricted key must never reach the browser.`
      );
    }
  }
}

// 6. CORS_ORIGINS in the comma form, which takes the backend down at startup.
const cors = local.get('CORS_ORIGINS');
if (cors && !cors.startsWith('[')) {
  problems.push(
    'CORS_ORIGINS must be a JSON array (["http://localhost:4790"]). pydantic-settings ' +
      'JSON-decodes it before any validator runs, so the comma form fails at startup.'
  );
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const problem of problems) console.error(`✖ ${problem}`);

if (problems.length === 0) {
  console.log(
    `✔ .env.local looks correct — ${local.size} variables, ${REQUIRED.length} required ones set.` +
      (warnings.length ? ` ${warnings.length} warning(s) above.` : '')
  );
  process.exit(0);
}

console.error(`\n${problems.length} problem(s) found.`);
process.exit(1);
