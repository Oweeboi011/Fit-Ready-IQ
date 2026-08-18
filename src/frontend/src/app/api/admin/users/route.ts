import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';

import { createLogger } from '@/lib/logger';
import { requireAdmin } from '@/lib/adminAuth';
import { recordAudit } from '@/lib/auditLog';
import { getFirebaseAdminApp } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users
 *
 * The Users tab of /admin/settings has called this endpoint since it was built,
 * and the endpoint did not exist — every load 404'd into "Could not load users",
 * and the empty state told the operator to go implement it. This is that.
 *
 * Reads from Firebase Auth rather than the `users` Firestore collection: a
 * Firestore document only appears once someone syncs Strava or saves a place,
 * so a Firestore-backed list silently omits everyone who signed up and has not
 * done anything yet — which is exactly the cohort an operator is looking for.
 *
 * The response is deliberately thin. An admin needs to know who exists, how
 * they signed in and whether they are still active; nothing here exposes a
 * user's routes, activities or location history, and the admin console has no
 * endpoint that does.
 */

/** Matches `AppUser` in src/app/admin/settings/page.tsx. */
export interface AdminUserEntry {
  uid: string;
  email: string;
  displayName: string | null;
  provider: string;
  createdAt: string;
  lastSignIn: string;
}

/**
 * One page of Firebase Auth's listUsers, which is the maximum it will return.
 *
 * Deliberately not paginated onward: the console renders a single table with no
 * paging control, so walking every page would build an unbounded response for a
 * UI that cannot show it. At 1 000 users this needs a real pagination story —
 * the `truncated` flag says when that day arrives instead of quietly cutting
 * the list short, which is the failure mode that gets shipped by accident.
 */
const PAGE_SIZE = 1000;

/** `google.com` → `google`, and a signed-up-but-never-linked account → `password`. */
function primaryProvider(providerIds: string[]): string {
  const first = providerIds[0];
  if (!first) return 'unknown';
  return first.replace(/\.com$/, '');
}

/** Firebase hands these back as UTC strings; empty means "never". */
function isoOrNever(value: string | undefined): string {
  if (!value) return 'never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'never' : parsed.toISOString();
}

export async function GET(request: Request) {
  const log = createLogger('/api/admin/users', request);
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await getAuth(getFirebaseAdminApp()).listUsers(PAGE_SIZE);

    const users: AdminUserEntry[] = result.users.map((user) => ({
      uid: user.uid,
      email: user.email ?? '—',
      displayName: user.displayName ?? null,
      provider: primaryProvider(user.providerData.map((p) => p.providerId)),
      createdAt: isoOrNever(user.metadata.creationTime),
      lastSignIn: isoOrNever(user.metadata.lastSignInTime),
    }));

    // Reading the whole user directory is a privileged act even though it is
    // only a read — it is the list an attacker who reached the console would
    // want most, so it leaves a record.
    await recordAudit(request, {
      action: 'admin.users.read',
      actor: auth.admin,
      target: 'firebase_auth',
      outcome: 'success',
      detail: { returned: users.length, truncated: Boolean(result.pageToken) },
    });

    return NextResponse.json({
      total: users.length,
      truncated: Boolean(result.pageToken),
      users,
    });
  } catch (err) {
    log.error('admin_users_read_failed', err);
    await recordAudit(request, {
      action: 'admin.users.read',
      actor: auth.admin,
      target: 'firebase_auth',
      outcome: 'failure',
      detail: { reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown' },
    });
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}
