import { describe, expect, it } from 'vitest';

import { parseGpxFile } from '@/lib/gpxParser';

describe('parseGpxFile', () => {
  it('parses a minimal GPX file into a normalized activity', async () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Route</name>
    <trkseg>
      <trkpt lat="14.6000" lon="120.9800"><ele>10</ele><time>2026-01-01T00:00:00Z</time></trkpt>
      <trkpt lat="14.6010" lon="120.9810"><ele>30</ele><time>2026-01-01T00:10:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    const fileLike = {
      name: 'sample.gpx',
      text: async () => gpx,
    } as unknown as File;
    const parsed = await parseGpxFile(fileLike);

    expect(parsed.name).toBe('Test Route');
    expect(parsed.polyline).toEqual([
      [120.98, 14.6],
      [120.981, 14.601],
    ]);
    expect(parsed.elevation_gain_m).toBe(20);
    expect(parsed.moving_time_s).toBe(600);
    expect(parsed.start_latlng).toEqual([120.98, 14.6]);
  });
});
