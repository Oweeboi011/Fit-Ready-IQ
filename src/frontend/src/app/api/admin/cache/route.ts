import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { requireAdmin, requireRole } from '@/lib/adminAuth';
import { recordAudit } from '@/lib/auditLog';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const COLLECTION = 'places_cache';
const CACHE_TTL_HOURS = 24;

export interface CacheEntry {
  gridKey: string;
  ts: string;
  ageHours: number;
  fresh: boolean;
  routeCount: number;
  mountainCount: number;
  campsiteCount: number;
  location?: { lat: number; lng: number; address?: string };
}

/**
 * GET /api/admin/cache
 * Returns all entries in the places_cache collection with freshness info.
 */
export async function GET(request: NextRequest) {
  const log = createLogger('/api/admin/cache', request);
  // Cache freshness is operational telemetry about regions, not about people.
  const auth = await requireRole(request, 'viewer');
  if (!auth.ok) return auth.response;

  try {
    const db = getFirestoreAdmin();
    const snapshot = await db.collection(COLLECTION).get();

    const entries: CacheEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      const ts = data.ts as string;
      const ageHours = (Date.now() - new Date(ts).getTime()) / 3_600_000;
      return {
        gridKey: doc.id,
        ts,
        ageHours: Math.round(ageHours * 10) / 10,
        fresh: ageHours <= CACHE_TTL_HOURS,
        routeCount: Array.isArray(data.routes) ? data.routes.length : 0,
        mountainCount: Array.isArray(data.mountains) ? data.mountains.length : 0,
        campsiteCount: Array.isArray(data.campsites) ? data.campsites.length : 0,
        location: data.location ?? undefined,
      };
    });

    entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    return NextResponse.json({
      total: entries.length,
      fresh: entries.filter((e) => e.fresh).length,
      stale: entries.filter((e) => !e.fresh).length,
      entries,
    });
  } catch (err) {
    log.error('admin_cache_read_failed', err);
    return NextResponse.json({ error: 'Failed to read cache' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/cache
 * Query param ?gridKey=<key> — deletes a single entry.
 * No query params — purges the entire collection.
 */
export async function DELETE(request: NextRequest) {
  const log = createLogger('/api/admin/cache', request);
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const gridKey = searchParams.get('gridKey');

  try {
    const db = getFirestoreAdmin();

    if (gridKey) {
      await db.collection(COLLECTION).doc(gridKey).delete();
      await recordAudit(request, {
        action: 'admin.cache.purge',
        actor: auth.admin,
        target: gridKey,
        outcome: 'success',
        detail: { deleted: 1, scope: 'single' },
      });
      return NextResponse.json({ ok: true, deleted: 1 });
    }

    // Batch delete all documents
    const snapshot = await db.collection(COLLECTION).get();
    const BATCH_SIZE = 400;
    let deleted = 0;

    const chunks: (typeof snapshot.docs)[] = [];
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      chunks.push(snapshot.docs.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += chunk.length;
    }

    await recordAudit(request, {
      action: 'admin.cache.purge',
      actor: auth.admin,
      target: COLLECTION,
      outcome: 'success',
      detail: { deleted, scope: 'all' },
    });

    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    log.error('admin_cache_purge_failed', err, { gridKey: gridKey ?? 'all' });
    // A failed purge is recorded too: a half-completed batch delete leaves the
    // cache in a state somebody will need to reconstruct, and "it errored" is
    // the fact that explains it.
    await recordAudit(request, {
      action: 'admin.cache.purge',
      actor: auth.admin,
      target: gridKey ?? COLLECTION,
      outcome: 'failure',
      detail: { reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown' },
    });
    return NextResponse.json({ error: 'Failed to purge cache' }, { status: 500 });
  }
}
