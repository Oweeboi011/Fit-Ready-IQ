'use client';

import { useEffect, useState } from 'react';

import type { PlannerWaypoint } from './gpxBuilder';
import { decodePolyline } from './polylineDecoder';

/**
 * Snaps a planned route to walkable paths.
 *
 * Waypoints used to be joined with straight lines, which look nothing like the
 * walk and give a distance that is always short. This routes between them on
 * foot via `/api/directions`, so the drawn line follows real paths and roads
 * and the distance is the one you would actually cover.
 *
 * Routing only knows mapped ways. Where a trail is absent it routes around it
 * or fails outright, so `mode` is reported back and the UI says which of the
 * two the number came from — a straight-line figure presented as a walking
 * distance would be exactly the plausible-but-wrong number this app has been
 * busy removing.
 */

export type RouteMode = 'walking' | 'straight';

export interface PlannerRoute {
  /** `[lng, lat]` pairs, GeoJSON order, ready to draw. */
  path: [number, number][];
  distanceKm: number;
  mode: RouteMode;
  status: 'idle' | 'routing' | 'ready';
}

const EMPTY: PlannerRoute = { path: [], distanceKm: 0, mode: 'straight', status: 'idle' };

/** Directions allows 23 intermediate waypoints on top of origin and destination. */
const MAX_INTERMEDIATE = 23;

/** Haversine sum, used when Directions cannot help. */
export function straightLineKm(path: [number, number][]): number {
  const R = 6371;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const [aLng, aLat] = path[i - 1];
    const [bLng, bLat] = path[i];
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(h));
  }
  return total;
}

export function usePlannerRoute(waypoints: PlannerWaypoint[], enabled: boolean): PlannerRoute {
  const [route, setRoute] = useState<PlannerRoute>(EMPTY);

  // Re-route only when the geometry changes, not on every render.
  const key = waypoints.map((w) => w.coordinates.join(',')).join('|');

  useEffect(() => {
    if (!enabled || waypoints.length < 2) {
      setRoute(EMPTY);
      return;
    }

    const straight: [number, number][] = waypoints.map((w) => w.coordinates);

    let cancelled = false;
    setRoute({
      path: straight,
      distanceKm: straightLineKm(straight),
      mode: 'straight',
      status: 'routing',
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
        mode: 'WALK',
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Routing responded ${res.status}`);
        return res.json();
      })
      .then((data: { polyline: string; distanceKm: number }) => {
        if (cancelled) return;
        const path = decodePolyline(data.polyline);
        if (path.length < 2) throw new Error('Empty route geometry');
        setRoute({ path, distanceKm: data.distanceKm, mode: 'walking', status: 'ready' });
      })
      .catch(() => {
        if (cancelled) return;
        // Common on unmapped trails, and on a project without the Routes API
        // enabled. Fall back, and say which it is.
        setRoute({
          path: straight,
          distanceKm: straightLineKm(straight),
          mode: 'straight',
          status: 'ready',
        });
      });

    return () => {
      cancelled = true;
    };
    // `key` stands in for the waypoint geometry.
  }, [key, enabled]);

  return route;
}
