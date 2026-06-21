import { NextResponse } from "next/server";

import { getFirebaseConnectionStatus, getFirestoreAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const status = getFirebaseConnectionStatus();

  if (!status.connected) {
    return NextResponse.json(
      {
        connected: false,
        provider: "firebase",
        gcpProjectId: process.env.FIREBASE_PROJECT_ID,
        error: status.error,
      },
      { status: 503 }
    );
  }

  try {
    const db = getFirestoreAdmin();
    await db.collection("_health").doc("chat-assistant").set(
      {
        updatedAt: new Date().toISOString(),
        service: "chat-assistant",
      },
      { merge: true }
    );

    return NextResponse.json({
      connected: true,
      provider: "firebase",
      gcpProjectId: status.projectId,
      firestoreWrite: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: true,
        provider: "firebase",
        gcpProjectId: status.projectId,
        firestoreWrite: false,
        error: error instanceof Error ? error.message : "Unknown Firestore error",
      },
      { status: 500 }
    );
  }
}
