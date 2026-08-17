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
    routing: ServiceStatus;
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

/**
 * Catches the configuration mistake a presence check would otherwise miss: a
 * server-side variable and the browser variable holding the *same* key.
 *
 * Both values are then perfectly valid keys and both variables are populated, so
 * presence is satisfied while one of the two uses is guaranteed to be wrong —
 * either a referrer-restricted key rejected server-side with 403 "Requests from
 * referer <empty> are blocked", or an unrestricted key compiled into the client
 * bundle for anyone to lift.
 *
 * Worth doing here precisely because it costs nothing: it is string equality,
 * not a network round trip.
 */
function sharesKeyWithBrowser(key: string | undefined): boolean {
  const publicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return !!key?.trim() && !!publicKey && key.trim() === publicKey;
}

/**
 * Deliberately says "the same key as" rather than naming which one is wrong.
 *
 * Equality is all this check can see, and it happens in both directions: a
 * browser key copied into the server slot (rejected server-side for having a
 * referrer restriction), or a server key copied into `NEXT_PUBLIC_…` — which is
 * worse, because that one is compiled into the client bundle and an unrestricted
 * key published to every visitor is a spending liability, not just a broken map.
 * Claiming it is the browser key sent someone looking in the wrong place.
 */
const SHARED_KEY_ADVICE =
  'is the same key as NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. These must be two ' +
  'different keys: the browser one HTTP-referrer restricted, the server one with ' +
  'no referrer restriction. A referrer-restricted key is rejected server-side, ' +
  'and an unrestricted key must never be exposed to the browser.';

function checkWeather(): ServiceStatus {
  const googleKey = process.env.GOOGLE_WEATHER_API_KEY;
  const openWeatherKey = process.env.OPENWEATHER_API_KEY;

  if (!googleKey && !openWeatherKey) {
    return {
      ok: false,
      message: 'No weather API key configured (GOOGLE_WEATHER_API_KEY or OPENWEATHER_API_KEY)',
    };
  }

  if (sharesKeyWithBrowser(googleKey) && !openWeatherKey) {
    return { ok: false, message: `GOOGLE_WEATHER_API_KEY ${SHARED_KEY_ADVICE}` };
  }

  return {
    ok: true,
    message: googleKey ? 'Google Weather API key present' : 'OpenWeather API key present',
  };
}

/**
 * Routing was not reported at all, so a misconfigured planner was invisible here
 * — the only signal was a 503 at the moment a user dragged a waypoint.
 */
function checkRouting(): ServiceStatus {
  const routesKey = process.env.GOOGLE_ROUTES_API_KEY?.trim();

  if (sharesKeyWithBrowser(routesKey)) {
    return { ok: false, message: `GOOGLE_ROUTES_API_KEY ${SHARED_KEY_ADVICE}` };
  }

  if (routesKey) return { ok: true, message: 'Dedicated Routes API key present' };

  // Falling back to the public key is only viable if that key is unrestricted,
  // which it should not be — so say it is unlikely to work rather than "fine".
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()) {
    return {
      ok: false,
      message:
        'No GOOGLE_ROUTES_API_KEY; falling back to the browser key, which will be ' +
        'rejected server-side unless it has no referrer restriction',
    };
  }

  return { ok: false, message: 'GOOGLE_ROUTES_API_KEY not configured' };
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
  const routing = checkRouting();
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
    routing,
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
