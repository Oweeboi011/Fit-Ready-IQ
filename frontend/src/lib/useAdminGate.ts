'use client';

import { useEffect, useState } from 'react';

import { authedFetch, onFirebaseAuthStateChanged } from './firebaseClient';

export type AdminGateState = 'checking' | 'allowed' | 'denied';

/**
 * Resolves whether the signed-in user is an admin by asking the server, which
 * holds the allowlist. Re-runs whenever auth state changes so signing out
 * immediately revokes the admin UI.
 *
 * This is a UI affordance, not the security boundary — every `/api/admin/*`
 * route verifies the caller independently via `requireAdmin`.
 */
export function useAdminGate(): AdminGateState {
  const [state, setState] = useState<AdminGateState>('checking');

  useEffect(() => {
    let active = true;

    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      if (!user) {
        if (active) setState('denied');
        return;
      }

      if (active) setState('checking');

      authedFetch('/api/admin/whoami')
        .then((res) => (res.ok ? res.json() : { isAdmin: false }))
        .then((data: { isAdmin?: boolean }) => {
          if (active) setState(data.isAdmin === true ? 'allowed' : 'denied');
        })
        .catch(() => {
          if (active) setState('denied');
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
