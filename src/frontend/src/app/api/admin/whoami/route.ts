import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lets the client discover what the signed-in user may do without ever shipping
 * the allowlist to the browser. Returns 200 either way so that the UI can hide
 * admin affordances quietly instead of surfacing an error.
 *
 * Asks for `viewer` — the lowest role — so the answer distinguishes "no access"
 * from "read-only access". Reporting only `isAdmin` would collapse a viewer
 * into a stranger and hide the dashboards they are entitled to see.
 *
 * `isAdmin` is still in the response and still means full access: it is what
 * `useAdminGate` reads, and changing its meaning to "has any role" would show
 * viewers the purge controls, which is precisely the confusion roles exist to
 * prevent. Presentation only, in any case — every route re-checks server-side.
 */
export async function GET(request: Request) {
  const check = await requireRole(request, 'viewer');

  return NextResponse.json({
    isAdmin: check.ok && check.admin.role === 'admin',
    role: check.ok ? check.admin.role : null,
  });
}
