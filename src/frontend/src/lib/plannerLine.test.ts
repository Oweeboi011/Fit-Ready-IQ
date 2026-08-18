import { describe, expect, it } from 'vitest';

import { plannerLine } from './plannerLine';

const wp = (lng: number, lat: number) => ({ coordinates: [lng, lat] as [number, number] });
const A = wp(121, 14);
const B = wp(122, 15);
const C = wp(123, 16);

const SNAPPED: [number, number][] = [
  [121, 14],
  [121.5, 14.5],
  [122, 15],
];

describe('clearing the plan clears the line', () => {
  it('draws nothing with no waypoints, even while routed geometry is still in state', () => {
    // The case that matters: `Clear` empties the waypoints, and a stale snapped
    // path must not keep a line on the map that has no waypoints to edit.
    expect(plannerLine([], SNAPPED, 'ready')).toEqual({ kind: 'none', path: [] });
  });

  it('draws nothing with a single waypoint', () => {
    expect(plannerLine([A], SNAPPED, 'ready').kind).toBe('none');
  });

  it('draws nothing with no waypoints in any status', () => {
    for (const status of ['idle', 'routing', 'ready', 'error'] as const) {
      expect(plannerLine([], SNAPPED, status).kind).toBe('none');
    }
  });
});

describe('a measured route', () => {
  it('is drawn as a route when there is snapped geometry', () => {
    expect(plannerLine([A, B], SNAPPED, 'ready')).toEqual({ kind: 'route', path: SNAPPED });
  });

  it('uses the snapped path, not the waypoints', () => {
    const line = plannerLine([A, B], SNAPPED, 'ready');
    expect(line.path).toHaveLength(3);
  });
});

describe('an unrouted plan', () => {
  it('is a dashed guide, never a route', () => {
    const line = plannerLine([A, B, C], undefined, 'error');
    expect(line.kind).toBe('guide');
    expect(line.path).toEqual([A.coordinates, B.coordinates, C.coordinates]);
  });

  it('is a guide when routing failed, so a failure is visibly not a route', () => {
    expect(plannerLine([A, B], [], 'error').kind).toBe('guide');
  });

  it('is a guide when idle — waypoints exist but nothing has been routed', () => {
    expect(plannerLine([A, B], undefined, 'idle').kind).toBe('guide');
  });

  it('treats a one-point path as no geometry, since a line needs two', () => {
    expect(plannerLine([A, B], [[121, 14]], 'ready').kind).toBe('guide');
  });
});

describe('while routing', () => {
  it('draws nothing, rather than flashing a straight line across the map', () => {
    expect(plannerLine([A, B, C], undefined, 'routing').kind).toBe('none');
    expect(plannerLine([A, B], [], 'routing').kind).toBe('none');
  });

  it('keeps showing the previous route if the path survived the re-route', () => {
    // Not the current behaviour of the hook, which empties the path — but if it
    // ever keeps it, showing measured geometry beats showing nothing.
    expect(plannerLine([A, B], SNAPPED, 'routing').kind).toBe('route');
  });
});
