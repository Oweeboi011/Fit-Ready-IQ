import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

import { createLogger } from '@/lib/logger';
import { recordAudit } from '@/lib/auditLog';
import { getFirebaseAdminApp, getFirestoreAdmin, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { ACCOUNT_EXPORT_RATE_LIMIT } from '@/lib/rateLimitRules';
import { requireUser } from '@/lib/serverAuth';
import {
  RETAINED_ON_DELETE,
  UNATTRIBUTED_LEGACY_DATA,
  USER_OWNED_COLLECTIONS,
  USER_OWNED_TREE_COLLECTIONS,
  USER_SUBCOLLECTIONS,
} from '@/lib/userDataFootprint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/account/export
 * Header: `Authorization: Bearer <firebaseIdToken>`
 *
 * Everything we hold about the calling user, as one JSON document.
 *
 * This is the GDPR Art. 15 / CCPA access right, and there was no way to
 * exercise it — not through the product, not through the admin console, not
 * without someone opening the Firebase console and reading collections by hand.
 * For an enterprise buyer that is a procurement blocker; for a user it is a
 * right they were owed and could not use.
 *
 * The uid comes from the verified token and is never accepted from the caller.
 * That is the whole security model of this endpoint: an export route that took
 * a uid parameter would be a one-request dump of any account in the system.
 */

/** Firestore Timestamps and friends do not survive JSON.stringify legibly. */
function serialisable(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  // Firestore Timestamp — duck-typed rather than imported, so this keeps working
  // if a field was written as a plain object by an older code path.
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const ts = value as { toDate?: () => Date };
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serialisable);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialisable(v)])
    );
  }
  return value;
}

/**
 * Walks the data footprint and assembles the whole record.
 *
 * Split out from the handler so the traversal reads as one thing: this is the
 * half that has to stay in step with `userDataFootprint.ts`, and it should be
 * possible to check it against the deletion path without also reading through
 * auth, rate limiting and response shaping.
 */
async function gatherUserData(uid: string): Promise<Record<string, unknown>> {
  const db = getFirestoreAdmin();
  const data: Record<string, unknown> = {};

  // The account record itself, from Firebase Auth rather than Firestore —
  // email, provider and sign-in history live there and nowhere else.
  const authUser = await getAuth(getFirebaseAdminApp()).getUser(uid);
  data.account = {
    uid: authUser.uid,
    email: authUser.email ?? null,
    displayName: authUser.displayName ?? null,
    photoURL: authUser.photoURL ?? null,
    emailVerified: authUser.emailVerified,
    providers: authUser.providerData.map((p) => p.providerId),
    createdAt: authUser.metadata.creationTime ?? null,
    lastSignInAt: authUser.metadata.lastSignInTime ?? null,
  };

  const userDoc = await db.collection('users').doc(uid).get();
  data.profile = userDoc.exists ? serialisable(userDoc.data()) : null;

  for (const name of USER_SUBCOLLECTIONS) {
    const snap = await db.collection('users').doc(uid).collection(name).get();
    data[name] = snap.docs.map((d) => ({ id: d.id, ...(serialisable(d.data()) as object) }));
  }

  for (const name of USER_OWNED_COLLECTIONS) {
    const snap = await db.collection(name).where('user_id', '==', uid).get();
    data[name] = snap.docs.map((d) => ({ id: d.id, ...(serialisable(d.data()) as object) }));
  }

  for (const name of USER_OWNED_TREE_COLLECTIONS) {
    const snap = await db.collection(name).where('user_id', '==', uid).get();
    const sessions = [];
    for (const doc of snap.docs) {
      // The transcript lives in a subcollection, so it needs its own read —
      // exporting the session document alone would return metadata and omit
      // every word the person actually wrote.
      const messages = await doc.ref.collection('messages').orderBy('createdAt').get();
      sessions.push({
        id: doc.id,
        ...(serialisable(doc.data()) as object),
        messages: messages.docs.map((m) => serialisable(m.data())),
      });
    }
    data[name] = sessions;
  }

  return data;
}

export async function GET(request: Request) {
  const log = createLogger('/api/account/export', request);
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { uid } = auth.user;

  const limit = await rateLimit(request, ACCOUNT_EXPORT_RATE_LIMIT);
  if (!limit.ok) return tooManyRequests(limit);

  if (!isFirebaseAdminConfigured()) {
    // Unlike the places cache, "not configured" is not a soft miss here. Handing
    // back an empty export would read as "we hold nothing about you", which is
    // a false answer to a legal question.
    return NextResponse.json(
      { error: 'Export is unavailable because the data store is not configured.' },
      { status: 503 }
    );
  }

  try {
    const data = await gatherUserData(uid);

    await recordAudit(request, {
      action: 'account.export',
      actor: auth.user,
      target: uid,
      outcome: 'success',
    });

    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        uid,
        data,
        // Said out loud in the export itself, because an access request is
        // answered by what we hold *and* by what we do not.
        notes: {
          notIncluded: RETAINED_ON_DELETE,
          legacyChatTranscripts: UNATTRIBUTED_LEGACY_DATA,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          // Names the file if the browser saves it, without making the response
          // an unconditional download for a programmatic caller.
          'Content-Disposition': `inline; filename="fit-ready-iq-export-${uid}.json"`,
        },
      }
    );
  } catch (err) {
    log.error('account_export_failed', err, { uid });
    await recordAudit(request, {
      action: 'account.export',
      actor: auth.user,
      target: uid,
      outcome: 'failure',
      detail: { reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown' },
    });
    return NextResponse.json({ error: 'Could not assemble your export.' }, { status: 500 });
  }
}
