import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/adminAuth';
import { getFirebaseConnectionStatus, getFirestoreAdmin } from '@/lib/firebaseAdmin';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Deep Firebase connectivity probe — admin only.
 *
 * Unlike /api/health, which only reports whether credentials are *present*,
 * this actually writes to Firestore to prove the round trip works. That makes
 * it two things an anonymous caller should not have: a write it can trigger at
 * will, and a readout of the GCP project id plus raw Admin SDK error strings,
 * which describe our infrastructure to anyone who asks.
 *
 * Use /api/health for uptime monitoring; that one is meant to be public.
 */
export async function GET(request: Request) {
  const log = createLogger('/api/integrations/firebase', request);
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const status = getFirebaseConnectionStatus();

  if (!status.connected) {
    return NextResponse.json(
      {
        connected: false,
        provider: 'firebase',
        gcpProjectId: process.env.FIREBASE_PROJECT_ID,
        error: status.error,
      },
      { status: 503 }
    );
  }

  try {
    const db = getFirestoreAdmin();
    await db.collection('_health').doc('chat-assistant').set(
      {
        updatedAt: new Date().toISOString(),
        service: 'chat-assistant',
      },
      { merge: true }
    );

    return NextResponse.json({
      connected: true,
      provider: 'firebase',
      gcpProjectId: status.projectId,
      firestoreWrite: true,
    });
  } catch (error) {
    // The raw Admin SDK message goes to the log, redacted and tied to the
    // request id — an admin reading this response can look it up there.
    log.error('firebase_probe_write_failed', error);
    return NextResponse.json(
      {
        connected: true,
        provider: 'firebase',
        gcpProjectId: status.projectId,
        firestoreWrite: false,
        error: 'firestore_write_failed',
      },
      { status: 500 }
    );
  }
}
