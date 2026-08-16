import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/adminAuth';
import { getFirebaseConnectionStatus, getFirestoreAdmin } from '@/lib/firebaseAdmin';

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
    return NextResponse.json(
      {
        connected: true,
        provider: 'firebase',
        gcpProjectId: status.projectId,
        firestoreWrite: false,
        error: error instanceof Error ? error.message : 'Unknown Firestore error',
      },
      { status: 500 }
    );
  }
}
