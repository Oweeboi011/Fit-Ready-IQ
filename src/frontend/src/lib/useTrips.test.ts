import { describe, expect, it } from 'vitest';

import { tripFromDocument } from './useTrips';

describe('tripFromDocument', () => {
  const raw = {
    target: { kind: 'route', id: 'wmt-hiking-1', name: 'Edelweissweg', coordinates: [7.7, 46] },
    startAt: 1,
    expectedReturnAt: 2,
    checkedInAt: null,
    notes: 'with Sam',
  };

  it('reads a stored trip', () => {
    expect(tripFromDocument('t1', raw)).toEqual({
      id: 't1',
      target: raw.target,
      startAt: 1,
      expectedReturnAt: 2,
      checkedInAt: null,
      notes: 'with Sam',
    });
  });

  it('reads a check-in as the server stamped it', () => {
    const stamped = { ...raw, checkedInAt: { toMillis: () => 1_800_000_000_000 } };
    expect(tripFromDocument('t1', stamped)?.checkedInAt).toBe(1_800_000_000_000);
    // A bare number is what an old client clock would have written; it is not trusted.
    expect(tripFromDocument('t1', { ...raw, checkedInAt: 5 })?.checkedInAt).toBeNull();
  });

  it('drops a document that is not a trip we wrote', () => {
    expect(tripFromDocument('x', { ...raw, startAt: 'soon' })).toBeNull();
    expect(tripFromDocument('x', { ...raw, target: { ...raw.target, kind: 'city' } })).toBeNull();
    expect(tripFromDocument('x', {})).toBeNull();
  });
});
