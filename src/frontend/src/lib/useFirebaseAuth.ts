import { useEffect, useState } from 'react';
import { type User as FirebaseUser } from 'firebase/auth';
import {
  isFirebaseAuthConfigured,
  onFirebaseAuthStateChanged,
  signInWithGoogle,
  signInWithApple,
  signOutFirebaseUser,
} from '@/lib/firebaseClient';
import { signInErrorMessage } from '@/lib/firebaseAuthErrors';
import { clearPersonalStorage } from '@/lib/personalStorage';

export function useFirebaseAuth() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) {
      return;
    }
    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  const signInGoogle = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      // User closed the popup or clicked away — not an error worth surfacing
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Google sign-in failed:', err);
      setAuthError(signInErrorMessage(code, 'Google'));
    } finally {
      setAuthBusy(false);
    }
  };

  const signInApple = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithApple();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Apple sign-in failed:', err);
      setAuthError(signInErrorMessage(code, 'Apple'));
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthBusy(true);
    try {
      await signOutFirebaseUser();
      // What this browser holds about them goes too, and the reload drops the
      // copies already in memory — otherwise the next person on a shared
      // device opens the app to the last one's history and chat.
      clearPersonalStorage();
      window.location.reload();
    } catch (err) {
      console.error('Sign-out failed:', err);
      setAuthError("We couldn't sign you out. Try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  return { authUser, authBusy, authError, setAuthError, signInGoogle, signInApple, signOut };
}
