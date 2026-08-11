import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type AuthProvider,
  type User,
} from 'firebase/auth';

type AuthSubscriber = (user: User | null) => void;

function getFirebaseClientConfig() {
  // The bare FIREBASE_PROJECT_ID fallback only ever resolves during SSR, where this
  // module is evaluated on the server. Next inlines nothing but NEXT_PUBLIC_* into the
  // browser bundle, so on the client the fallback is `undefined` and no secret can
  // leak — and a project ID is not a credential in any case.
  // eslint-disable-next-line no-restricted-syntax
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

/** Popup failures that mean "this browser won't do popups", not "you cancelled". */
const POPUP_UNSUPPORTED_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

/**
 * Popup first, redirect if the browser refuses.
 *
 * Popups are the better experience — the page keeps its state — but they are
 * blocked outright by iOS Safari in several configurations, which used to leave
 * mobile users with a dead button and an error they could not act on.
 */
async function signInWith(provider: AuthProvider): Promise<void> {
  const auth = getAuth(getFirebaseApp());
  try {
    await signInWithPopup(auth, provider);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    if (!POPUP_UNSUPPORTED_CODES.has(code)) throw err;
    // Navigates away; the session is picked up by onAuthStateChanged on return.
    await signInWithRedirect(auth, provider);
  }
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWith(provider);
}

export async function signInWithApple(): Promise<void> {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  await signInWith(provider);
}

export async function signOutFirebaseUser(): Promise<void> {
  await signOut(getAuth(getFirebaseApp()));
}

/**
 * Fresh Firebase ID token for the signed-in user, or `null` when nobody is
 * signed in. Server routes verify this token, so it is the only credential the
 * client is allowed to present to `/api/admin/*`.
 */
export async function getIdToken(): Promise<string | null> {
  if (!isFirebaseAuthConfigured()) return null;
  const user = getAuth(getFirebaseApp()).currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/** `fetch` with the caller's ID token attached. Throws if nobody is signed in. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new Error('Not signed in.');

  return fetch(input, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
}
