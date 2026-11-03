import { describe, expect, it } from 'vitest';

import {
  fromLocalInput,
  nextHour,
  sortTrips,
  suggestedHours,
  suggestedReturn,
  toLocalInput,
  tripProblem,
  tripState,
  type Trip,
} from './trips';

const HOUR = 3_600_000;
const NOW = new Date(2026, 10, 3, 9, 20).getTime();

const trip = (id: string, startAt: number, hours: number, checkedInAt: number | null = null) => ({
  id,
  target: {
    kind: 'mountain' as const,
    id: 'p',
    name: id,
    coordinates: [120.9, 16.6] as [number, number],
  },
  startAt,
  expectedReturnAt: startAt + hours * HOUR,
  checkedInAt,
  notes: '',
});

describe('tripState', () => {
  it('follows the clock until the user checks in', () => {
    const t: Trip = trip('a', NOW + HOUR, 4);
    expect(tripState(t, NOW)).toBe('upcoming');
    expect(tripState(t, NOW + 2 * HOUR)).toBe('active');
    expect(tripState(t, NOW + 6 * HOUR)).toBe('overdue');
    expect(tripState({ ...t, checkedInAt: NOW + 6 * HOUR }, NOW + 7 * HOUR)).toBe('back');
  });
});

describe('tripProblem', () => {
  const ok = { startAt: NOW + HOUR, expectedReturnAt: NOW + 5 * HOUR, notes: '' };

  it('accepts a sensible trip, and one starting a moment ago', () => {
    expect(tripProblem(ok, NOW)).toBeNull();
    expect(tripProblem({ ...ok, startAt: NOW - 5 * 60_000 }, NOW)).toBeNull();
  });

  it('names what is wrong', () => {
    expect(tripProblem({ ...ok, startAt: NaN }, NOW)).toMatch(/Choose when/);
    expect(tripProblem({ ...ok, startAt: NOW - 2 * HOUR }, NOW)).toMatch(/past/);
    expect(tripProblem({ ...ok, expectedReturnAt: ok.startAt }, NOW)).toMatch(/after the start/);
    expect(tripProblem({ ...ok, expectedReturnAt: ok.startAt + 15 * 24 * HOUR }, NOW)).toMatch(
      /14 days/
    );
    expect(
      tripProblem(
        { ...ok, startAt: NOW + 400 * 24 * HOUR, expectedReturnAt: NOW + 401 * 24 * HOUR },
        NOW
      )
    ).toMatch(/year/);
    expect(tripProblem({ ...ok, notes: 'x'.repeat(501) }, NOW)).toMatch(/500/);
  });
});

describe('suggested length', () => {
  it('uses the slower end of the climb estimate, else four hours', () => {
    // 900 m at 300 m/h is 3 h, 3.9 h for a slower party → 4.
    expect(suggestedHours(900)).toBe(4);
    expect(suggestedHours(1800)).toBe(8);
    expect(suggestedHours(null)).toBe(4);
    expect(suggestedReturn(NOW, 1800)).toBe(NOW + 8 * HOUR);
  });
});

describe('sortTrips', () => {
  it('puts what needs attention first and finished trips last', () => {
    const sorted = sortTrips(
      [
        trip('back', NOW - 30 * HOUR, 4, NOW - 25 * HOUR),
        trip('later', NOW + 48 * HOUR, 4),
        trip('overdue', NOW - 10 * HOUR, 4),
        trip('out', NOW - HOUR, 4),
        trip('soon', NOW + 2 * HOUR, 4),
      ],
      NOW
    );
    expect(sorted.map((t) => t.id)).toEqual(['overdue', 'out', 'soon', 'later', 'back']);
  });
});

describe('time inputs', () => {
  it('round-trips a local datetime', () => {
    expect(fromLocalInput(toLocalInput(NOW))).toBe(NOW - (NOW % 60_000));
    expect(fromLocalInput('')).toBeNaN();
    expect(fromLocalInput('tomorrow')).toBeNaN();
  });

  it('suggests the next whole hour on the local clock', () => {
    expect(new Date(nextHour(NOW)).getHours()).toBe(10);
    expect(new Date(nextHour(NOW)).getMinutes()).toBe(0);
  });
});
