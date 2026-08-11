import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchLatestRadarFrame, radarTileUrl, type RadarFrame } from './radarLayer';

describe('radarTileUrl', () => {
  it("builds RainViewer's documented tile URL shape", () => {
    const frame: RadarFrame = {
      host: 'https://tilecache.rainviewer.com',
      path: '/v2/radar/123',
      time: 123,
    };
    expect(radarTileUrl(frame, 5, 6, 7)).toBe(
      'https://tilecache.rainviewer.com/v2/radar/123/256/7/5/6/2/1_1.png'
    );
  });
});

describe('fetchLatestRadarFrame', () => {
  // The frame is cached at module scope for a few minutes. Real timers plus a
  // fresh Date.now() per test isn't enough to escape that cache, so each test
  // fast-forwards a fake clock past the TTL before calling in.
  let now = 0;

  beforeEach(() => {
    now += 10 * 60 * 1000; // clears the previous test's cached frame
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the last past frame from a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        host: 'https://tilecache.rainviewer.com',
        radar: {
          past: [
            { time: 1, path: '/v2/radar/1' },
            { time: 2, path: '/v2/radar/2' },
          ],
        },
      }),
    } as Response);

    const frame = await fetchLatestRadarFrame();
    expect(frame).toEqual({
      host: 'https://tilecache.rainviewer.com',
      path: '/v2/radar/2',
      time: 2,
    });
  });

  it('returns null when the request fails, rather than throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    await expect(fetchLatestRadarFrame()).resolves.toBeNull();
  });

  it('returns null when there are no past frames', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ host: 'https://tilecache.rainviewer.com', radar: { past: [] } }),
    } as Response);
    await expect(fetchLatestRadarFrame()).resolves.toBeNull();
  });
});
