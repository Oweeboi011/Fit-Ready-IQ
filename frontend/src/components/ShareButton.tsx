'use client';

import { Check, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { placeShareUrl, type PlaceKind } from '@/lib/placeUrl';
import { buttonSecondary, buttonSize } from '@/lib/ui';

interface ShareButtonProps {
  /** Place name — becomes the share title. */
  name: string;
  /** Optional one-line description, e.g. "12.4 km · 980 m gain". */
  summary?: string;
  /** What the link should reopen. Together these form the deep link. */
  kind: PlaceKind;
  id: string;
}

const CONFIRMATION_MS = 2000;

/**
 * Share a place.
 *
 * This replaces three identical buttons that had no `onClick` at all. The link
 * reopens the place inside Fit Ready IQ, which is the point — a recipient lands
 * on the route with its stats and forecast, not on a pin in someone else's map.
 */
export function ShareButton({ name, summary, kind, id }: ShareButtonProps) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const confirm = useCallback((message: string) => {
    setConfirmation(message);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirmation(null), CONFIRMATION_MS);
  }, []);

  const handleShare = useCallback(async () => {
    const url = placeShareUrl(kind, id);
    const text = summary ? `${name} — ${summary}` : name;

    if (navigator.share) {
      try {
        await navigator.share({ title: name, text, url });
        return;
      } catch (err: unknown) {
        // Dismissing the sheet is a choice, not a failure.
        if ((err as { name?: string })?.name === 'AbortError') return;
        // Anything else: fall through to the clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      confirm('Link copied');
    } catch {
      confirm("Couldn't share");
    }
  }, [name, summary, kind, id, confirm]);

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`${buttonSecondary} ${buttonSize.md}`}
      aria-label={`Share ${name}`}
    >
      {confirmation ? (
        <>
          <Check aria-hidden="true" className="h-4 w-4" />
          {confirmation}
        </>
      ) : (
        <>
          <Share2 aria-hidden="true" className="h-4 w-4" />
          Share
        </>
      )}
      {/* Announce the outcome; the icon swap alone is silent to a screen reader. */}
      <span role="status" className="sr-only">
        {confirmation ?? ''}
      </span>
    </button>
  );
}
