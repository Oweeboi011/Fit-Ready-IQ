import { describe, expect, it } from 'vitest';

import { MAX_PATH_POINTS, normaliseKomootTour, parseKomootLink } from './komootTour';

describe('parseKomootLink', () => {
  it.each([
    ['https://www.komoot.com/tour/210499946', '210499946', null],
    ['https://www.komoot.com/de-de/tour/210499946?ref=wtd', '210499946', null],
    ['komoot.de/tour/210499946', '210499946', null],
    ['210499946', '210499946', null],
    ['https://www.komoot.com/tour/123456?share_token=aB3_x-9', '123456', 'aB3_x-9'],
  ])('reads %s', (raw, id, shareToken) => {
    expect(parseKomootLink(raw)).toEqual({ ok: true, id, shareToken });
  });

  it('drops a share token that is not one, rather than forwarding it', () => {
    expect(parseKomootLink('https://www.komoot.com/tour/123456?share_token=a%20b')).toEqual({
      ok: true,
      id: '123456',
      shareToken: null,
    });
  });

  it('names smart tours separately from nonsense', () => {
    expect(parseKomootLink('https://www.komoot.com/smarttour/e1025815036/x')).toEqual({
      ok: false,
      reason: 'smarttour',
    });
  });

  it.each([
    'https://evil.example.com/tour/123456',
    'https://komoot.com.evil.example/tour/123456',
    'https://www.komoot.com/user/123456',
    'not a link at all',
    '',
  ])('rejects %s', (raw) => {
    expect(parseKomootLink(raw)).toEqual({ ok: false, reason: 'invalid' });
  });
});

const coordinates = (n: number, alt: (i: number) => number | undefined = (i) => 100 + i) =>
  Array.from({ length: n }, (_, i) => ({ lat: 46 + i * 0.001, lng: 7, alt: alt(i), t: i }));

const tour = (overrides: Record<string, unknown> = {}) => ({
  name: '  Ridge loop ',
  sport: 'hike',
  distance: 12_500,
  duration: 14_400,
  elevation_up: 812.4,
  elevation_down: 790,
  difficulty: { grade: 'moderate' },
  summary: {
    surfaces: [
      { type: 'sf#paved', amount: 0.1 },
      { type: 'sf#nature', amount: 0.5 },
      { type: 'sf#ground', amount: 0.4 },
    ],
    way_types: [
      { type: 'wt#hike_d2', amount: 0.9 },
      { type: 'wt#off_grid', amount: 0.1 },
    ],
  },
  _embedded: { coordinates: { items: coordinates(10) } },
  ...overrides,
});

describe('normaliseKomootTour', () => {
  it('reads the fields the briefing needs', () => {
    const route = normaliseKomootTour(tour(), '42');
    expect(route).toMatchObject({
      id: '42',
      name: 'Ridge loop',
      sport: 'hike',
      distanceKm: 12.5,
      durationSeconds: 14_400,
      ascentM: 812,
      descentM: 790,
      komootGrade: 'moderate',
      start: { lat: 46, lng: 7 },
      offGridShare: 0.1,
      url: 'https://www.komoot.com/tour/42',
    });
    expect(route?.path[1]).toEqual([7, 46.001]);
    expect(route?.altitudes[1]).toBe(101);
  });

  it('merges surfaces that share a label and sorts by share', () => {
    const route = normaliseKomootTour(tour(), '42');
    expect(route?.surfaces.map((s) => s.label)).toEqual(['Natural ground', 'Paved']);
    expect(route?.surfaces[0].share).toBeCloseTo(0.9);
  });

  it('humanises a key it has no label for', () => {
    const route = normaliseKomootTour(
      tour({ summary: { surfaces: [{ type: 'sf#moon_dust', amount: 1 }] } }),
      '42'
    );
    expect(route?.surfaces[0].label).toBe('Moon dust');
  });

  it('keeps unknowns unknown instead of zero', () => {
    const route = normaliseKomootTour(
      tour({
        duration: 0,
        elevation_up: null,
        elevation_down: 'lots',
        difficulty: undefined,
        _embedded: { coordinates: { items: coordinates(3, () => undefined) } },
      }),
      '42'
    );
    expect(route).toMatchObject({
      durationSeconds: null,
      ascentM: null,
      descentM: null,
      komootGrade: null,
    });
    expect(route?.altitudes).toEqual([null, null, null]);
  });

  it('measures the track when Komoot gives no distance', () => {
    const route = normaliseKomootTour(tour({ distance: undefined }), '42');
    // Nine steps of 0.001° latitude ≈ 1.0 km.
    expect(route?.distanceKm).toBeCloseTo(1.0, 1);
  });

  it('thins a long track but keeps the finish', () => {
    const items = coordinates(2_000);
    const route = normaliseKomootTour(tour({ _embedded: { coordinates: { items } } }), '42');
    expect(route?.path).toHaveLength(MAX_PATH_POINTS);
    expect(route?.path.at(-1)).toEqual([7, items[1_999].lat]);
  });

  it.each([
    ['not an object', 'nope'],
    ['no coordinates', tour({ _embedded: {} })],
    [
      'one usable point',
      tour({ _embedded: { coordinates: { items: [{ lat: 1, lng: 2 }, { lat: 'x' }] } } }),
    ],
  ])('returns null for %s', (_label, json) => {
    expect(normaliseKomootTour(json, '42')).toBeNull();
  });
});
