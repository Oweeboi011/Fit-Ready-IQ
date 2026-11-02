import { describe, expect, it } from 'vitest';

import type { KomootRoute } from './komootTour';
import { buildBriefing, formatHours, routeSamples, steepestClimb } from './routeBriefing';
import type { WeatherWindow } from './weatherWindow';

/** A straight north-bound line, ~111 m per step, with the given altitudes. */
function route(altitudes: (number | null)[], overrides: Partial<KomootRoute> = {}): KomootRoute {
  return {
    id: '1',
    name: 'Test',
    sport: 'hike',
    distanceKm: 12,
    durationSeconds: 4 * 3600,
    ascentM: 900,
    descentM: 900,
    komootGrade: 'moderate',
    start: { lat: 46, lng: 7 },
    path: altitudes.map((_, i) => [7, 46 + i * 0.001]),
    altitudes,
    surfaces: [{ type: 'sf#nature', label: 'Natural ground', share: 0.8 }],
    wayTypes: [{ type: 'wt#hike_d2', label: 'Hiking path', share: 1 }],
    offGridShare: 0,
    url: 'https://www.komoot.com/tour/1',
    ...overrides,
  };
}

const ids = (r: KomootRoute, conditions = {}) =>
  buildBriefing(r, conditions).checklist.map((c) => c.id);
const item = (r: KomootRoute, id: string, conditions = {}) =>
  buildBriefing(r, conditions).checklist.find((c) => c.id === id);

describe('formatHours', () => {
  it.each([
    [3.5, '3h 30m'],
    [2, '2h'],
    [1.999, '2h'],
    [0.25, '0h 15m'],
  ])('%s → %s', (hours, text) => expect(formatHours(hours)).toBe(text));
});

describe('steepestClimb', () => {
  it('finds the steepest sustained stretch, not a single kick', () => {
    // Flat, then 40 m per ~111 m step for four steps, then flat.
    const samples = routeSamples(route([100, 100, 100, 140, 180, 220, 260, 260, 260]));
    const climb = steepestClimb(samples);
    expect(climb?.gradePct).toBeGreaterThan(30);
    expect(climb?.atKm).toBeCloseTo(0.2, 1);
  });

  it('is null when altitude is unknown or the route only descends', () => {
    expect(steepestClimb(routeSamples(route([null, null, null])))).toBeNull();
    expect(steepestClimb(routeSamples(route([500, 400, 300, 200, 100])))).toBeNull();
  });
});

