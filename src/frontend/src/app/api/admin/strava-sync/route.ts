import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { requireRole } from '@/lib/adminAuth';
import { recordAudit } from '@/lib/auditLog';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

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

export async function GET(request: Request) {
  const log = createLogger('/api/admin/strava-sync', request);
  // Operational health, not personal data — uids and sync counters only — so a
  // viewer can watch it without also holding the destructive controls.
  const auth = await requireRole(request, 'viewer');
  if (!auth.ok) return auth.response;

  try {
    const db = getFirestoreAdmin();
    const usersSnapshot = await db.collection('users').get();

    const entries: StravaSyncEntry[] = [];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const syncManifest = data.strava_sync as
        | {
            last_synced_at?: string;
            total_activities?: number;
            errors?: string[] | null;
          }
        | undefined;

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

    // A cross-user read: this walks every user document in the product, so it
    // is recorded even on success.
    await recordAudit(request, {
      action: 'admin.strava_sync.read',
      actor: auth.admin,
      target: 'users',
      outcome: 'success',
      detail: { scanned: usersSnapshot.size, returned: entries.length },
    });

    return NextResponse.json({ total: entries.length, entries });
  } catch (err) {
    log.error('admin_strava_sync_read_failed', err);
    return NextResponse.json({ error: 'Failed to read sync status' }, { status: 500 });
  }
}
