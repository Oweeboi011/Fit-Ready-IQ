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

  it('decodes a single point', () => {
    expect(decodePolyline('_p~iF~ps|U')).toEqual([[-120.2, 38.5]]);
  });

  it('decodes decreasing latitudes, which encode as negative deltas', () => {
    // The negative-delta branch inverts the shifted value rather than using it directly.
    expect(decodePolyline('_p~iF~ps|U~tlL?~mme@_kiF')).toEqual([
      [-120.2, 38.5],
      [-120.2, 36.3],
      [-119, 30],
    ]);
  });

  it('decodes a zero delta as a repeated point', () => {
    expect(decodePolyline('_p~iF~ps|U??')).toEqual([
      [-120.2, 38.5],
      [-120.2, 38.5],
    ]);
  });

  it('keeps reading continuation bytes whose value is exactly the 0x20 flag', () => {
    // Each delta here encodes as [0x20, 0x01]: the first byte carries the
    // continuation flag with a zero payload, so a decoder that stops on
    // anything less than 0x20 would misread every coordinate.
    expect(decodePolyline('_@_@_@_@')).toEqual([
      [0.00016, 0.00016],
      [0.00032, 0.00032],
    ]);
  });
});
