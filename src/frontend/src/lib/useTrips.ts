'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Trip, TripTarget } from './trips';
import { getFirestoreDb } from './useSavedPlaces';

/**
 * The signed-in user's trips, live from `users/{uid}/trips` (ADR-0003).
 *
 * Account-only, unlike plans: a trip is the record the safety timer will read
 * from the server, and a trip kept on one device could never be watched.
 */

/** The stored document: the trip without its id, which is the document id. */
type TripDocument = Omit<Trip, 'id'>;

/** A stored trip, or null when the document is not one we wrote. */
export function tripFromDocument(id: string, raw: Record<string, unknown>): Trip | null {
  const t = raw.target as Partial<TripTarget> | undefined;
  const coords = t?.coordinates;
  if (
    !t ||
    (t.kind !== 'route' && t.kind !== 'mountain' && t.kind !== 'campsite') ||
    typeof t.id !== 'string' ||
    typeof t.name !== 'string' ||
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    typeof raw.startAt !== 'number' ||
    typeof raw.expectedReturnAt !== 'number'
  ) {
    return null;
  }
  return {
    id,
    target: { kind: t.kind, id: t.id, name: t.name, coordinates: [coords[0], coords[1]] },
    startAt: raw.startAt,
    expectedReturnAt: raw.expectedReturnAt,
    checkedInAt: checkInMillis(raw.checkedInAt),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/**
 * The check-in is the server's timestamp, never the phone's clock: the safety
 * timer will compare it with the expected return on the server, and a device
 * set to the wrong day must not be able to close a trip it never finished.
 */
function checkInMillis(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

/** Enough for a season of trips; older ones are history, not something to act on. */
const MAX_TRIPS_LISTED = 100;

export type TripsStatus = 'signed_out' | 'loading' | 'ready' | 'failed';

export function useTrips(uid: string | null) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [status, setStatus] = useState<TripsStatus>(uid ? 'loading' : 'signed_out');
  /** The last write that failed, as a sentence; cleared by the next attempt. */
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the user signs out
      setTrips([]);
      setStatus('signed_out');
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    setStatus('loading');

    (async () => {
      const db = await getFirestoreDb();
      if (cancelled) return;
      if (!db) {
        setStatus('failed');
        return;
      }
      const { collection, limit, onSnapshot, orderBy, query } = await import('firebase/firestore');
      if (cancelled) return;
      unsubscribe = onSnapshot(
        // Bounded: every change re-reads the result, and each read is billed.
        query(
          collection(db, 'users', uid, 'trips'),
          orderBy('startAt', 'desc'),
          limit(MAX_TRIPS_LISTED)
        ),
        (snapshot) => {
          setTrips(
            snapshot.docs.flatMap((d) => {
              // A pending check-in shows at once, as the local estimate of the server's time.
              const trip = tripFromDocument(d.id, d.data({ serverTimestamps: 'estimate' }));
              return trip ? [trip] : [];
            })
          );
          setStatus('ready');
        },
        (err) => {
          console.error('Trips listener failed:', err);
          setStatus('failed');
        }
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [uid]);

  /** Runs one write against a trip document; resolves whether it landed. */
  const write = useCallback(
    async (
      id: string,
      apply: (
        ref: import('firebase/firestore').DocumentReference,
        fs: typeof import('firebase/firestore')
      ) => Promise<void>,
      failure: string
    ): Promise<boolean> => {
      if (!uid) return false;
      setWriteError(null);
      try {
        const db = await getFirestoreDb();
        if (!db) throw new Error('Firestore is not configured');
        const fs = await import('firebase/firestore');
        await apply(fs.doc(db, 'users', uid, 'trips', id), fs);
        return true;
      } catch (err) {
        console.error('Trip write failed:', err);
        setWriteError(failure);
        return false;
      }
    },
    [uid]
  );

  const create = useCallback(
    (draft: Omit<Trip, 'id' | 'checkedInAt'>) => {
      const trip: TripDocument = { ...draft, checkedInAt: null };
      return write(
        crypto.randomUUID(),
        (ref, fs) => fs.setDoc(ref, { ...trip, updatedAt: fs.serverTimestamp() }),
        "We couldn't save the trip. Try again."
      );
    },
    [write]
  );

  const checkIn = useCallback(
    (id: string) =>
      write(
        id,
        (ref, fs) =>
          fs.updateDoc(ref, {
            checkedInAt: fs.serverTimestamp(),
            updatedAt: fs.serverTimestamp(),
          }),
        "We couldn't record your check-in. Try again."
      ),
    [write]
  );

  const remove = useCallback(
    (id: string) =>
      write(id, (ref, fs) => fs.deleteDoc(ref), "We couldn't delete the trip. Try again."),
    [write]
  );

  return { trips, status, writeError, create, checkIn, remove };
}
