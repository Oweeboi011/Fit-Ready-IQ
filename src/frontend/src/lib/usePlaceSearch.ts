'use client';

import { useEffect, useState } from 'react';

import { newPlacesService, textSearchOnce } from './placesSearch';

/**
 * Free-text place search, for finding somewhere that is not already on the map.
 *
 * The sidebar's search box only *filters* the results already loaded, so a peak
 * outside the current discovery radius could not be found at all — and therefore
 * could not be planned to. This queries Places directly.
 *
 * Every call is billable, which shapes the whole design: the query is debounced,
 * short queries are refused outright, and a stale response is discarded rather
 * than allowed to overwrite a newer one. Typing "Mount Pulag" at one request per
 * keystroke would be eleven searches for one intention.
 */

export interface PlaceSearchResult {
  id: string;
  name: string;
  /** Formatted address, when Google supplies one. */
  address: string | null;
  /** `[lng, lat]`, GeoJSON order, matching the rest of the app. */
  coordinates: [number, number];
}

/** Below this, a query matches half the country and costs a call to learn it. */
export const MIN_QUERY_LENGTH = 3;

/** Long enough to finish a word, short enough not to feel laggy. */
const DEBOUNCE_MS = 400;

/** More than a screenful is not a shortlist, it is a second problem. */
const MAX_RESULTS = 6;

/** Biases results towards the user rather than restricting to them. */
const SEARCH_RADIUS_M = 100_000;

/** Whether a query is worth spending a Places call on. */
export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

/**
 * Google's `PlaceResult` reduced to what the list needs.
 *
 * Anything without a name or coordinates is dropped rather than rendered as a
 * blank row that cannot be planned to — the same rule the discovery pipeline
 * follows.
 */
export function toSearchResults(
  places: google.maps.places.PlaceResult[],
  limit = MAX_RESULTS
): PlaceSearchResult[] {
  const results: PlaceSearchResult[] = [];

  for (const place of places) {
    const lat = place.geometry?.location?.lat();
    const lng = place.geometry?.location?.lng();
    if (!place.name || lat == null || lng == null) continue;

    results.push({
      // `place_id` is Google's stable identity; the name is a fallback for the
      // rare result without one, and only needs to be unique within this list.
      id: place.place_id ?? `${place.name}:${lat},${lng}`,
      name: place.name,
      address: place.formatted_address ?? place.vicinity ?? null,
      coordinates: [lng, lat],
    });

    if (results.length >= limit) break;
  }

  return results;
}

export interface PlaceSearchState {
  results: PlaceSearchResult[];
  loading: boolean;
  /** Set only when a search ran and found nothing, so the UI can say so. */
  empty: boolean;
}

const IDLE: PlaceSearchState = { results: [], loading: false, empty: false };

export function usePlaceSearch(
  query: string,
  near: [number, number] | undefined
): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>(IDLE);

  useEffect(() => {
    if (!isSearchable(query) || !near) {
      setState(IDLE);
      return;
    }

    // The SDK is injected by the loader; without it there is nothing to ask, and
    // the map already reports that failure.
    if (typeof google === 'undefined' || !google.maps?.places) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    setState({ results: [], loading: true, empty: false });

    const timer = setTimeout(() => {
      const location = { lat: near[1], lng: near[0] };
      textSearchOnce(newPlacesService(), query.trim(), location, SEARCH_RADIUS_M).then((places) => {
        if (cancelled) return; // a newer query won
        const results = toSearchResults(places);
        setState({ results, loading: false, empty: results.length === 0 });
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Keyed on the coordinates rather than the array: `near` is rebuilt on every
    // render upstream, and depending on it would re-run this on each keystroke's
    // render — which is exactly the billable call the debounce exists to avoid.
  }, [query, near?.[0], near?.[1]]);

  return state;
}
