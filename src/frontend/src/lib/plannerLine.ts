import type { PlannerRoute } from './usePlannerRoute';

/**
 * What line, if any, the map should draw for the planner.
 *
 * Extracted from MapView so the decision can be tested without a Google map:
 * "is there a line right now, and is it a measured route or a provisional
 * guide?" is a question with a handful of answers and several ways to get wrong,
 * and it was previously a conditional buried in JSX.
 *
 * The three outcomes are deliberately named rather than expressed as booleans:
 *   - `route` — measured, snapped geometry. Solid line.
 *   - `guide` — the waypoints joined as they were dropped. Dashed, because it is
 *     not a route and must never be mistaken for one.
 *   - `none`  — nothing to draw. Fewer than two waypoints, or a route in flight.
 */

export type PlannerLineKind = 'none' | 'route' | 'guide';

export interface PlannerLine {
  kind: PlannerLineKind;
  /** `[lng, lat]` pairs. Empty when `kind` is `none`. */
  path: [number, number][];
}

const NOTHING: PlannerLine = { kind: 'none', path: [] };

export function plannerLine(
  waypoints: { coordinates: [number, number] }[],
  path: [number, number][] | undefined,
  status: PlannerRoute['status']
): PlannerLine {
  // Clearing the plan clears the line. Stated first because it is the case that
  // has to hold no matter what stale routed geometry is still in state — a line
  // outliving its waypoints is a route the user cannot edit or delete.
  if (waypoints.length < 2) return NOTHING;

  if (path && path.length > 1) return { kind: 'route', path };

  // Mid-route, draw nothing rather than flashing a straight line across the map.
  // usePlannerRoute empties the path for exactly this reason.
  if (status === 'routing') return NOTHING;

  return { kind: 'guide', path: waypoints.map((w) => w.coordinates) };
}
