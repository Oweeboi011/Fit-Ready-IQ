import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ServiceStatus {
  ok: boolean;
  message: string;
}

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
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
  if (!val || val.startsWith("YOUR_") || val === "") {
    return { ok: false, message: `${key} not configured` };
  }
  return { ok: true, message: "configured" };
}

async function checkFirebaseAdmin(): Promise<ServiceStatus> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return { ok: false, message: "FIREBASE_PROJECT_ID not set" };

  const hasJson = !!(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON &&
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON.trim() !== ""
  );
  const hasKeyPair = !!(
    process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );

  if (!hasJson && !hasKeyPair) {
    return {
      ok: false,
      message:
        "No service account credentials — set FIREBASE_SERVICE_ACCOUNT_KEY_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY",
    };
  }

  // Attempt a live Firestore write to confirm credentials work
  try {
    const { getFirestoreAdmin } = await import("@/lib/firebaseAdmin");
    const db = getFirestoreAdmin();
    await db.collection("_health").doc("health-check").set(
      { updatedAt: new Date().toISOString(), source: "health-route" },
      { merge: true }
    );
    return { ok: true, message: `Firestore write OK (project: ${projectId})` };
  } catch (err) {
    return {
      ok: false,
      message: `Firestore write failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkWeather(): Promise<ServiceStatus> {
  const apiKey =
    process.env.OPENWEATHER_API_KEY ?? process.env.GOOGLE_WEATHER_API_KEY;
  if (!apiKey) return { ok: false, message: "OPENWEATHER_API_KEY not configured" };

  const baseUrl =
    process.env.OPENWEATHER_BASE_URL ??
    "https://api.openweathermap.org/data/2.5";
  // Lightweight ping: Manila coordinates
  const url = `${baseUrl}/weather?lat=14.5995&lon=120.9842&appid=${apiKey}&units=metric`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { ok: true, message: "OpenWeather API reachable" };
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      message: `OpenWeather responded ${res.status}: ${body.message ?? "unknown"}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `OpenWeather unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkGemini(): Promise<ServiceStatus> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("YOUR_")) {
    return { ok: false, message: "GEMINI_API_KEY not configured" };
  }
  // Validate key format — Gemini keys are 39 chars starting with "AIza"
  if (!apiKey.startsWith("AIza") || apiKey.length < 35) {
    return { ok: false, message: "GEMINI_API_KEY appears malformed" };
  }
  return { ok: true, message: "API key present and valid format" };
}

export async function GET() {
  const [firebaseAdmin, weather, gemini] = await Promise.all([
    checkFirebaseAdmin(),
    checkWeather(),
    checkGemini(),
  ]);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const maps: ServiceStatus =
    mapsKey && !mapsKey.startsWith("YOUR_")
      ? { ok: true, message: "API key present" }
      : { ok: false, message: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured" };

  const fbProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const firebase_client: ServiceStatus =
    fbProjectId && process.env.NEXT_PUBLIC_FIREBASE_API_KEY
      ? { ok: true, message: `Project: ${fbProjectId}` }
      : { ok: false, message: "NEXT_PUBLIC_FIREBASE_* vars missing" };

  const stravaId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const strava: ServiceStatus =
    stravaId && process.env.STRAVA_CLIENT_SECRET
      ? { ok: true, message: `Client ID: ${stravaId}` }
      : { ok: false, message: "NEXT_PUBLIC_STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET missing" };

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
  const status: HealthReport["status"] =
    failCount === 0 ? "healthy" : failCount <= 2 ? "degraded" : "unhealthy";

  const report: HealthReport = {
    status,
    timestamp: new Date().toISOString(),
    services,
  };

  return NextResponse.json(report, {
    status: status === "unhealthy" ? 503 : 200,
    headers: {
      // Never cache — always reflect live config state
      "Cache-Control": "no-store",
    },
  });
}
