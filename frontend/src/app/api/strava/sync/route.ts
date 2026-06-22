import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/strava/sync
 *
 * Fetches ALL historical activities from Strava (all pages) for the authenticated
 * user and upserts them into Firestore under:
 *   users/{uid}/strava_activities/{strava_activity_id}
 *
 * Body: { token: string; uid: string }
 *
 * - Uses the Strava API server-side so the token never reaches the browser network layer.
 * - Idempotent: re-running will update existing docs, not create duplicates.
 * - Returns a summary: { synced, skipped, total }
 */

interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  distance: number;
  total_elevation_gain: number;
  moving_time: number;
  elapsed_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number;
  max_speed?: number;
  calories?: number;
  kudos_count?: number;
  achievement_count?: number;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  map?: {
    id: string;
    summary_polyline?: string;
    resource_state: number;
  };
  type: string;
  workout_type?: number | null;
  location_city?: string | null;
  location_country?: string | null;
  visibility?: string;
  gear_id?: string | null;
  flagged?: boolean;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
}

const MAX_PAGES = 10; // cap at 300 activities (10 × 30) per sync
const PER_PAGE = 30;
const COLLECTION = "strava_activities";

export async function POST(request: NextRequest) {
  let token: string;
  let uid: string;

  try {
    const body = await request.json();
    token = body.token;
    uid = body.uid;
    if (!token || typeof token !== "string") throw new Error("missing token");
    if (!uid || typeof uid !== "string") throw new Error("missing uid");
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid request body: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 }
    );
  }

  const db = getFirestoreAdmin();
  const collectionRef = db.collection("users").doc(uid).collection(COLLECTION);

  let totalFetched = 0;
  let synced = 0;
  const errors: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    let activities: StravaActivity[];

    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${PER_PAGE}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 0 },
        }
      );

      if (res.status === 401) {
        return NextResponse.json({ error: "Strava token expired or invalid" }, { status: 401 });
      }

      if (!res.ok) {
        errors.push(`Page ${page}: Strava API error ${res.status}`);
        break;
      }

      activities = (await res.json()) as StravaActivity[];
    } catch (err) {
      errors.push(`Page ${page}: fetch failed — ${err instanceof Error ? err.message : "unknown"}`);
      break;
    }

    if (!activities || activities.length === 0) break;

    totalFetched += activities.length;

    // Batch-write to Firestore (max 500 ops per batch; we use ≤30 per iteration)
    const batch = db.batch();
    for (const act of activities) {
      const docRef = collectionRef.doc(String(act.id));
      batch.set(
        docRef,
        {
          strava_id: act.id,
          name: act.name,
          sport_type: act.sport_type ?? act.type,
          start_date: act.start_date,
          distance_km: act.distance / 1000,
          elevation_gain_m: Math.round(act.total_elevation_gain),
          moving_time_s: act.moving_time,
          elapsed_time_s: act.elapsed_time,
          avg_heartrate: act.average_heartrate ?? null,
          max_heartrate: act.max_heartrate ?? null,
          avg_speed_ms: act.average_speed ?? null,
          max_speed_ms: act.max_speed ?? null,
          calories: act.calories ?? null,
          kudos_count: act.kudos_count ?? 0,
          achievement_count: act.achievement_count ?? 0,
          start_latlng: act.start_latlng ?? null,
          end_latlng: act.end_latlng ?? null,
          summary_polyline: act.map?.summary_polyline ?? null,
          location_city: act.location_city ?? null,
          location_country: act.location_country ?? null,
          visibility: act.visibility ?? "everyone",
          trainer: act.trainer ?? false,
          commute: act.commute ?? false,
          manual: act.manual ?? false,
          gear_id: act.gear_id ?? null,
          synced_at: new Date().toISOString(),
        },
        { merge: true } // idempotent upsert
      );
      synced++;
    }

    try {
      await batch.commit();
    } catch (err) {
      errors.push(`Batch write failed on page ${page}: ${err instanceof Error ? err.message : "unknown"}`);
      // Continue — partial sync is better than nothing
    }

    // Strava paginates 30 per page; if we got fewer, we're done
    if (activities.length < PER_PAGE) break;
  }

  // Write a sync-manifest doc so the admin page can report sync status
  try {
    await db.collection("users").doc(uid).set(
      {
        strava_sync: {
          last_synced_at: new Date().toISOString(),
          total_activities: synced,
          errors: errors.length > 0 ? errors.slice(0, 5) : null,
        },
      },
      { merge: true }
    );
  } catch { /* non-critical */ }

  return NextResponse.json({
    ok: true,
    total_fetched: totalFetched,
    synced,
    errors: errors.length > 0 ? errors : undefined,
  });
}
