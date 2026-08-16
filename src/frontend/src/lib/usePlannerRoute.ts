'use client';

import { useEffect, useState } from 'react';

import type { PlannerWaypoint } from './gpxBuilder';
import { decodePolyline } from './polylineDecoder';

/**
 * Snaps a planned route to real paths, on foot or by bike.
 *
 * Waypoints used to be joined with straight lines, which look nothing like the
 * journey and give a distance that is always short. This routes between them
 * via `/api/directions`, so the drawn line follows real ways and the distance is
 * the one you would actually cover.
 *
 * Travel mode is not cosmetic. Walking routing will happily send you up steps
 * and along footpaths a bike cannot ride, and cycling routing prefers cycleways
 * and roads that a walking route avoids — so the same waypoints give a different
 * line and a different distance. Planning a ride on foot produces a route no
 * bike can follow.
 *
 * Routing only knows mapped ways. Where a trail is absent it routes around it
 * or fails outright, and a failure is reported as a failure: no line, no
 * distance, and a reason the user can act on. There is deliberately no
 * straight-line fallback — presenting one as a walking or cycling distance
 * would be exactly the plausible-but-wrong number this app has been busy
 * removing, and it was still what got saved and exported.
 */

/** What the user is planning. Chosen in the planner, not inferred. */
export type PlannerTravelMode = 'walk' | 'bike';

/**
 * How the drawn line was produced.
 *
 * There is no `straight` member any more, and that is the point. The planner
 * used to join unroutable waypoints with a straight line and label it — but a
 * label does not make the number right: the distance is always short, the line
 * crosses whatever is in the way, and it was still exported to GPX and carried
 * into saved plans as if it were a route. A route the router could not find is
 * not a route, so now nothing is drawn and the reason is stated.
 */
export type RouteMode = 'walking' | 'cycling';

/** Routes API travel mode for each planner mode. */
const API_MODE: Record<PlannerTravelMode, 'WALK' | 'BICYCLE'> = {
  walk: 'WALK',
  bike: 'BICYCLE',
};

/** What a successful snap is called, per planner mode. */
const SNAPPED_MODE: Record<PlannerTravelMode, RouteMode> = {
  walk: 'walking',
  bike: 'cycling',
};

export interface PlannerRoute {
  /**
   * `[lng, lat]` pairs, GeoJSON order, ready to draw. Only ever real routed
   * geometry — empty when routing did not produce any.
   */
  path: [number, number][];
  /** Routed distance. `null` when there is no route to measure. */
  distanceKm: number | null;
  mode: RouteMode;
  status: 'idle' | 'routing' | 'ready' | 'error';
  /** Why there is no route. Written for the user, not the log. */
  error: string | null;
}

const EMPTY: PlannerRoute = {
  path: [],
  distanceKm: null,
  mode: 'walking',
  status: 'idle',
  error: null,
};

/**
 * Turn a failed routing call into something the user can act on.
 *
 * "No route exists between these two points" and "routing is switched off" are
 * different problems with different fixes, and collapsing them into one silent
 * straight line hid both.
 */
function messageFor(reason: string | null, travelMode: PlannerTravelMode): string {
  const vehicle = travelMode === 'bike' ? 'cycling' : 'walking';
  switch (reason) {
    case 'not_configured':
      return 'Routing is not set up, so this route cannot be measured. Add a Google Maps or Routes API key.';
    case 'rejected':
      return 'Google refused the routing key. Check that the key is valid and that the Routes API and billing are enabled on its project.';
    case 'no_route':
      return `No ${vehicle} route between these points. Try moving a waypoint onto a mapped path.`;
    case 'timeout':
      return 'Routing took too long to answer. Try again in a moment.';
    case 'upstream':
      return 'The routing service did not respond. Try again in a moment.';
    default:
      return 'Could not work out a route between these points.';
  }
}

/** Directions allows 23 intermediate waypoints on top of origin and destination. */
const MAX_INTERMEDIATE = 23;

export function usePlannerRoute(
  waypoints: PlannerWaypoint[],
  enabled: boolean,
  travelMode: PlannerTravelMode = 'walk'
): PlannerRoute {
  const [route, setRoute] = useState<PlannerRoute>(EMPTY);

  // Re-route only when the geometry changes, not on every render.
  const key = waypoints.map((w) => w.coordinates.join(',')).join('|');

  useEffect(() => {
    if (!enabled || waypoints.length < 2) {
      setRoute(EMPTY);
      return;
    }

    let cancelled = false;
    // Nothing is drawn while we wait. Showing a provisional straight line here
    // is how the wrong number used to reach the screen, and it flashed into the
    // saved-plan flow if the user was quick.
    setRoute({
      path: [],
      distanceKm: null,
      mode: SNAPPED_MODE[travelMode],
      status: 'routing',
      error: null,
    });

    const points = waypoints.slice(0, MAX_INTERMEDIATE + 2);
    const toLatLng = (w: PlannerWaypoint) => ({ lat: w.coordinates[1], lng: w.coordinates[0] });

    fetch('/api/directions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: toLatLng(points[0]),
        destination: toLatLng(points[points.length - 1]),
        intermediates: points.slice(1, -1).map(toLatLng),
        mode: API_MODE[travelMode],
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          // The body carries the real cause; the status cannot distinguish
          // "no key set" from "Google refused this key".
          const body = await res.json().catch(() => ({}) as { reason?: string });
          const err = new Error(`Routing responded ${res.status}`) as Error & { reason?: string };
          err.reason = body.reason;
          throw err;
        }
        return res.json();
      })
      .then((data: { polyline: string; distanceKm: number }) => {
        if (cancelled) return;
        const path = decodePolyline(data.polyline);
        if (path.length < 2) throw new Error('Empty route geometry');
        setRoute({
          path,
          distanceKm: data.distanceKm,
          mode: SNAPPED_MODE[travelMode],
          status: 'ready',
          error: null,
        });
      })
      .catch((err: Error & { reason?: string }) => {
        if (cancelled) return;
        // No line and no distance. The planner says why, and the user can move a
        // waypoint or fix the key — both of which a straight line hid.
        setRoute({
          path: [],
          distanceKm: null,
          mode: SNAPPED_MODE[travelMode],
          status: 'error',
          error: messageFor(err.reason ?? null, travelMode),
        });
      });

    return () => {
      cancelled = true;
    };
    // `key` stands in for the waypoint geometry: it is the serialised
    // coordinates, so it changes exactly when the geometry does. `waypoints`
    // itself is a fresh array on nearly every render, and depending on it would
    // re-request directions on renders where nothing moved — billable calls to
    // the Routes API for an identical answer.
    //
    // `travelMode` is a real dependency: switching between walk and bike must
    // re-request, because the two produce genuinely different lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the value-equality form of `waypoints`
  }, [key, enabled, travelMode]);

  return route;
}
