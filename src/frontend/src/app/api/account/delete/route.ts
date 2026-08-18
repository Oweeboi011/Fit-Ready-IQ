import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

import { createLogger } from '@/lib/logger';
import { recordAudit } from '@/lib/auditLog';
import {
  getFirebaseAdminApp,
  getFirestoreAdmin,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { ACCOUNT_DELETE_RATE_LIMIT } from '@/lib/rateLimitRules';
import { requireUser } from '@/lib/serverAuth';
import {
  USER_KEYED_DOCUMENTS,
  USER_OWNED_COLLECTIONS,
  USER_OWNED_TREE_COLLECTIONS,
} from '@/lib/userDataFootprint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/delete
 * Header: `Authorization: Bearer <firebaseIdToken>`
 * Body:   { "confirm": "DELETE" }
 *
 * The GDPR Art. 17 erasure right. Irreversible, and there was no way to
 * exercise it before this — a user asking to be deleted had to be handled by
 * someone opening the Firebase console, which is neither auditable nor
 * something you can promise a customer in a DPA.
 *
 * Order matters and is deliberate: Firestore data first, the Auth account last.
 * Deleting the Auth record first would revoke the credential mid-run, and a
 * failure after that point would strand orphaned documents belonging to a uid
 * that can no longer sign in to retry. This way a partial failure leaves an
 * account that still works and can run it again, and the audit record says how
 * far it got.
 *
 * The uid comes from the verified token, never the body — the same rule as
 * every other user-scoped route, and the stakes here are as high as they get.
 */

/** Firestore caps a write batch at 500 operations. */
const DELETE_BATCH_SIZE = 500;

interface DeleteBody {
  confirm?: unknown;
}

export async function POST(request: Request) {
  const log = createLogger('/api/account/delete', request);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { uid } = auth.user;

  const limit = await rateLimit(request, ACCOUNT_DELETE_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  // An explicit confirmation string, so that a stray POST — a retried request,
  // a mis-wired button, a crawler following a form — cannot erase an account.
  // A valid session is authorisation; it is not intent.
  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (body.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Send {"confirm":"DELETE"} to confirm this irreversible action.' },
      { status: 400 }
    );
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: 'Deletion is unavailable because the data store is not configured.' },
      { status: 503 }
    );
  }

  const deleted: Record<string, number> = {};

  try {
    const db = getFirestoreAdmin();

    // The user document and everything beneath it — profile, saved_places,
    // strava_activities — in one walk. recursiveDelete is the only path that
    // reaches subcollections; a plain document delete would leave every saved
    // place and synced activity in place, addressable by uid, forever.
    await db.recursiveDelete(db.collection('users').doc(uid));
    deleted.user_tree = 1;

    for (const name of USER_OWNED_COLLECTIONS) {
      const snap = await db.collection(name).where('user_id', '==', uid).get();
      let count = 0;
      // Chunked: a batch takes at most 500 operations, and a heavy user can
      // exceed that in activities alone.
      for (let i = 0; i < snap.docs.length; i += DELETE_BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of snap.docs.slice(i, i + DELETE_BATCH_SIZE)) {
          batch.delete(doc.ref);
          count++;
        }
        await batch.commit();
      }
      deleted[name] = count;
    }

    for (const name of USER_OWNED_TREE_COLLECTIONS) {
      const snap = await db.collection(name).where('user_id', '==', uid).get();
      for (const doc of snap.docs) {
        // Recursive, because the transcript lives in a `messages` subcollection
        // that a document delete would orphan — and the transcript is the part
        // that actually holds what the person said.
        await db.recursiveDelete(doc.ref);
      }
      deleted[name] = snap.size;
    }

    // Documents keyed by uid outside the user tree — currently the Strava OAuth
    // tokens. A deleted account must not leave a live, non-expiring refresh
    // token behind; that is the worst possible remnant of an erasure.
    for (const name of USER_KEYED_DOCUMENTS) {
      await db.collection(name).doc(uid).delete();
      deleted[name] = 1;
    }

    // Last: the credential itself. Everything above is now unreachable.
    await getAuth(getFirebaseAdminApp()).deleteUser(uid);
    deleted.auth_account = 1;

    // Written after the account is gone and deliberately outlives it — this
    // record is the evidence the erasure happened, and it holds the uid and
    // these counters only, never any of the erased content.
    await recordAudit(request, {
      action: 'account.delete',
      actor: auth.user,
      target: uid,
      outcome: 'success',
      detail: deleted,
    });

    return NextResponse.json({ ok: true, uid, deleted });
  } catch (err) {
    log.error('account_delete_failed', err, { uid });
    // The partial counts go into the record: a half-finished erasure is the one
    // case where "what was removed before it failed" is the only useful fact.
    await recordAudit(request, {
      action: 'account.delete',
      actor: auth.user,
      target: uid,
      outcome: 'failure',
      detail: { ...deleted, reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown' },
    });
    return NextResponse.json(
      {
        error: 'Deletion did not complete. Nothing further was removed; please try again.',
        partial: deleted,
      },
      { status: 500 }
    );
  }
}
