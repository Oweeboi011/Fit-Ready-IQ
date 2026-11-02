'use client';

import { Bookmark, Check } from 'lucide-react';

import type { SavedPlace } from '@/lib/useSavedPlaces';
import { buttonGhost, buttonSecondary, buttonSize } from '@/lib/ui';

/** A save the assistant offered, and where the user has taken it. */
export interface PendingSave {
  place: Omit<SavedPlace, 'savedAt'>;
  state: 'offered' | 'saving' | 'saved' | 'declined' | 'failed';
}

interface SaveProposalCardProps {
  proposal: PendingSave;
  /** Signed out, there is nowhere to save to, so the card says so instead of offering. */
  canSave: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

/**
 * The confirmation step for a save the assistant proposed (#31).
 *
 * The model can only offer; this is where the user decides, inline in the
 * thread next to the message that offered it — a modal would hide the
 * conversation that explains why it was offered, and a typed "yes" is easy to
 * send by accident. The write happens in the browser with the user's own
 * sign-in, exactly as the bookmark button's does.
 */
export function SaveProposalCard({
  proposal,
  canSave,
  onConfirm,
  onDecline,
}: SaveProposalCardProps) {
  const { place, state } = proposal;

  if (!canSave) {
    return (
      <p className="mt-1.5 ml-9 text-[11px] text-slate-400">
        Sign in to save {place.name} to your places.
      </p>
    );
  }

  if (state === 'saved') {
    return (
      <p role="status" className="mt-1.5 ml-9 flex items-center gap-1 text-[11px] text-emerald-400">
        <Check aria-hidden="true" className="h-3 w-3" />
        Saved {place.name} to your places.
      </p>
    );
  }

  if (state === 'declined') {
    return <p className="mt-1.5 ml-9 text-[11px] text-slate-500">Not saved.</p>;
  }

  return (
    <div className="mt-1.5 ml-9 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onConfirm}
        disabled={state === 'saving'}
        className={`${buttonSecondary} ${buttonSize.sm}`}
      >
        <Bookmark aria-hidden="true" className="h-3 w-3" />
        {state === 'saving' ? 'Saving…' : `Save ${place.name}`}
      </button>
      <button
        type="button"
        onClick={onDecline}
        disabled={state === 'saving'}
        className={`${buttonGhost} ${buttonSize.sm}`}
      >
        Not now
      </button>
      {state === 'failed' && (
        <p role="alert" className="w-full text-[11px] text-amber-300">
          That didn&apos;t save. Try again.
        </p>
      )}
    </div>
  );
}
