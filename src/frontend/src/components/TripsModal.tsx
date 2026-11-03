'use client';

import { useEffect, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import {
  MAX_NOTES_CHARS,
  fromLocalInput,
  nextHour,
  sortTrips,
  suggestedReturn,
  toLocalInput,
  tripProblem,
  tripState,
  type Trip,
  type TripState,
  type TripTarget,
} from '@/lib/trips';
import { buttonGhost, buttonPrimary, buttonSecondary, buttonSize } from '@/lib/ui';
import { useTrips } from '@/lib/useTrips';

/** A trip being planned from the details view: the place, and its climb for the suggested length. */
export interface TripDraft {
  target: TripTarget;
  elevationGainM: number | null;
}

const STATE_LABELS: Record<TripState, string> = {
  upcoming: 'Upcoming',
  active: 'Out now',
  overdue: 'Overdue',
  back: 'Back',
};

const STATE_STYLES: Record<TripState, string> = {
  upcoming: 'bg-slate-700 text-slate-200',
  active: 'bg-blue-900/60 text-blue-200',
  overdue: 'bg-amber-900/60 text-amber-200',
  back: 'bg-emerald-900/50 text-emerald-200',
};

const formatTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** The clock, refreshed each minute so a trip turns overdue on screen without a reload. */
function useNow(isOpen: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-reads the clock when the modal opens
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [isOpen]);
  return now;
}

function TripForm({
  draft,
  now,
  onSave,
}: {
  draft: TripDraft;
  now: number;
  onSave: (trip: Omit<Trip, 'id' | 'checkedInAt'>) => Promise<boolean>;
}) {
  const [start, setStart] = useState(() => toLocalInput(nextHour(now)));
  const [back, setBack] = useState(() =>
    toLocalInput(suggestedReturn(nextHour(now), draft.elevationGainM))
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const startAt = fromLocalInput(start);
  const expectedReturnAt = fromLocalInput(back);
  const problem = tripProblem({ startAt, expectedReturnAt, notes }, now);

  if (saved) {
    return (
      <p role="status" className="rounded-lg bg-emerald-900/30 p-3 text-sm text-emerald-200">
        Trip to {draft.target.name} saved.
      </p>
    );
  }

  return (
    <form
      className="border-ink/10 space-y-3 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem) return;
        setSaving(true);
        const ok = await onSave({ target: draft.target, startAt, expectedReturnAt, notes });
        setSaving(false);
        setSaved(ok);
      }}
    >
      <p className="text-sm font-semibold text-white">Plan a trip to {draft.target.name}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">
          Leaving
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          Expected back
          <input
            type="datetime-local"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>
      <label className="block text-xs text-slate-400">
        Notes (route, who you&apos;re with)
        <textarea
          value={notes}
          maxLength={MAX_NOTES_CHARS}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-md bg-slate-800 px-2 py-1.5 text-sm text-white"
        />
      </label>
      {problem && start && back && <p className="text-xs text-amber-300">{problem}</p>}
      <button
        type="submit"
        disabled={Boolean(problem) || saving}
        className={`${buttonPrimary} ${buttonSize.sm}`}
      >
        {saving ? 'Saving…' : 'Save trip'}
      </button>
    </form>
  );
}

function TripRow({
  trip,
  now,
  onCheckIn,
  onDelete,
}: {
  trip: Trip;
  now: number;
  onCheckIn: () => void;
  onDelete: () => void;
}) {
  const state = tripState(trip, now);
  return (
    <li className="border-ink/10 space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{trip.target.name}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE_STYLES[state]}`}>
          {STATE_LABELS[state]}
        </span>
      </div>
      <p className="text-xs text-slate-400">
        {formatTime(trip.startAt)} → back by {formatTime(trip.expectedReturnAt)}
      </p>
      {trip.notes && <p className="text-xs whitespace-pre-line text-slate-300">{trip.notes}</p>}
      {state === 'overdue' && (
        <p className="text-xs text-amber-200">
          Past your expected return. Check in when you&apos;re back — nobody has been notified.
        </p>
      )}
      <div className="flex gap-2">
        {(state === 'active' || state === 'overdue') && (
          <button
            type="button"
            onClick={onCheckIn}
            className={`${buttonSecondary} ${buttonSize.sm}`}
          >
            I&apos;m back
          </button>
        )}
        <button type="button" onClick={onDelete} className={`${buttonGhost} ${buttonSize.sm}`}>
          Delete
        </button>
      </div>
    </li>
  );
}

export default function TripsModal({
  isOpen,
  onClose,
  uid,
  draft,
}: {
  isOpen: boolean;
  onClose: () => void;
  uid: string | null;
  /** Set when opened from a place's details: shows the form for it. */
  draft: TripDraft | null;
}) {
  const { trips, status, writeError, create, checkIn, remove } = useTrips(uid);
  const now = useNow(isOpen);
  const [deleting, setDeleting] = useState<Trip | null>(null);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Your trips" maxWidth="max-w-lg">
      <div className="space-y-4 p-5">
        {/* Said up front, every time: a trip is a record, not yet a safety net. */}
        <p className="rounded-lg bg-slate-800/70 p-3 text-xs text-slate-300">
          Fit Ready IQ does not alert anyone if you&apos;re late yet. Leave your plan with someone
          you trust.
        </p>

        {status === 'signed_out' ? (
          <p className="text-sm text-slate-300">Sign in to plan trips.</p>
        ) : (
          <>
            {draft && <TripForm key={draft.target.id} draft={draft} now={now} onSave={create} />}
            {writeError && (
              <p role="alert" className="text-sm text-amber-300">
                {writeError}
              </p>
            )}
            {status === 'loading' && <p className="text-sm text-slate-400">Loading trips…</p>}
            {status === 'failed' && (
              <p role="alert" className="text-sm text-amber-300">
                We couldn&apos;t load your trips. Close this and try again.
              </p>
            )}
            {status === 'ready' && trips.length === 0 && !draft && (
              <p className="text-sm text-slate-400">
                No trips yet. Open a route, peak or campsite and choose “Plan a trip”.
              </p>
            )}
            {trips.length > 0 && (
              <ul className="space-y-2">
                {sortTrips(trips, now).map((trip) => (
                  <TripRow
                    key={trip.id}
                    trip={trip}
                    now={now}
                    onCheckIn={() => void checkIn(trip.id)}
                    onDelete={() => setDeleting(trip)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete this trip?"
        body={`The trip to ${deleting?.target.name ?? ''} will be removed from your account.`}
        confirmLabel="Delete trip"
        onConfirm={() => {
          if (deleting) void remove(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </Modal>
  );
}
