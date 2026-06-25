import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSummary(opts: {
  conditionType: string;
  description: string;
  tempC: number | null;
  humidity: number | null;
  windKph: number;
  precipMm: number;
  thunderPct: number;
  elevationM: number | null;
}): { best: string; avoid: string; temp: string; risk: string } {
  const { conditionType, description, tempC, humidity, windKph, precipMm, thunderPct, elevationM } = opts;
  const highAltitude = elevationM !== null && elevationM >= 2500;

  const best = highAltitude
    ? "Nov - Feb (typically drier, clearer mornings)"
    : "Nov - Apr (typically drier conditions)";
  const avoid = highAltitude ? "Peak monsoon / storm windows" : "Heavy rain and thunderstorm windows";
  const temp = tempC === null ? "n/a" : `${Math.round(tempC)}C`;

  const riskBits: string[] = [];
  if (windKph >= 35) riskBits.push(`High wind (${windKph} kph)`);
  if (precipMm >= 1) riskBits.push(`Active precipitation (${precipMm.toFixed(1)} mm/h)`);
  if (highAltitude && tempC !== null && tempC <= 5) riskBits.push("Cold summit exposure");
  if (humidity !== null && humidity >= 90) riskBits.push("Low visibility risk");
  if (thunderPct >= 20 || conditionType.includes("thunder") || conditionType.includes("THUNDERSTORM"))
    riskBits.push(`Thunderstorm risk (${thunderPct}%)`);

  const risk =
    riskBits.length > 0
      ? `${riskBits.join("; ")}. Current: ${description}.`
      : `Low immediate weather risk. Current: ${description}.`;

  return { best, avoid, temp, risk };
}

// ── Google Weather API (Maps Platform) ───────────────────────────────────────
type GoogleWeatherCurrent = {
  weatherCondition?: { description?: { text?: string }; type?: string };
  temperature?: { degrees?: number };
  humidity?: number;
  wind?: { speed?: { value?: number; unit?: string } };
  precipitation?: { qpf?: { quantity?: number } };
  thunderstormProbability?: number;
};

async function fetchGoogleWeather(
  apiKey: string,
  lat: number,
  lng: number,
  elevation: number | null,
) {
  const endpoint =
    `https://weather.googleapis.com/v1/currentConditions:lookup` +
    `?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&languageCode=en`;

  const res = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Weather ${res.status}: ${body.slice(0, 200)}`);
  }

  // Response may be top-level or wrapped in currentConditions
  const raw = (await res.json()) as GoogleWeatherCurrent & { currentConditions?: GoogleWeatherCurrent };
  const d: GoogleWeatherCurrent = raw.currentConditions ?? raw;

  const condType = d.weatherCondition?.type ?? "";
  const desc = d.weatherCondition?.description?.text ?? (condType.toLowerCase().replace(/_/g, " ") || "n/a");
  const tempC = d.temperature?.degrees ?? null;
  const humidity = d.humidity ?? null;
  const windKph = d.wind?.speed?.unit === "KPH"
    ? (d.wind.speed.value ?? 0)
    : Math.round((d.wind?.speed?.value ?? 0) * 1.60934); // convert MPH→KPH if needed
  const precipMm = d.precipitation?.qpf?.quantity ?? 0;
  const thunderPct = d.thunderstormProbability ?? 0;

  const summary = buildSummary({ conditionType: condType, description: desc, tempC, humidity, windKph, precipMm, thunderPct, elevationM: elevation });

  return {
    provider: "google-weather",
    location: { lat, lng },
    current: { condition: condType, description: desc, tempC, humidity, windKph },
    summary,
    fetchedAt: new Date().toISOString(),
  };
}

// ── OpenWeather API (fallback) ────────────────────────────────────────────────
type OpenWeatherCurrent = {
  weather?: Array<{ main?: string; description?: string }>;
  main?: { temp?: number; humidity?: number };
  wind?: { speed?: number };
  rain?: { "1h"?: number };
  snow?: { "1h"?: number };
};

async function fetchOpenWeather(
  apiKey: string,
  lat: number,
  lng: number,
  elevation: number | null,
) {
  const baseUrl = process.env.OPENWEATHER_BASE_URL ?? "https://api.openweathermap.org/data/2.5";
  const endpoint = `${baseUrl}/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;

  const res = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenWeather ${res.status}: ${body.slice(0, 200)}`);
  }

  const d = (await res.json()) as OpenWeatherCurrent;
  const condType = d.weather?.[0]?.main ?? "";
  const desc = d.weather?.[0]?.description ?? "n/a";
  const tempC = d.main?.temp ?? null;
  const humidity = d.main?.humidity ?? null;
  const windKph = d.wind?.speed ? Math.round(d.wind.speed * 3.6) : 0;
  const precipMm = (d.rain?.["1h"] ?? 0) + (d.snow?.["1h"] ?? 0);

  const summary = buildSummary({ conditionType: condType.toLowerCase(), description: desc, tempC, humidity, windKph, precipMm, thunderPct: 0, elevationM: elevation });

  return {
    provider: "openweather",
    location: { lat, lng },
    current: { condition: condType, description: desc, tempC, humidity, windKph },
    summary,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const lat = toNumber(request.nextUrl.searchParams.get("lat"));
  const lng = toNumber(request.nextUrl.searchParams.get("lng"));
  const elevation = toNumber(request.nextUrl.searchParams.get("elevation"));

  if (lat === null || lng === null) {
    return NextResponse.json({ error: "Missing or invalid lat/lng" }, { status: 400 });
  }

  const googleKey = process.env.GOOGLE_WEATHER_API_KEY;
  const openWeatherKey = process.env.OPENWEATHER_API_KEY;

  if (!googleKey && !openWeatherKey) {
    return NextResponse.json({ error: "Weather service not configured" }, { status: 503 });
  }

  try {
    // Prefer Google Weather API when its key is configured
    if (googleKey) {
      const result = await fetchGoogleWeather(googleKey, lat, lng, elevation);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=300" },
      });
    }

    const result = await fetchOpenWeather(openWeatherKey!, lat, lng, elevation);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=300" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Weather route failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
