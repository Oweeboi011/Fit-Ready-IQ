import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

import { recordAudit } from './auditLog';
import { getFirebaseAdminApp } from './firebaseAdmin';
import { deny } from './serverAuth';

/**
 * Server-side admin gate, and the role vocabulary it enforces.
 *
 * The allowlist lives in `ADMIN_EMAILS` (comma-separated) and is deliberately
 * NOT a `NEXT_PUBLIC_` variable — shipping the list of admin addresses to every
 * browser would hand an attacker the exact accounts worth phishing. The client
 * learns whether it is an admin by asking `/api/admin/whoami`, never by reading
 * the list itself.
 *
 * ROLES
 *
 * The allowlist alone is all-or-nothing: everyone on it can purge the shared
 * cache and read the user directory, and the only way to let somebody watch
 * sync health without also handing them the destructive controls was to not let
 * them in at all. That is the opposite of least privilege, and it is the first
 * question an enterprise security review asks.
 *
 * So a role rides on a Firebase custom claim, and `ADMIN_EMAILS` remains the
 * bootstrap: an address on the allowlist is an `admin` whatever its claim says,
 * which means there is always a way back in if claims are misconfigured, and an
 * existing deployment keeps working with no migration. Claims are the finer
 * instrument layered on top, not a replacement.
 *
 * Custom claims travel inside the ID token, so a role change takes effect when
 * the client next refreshes it (within the hour, or immediately on reload) —
 * there is no per-request lookup to pay for. Only the Admin SDK can set them,
 * so a claim is not something a client can assert about itself.
 */

/**
 * Least privilege first: `viewer` reads operational dashboards, `admin` also
 * performs destructive and directory-wide actions.
 *
 * Ordered, and compared by index in `satisfies`, so a route asks for the
 * minimum it needs rather than enumerating who is allowed.
 */
export const ROLES = ['viewer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** The claim key. Namespaced loosely to avoid colliding with Firebase's own. */
const ROLE_CLAIM = 'fri_role';

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Whether `held` meets or exceeds `required`. */
export function satisfies(held: Role, required: Role): boolean {
  return ROLES.indexOf(held) >= ROLES.indexOf(required);
}

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
  /** What the caller is actually allowed to do. */
  role: Role;
}

type AdminCheck = { ok: true; admin: AdminIdentity } | { ok: false; response: NextResponse };

/**
 * Full administrative access: destructive actions and the user directory.
 *
 * Unchanged in contract from before roles existed — it now simply means
 * "requires the `admin` role", and the allowlist grants exactly that.
 */
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  return requireRole(request, 'admin');
}

/**
 * Verifies the `Authorization: Bearer <firebaseIdToken>` header and checks that
 * the caller holds at least `required`. Route handlers should return
 * `result.response` unchanged when `ok` is false.
 */
export async function requireRole(request: Request, required: Role): Promise<AdminCheck> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return deny(401, 'Missing bearer token.');
  }

  let decoded;
  try {
    // `checkRevoked` so a signed-out or disabled admin loses access immediately
    // rather than at the end of the ID token's hour.
    decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(token, true);
  } catch {
    // Never echo the verification error back — it distinguishes "expired" from
    // "forged", which is free information for someone probing the endpoint.
    return deny(401, 'Invalid or expired token.');
  }

  // The allowlist is keyed on an email address, so an unverified one is a
  // forgeable claim. Google and Apple both hand back verified addresses, but if
  // any password or link provider is ever enabled in the Firebase console, an
  // attacker could self-register an admin's address and walk straight in. Check
  // it here so enabling a provider can never quietly open the console.
  if (!decoded.email_verified) {
    await recordDenial(request, decoded.uid, decoded.email ?? null, 'email_unverified');
    return deny(403, 'Not authorised.');
  }

  // The allowlist is the bootstrap and outranks the claim, so a broken or
  // cleared claim can never lock the last administrator out of the console.
  const claimed = decoded[ROLE_CLAIM];
  const role: Role | null = isAdminEmail(decoded.email)
    ? 'admin'
    : isRole(claimed)
      ? claimed
      : null;

  if (role === null) {
    await recordDenial(request, decoded.uid, decoded.email ?? null, 'no_role');
    return deny(403, 'Not authorised.');
  }

  if (!satisfies(role, required)) {
    // Distinguished from `no_role` in the audit trail on purpose: a viewer
    // reaching for a destructive endpoint is a different event from a stranger
    // knocking, and only one of them is a person who should be asked about it.
    await recordDenial(request, decoded.uid, decoded.email ?? null, `role_insufficient:${role}`);
    return deny(403, 'Not authorised.');
  }

  return { ok: true, admin: { uid: decoded.uid, email: decoded.email as string, role } };
}

/**
 * A signed-in, verified user who reached an admin endpoint and was turned away
 * is the single most interesting event this gate produces — it is either a
 * misconfigured allowlist locking out a colleague, or someone with a valid
 * account probing for the console. Both deserve a durable record; neither used
 * to leave one.
 *
 * `/api/admin/whoami` calls `requireAdmin` on every page load to decide whether
 * to show admin affordances, so this fires routinely for ordinary users. That
 * is the intended volume: the signal is in the target, not the rate.
 */
async function recordDenial(
  request: Request,
  uid: string,
  email: string | null,
  reason: string
): Promise<void> {
  await recordAudit(request, {
    action: 'admin.access_denied',
    actor: { uid, email },
    target: new URL(request.url).pathname,
    outcome: 'failure',
    detail: { reason },
  });
}
