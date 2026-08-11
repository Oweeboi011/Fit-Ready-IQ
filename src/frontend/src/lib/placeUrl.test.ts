import { describe, expect, it } from 'vitest';

import { decodePlaceRef, encodePlaceRef, placeShareUrl } from './placeUrl';

describe('place deep links', () => {
  it('round-trips every kind', () => {
    for (const kind of ['route', 'mountain', 'campsite', 'activity'] as const) {
      expect(decodePlaceRef(encodePlaceRef(kind, 'x1'))).toEqual({ kind, id: 'x1' });
    }
  });

  it('keeps colons that belong to the id', () => {
    // Strava ids and file-derived activity ids contain separators.
    expect(decodePlaceRef('activity:strava:12345')).toEqual({
      kind: 'activity',
      id: 'strava:12345',
    });
  });

  it.each([
    [null, 'nothing'],
    ['', 'an empty string'],
    ['route', 'a kind with no id'],
    ['route:', 'an empty id'],
    [':r1', 'an empty kind'],
    ['badkind:r1', 'an unknown kind'],
  ])('rejects %o (%s)', (value: string | null, _description: string) => {
    expect(decodePlaceRef(value)).toBeNull();
  });

  it('percent-encodes the ref so ids with separators survive the query string', () => {
    const url = placeShareUrl('activity', 'strava:1 2&3');
    const encoded = new URL(url, 'https://example.test').searchParams.get('place');
    expect(decodePlaceRef(encoded)).toEqual({ kind: 'activity', id: 'strava:1 2&3' });
  });

  it('points at the app, not the marketing page', () => {
    expect(placeShareUrl('route', 'r1')).toContain('/app?place=');
  });
});
