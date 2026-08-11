'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Where the coordinates came from. This is the important part of the hook:
 * the app used to fall back to San Francisco silently and then draw a
 * "Your Location" marker on it, which is an affirmatively false claim. Callers
 * must be able to tell a real fix from a guess, so `source` travels with the
 * coordinates everywhere they go.
 */
export type LocationSource = 'gps' | 'restored' | 'fallback';

export type LocationStatus = 'locating' | 'ready';

/** Why we never got a real fix. `null` means nothing went wrong. */
export type LocationProblem = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string;
}

/** Last resort so the map has somewhere to point. Always labelled as a guess. */
export const FALLBACK_LOCATION: UserLocation = {
  lat: 37.7749,
  lng: -122.4194,
  address: 'San Francisco, CA',
};

export const LAST_LOCATION_KEY = 'fri_last_location';

/**
 * A hanging permission prompt used to hang forever — the previous calls passed
 * no options at all. Ten seconds is long enough for a cold GPS fix and short
 * enough that the user is not staring at a spinner wondering if it is broken.
 */
const GEOLOCATION_OPTIONS: PositionOptions = {
  timeout: 10_000,
  maximumAge: 5 * 60 * 1000,
  enableHighAccuracy: false,
};

function readStoredLocation(): UserLocation | null {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocation;
    if (typeof parsed?.lat !== 'number' || typeof parsed?.lng !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function problemFromError(error: GeolocationPositionError): LocationProblem {
  if (error.code === error.PERMISSION_DENIED) return 'denied';
  if (error.code === error.TIMEOUT) return 'timeout';
  return 'unavailable';
}

export interface UseUserLocationResult {
  location: UserLocation | null;
  source: LocationSource | null;
  status: LocationStatus;
  /** Non-null when we could not get a real fix, whatever we ended up showing. */
  problem: LocationProblem | null;
  /** True only for a live device fix — gate the "Your Location" marker on this. */
  isPrecise: boolean;
  /** Attach a reverse-geocoded address (or a user-chosen place) to the fix. */
  setLocation: (location: UserLocation, source?: LocationSource) => void;
  retry: () => void;
}

/**
 * Single source of truth for where the user is.
 *
 * Resolution order: a stored location paints the map immediately, then a live
 * fix upgrades it. If neither is available we fall back, but we say so.
 */
export function useUserLocation(): UseUserLocationResult {
  const [location, setLocationState] = useState<UserLocation | null>(null);
  const [source, setSource] = useState<LocationSource | null>(null);
  const [status, setStatus] = useState<LocationStatus>('locating');
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const [attempt, setAttempt] = useState(0);

  // A late GPS callback must not overwrite a place the user picked by hand.
  const manualOverrideRef = useRef(false);

  const setLocation = useCallback((next: UserLocation, nextSource: LocationSource = 'gps') => {
    if (nextSource === 'gps') {
      manualOverrideRef.current = true;
      // Only a real fix clears the notice. Labelling a fallback with a
      // reverse-geocoded address does not mean we found the user.
      setProblem(null);
    }
    setLocationState(next);
    setSource(nextSource);
    setStatus('ready');
    try {
      localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(next));
    } catch {
      /* private mode or quota — the map still works, we just won't remember */
    }
  }, []);

  const retry = useCallback(() => {
    manualOverrideRef.current = false;
    setProblem(null);
    setStatus('locating');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const stored = readStoredLocation();
    if (stored) {
      setLocationState(stored);
      setSource('restored');
      setStatus('ready');
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      if (!stored) {
        setLocationState(FALLBACK_LOCATION);
        setSource('fallback');
      }
      setProblem('unsupported');
      setStatus('ready');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled || manualOverrideRef.current) return;
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocationState(next);
        setSource('gps');
        setProblem(null);
        setStatus('ready');
        try {
          localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(next));
        } catch {
          /* see above */
        }
      },
      (error) => {
        if (cancelled) return;
        // A stored location is still a reasonable place to look, so keep it and
        // only record the problem. With nothing stored we have to guess.
        if (!stored) {
          setLocationState(FALLBACK_LOCATION);
          setSource('fallback');
        }
        setProblem(problemFromError(error));
        setStatus('ready');
      },
      GEOLOCATION_OPTIONS
    );

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    location,
    source,
    status,
    problem,
    isPrecise: source === 'gps',
    setLocation,
    retry,
  };
}

/** User-facing explanation for each failure. Never mentions an API or a console. */
export function locationProblemMessage(problem: LocationProblem, source: LocationSource | null) {
  const where =
    source === 'fallback'
      ? `Showing routes near ${FALLBACK_LOCATION.address}.`
      : 'Showing your last known area.';

  switch (problem) {
    case 'denied':
      return `Location access is off. ${where}`;
    case 'timeout':
      return `We couldn't get a location fix in time. ${where}`;
    case 'unsupported':
      return `This browser can't share your location. ${where}`;
    default:
      return `Your location isn't available right now. ${where}`;
  }
}
