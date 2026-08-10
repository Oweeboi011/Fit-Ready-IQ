import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

import { getFirebaseAdminApp } from './firebaseAdmin';

/**
 * Server-side admin gate.
 *
 * The allowlist lives in `ADMIN_EMAILS` (comma-separated) and is deliberately
 * NOT a `NEXT_PUBLIC_` variable — shipping the list of admin addresses to every
 * browser would hand an attacker the exact accounts worth phishing. The client
 * learns whether it is an admin by asking `/api/admin/whoami`, never by reading
 * the list itself.
 */

function getAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const allowlist = getAllowlist();
  // An empty allowlist denies everyone. Failing closed means a missing env var
  // in a new environment locks the console rather than opening it to the world.
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.toLowerCase());
}

export interface AdminIdentity {
  uid: string;
  email: string;
}

type AdminCheck = { ok: true; admin: AdminIdentity } | { ok: false; response: NextResponse };

function deny(status: number, message: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

/**
 * Verifies the `Authorization: Bearer <firebaseIdToken>` header and checks the
 * caller against the allowlist. Route handlers should return `result.response`
 * unchanged when `ok` is false.
 */
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return deny(401, 'Missing bearer token.');
  }

  let decoded;
  try {
    decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(token);
  } catch {
    // Never echo the verification error back — it distinguishes "expired" from
    // "forged", which is free information for someone probing the endpoint.
    return deny(401, 'Invalid or expired token.');
  }

  if (!isAdminEmail(decoded.email)) {
    return deny(403, 'Not authorised.');
  }

  return { ok: true, admin: { uid: decoded.uid, email: decoded.email as string } };
}
