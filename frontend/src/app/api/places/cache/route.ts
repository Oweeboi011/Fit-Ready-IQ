import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * Shared Places cache — Firestore collection: places_cache
 *
 * Grid key: lat/lng rounded to 0.5-degree (~55 km) cells so that all users
 * within a region share the same cached result set.
 *
 * TTL: 24 hours. After that the client falls through to live API calls.
 */
const CACHE_TTL_HOURS = 24;
const COLLECTION = "places_cache";

function gridKey(lat: number, lng: number): string {
  const gLat = Math.round(lat * 2) / 2;
  const gLng = Math.round(lng * 2) / 2;
  return `${gLat}_${gLng}`;
}

/**
 * GET /api/places/cache?lat=<lat>&lng=<lng>
 * Returns cached routes/mountains/campsites if fresh, otherwise 404.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  try {
    const db = getFirestoreAdmin();
    const doc = await db.collection(COLLECTION).doc(gridKey(lat, lng)).get();

    if (!doc.exists) {
      return NextResponse.json({ hit: false }, { status: 404 });
    }

    const data = doc.data()!;
    const ageHours = (Date.now() - new Date(data.ts as string).getTime()) / 3_600_000;

    if (ageHours > CACHE_TTL_HOURS) {
      return NextResponse.json({ hit: false }, { status: 404 });
    }

    return NextResponse.json({
      hit: true,
      routes: data.routes,
      mountains: data.mountains,
      campsites: data.campsites,
      location: data.location,
      ts: data.ts,
    });
  } catch (err) {
    // Firestore unavailable — caller falls back to live fetch
    console.warn("places/cache GET failed:", err);
    return NextResponse.json({ hit: false }, { status: 404 });
  }
}

/**
 * POST /api/places/cache
 * Body: { lat, lng, routes, mountains, campsites, location }
 * Writes to Firestore. Called after a successful live fetch.
 */
export async function POST(request: NextRequest) {
  let body: {
    lat: number;
    lng: number;
    routes: unknown;
    mountains: unknown;
    campsites: unknown;
    location: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { lat, lng, routes, mountains, campsites, location } = body;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng must be numbers" }, { status: 400 });
  }

  try {
    const db = getFirestoreAdmin();
    await db.collection(COLLECTION).doc(gridKey(lat, lng)).set({
      routes,
      mountains,
      campsites,
      location,
      ts: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("places/cache POST failed:", err);
    return NextResponse.json({ error: "Cache write failed" }, { status: 500 });
  }
}
