'use client';

import { useEffect, useRef, useState } from 'react';

import type { ElevationSample } from './elevationProfile';
import { fetchElevationAlongPath, haversineKm } from './mapsGeometry';

/**
 * Elevation samples for a path, ready to plot.
 *
 * Shared by the planner and the details modal: both have a `[lng, lat]` path and
 * both want the same profile, so the fetching, distance arithmetic and
 * cancellation live here once rather than in each component.
 *
 * Deliberately keyed on the path's geometry rather than object identity. The
 * planner re-snaps on every waypoint drag and hands back a fresh array each
 * time; keying on the array itself would refetch on every render of an unchanged
 * route, and each refetch is billable Elevation quota.
 */

export interface ElevationProfileState {
  samples: ElevationSample[];
  loading: boolean;
  /** Written for a person, and only set when we actually know something is wrong. */
  error: string | null;
}

const IDLE: ElevationProfileState = { samples: [], loading: false, error: null };

/** Enough shape for a 320px-wide strip without wasting quota. */
const SAMPLE_COUNT = 96;

/** Total length of a `[lng, lat]` path, in km. */
function pathLengthKm(path: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineKm(path[i - 1], path[i]);
  return total;
}

/**
 * A cheap, stable identity for a path.
 *
 * The endpoints, the length and a midpoint together change whenever the route
 * meaningfully changes, and stay identical when React merely re-renders. Hashing
 * every coordinate would be more correct and more expensive than the refetch it
 * saves.
 */
function pathKey(path: [number, number][]): string {
  if (path.length < 2) return '';
  const mid = path[Math.floor(path.length / 2)];
  const first = path[0];
  const last = path[path.length - 1];
  return `${path.length}|${first[0]},${first[1]}|${mid[0]},${mid[1]}|${last[0]},${last[1]}`;
}

export function useElevationProfile(
  path: [number, number][] | undefined,
  enabled = true
): ElevationProfileState {
  const [state, setState] = useState<ElevationProfileState>(IDLE);
  const key = path ? pathKey(path) : '';

  // Guards against a slow response for an old route overwriting a newer one —
  // dragging a waypoint can easily outpace the Elevation API.
  const latestKey = useRef(key);

  useEffect(() => {
    latestKey.current = key;

    if (!enabled || !path || path.length < 2) {
      setState(IDLE);
      return;
    }

    // `google` is injected by the Maps SDK loader; without it there is nothing to
    // ask. Silent rather than an error: the map itself already reports that.
    if (typeof google === 'undefined' || !google.maps?.ElevationService) {
      setState(IDLE);
      return;
    }

    setState({ samples: [], loading: true, error: null });

    const totalKm = pathLengthKm(path);
    const locations = path.map(([lng, lat]) => ({ lat, lng }));

    fetchElevationAlongPath(locations, SAMPLE_COUNT).then(({ values, failed }) => {
      if (latestKey.current !== key) return; // a newer route won

      if (failed || values.length === 0) {
        setState({
          samples: [],
          loading: false,
          error: 'Elevation data is unavailable, so this route has no profile yet.',
        });
        return;
      }

      // Samples come back evenly spaced along the path, so distance is a
      // straight proportion — no need to re-measure per point.
      const lastIndex = Math.max(values.length - 1, 1);
      setState({
        samples: values.map((elevationM, i) => ({
          distanceKm: (i / lastIndex) * totalKm,
          elevationM,
        })),
        loading: false,
        error: null,
      });
    });
    // `path` is intentionally excluded: `key` is its stable identity, and
    // depending on the array would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state;
}
