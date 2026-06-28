import { App, applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

interface FirebaseConfig {
  projectId?: string;
  serviceAccountJson?: string;
  clientEmail?: string;
  privateKey?: string;
}

function getFirebaseConfig(): FirebaseConfig {
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };
}

function createFirebaseApp(): App {
  const cfg = getFirebaseConfig();

  if (!cfg.projectId) {
    throw new Error('FIREBASE_PROJECT_ID is required for Firebase integration.');
  }

  if (cfg.serviceAccountJson) {
    const parsed = JSON.parse(cfg.serviceAccountJson) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    return initializeApp({
      projectId: cfg.projectId,
      credential: cert({
        projectId: parsed.project_id ?? cfg.projectId,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      }),
    });
  }

  if (cfg.clientEmail && cfg.privateKey) {
    return initializeApp({
      projectId: cfg.projectId,
      credential: cert({
        projectId: cfg.projectId,
        clientEmail: cfg.clientEmail,
        privateKey: cfg.privateKey,
      }),
    });
  }

  return initializeApp({
    projectId: cfg.projectId,
    credential: applicationDefault(),
  });
}

export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }
  return createFirebaseApp();
}

export function getFirestoreAdmin(): Firestore {
  const app = getFirebaseAdminApp();
  return getFirestore(app);
}

export function getFirebaseConnectionStatus(): {
  connected: boolean;
  projectId?: string;
  error?: string;
} {
  try {
    const app = getFirebaseAdminApp();
    return { connected: true, projectId: app.options.projectId };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown Firebase error',
    };
  }
}
