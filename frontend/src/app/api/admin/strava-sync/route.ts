import { NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/admin/strava-sync
 *
 * Returns Strava sync status for all users who have a strava_sync manifest.
 * Reads from: users/{uid}.strava_sync + count of users/{uid}/strava_activities
 */

export interface StravaSyncEntry {
  uid: string;
  last_synced_at: string | null;
  total_activities: number;
  errors: string[] | null;
}

export async function GET() {
  try {
    const db = getFirestoreAdmin();
    const usersSnapshot = await db.collection("users").get();

    const entries: StravaSyncEntry[] = [];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const syncManifest = data.strava_sync as {
        last_synced_at?: string;
        total_activities?: number;
        errors?: string[] | null;
      } | undefined;

      if (!syncManifest) continue; // user has never synced Strava

      entries.push({
        uid: doc.id,
        last_synced_at: syncManifest.last_synced_at ?? null,
        total_activities: syncManifest.total_activities ?? 0,
        errors: syncManifest.errors ?? null,
      });
    }

    entries.sort((a, b) => {
      if (!a.last_synced_at) return 1;
      if (!b.last_synced_at) return -1;
      return new Date(b.last_synced_at).getTime() - new Date(a.last_synced_at).getTime();
    });

    return NextResponse.json({ total: entries.length, entries });
  } catch (err) {
    console.error("admin/strava-sync GET error:", err);
    return NextResponse.json({ error: "Failed to read sync status" }, { status: 500 });
  }
}
