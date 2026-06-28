import { describe, expect, it } from 'vitest';

import { decodePolyline } from '@/lib/polylineDecoder';

describe('decodePolyline', () => {
  it('decodes encoded polyline into [lng, lat] coordinates', () => {
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

    const decoded = decodePolyline(encoded);

    expect(decoded).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('returns empty list when encoded string is empty', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
