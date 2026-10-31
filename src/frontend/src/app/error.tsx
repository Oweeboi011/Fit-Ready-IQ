'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { buttonPrimary, buttonSecondary, buttonSize } from '@/lib/ui';

/**
 * A render failure anywhere under the root layout.
 *
 * There was no error boundary, so an exception in the map or a modal replaced
 * the whole app with Next's bare default screen and no way back but the
 * browser's own reload. This keeps the shell and offers the two useful moves.
 * The digest is shown because it is what joins a user's report to the server
 * log line for the same failure.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled render error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-white">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your saved places and activities are not affected. Trying again usually works.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className={`${buttonPrimary} ${buttonSize.md}`}
          >
            Try again
          </button>
          <Link href="/" className={`${buttonSecondary} ${buttonSize.md}`}>
            Home
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 font-mono text-[11px] text-slate-600">Reference {error.digest}</p>
        )}
      </div>
    </div>
  );
}
