'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isFirebaseAuthConfigured, onFirebaseAuthStateChanged } from '@/lib/firebaseClient';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

import { StartTrialButton } from './StartTrialButton';

/**
 * The right-hand side of the landing header.
 *
 * Two problems live here. First, the header used to show "Sign in" and "Start
 * free" to everyone, including people who were already signed in — clicking
 * either re-opened an account chooser for a session they already had. Second,
 * because the header is sticky, its primary button was permanently on screen
 * and therefore always competing with whichever primary the section below was
 * offering, which `src/lib/ui.ts` explicitly forbids.
 *
 * So: signed-in visitors get one quiet link into the app, and signed-out
 * visitors get a *secondary* CTA up here, leaving the hero's primary as the
 * only primary in the viewport.
 */
export function HeaderActions() {
  // `null` = we do not know yet. Rendering the signed-out state during that
  // window is the safe default: it is what an unauthenticated visitor sees, and
  // it is what the static HTML already contains, so there is no hydration jump.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isFirebaseAuthConfigured()) {
      setSignedIn(false);
      return;
    }
    return onFirebaseAuthStateChanged((user) => setSignedIn(Boolean(user)));
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <Link href="#how" className={`${buttonGhost} ${buttonSize.sm} hidden sm:inline-flex`}>
        How it works
      </Link>
      <Link href="#pricing" className={`${buttonGhost} ${buttonSize.sm} hidden sm:inline-flex`}>
        Pricing
      </Link>

      {signedIn ? (
        <Link href="/app" className={`${buttonSecondary} ${buttonSize.sm}`}>
          Open the app
        </Link>
      ) : (
        <>
          {/* Was labelled "Sign in" while being a plain link that signs nobody
              in. Naming it after what it does removes the surprise. */}
          <Link href="/app" className={`${buttonGhost} ${buttonSize.sm}`}>
            Open the map
          </Link>
          <StartTrialButton label="Start free" size="sm" variant="secondary" />
        </>
      )}
    </div>
  );
}
