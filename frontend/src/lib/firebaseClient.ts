import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

type AuthSubscriber = (user: User | null) => void;

function getFirebaseClientConfig() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function isFirebaseAuthConfigured(): boolean {
  const cfg = getFirebaseClientConfig();
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

function getFirebaseApp(): FirebaseApp {
  const cfg = getFirebaseClientConfig();

  if (!isFirebaseAuthConfigured()) {
    throw new Error(
      'Firebase Auth is not configured. Add NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, and NEXT_PUBLIC_FIREBASE_APP_ID.'
    );
  }

  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    appId: cfg.appId,
  });
}

export function onFirebaseAuthStateChanged(subscriber: AuthSubscriber): () => void {
  if (!isFirebaseAuthConfigured()) {
    return () => undefined;
  }
  return onAuthStateChanged(getAuth(getFirebaseApp()), subscriber);
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(getAuth(getFirebaseApp()), provider);
}

export async function signInWithApple(): Promise<void> {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  await signInWithPopup(getAuth(getFirebaseApp()), provider);
}

export async function signOutFirebaseUser(): Promise<void> {
  await signOut(getAuth(getFirebaseApp()));
}
