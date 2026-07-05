import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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

function checkEnv(key: string): ServiceStatus {
  const val = process.env[key];
  if (!val || val.startsWith('YOUR_') || val === '') {
    return { ok: false, message: `${key} not configured` };
  }
  return { ok: true, message: 'configured' };
}

function checkFirebaseAdmin(): ServiceStatus {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return { ok: false, message: 'FIREBASE_PROJECT_ID not set' };

  const hasJson = !!(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON &&
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON.trim() !== ''
  );
  const hasKeyPair = !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

  if (!hasJson && !hasKeyPair) {
    return {
      ok: false,
      message:
        'No service account credentials — set FIREBASE_SERVICE_ACCOUNT_KEY_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY',
    };
  }

  return { ok: true, message: `Credentials present (project: ${projectId})` };
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
