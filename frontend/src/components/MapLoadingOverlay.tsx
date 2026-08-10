'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface MapLoadingOverlayProps {
  /** Whether work is still in flight. */
  isLoading: boolean;
  /** What is being waited on, e.g. 'Finding routes near you'. */
  message?: string;
  /** Secondary line, e.g. the resolved place name. */
  detail?: string;
}

/**
 * Progress overlay for the map viewport.
 *
 * The map stays usable while this is up: the backdrop does not capture
 * pointer events, so panning and zooming keep working, and the card can be
 * dismissed for a load that is taking longer than the user cares to wait on.
 */
export default function MapLoadingOverlay({
  isLoading,
  message = 'Finding routes near you',
  detail,
}: MapLoadingOverlayProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // A new load re-arms the overlay, so dismissing one slow fetch does not
  // silence every later one.
  useEffect(() => {
    if (isLoading) setIsDismissed(false);
  }, [isLoading]);

  if (!isLoading || isDismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-8">
      {/* The map surface carries several status regions (location problems,
          save failures); naming this one keeps it distinguishable to screen
          readers and to tests. */}
      <div
        role="status"
        aria-live="polite"
        aria-label="Map loading progress"
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-slate-900/90 py-2.5 pl-3 pr-2.5 shadow-xl backdrop-blur-md"
      >
        <span
          className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-blue-500/25 border-t-blue-500"
          aria-hidden="true"
        />

        <span className="text-xs font-medium text-slate-200">
          {message}
          {detail ? <span className="ml-1.5 text-slate-400">{detail}</span> : null}
        </span>

        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          aria-label="Hide loading indicator"
          className="-my-2 -mr-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
