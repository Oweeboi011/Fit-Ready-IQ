'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { isFirebaseAuthConfigured, signInWithGoogle } from '@/lib/firebaseClient';
import { rememberSelectedPlan, type PlanId } from '@/lib/plans';
import { buttonPrimary, buttonSecondary, buttonSize } from '@/lib/ui';

interface StartTrialButtonProps {
  /** Button label. Say the outcome, never the auth vendor. */
  label?: string;
  size?: keyof typeof buttonSize;
  variant?: 'primary' | 'secondary';
  className?: string;
  /**
   * Which tier this button is offering. Carried into the app so the choice a
   * visitor made on the pricing table is not silently discarded.
   */
  plan?: PlanId;
}

/**
 * The conversion action. One click: sign in, land in the app.
 *
 * When Firebase Auth is not configured (preview builds, local dev without env)
 * this degrades to a plain link into the app rather than throwing at the user.
 */
export function StartTrialButton({
  label = 'Start free — no card needed',
  size = 'lg',
  variant = 'primary',
  className = '',
  plan,
}: StartTrialButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const classes = `${variant === 'primary' ? buttonPrimary : buttonSecondary} ${buttonSize[size]} ${className}`;
  const destination = plan ? `/app?plan=${plan}` : '/app';

  async function handleClick() {
    if (plan) rememberSelectedPlan(plan);

    if (!isFirebaseAuthConfigured()) {
      router.push(destination);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.push(destination);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      // Closing the popup is the common case and is not worth an alarming
      // message, but silence would look like a broken button.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Start trial sign-in failed:', err);
      setError(
        code === 'auth/network-request-failed'
          ? 'Network trouble signing in. Check your connection and try again.'
          : 'Sign-in did not complete. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className.includes('w-full') ? 'w-full' : undefined}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        aria-describedby={error ? errorId : undefined}
        className={classes}
      >
        {busy ? 'Opening…' : label}
        {!busy && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
      </button>
      {error && (
        <p id={errorId} role="status" className="mt-2 text-xs text-amber-400">
          {error}
        </p>
      )}
    </div>
  );
}
