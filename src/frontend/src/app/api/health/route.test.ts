import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `firebase_admin` check reported failure whenever the two service-account
 * variables were absent, even though `src/lib/firebaseAdmin.ts` falls back to
 * Application Default Credentials and Firestore worked fine that way.
 *
 * That mattered beyond cosmetics: health answers 503 once enough checks fail and
 * `uptime.yml` fails the run on a non-2xx, so a correctly configured Cloud Run
 * or GKE deployment using workload identity would have alarmed continuously.
 *
 * These drive a real temporary directory rather than mocking `node:fs`. Mocking
 * it proved unreliable across `vi.resetModules()` — some module instances got
 * the stub and some the real thing — and the honest version is better anyway:
 * it exercises the actual path construction, including the platform split
 * between `%APPDATA%` and `$HOME`.
 */

let sandbox: string;

/** Where the route looks for the gcloud-written ADC file on this platform. */
function adcHomeVar(): 'APPDATA' | 'HOME' {
  return process.platform === 'win32' ? 'APPDATA' : 'HOME';
}

/** Creates the well-known ADC file inside the sandbox and points the env at it. */
function writeWellKnownAdc(): void {
  const dir =
    process.platform === 'win32' ? join(sandbox, 'gcloud') : join(sandbox, '.config', 'gcloud');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'application_default_credentials.json'), '{}');
}

async function health(): Promise<Record<string, { ok: boolean; message: string }>> {
  vi.resetModules();
  const { GET } = await import('./route');
  return (await (GET() as Response).json()).services;
}

const ORIGINAL = { ...process.env };

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'fri-health-'));

  for (const key of Object.keys(process.env)) {
    if (/^(FIREBASE_|NEXT_PUBLIC_|GOOGLE_|GEMINI_|OPENWEATHER_|STRAVA_)/.test(key)) {
      delete process.env[key];
    }
  }
  delete process.env.K_SERVICE;
  delete process.env.GAE_ENV;
  delete process.env.FUNCTION_TARGET;

  // Point the ADC lookup at an empty sandbox so the developer's real
  // ~/.config/gcloud file cannot make these tests pass by accident.
  process.env[adcHomeVar()] = sandbox;
  process.env.FIREBASE_PROJECT_ID = 'fit-ready-iq';
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  process.env = { ...ORIGINAL };
});

describe('firebase_admin credential detection', () => {
  it('fails when the project id is missing, which nothing can work without', async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(false);
    expect(firebase_admin.message).toContain('FIREBASE_PROJECT_ID');
  });

  it('accepts the service account JSON', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON = '{"project_id":"x"}';
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(true);
    expect(firebase_admin.message).toContain('Service account JSON');
  });

  it('ignores a whitespace-only JSON value', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON = '   ';
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(false);
  });

  it('accepts the client email and private key pair', async () => {
    process.env.FIREBASE_CLIENT_EMAIL = 'sa@example.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----';
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(true);
    expect(firebase_admin.message).toContain('Client email');
  });

  it('accepts ADC from GOOGLE_APPLICATION_CREDENTIALS when the file exists', async () => {
    const keyFile = join(sandbox, 'sa.json');
    writeFileSync(keyFile, '{}');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(true);
    expect(firebase_admin.message).toContain('GOOGLE_APPLICATION_CREDENTIALS');
  });

  it('rejects GOOGLE_APPLICATION_CREDENTIALS pointing at a missing file', async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = join(sandbox, 'does-not-exist.json');
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(false);
  });

  it('accepts the well-known gcloud ADC file — the local-dev case that regressed', async () => {
    writeWellKnownAdc();
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(true);
    expect(firebase_admin.message).toContain('gcloud');
  });

  it('accepts the GCP metadata server, where there is no file to find', async () => {
    process.env.K_SERVICE = 'fit-ready-iq-api'; // set by Cloud Run
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(true);
    expect(firebase_admin.message).toContain('metadata');
  });

  it('fails with actionable advice when there is genuinely nothing', async () => {
    const { firebase_admin } = await health();
    expect(firebase_admin.ok).toBe(false);
    expect(firebase_admin.message).toContain('gcloud auth application-default login');
  });

  it('prefers the JSON over ADC, matching the SDK resolution order', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON = '{"project_id":"x"}';
    writeWellKnownAdc();
    const { firebase_admin } = await health();
    expect(firebase_admin.message).toContain('Service account JSON');
  });
});

describe('overall status', () => {
  it('answers 503 when almost nothing is configured', async () => {
    vi.resetModules();
    const { GET } = await import('./route');
    expect((GET() as Response).status).toBe(503);
  });

  it('answers 200 and healthy once everything is present', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON = '{"project_id":"x"}';
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'AIzaKEY';
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'fit-ready-iq';
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'AIzaKEY';
    process.env.GEMINI_API_KEY = 'AIzaSyLongEnoughToPassTheLengthCheck';
    // Distinct from the browser key on purpose: reusing that one is the
    // misconfiguration checkRouting/checkWeather exist to catch.
    process.env.GOOGLE_ROUTES_API_KEY = 'AIzaSERVERKEY';
    process.env.GOOGLE_WEATHER_API_KEY = 'AIzaSERVERKEY';
    process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID = '260217';
    process.env.STRAVA_CLIENT_SECRET = 'secret';

    vi.resetModules();
    const { GET } = await import('./route');
    const res = GET() as Response;
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('healthy');
  });
});

describe('browser key reused server-side', () => {
  const BROWSER = 'AIzaBROWSERKEY';

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = BROWSER;
  });

  it('rejects a routes key that is really the browser key', async () => {
    // The exact mistake that produced "Requests from referer <empty> are
    // blocked": a valid key, present, and unusable from a server.
    process.env.GOOGLE_ROUTES_API_KEY = BROWSER;
    const { routing } = await health();
    expect(routing.ok).toBe(false);
    expect(routing.message).toContain('referrer restriction');
  });

  it('accepts a distinct dedicated routes key', async () => {
    process.env.GOOGLE_ROUTES_API_KEY = 'AIzaSERVERKEY';
    const { routing } = await health();
    expect(routing.ok).toBe(true);
  });

  it('warns when routing silently falls back to the browser key', async () => {
    delete process.env.GOOGLE_ROUTES_API_KEY;
    const { routing } = await health();
    expect(routing.ok).toBe(false);
    expect(routing.message).toContain('falling back');
  });

  it('rejects a weather key that is really the browser key', async () => {
    process.env.GOOGLE_WEATHER_API_KEY = BROWSER;
    const { weather } = await health();
    expect(weather.ok).toBe(false);
    expect(weather.message).toContain('referrer restriction');
  });

  it('still passes weather when OpenWeather can carry the fallback', async () => {
    process.env.GOOGLE_WEATHER_API_KEY = BROWSER;
    process.env.OPENWEATHER_API_KEY = 'ow-key';
    const { weather } = await health();
    expect(weather.ok).toBe(true);
  });
});
