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
  elevation_m?: number;
  prominence_m?: number;
  difficulty?: string;
  activity_type?: string;
  distance_km?: number;
  elevation_gain_m?: number;
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

export function useSavedPlaces(uid: string | null) {
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) {
      setSavedPlaces([]);
      return;
    }

    let unsubscribeFn: (() => void) | undefined;
    setLoading(true);

    (async () => {
      const db = await getFirestoreDb();
      if (!db) {
        setLoading(false);
        return;
      }
      const { collection, onSnapshot } = await import('firebase/firestore');
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
        () => {
          setLoading(false);
        }
      );
    })();

    return () => unsubscribeFn?.();
  }, [uid]);

  const isSaved = useCallback((id: string) => savedPlaces.some((p) => p.id === id), [savedPlaces]);

  const toggleSave = useCallback(
    async (place: Omit<SavedPlace, 'savedAt'>) => {
      if (!uid) return;
      const db = await getFirestoreDb();
      if (!db) return;
      const { doc, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
      const ref = doc(db, 'users', uid, 'saved_places', place.id);

      if (isSaved(place.id)) {
        await deleteDoc(ref);
      } else {
        const data: Record<string, unknown> = {
          type: place.type,
          name: place.name,
          coordinates: place.coordinates,
          savedAt: serverTimestamp(),
        };
        if (place.elevation_m !== undefined) data.elevation_m = place.elevation_m;
        if (place.prominence_m !== undefined) data.prominence_m = place.prominence_m;
        if (place.difficulty !== undefined) data.difficulty = place.difficulty;
        if (place.activity_type !== undefined) data.activity_type = place.activity_type;
        if (place.distance_km !== undefined) data.distance_km = place.distance_km;
        if (place.elevation_gain_m !== undefined) data.elevation_gain_m = place.elevation_gain_m;
        if (place.mountain_type !== undefined) data.mountain_type = place.mountain_type;
        if (place.rating !== undefined) data.rating = place.rating;
        if (place.photos !== undefined) data.photos = place.photos;
        if (place.place_id !== undefined) data.place_id = place.place_id;
        await setDoc(ref, data);
      }
    },
    [uid, isSaved]
  );

  return { savedPlaces, loading, isSaved, toggleSave };
}
