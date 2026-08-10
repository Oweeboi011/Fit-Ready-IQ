import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchElevationBatch } from './elevation';

describe('fetchElevationBatch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty, non-failed result for no locations without calling the network', async () => {
    const result = await fetchElevationBatch([]);
    expect(result).toEqual({ values: [], failed: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports success when a source answered, even a fallback one', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [120, null], source: 'open-elevation' }),
    } as Response);

    const result = await fetchElevationBatch([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
    expect(result).toEqual({ values: [120, null], failed: false });
  });

  it('reports failure when no source could answer', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [null], source: null }),
    } as Response);

    const result = await fetchElevationBatch([{ lat: 1, lng: 2 }]);
    expect(result).toEqual({ values: [null], failed: true });
  });

  it('falls back to nulls, marked failed, on a network error rather than throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    const result = await fetchElevationBatch([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
    expect(result).toEqual({ values: [null, null], failed: true });
  });

  it('falls back to nulls, marked failed, on a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    const result = await fetchElevationBatch([{ lat: 1, lng: 2 }]);
    expect(result).toEqual({ values: [null], failed: true });
  });

  it('falls back to nulls, marked failed, on a malformed body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ nope: true }),
    } as Response);
    const result = await fetchElevationBatch([{ lat: 1, lng: 2 }]);
    expect(result).toEqual({ values: [null], failed: true });
  });
});
