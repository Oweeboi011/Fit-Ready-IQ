import { NextResponse } from 'next/server';

import { currentRole } from '@/lib/adminAuth';
import { rateLimit, tooManyRequests } from '@/lib/rateLimit';
import { ADMIN_WHOAMI_RATE_LIMIT } from '@/lib/rateLimitRules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lets the client discover what the signed-in user may do without ever shipping
 * the allowlist to the browser. Returns 200 either way so that the UI can hide
 * admin affordances quietly instead of surfacing an error.
 *
 * Reports the role itself, so the answer distinguishes "no access" from
 * "read-only access". Reporting only `isAdmin` would collapse a viewer into a
 * stranger and hide the dashboards they are entitled to see.
 *
 * `isAdmin` is still in the response and still means full access: it is what
 * `useAdminGate` reads, and changing its meaning to "has any role" would show
 * viewers the purge controls, which is precisely the confusion roles exist to
 * prevent. Presentation only, in any case — every route re-checks server-side.
 *
 * Uses `currentRole`, not `requireRole`: this is a question, not an attempt, so
 * it leaves no audit record. It is metered because every signed-in visitor can
 * reach it, which is exactly why it was never "admins only" in practice.
 */
export async function GET(request: Request) {
  const who = await currentRole(request);

  const limit = await rateLimit(request, ADMIN_WHOAMI_RATE_LIMIT, who);
  if (!limit.ok) return tooManyRequests(limit);

  return NextResponse.json({
    isAdmin: who?.role === 'admin',
    role: who?.role ?? null,
  });
}
