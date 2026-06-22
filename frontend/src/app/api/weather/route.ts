import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type OpenWeatherCurrent = {
  weather?: Array<{ main?: string; description?: string }>;
  main?: { temp?: number; humidity?: number };
  wind?: { speed?: number };
  rain?: { "1h"?: number };
  snow?: { "1h"?: number };
};

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeRisk(
  weather: OpenWeatherCurrent,
  elevationM: number | null,
): { best: string; avoid: string; temp: string; risk: string } {
  const condition = weather.weather?.[0]?.main?.toLowerCase() ?? "unknown";
  const desc = weather.weather?.[0]?.description ?? "n/a";
  const tempC = weather.main?.temp ?? null;
  const humidity = weather.main?.humidity ?? null;
  const windMps = weather.wind?.speed ?? 0;
  const windKph = Math.round(windMps * 3.6);
  const precipMm = (weather.rain?.["1h"] ?? 0) + (weather.snow?.["1h"] ?? 0);
  const highAltitude = elevationM !== null && elevationM >= 2500;

  const best = highAltitude ? "Nov - Feb (typically drier, clearer mornings)" : "Nov - Apr (typically drier conditions)";
  const avoid = highAltitude ? "Peak monsoon / storm windows" : "Heavy rain and thunderstorm windows";

  const tempLabel =
    tempC === null
      ? "n/a"
      : `${Math.round(tempC)}C`;

  const riskBits: string[] = [];
  if (windKph >= 35) riskBits.push(`High wind (${windKph} kph)`);
  if (precipMm >= 1) riskBits.push(`Active precipitation (${precipMm.toFixed(1)} mm/h)`);
  if (highAltitude && tempC !== null && tempC <= 5) riskBits.push("Cold summit exposure");
  if (humidity !== null && humidity >= 90) riskBits.push("Low visibility risk");
  if (condition.includes("thunder")) riskBits.push("Thunderstorm hazard");

  const risk =
    riskBits.length > 0
      ? `${riskBits.join("; ")}. Current: ${desc}.`
      : `Low immediate weather risk. Current: ${desc}.`;

  return {
    best,
    avoid,
    temp: tempLabel,
    risk,
  };
}

export async function GET(request: NextRequest) {
  const lat = toNumber(request.nextUrl.searchParams.get("lat"));
  const lng = toNumber(request.nextUrl.searchParams.get("lng"));
  const elevation = toNumber(request.nextUrl.searchParams.get("elevation"));

  if (lat === null || lng === null) {
    return NextResponse.json({ error: "Missing or invalid lat/lng" }, { status: 400 });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY ?? process.env.GOOGLE_WEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Weather service not configured" }, { status: 503 });
  }

  const baseUrl = process.env.OPENWEATHER_BASE_URL ?? "https://api.openweathermap.org/data/2.5";
  const endpoint = `${baseUrl}/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json(
        { error: "Weather provider request failed", details: errorBody.slice(0, 300) },
        { status: 502 },
      );
    }

    const data = (await res.json()) as OpenWeatherCurrent;
    const summary = summarizeRisk(data, elevation);

    return NextResponse.json({
      provider: "openweather",
      location: { lat, lng },
      current: {
        condition: data.weather?.[0]?.main ?? null,
        description: data.weather?.[0]?.description ?? null,
        tempC: data.main?.temp ?? null,
        humidity: data.main?.humidity ?? null,
        windKph: data.wind?.speed ? Math.round(data.wind.speed * 3.6) : null,
      },
      summary,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Weather route failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
