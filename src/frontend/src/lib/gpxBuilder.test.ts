import { describe, expect, it } from 'vitest';

import { buildGpx, gpxFilename, type PlannerWaypoint } from './gpxBuilder';
import { parseGpxFile } from './gpxParser';

function wp(lng: number, lat: number, name = 'Point', elevation?: number): PlannerWaypoint {
  return { id: `${lng},${lat}`, coordinates: [lng, lat], name, elevation };
}

const CREATED = new Date('2026-06-01T08:00:00.000Z');

/** jsdom's File has no .text(); the parser only needs that one method. */
function gpxFile(xml: string): File {
  return { name: 'plan.gpx', text: async () => xml } as unknown as File;
}

/** Reads a tag's text back out, so escaping is checked by parsing not regex. */
function firstTagText(xml: string, tag: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc.querySelector(tag)?.textContent ?? null;
}

describe('buildGpx', () => {
  it('round-trips through our own parser', async () => {
    // The export is worthless if the app cannot read its own file back.
    const xml = buildGpx({
      name: 'Pulag traverse',
      createdAt: CREATED,
      waypoints: [wp(120.9, 16.5, 'Jumpoff', 2100), wp(120.91, 16.51, 'Summit', 2926)],
    });

    const parsed = await parseGpxFile(gpxFile(xml));

    expect(parsed.polyline).toHaveLength(2);
    expect(parsed.polyline[0][0]).toBeCloseTo(120.9, 5);
    expect(parsed.polyline[0][1]).toBeCloseTo(16.5, 5);
    expect(parsed.elevation_gain_m).toBeGreaterThan(800);
  });

  it('emits both waypoints and a track, since tools differ on which they read', () => {
    const xml = buildGpx({ name: 'Two ways', createdAt: CREATED, waypoints: [wp(1, 2)] });
    expect(xml).toContain('<wpt lat="2.000000" lon="1.000000">');
    expect(xml).toContain('<trkpt lat="2.000000" lon="1.000000">');
  });

  it('escapes XML metacharacters in names', () => {
    const xml = buildGpx({
      name: 'Ridge & <Gully>',
      createdAt: CREATED,
      waypoints: [wp(1, 2, `Bob's "camp" & co`)],
    });

    // Parsing is the real check: the document must stay well-formed and the
    // names must come back exactly as typed.
    expect(firstTagText(xml, 'metadata > name')).toBe('Ridge & <Gully>');
    expect(firstTagText(xml, 'wpt > name')).toBe(`Bob's "camp" & co`);
  });

  it('omits elevation when it is unknown rather than writing zero', () => {
    const xml = buildGpx({ name: 'Flat', createdAt: CREATED, waypoints: [wp(1, 2, 'A')] });
    expect(xml).not.toContain('<ele>');
  });

  it('writes elevation when it is known', () => {
    const xml = buildGpx({ name: 'Up', createdAt: CREATED, waypoints: [wp(1, 2, 'A', 1234)] });
    expect(xml).toContain('<ele>1234.0</ele>');
  });

  it('records the creation time in the metadata', () => {
    const xml = buildGpx({ name: 'T', createdAt: CREATED, waypoints: [wp(1, 2)] });
    expect(xml).toContain('<time>2026-06-01T08:00:00.000Z</time>');
  });

  it('declares GPX 1.1 with the right namespace', () => {
    const xml = buildGpx({ name: 'T', createdAt: CREATED, waypoints: [wp(1, 2)] });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml).toContain('version="1.1"');
  });

  it('falls back to a name rather than emitting an empty one', () => {
    const xml = buildGpx({ name: '   ', createdAt: CREATED, waypoints: [wp(1, 2)] });
    expect(xml).toContain('<name>Fit Ready IQ route</name>');
  });

  it('keeps six decimals of coordinate precision', () => {
    const xml = buildGpx({
      name: 'Precise',
      createdAt: CREATED,
      waypoints: [wp(120.987654321, 16.123456789)],
    });
    expect(xml).toContain('lat="16.123457" lon="120.987654"');
  });
});

describe('gpxFilename', () => {
  it.each([
    ['Pulag Traverse', 'pulag-traverse.gpx'],
    ['Ridge & Gully!', 'ridge-gully.gpx'],
    ['  spaced  out  ', 'spaced-out.gpx'],
    ['', 'route.gpx'],
    ['!!!', 'route.gpx'],
  ])('turns %o into %o', (input, expected) => {
    expect(gpxFilename(input)).toBe(expected);
  });

  it('caps the length so no filesystem rejects it', () => {
    expect(gpxFilename('a'.repeat(200)).length).toBeLessThanOrEqual(64);
  });
});
