'use client';

import { useState, useEffect, useCallback } from 'react';
import { isFirebaseAuthConfigured } from './firebaseClient';

export type SavedPlaceType = 'route' | 'mountain' | 'campsite';

export interface SavedPlace {
  id: string;
  type: SavedPlaceType;
  name: string;
  coordinates: [number, number];
  savedAt?: number;
  elevation_m?: number | null;
  prominence_m?: number;
  difficulty?: string;
  activity_type?: string;
  distance_km?: number;
  elevation_gain_m?: number | null;
  mountain_type?: string;
  rating?: number;
  photos?: string[];
  place_id?: string;
}

// Lazy-load Firestore only in the browser to avoid SSR/prerender failures.
async function getFirestoreDb() {
  if (typeof window === 'undefined') return null;
  if (!isFirebaseAuthConfigured()) return null;
  const { getApps, getApp } = await import('firebase/app');
  if (!getApps().length) return null;
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(getApp());
}

/** Optional fields that a place may or may not carry, depending on its type. */
const OPTIONAL_FIELDS = [
  'elevation_m',
  'prominence_m',
  'difficulty',
  'activity_type',
  'distance_km',
  'elevation_gain_m',
  'mountain_type',
  'rating',
  'photos',
  'place_id',
] as const satisfies readonly (keyof SavedPlace)[];

/** Firestore rejects `undefined`, so only defined fields make it into the doc. */
function toFirestoreFields(place: Omit<SavedPlace, 'savedAt'>): Record<string, unknown> {
  const data: Record<string, unknown> = {
    type: place.type,
    name: place.name,
    coordinates: place.coordinates,
  };
  for (const field of OPTIONAL_FIELDS) {
    const value = place[field];
    if (value !== undefined) data[field] = value;
  }
  return data;
}

export function useSavedPlaces(uid: string | null) {
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  // A save that silently fails looks identical to a bookmark that never
  // registered the tap, so failures have to be sayable.
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setSavedPlaces([]);
      return;
    }

    let unsubscribeFn: (() => void) | undefined;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const db = await getFirestoreDb();
      if (cancelled || !db) {
        setLoading(false);
        return;
      }
      const { collection, onSnapshot } = await import('firebase/firestore');
      if (cancelled) {
        setLoading(false);
        return;
      }
      const ref = collection(db, 'users', uid, 'saved_places');
      unsubscribeFn = onSnapshot(
        ref,
        (snapshot) => {
          const places: SavedPlace[] = snapshot.docs.map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              type: raw.type as SavedPlaceType,
              name: raw.name,
              coordinates: raw.coordinates as [number, number],
              savedAt: raw.savedAt?.toMillis?.() ?? Date.now(),
              elevation_m: raw.elevation_m,
              prominence_m: raw.prominence_m,
              difficulty: raw.difficulty,
              activity_type: raw.activity_type,
              distance_km: raw.distance_km,
              elevation_gain_m: raw.elevation_gain_m,
              mountain_type: raw.mountain_type,
              rating: raw.rating,
              photos: raw.photos,
              place_id: raw.place_id,
            };
          });
          places.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
          setSavedPlaces(places);
          setLoading(false);
        },
        (err) => {
          console.error('Saved places listener failed:', err);
          setSaveError("We couldn't load your saved places. Check your connection.");
          setLoading(false);
        }
      );
    })();

    return () => {
      cancelled = true;
      unsubscribeFn?.();
    };
  }, [uid]);

  const isSaved = useCallback((id: string) => savedPlaces.some((p) => p.id === id), [savedPlaces]);

  const toggleSave = useCallback(
    async (place: Omit<SavedPlace, 'savedAt'>) => {
      if (!uid) return;
      const wasSaved = isSaved(place.id);
      setSaveError(null);

      try {
        const db = await getFirestoreDb();
        if (!db) {
          setSaveError('Saving is unavailable right now.');
          return;
        }
        const { doc, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
        const ref = doc(db, 'users', uid, 'saved_places', place.id);

        if (wasSaved) {
          await deleteDoc(ref);
        } else {
          await setDoc(ref, { ...toFirestoreFields(place), savedAt: serverTimestamp() });
        }
      } catch (err) {
        // Previously an unhandled rejection: the write failed and the bookmark
        // simply never filled, with nothing anywhere to explain why.
        console.error('Saving place failed:', err);
        setSaveError(
          wasSaved ? "We couldn't remove that place." : "We couldn't save that place. Try again."
        );
      }
    },
    [uid, isSaved]
  );

  const dismissSaveError = useCallback(() => setSaveError(null), []);

  return { savedPlaces, loading, isSaved, toggleSave, saveError, dismissSaveError };
}
