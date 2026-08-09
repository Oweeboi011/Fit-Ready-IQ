import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lets the client discover whether the signed-in user is an admin without ever
 * shipping the allowlist to the browser. Returns 200 either way so that the UI
 * can hide admin affordances quietly instead of surfacing an error.
 */
export async function GET(request: Request) {
  const check = await requireAdmin(request);
  return NextResponse.json({ isAdmin: check.ok });
}
