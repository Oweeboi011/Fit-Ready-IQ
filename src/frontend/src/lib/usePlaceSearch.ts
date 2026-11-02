'use client';

import { useEffect, useState } from 'react';

/**
 * Free-text place search, for finding somewhere that is not already on the map.
 *
 * The sidebar's search box only *filters* the results already loaded, so a peak
 * outside the current discovery radius could not be found at all — and therefore
 * could not be planned to. This queries Photon, komoot's OpenStreetMap geocoder,
 * which (unlike Nominatim) is built for search-as-you-type.
 *
 * It is free but shared, which shapes the design: the query is debounced, short
 * queries are refused outright, and a stale response is discarded rather than
 * allowed to overwrite a newer one. Typing "Mount Pulag" at one request per
 * keystroke would be eleven searches for one intention.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';

export interface PlaceSearchResult {
  id: string;
  name: string;
  /** Where it is — town, region, country — when Photon knows. */
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

/** Whether a query is worth a request. */
export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

/** A Photon GeoJSON feature, with just the fields the list reads. */
export interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Photon's features reduced to what the list needs.
 *
 * Anything without a name or coordinates is dropped rather than rendered as a
 * blank row that cannot be planned to — the same rule the discovery pipeline
 * follows.
 */
export function toSearchResults(
  features: PhotonFeature[],
  limit = MAX_RESULTS
): PlaceSearchResult[] {
  const results: PlaceSearchResult[] = [];

  for (const feature of features) {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const p = feature.properties ?? {};
    if (!p.name || typeof lat !== 'number' || typeof lng !== 'number') continue;

    const where = [p.city ?? p.county, p.state, p.country].filter(Boolean);
    results.push({
      // The OSM identity is stable; the name is a fallback for a result
      // without one, and only needs to be unique within this list.
      id: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : `${p.name}:${lat},${lng}`,
      name: p.name,
      address: where.length > 0 ? where.join(', ') : null,
      coordinates: [lng, lat],
    });

    if (results.length >= limit) break;
  }

  return results;
}

/** Results biased towards `near`, nearest-relevant first. Throws on a failed request. */
async function searchPhoton(query: string, near: [number, number]): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({
    q: query,
    lat: String(near[1]),
    lon: String(near[0]),
    limit: String(MAX_RESULTS * 2),
  });
  const res = await fetch(`${PHOTON_URL}?${params}`);
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return data.features ?? [];
}

export interface PlaceSearchState {
  results: PlaceSearchResult[];
  loading: boolean;
  /** Set only when a search ran and found nothing, so the UI can say so. */
  empty: boolean;
  /** The search itself failed — distinct from finding nothing. */
  failed: boolean;
}

const IDLE: PlaceSearchState = { results: [], loading: false, empty: false, failed: false };

export function usePlaceSearch(
  query: string,
  near: [number, number] | undefined
): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>(IDLE);

  useEffect(() => {
    if (!isSearchable(query) || !near) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets to idle when the input goes away, after the previous run has been cancelled
      setState(IDLE);
      return;
    }

    let cancelled = false;
    setState({ results: [], loading: true, empty: false, failed: false });

    const timer = setTimeout(() => {
      searchPhoton(query.trim(), near).then(
        (features) => {
          if (cancelled) return; // a newer query won
          const results = toSearchResults(features);
          setState({ results, loading: false, empty: results.length === 0, failed: false });
        },
        () => {
          if (!cancelled) setState({ results: [], loading: false, empty: false, failed: true });
        }
      );
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Keyed on the coordinates rather than the array: `near` is rebuilt on every
    // render upstream, and depending on it would re-run this on each keystroke's
    // render — which is exactly the request the debounce exists to avoid.
  }, [query, near?.[0], near?.[1]]);

  return state;
}