describe('buildBriefing', () => {
  const alpine = route([1200, 1400, 1600, 1800, 2100, 1800, 1500, 1200]);

  it('explains the route in plain sentences', () => {
    const { summary } = buildBriefing(alpine);
    expect(summary[0]).toBe(
      'A 12.0 km hike with 900 m of climbing and 900 m of descent. Challenging by our rating. Komoot grades it intermediate.'
    );
    expect(summary[1]).toBe('Komoot estimates 4h of moving time; plan about 5h with breaks.');
    expect(summary[2]).toMatch(
      /^The route runs from 1200 m to a high point of 2100 m; the steepest/
    );
    expect(summary[3]).toBe('Underfoot: natural ground (80%), mostly on hiking path (100%).');
  });

  it('sizes water from the planned time, and more in the heat', () => {
    expect(item(alpine, 'water')?.label).toBe('2.5 L of water');
    expect(item(alpine, 'water', { tempC: 30 })?.label).toBe('4 L of water');
  });

  it('never sizes water from a duration it does not have', () => {
    const r = route([100, 120], { durationSeconds: null });
    expect(item(r, 'water')?.label).toBe('Water');
    expect(buildBriefing(r).summary[1]).toMatch(/no time estimate/);
    expect(ids(r)).not.toContain('light');
  });

  it('asks for layers from the climb above the start, essential up high', () => {
    const layers = item(alpine, 'layers', { tempC: 15 });
    expect(layers?.priority).toBe('essential');
    expect(layers?.why).toMatch(/900 m above the start, typically ~6°C colder/);
    expect(layers?.why).toMatch(/about 9°C if it is 15°C/);
    expect(ids(route([100, 150, 120]))).not.toContain('layers');
  });

  it('makes the shell essential when the window has rain', () => {
    const window: WeatherWindow = {
      status: 'marginal',
      start: null,
      end: null,
      hours: 5,
      worst: 'watch',
      hazards: [{ kind: 'heavy-rain', severity: 'watch', at: '', label: 'Rain' } as never],
      summary: 'A passable window.',
    };
    const lowland = route([100, 120, 110]);
    expect(item(lowland, 'shell')?.priority).toBe('recommended');
    expect(item(lowland, 'shell', { window })?.priority).toBe('essential');
    expect(buildBriefing(lowland, { window }).summary.at(-1)).toBe('A passable window.');
  });

  it('puts "rethink the date" first when there is no safe window', () => {
    const window = {
      status: 'none',
      hazards: [],
      summary: 'No window.',
    } as unknown as WeatherWindow;
    expect(ids(alpine, { window })[0]).toBe('weather');
  });

  it('picks footwear from surface and path grade', () => {
    expect(item(alpine, 'footwear')?.label).toBe('Trail shoes or boots');
    const scramble = route([100, 200], {
      wayTypes: [{ type: 'wt#hike_d5', label: 'Demanding alpine path', share: 0.2 }],
    });
    expect(item(scramble, 'footwear')?.label).toBe('Sturdy boots with grippy soles');
    const town = route([100, 101], {
      surfaces: [{ type: 'sf#asphalt', label: 'Asphalt', share: 1 }],
    });
    expect(item(town, 'footwear')?.label).toBe('Comfortable walking shoes');
  });

  it("recognises Komoot's descriptive alpine path key", () => {
    const alpinePath = route([2000, 2400], {
      wayTypes: [
        { type: 'wt#mountain_hiking_path', label: 'Mountain hiking path', share: 0.7 },
        { type: 'wt#alpine_hiking_path', label: 'Alpine path', share: 0.3 },
      ],
    });
    expect(item(alpinePath, 'footwear')?.why).toMatch(/^30% is alpine path or harder/);
    const mountainOnly = route([2000, 2400], {
      wayTypes: [{ type: 'wt#mountain_hiking_path', label: 'Mountain hiking path', share: 1 }],
    });
    expect(item(mountainOnly, 'footwear')?.label).toBe('Trail shoes or boots');
  });

  it('does not read a missing surface as firm ground', () => {
    const recorded = route([2000, 2600], { surfaces: [] });
    expect(item(recorded, 'footwear')).toMatchObject({
      label: 'Trail shoes or boots',
      why: 'Komoot does not know the surface for 100% of the route; assume rough ground.',
    });
    const unknown = route([100, 110], {
      surfaces: [
        { type: 'sf#unknown', label: 'Unknown surface', share: 0.6 },
        { type: 'sf#paved', label: 'Paved', share: 0.4 },
      ],
    });
    expect(item(unknown, 'footwear')?.label).toBe('Trail shoes or boots');
    expect(buildBriefing(unknown).summary).toContain(
      'Underfoot: paved (40%), mostly on hiking path (100%).'
    );
  });

  it.each([
    [11.8, 'An 11.8 km'],
    [8.2, 'An 8.2 km'],
    [81, 'An 81.0 km'],
    [1.8, 'A 1.8 km'],
    [118, 'A 118.0 km'],
  ])('uses the right article for %s km', (distanceKm, start) => {
    expect(buildBriefing(route([100, 110], { distanceKm })).summary[0].startsWith(start)).toBe(
      true
    );
  });

  it('swaps walking kit for bike kit on a ride', () => {
    const ride = route([100, 120], { sport: 'mtb', descentM: 1200 });
    expect(ids(ride)).toContain('bike');
    expect(ids(ride)).not.toContain('footwear');
    expect(ids(ride)).not.toContain('poles');
  });

  it('flags off-grid sections for navigation and telling someone', () => {
    const remote = route([100, 120], { offGridShare: 0.3, ascentM: 50, durationSeconds: 3600 });
    expect(item(remote, 'navigation')?.priority).toBe('essential');
    expect(ids(remote)).toContain('plan');
    expect(buildBriefing(remote).summary).toContain('30% of it leaves the mapped path network.');
  });

  it('adds a head torch and training only when the day warrants it', () => {
    const long = route([100, 900, 1500], {
      durationSeconds: 7 * 3600,
      ascentM: 1500,
      distanceKm: 20,
    });
    expect(item(long, 'light')?.priority).toBe('essential');
    expect(item(long, 'training')?.why).toMatch(/around 1050 m of ascent/);
    const short = route([100, 110], { durationSeconds: 3600, ascentM: 10, distanceKm: 3 });
    expect(ids(short)).not.toContain('light');
    expect(ids(short)).not.toContain('training');
    expect(item(short, 'food')?.label).toBe('A snack');
  });

  it('says it cannot rate difficulty without the ascent', () => {
    const r = route([null, null], { ascentM: null, descentM: null, komootGrade: null });
    const briefing = buildBriefing(r);
    expect(briefing.difficulty).toBe('unknown');
    expect(briefing.summary[0]).toBe(
      'A 12.0 km hike, climbing unknown. We cannot rate its difficulty without the ascent.'
    );
    expect(briefing.highPointM).toBeNull();
  });
});
