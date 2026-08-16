import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

import { getFirebaseAdminApp } from './firebaseAdmin';

/**
 * Server-side identity gate.
 *
 * Every route that reads or writes data belonging to a particular user has to
 * learn *which* user from a credential the caller cannot forge. A `uid` in the
 * request body is not that: it is an assertion by the caller, and the Admin SDK
 * bypasses Firestore rules, so a route that trusts it will happily write into a
 * stranger's collection on request.
 *
 * The only acceptable source is a Firebase ID token, verified here.
 * `requireAdmin` in ./adminAuth.ts layers the allowlist on top of this.
 */

export interface VerifiedUser {
  uid: string;
  email: string | null;
}

export type AuthResult<TIdentity> =
  | { ok: true; user: TIdentity }
  | { ok: false; response: NextResponse };

export function deny(status: number, message: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

/**
 * Verifies `Authorization: Bearer <firebaseIdToken>` and returns the caller.
 *
 * `checkRevoked` costs a lookup but means signing out — or an admin disabling a
 * compromised account — takes effect now rather than whenever the hour-long
 * token happens to expire.
 */
/**
 * The caller, when there is one, and null otherwise.
 *
 * For endpoints that serve signed-out visitors but should still attribute their
 * work when a session exists — `/api/chat` persists transcripts either way, and
 * stamping the uid when it is available is what makes those transcripts
 * erasable later. Never refuses: an absent or bad token is simply "anonymous",
 * because on these routes it is not an error.
 *
 * Do not reach for this to guard user-scoped writes. `requireUser` is the gate;
 * this is attribution.
 */
export async function optionalUser(request: Request): Promise<VerifiedUser | null> {
  const result = await requireUser(request);
  return result.ok ? result.user : null;
}

export async function requireUser(request: Request): Promise<AuthResult<VerifiedUser>> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return deny(401, 'Missing bearer token.');
  }

  try {
    const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(token, true);
    return { ok: true, user: { uid: decoded.uid, email: decoded.email ?? null } };
  } catch {
    // Never echo the verification error back — it distinguishes "expired" from
    // "revoked" from "forged", which is free information for someone probing.
    return deny(401, 'Invalid or expired token.');
  }
}
