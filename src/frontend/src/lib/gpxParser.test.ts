import { describe, expect, it } from 'vitest';

import { haversineDistanceKm, parseGpxFile } from '@/lib/gpxParser';

/** Builds a File-like object accepted by parseGpxFile. */
function gpxFile(xml: string, name = 'sample.gpx'): File {
  return {
    name,
    text: async () => xml,
  } as unknown as File;
}

/** Wraps track points in a minimal but valid GPX document. */
function trackDoc(points: string, trackName = '<name>Test Route</name>'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    ${trackName}
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

/** One degree of longitude at the equator, in km, per the haversine formula. */
const KM_PER_DEGREE = 111.19492664455873;

describe('haversineDistanceKm', () => {
  it('measures a one-degree step along the equator', () => {
    expect(haversineDistanceKm(0, 0, 0, 1)).toBeCloseTo(KM_PER_DEGREE, 9);
  });

  it('measures a one-degree step along a meridian identically', () => {
    expect(haversineDistanceKm(0, 0, 1, 0)).toBeCloseTo(KM_PER_DEGREE, 9);
  });

  it('returns zero for a pair of identical coordinates', () => {
    expect(haversineDistanceKm(10, 20, 10, 20)).toBe(0);
  });

  it('is symmetric, so direction of travel does not change the distance', () => {
    expect(haversineDistanceKm(0, 1, 0, 0)).toBeCloseTo(haversineDistanceKm(0, 0, 0, 1), 12);
  });

  it('shrinks a fixed longitude span as latitude increases', () => {
    // cos(latitude) scaling: the same 1° of longitude is shorter nearer the poles.
    expect(haversineDistanceKm(60, 0, 60, 1)).toBeCloseTo(55.59693407114088, 9);
  });

  it('measures a short real-world segment', () => {
    expect(haversineDistanceKm(14.6, 120.98, 14.601, 120.981)).toBeCloseTo(0.15473511320284, 12);
  });

  it('measures a multi-kilometre segment', () => {
    expect(haversineDistanceKm(14.6, 120.98, 14.75, 121.05)).toBeCloseTo(18.300103952697793, 9);
  });
});

describe('parseGpxFile', () => {
  it('parses a minimal GPX file into a normalized activity', async () => {
    const parsed = await parseGpxFile(
      gpxFile(
        trackDoc(`      <trkpt lat="14.6000" lon="120.9800"><ele>10</ele><time>2026-01-01T00:00:00Z</time></trkpt>
      <trkpt lat="14.6010" lon="120.9810"><ele>30</ele><time>2026-01-01T00:10:00Z</time></trkpt>`)
      )
    );

    expect(parsed.name).toBe('Test Route');
    expect(parsed.polyline).toEqual([
      [120.98, 14.6],
      [120.981, 14.601],
    ]);
    expect(parsed.elevation_gain_m).toBe(20);
    expect(parsed.moving_time_s).toBe(600);
    expect(parsed.start_date).toBe('2026-01-01T00:00:00Z');
    expect(parsed.start_latlng).toEqual([120.98, 14.6]);
  });

  it('rounds distance to two decimal places', async () => {
    const parsed = await parseGpxFile(
      gpxFile(
        trackDoc(`      <trkpt lat="14.6000" lon="120.9800"></trkpt>
      <trkpt lat="14.6010" lon="120.9810"></trkpt>`)
      )
    );

    // Raw haversine distance is 0.15473511320284 km.
    expect(parsed.distance_km).toBe(0.15);
  });

  it('accumulates distance across every consecutive pair of points', async () => {
    const parsed = await parseGpxFile(
      gpxFile(
        trackDoc(`      <trkpt lat="0.0" lon="0.0"></trkpt>
      <trkpt lat="0.0" lon="1.0"></trkpt>
      <trkpt lat="0.0" lon="2.0"></trkpt>`)
      )
    );

    expect(parsed.distance_km).toBe(Math.round(KM_PER_DEGREE * 2 * 100) / 100);
  });

  describe('elevation gain', () => {
    it('sums only the climbs and ignores descents', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>100</ele></trkpt>
      <trkpt lat="0.0" lon="0.001"><ele>150</ele></trkpt>
      <trkpt lat="0.0" lon="0.002"><ele>120</ele></trkpt>
      <trkpt lat="0.0" lon="0.003"><ele>140</ele></trkpt>`)
        )
      );

      // +50 climb, -30 descent (ignored), +20 climb.
      expect(parsed.elevation_gain_m).toBe(70);
    });

    it('reports no gain for a flat track where elevation never increases', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>100</ele></trkpt>
      <trkpt lat="0.0" lon="0.001"><ele>100</ele></trkpt>
      <trkpt lat="0.0" lon="0.002"><ele>90</ele></trkpt>`)
        )
      );

      expect(parsed.elevation_gain_m).toBe(0);
    });

    it('treats points with no <ele> element as having unknown elevation', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>100</ele></trkpt>
      <trkpt lat="0.0" lon="0.001"></trkpt>
      <trkpt lat="0.0" lon="0.002"><ele>300</ele></trkpt>`)
        )
      );

      // The gap resets the previous elevation, so no climb is attributed.
      expect(parsed.elevation_gain_m).toBe(0);
    });

    it('treats an empty <ele> element as unknown elevation', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>100</ele></trkpt>
      <trkpt lat="0.0" lon="0.001"><ele></ele></trkpt>
      <trkpt lat="0.0" lon="0.002"><ele>300</ele></trkpt>`)
        )
      );

      expect(parsed.elevation_gain_m).toBe(0);
    });

    it('treats a non-numeric <ele> element as unknown elevation', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>100</ele></trkpt>
      <trkpt lat="0.0" lon="0.001"><ele>not-a-number</ele></trkpt>
      <trkpt lat="0.0" lon="0.002"><ele>300</ele></trkpt>`)
        )
      );

      expect(parsed.elevation_gain_m).toBe(0);
    });

    it('rounds elevation gain to whole metres', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>100.0</ele></trkpt>
      <trkpt lat="0.0" lon="0.001"><ele>100.6</ele></trkpt>`)
        )
      );

      expect(parsed.elevation_gain_m).toBe(1);
    });
  });

  describe('sport type inference', () => {
    it('infers Hike when the climb exceeds 7% of the distance', async () => {
      // 1.00 km with 100 m of climb => grade ratio 0.1.
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>0</ele></trkpt>
      <trkpt lat="0.008993216059187306" lon="0.0"><ele>100</ele></trkpt>`)
        )
      );

      expect(parsed.distance_km).toBe(1);
      expect(parsed.sport_type).toBe('Hike');
    });

    it('infers Run for a short, shallow track', async () => {
      // 1.00 km with 10 m of climb => grade ratio 0.01.
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>0</ele></trkpt>
      <trkpt lat="0.008993216059187306" lon="0.0"><ele>10</ele></trkpt>`)
        )
      );

      expect(parsed.distance_km).toBe(1);
      expect(parsed.sport_type).toBe('Run');
    });

    it('infers Ride at exactly the 15 km boundary', async () => {
      // Exactly 15.00 km after rounding, flat: the boundary is exclusive for Run.
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>0</ele></trkpt>
      <trkpt lat="0.1349" lon="0.0"><ele>0</ele></trkpt>`)
        )
      );

      expect(parsed.distance_km).toBe(15);
      expect(parsed.sport_type).toBe('Ride');
    });

    it('infers Run just below the 15 km boundary', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>0</ele></trkpt>
      <trkpt lat="0.1339" lon="0.0"><ele>0</ele></trkpt>`)
        )
      );

      expect(parsed.distance_km).toBeLessThan(15);
      expect(parsed.sport_type).toBe('Run');
    });

    it('prefers Hike over Ride when a long track is also steep', async () => {
      // 15 km with 2000 m of climb => grade ratio 0.133.
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>0</ele></trkpt>
      <trkpt lat="0.1349" lon="0.0"><ele>2000</ele></trkpt>`)
        )
      );

      expect(parsed.sport_type).toBe('Hike');
    });

    it('infers Run for a zero-distance track, where no grade can be computed', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><ele>0</ele></trkpt>
      <trkpt lat="0.0" lon="0.0"><ele>500</ele></trkpt>`)
        )
      );

      expect(parsed.distance_km).toBe(0);
      expect(parsed.sport_type).toBe('Run');
    });
  });

  describe('activity name', () => {
    it('prefers the track name and trims it', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"></trkpt>`, '<name>  Sunrise Loop  </name>'),
          'ignored.gpx'
        )
      );

      expect(parsed.name).toBe('Sunrise Loop');
    });

    it('falls back to any other name element when the track has none', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <metadata><name>Metadata Name</name></metadata>
  <trk>
    <trkseg>
      <trkpt lat="0.0" lon="0.0"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

      expect((await parseGpxFile(gpxFile(xml, 'ignored.gpx'))).name).toBe('Metadata Name');
    });

    it('falls back to the file name with its extension stripped', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="0.0" lon="0.0"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

      expect((await parseGpxFile(gpxFile(xml, 'Morning Ride.GPX'))).name).toBe('Morning Ride');
      expect((await parseGpxFile(gpxFile(xml, 'workout.tcx'))).name).toBe('workout');
      expect((await parseGpxFile(gpxFile(xml, 'workout.fit'))).name).toBe('workout');
      expect((await parseGpxFile(gpxFile(xml, 'no-extension'))).name).toBe('no-extension');
    });

    it('falls back past an empty track name', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name></name>
    <trkseg>
      <trkpt lat="0.0" lon="0.0"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

      expect((await parseGpxFile(gpxFile(xml, 'fallback.gpx'))).name).toBe('fallback');
    });
  });

  describe('timing', () => {
    it('derives moving time from the first and last track point', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><time>2026-01-01T00:00:00Z</time></trkpt>
      <trkpt lat="0.0" lon="0.001"><time>2026-01-01T00:05:00Z</time></trkpt>
      <trkpt lat="0.0" lon="0.002"><time>2026-01-01T01:00:00Z</time></trkpt>`)
        )
      );

      expect(parsed.moving_time_s).toBe(3600);
      expect(parsed.start_date).toBe('2026-01-01T00:00:00Z');
    });

    it('clamps negative durations to zero when timestamps run backwards', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><time>2026-01-01T01:00:00Z</time></trkpt>
      <trkpt lat="0.0" lon="0.001"><time>2026-01-01T00:00:00Z</time></trkpt>`)
        )
      );

      expect(parsed.moving_time_s).toBe(0);
    });

    it('reports zero moving time and a generated start date when no timestamps exist', async () => {
      const before = Date.now();
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"></trkpt>
      <trkpt lat="0.0" lon="0.001"></trkpt>`)
        )
      );

      expect(parsed.moving_time_s).toBe(0);
      expect(Date.parse(parsed.start_date)).toBeGreaterThanOrEqual(before);
    });

    it('reports zero moving time when only the first point is timestamped', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><time>2026-01-01T00:00:00Z</time></trkpt>
      <trkpt lat="0.0" lon="0.001"></trkpt>`)
        )
      );

      expect(parsed.moving_time_s).toBe(0);
      expect(parsed.start_date).toBe('2026-01-01T00:00:00Z');
    });

    it('rounds fractional seconds', async () => {
      const parsed = await parseGpxFile(
        gpxFile(
          trackDoc(`      <trkpt lat="0.0" lon="0.0"><time>2026-01-01T00:00:00.000Z</time></trkpt>
      <trkpt lat="0.0" lon="0.001"><time>2026-01-01T00:00:01.600Z</time></trkpt>`)
        )
      );

      expect(parsed.moving_time_s).toBe(2);
    });
  });

  describe('malformed input', () => {
    it('rejects a file that is not valid XML', async () => {
      await expect(parseGpxFile(gpxFile('<gpx><trk></gpx>'))).rejects.toThrow(
        'Invalid GPX file — could not be parsed'
      );
    });

    it('rejects a well-formed document with no track points', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Empty</name><trkseg></trkseg></trk>
</gpx>`;

      await expect(parseGpxFile(gpxFile(xml))).rejects.toThrow(
        'No track points found — file may be empty or unsupported'
      );
    });

    it('treats track points with missing coordinates as the origin', async () => {
      const parsed = await parseGpxFile(gpxFile(trackDoc(`      <trkpt></trkpt>`)));

      expect(parsed.polyline).toEqual([[0, 0]]);
      expect(parsed.start_latlng).toEqual([0, 0]);
      expect(parsed.distance_km).toBe(0);
    });
  });
});
