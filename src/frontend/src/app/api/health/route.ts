import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Deliberately still a credential-*presence* check, not a live probe.
 *
 * Proving ADC really works would mean fetching an access token, which is a
 * network round trip on an endpoint an uptime monitor hits every 15 minutes and
 * which is edge-cached for 30 s. `existsSync` keeps it honest and free.
 * `/api/integrations/firebase` remains the deep, admin-gated probe that actually
 * writes to Firestore.
 */

interface ServiceStatus {
  ok: boolean;
  message: string;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    maps: ServiceStatus;
    firebase_client: ServiceStatus;
    firebase_admin: ServiceStatus;
    gemini: ServiceStatus;
    weather: ServiceStatus;
    strava: ServiceStatus;
  };
}

/**
 * Where Application Default Credentials would come from, if anywhere.
 *
 * `src/lib/firebaseAdmin.ts` tries three credential sources in order — the
 * service-account JSON, the client-email/private-key pair, then
 * `applicationDefault()`. This check only knew about the first two, so a
 * deployment running on ADC reported `firebase_admin` as failed while Firestore
 * worked perfectly. That is not a cosmetic wrong answer: health returns 503 when
 * enough checks fail, and `uptime.yml` fails the run on a non-2xx — so a
 * correctly configured Cloud Run or GKE service using workload identity would
 * have been alarmed on continuously.
 */
function findAdcSource(): string | null {
  // An explicit pointer wins, exactly as the Google auth libraries treat it.
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicit && existsSync(explicit)) return 'GOOGLE_APPLICATION_CREDENTIALS';

  // The well-known file written by `gcloud auth application-default login`.
  const wellKnown =
    process.platform === 'win32'
      ? process.env.APPDATA && join(process.env.APPDATA, 'gcloud', WELL_KNOWN_ADC_FILE)
      : process.env.HOME && join(process.env.HOME, '.config', 'gcloud', WELL_KNOWN_ADC_FILE);
  if (wellKnown && existsSync(wellKnown)) return 'gcloud application-default login';

  // On Google infrastructure the metadata server supplies credentials and there
  // is no file to look for. These variables are set by the platform itself.
  if (process.env.K_SERVICE || process.env.GAE_ENV || process.env.FUNCTION_TARGET) {
    return 'GCP metadata server';
  }

  return null;
}

const WELL_KNOWN_ADC_FILE = 'application_default_credentials.json';

function checkFirebaseAdmin(): ServiceStatus {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return { ok: false, message: 'FIREBASE_PROJECT_ID not set' };

  const hasJson = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON?.trim();
  const hasKeyPair = !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

  // Reported in the same order firebaseAdmin.ts resolves them, so the message
  // names the credential the SDK will actually use rather than one that happens
  // to be present.
  if (hasJson) return { ok: true, message: `Service account JSON (project: ${projectId})` };
  if (hasKeyPair)
    return { ok: true, message: `Client email + private key (project: ${projectId})` };

  const adc = findAdcSource();
  if (adc) return { ok: true, message: `Application Default Credentials via ${adc}` };

  return {
    ok: false,
    message:
      'No credentials — set FIREBASE_SERVICE_ACCOUNT_KEY_JSON, or ' +
      'FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or run ' +
      '`gcloud auth application-default login` for local development',
  };
}

function checkWeather(): ServiceStatus {
  const googleKey = process.env.GOOGLE_WEATHER_API_KEY;
  const openWeatherKey = process.env.OPENWEATHER_API_KEY;

  if (!googleKey && !openWeatherKey) {
    return {
      ok: false,
      message: 'No weather API key configured (GOOGLE_WEATHER_API_KEY or OPENWEATHER_API_KEY)',
    };
  }

  return {
    ok: true,
    message: googleKey ? 'Google Weather API key present' : 'OpenWeather API key present',
  };
}

function checkGemini(): ServiceStatus {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('YOUR_')) {
    return { ok: false, message: 'GEMINI_API_KEY not configured' };
  }
  // Gemini keys are either AIza... (39 chars) or AQ... format from AI Studio
  if (apiKey.length < 20) {
    return { ok: false, message: 'GEMINI_API_KEY appears too short' };
  }
  return { ok: true, message: 'API key present' };
}

export function GET() {
  const firebaseAdmin = checkFirebaseAdmin();
  const weather = checkWeather();
  const gemini = checkGemini();

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const maps: ServiceStatus =
    mapsKey && !mapsKey.startsWith('YOUR_')
      ? { ok: true, message: 'API key present' }
      : { ok: false, message: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured' };

  const fbProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const firebase_client: ServiceStatus =
    fbProjectId && process.env.NEXT_PUBLIC_FIREBASE_API_KEY
      ? { ok: true, message: `Project: ${fbProjectId}` }
      : { ok: false, message: 'NEXT_PUBLIC_FIREBASE_* vars missing' };

  const stravaId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const strava: ServiceStatus =
    stravaId && process.env.STRAVA_CLIENT_SECRET
      ? { ok: true, message: `Client ID: ${stravaId}` }
      : { ok: false, message: 'NEXT_PUBLIC_STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET missing' };

  const services = {
    maps,
    firebase_client,
    firebase_admin: firebaseAdmin,
    gemini,
    weather,
    strava,
  };

  const values = Object.values(services);
  const failCount = values.filter((s) => !s.ok).length;
  const status: HealthReport['status'] =
    failCount === 0 ? 'healthy' : failCount <= 2 ? 'degraded' : 'unhealthy';

  const report: HealthReport = {
    status,
    timestamp: new Date().toISOString(),
    services,
  };

  return NextResponse.json(report, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: {
      // Edge-cache for 30 s — config rarely changes within a request burst
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10',
    },
  });
}
