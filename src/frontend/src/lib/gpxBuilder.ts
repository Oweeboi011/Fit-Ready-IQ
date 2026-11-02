/**
 * Build a GPX 1.1 document from a planned route.
 *
 * The counterpart to `gpxParser`: what the planner exports, other tools import.
 * Written by hand rather than with a serialiser because the shape is small and
 * fixed, and because the escaping rules are the only subtle part.
 */

export interface PlannerWaypoint {
  id: string;
  /** GeoJSON order, `[lng, lat]`, as everywhere else in the app. */
  coordinates: [number, number];
  name: string;
  /** Metres, when known. */
  elevation?: number | null;
}

/** XML predefined entities. Names come from user input and can contain any of them. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** GPX wants at least six decimals; more is false precision from a map click. */
function coord(value: number): string {
  return value.toFixed(6);
}

export interface BuildGpxOptions {
  name: string;
  waypoints: PlannerWaypoint[];
  /**
   * The routed line, `[lng, lat]`, when the router joined the waypoints. The
   * track follows it; without it, the track can only join the waypoints.
   */
  path?: [number, number][];
  /** Overrides the timestamp; injected by tests. */
  createdAt?: Date;
}

/**
 * Both `<wpt>` entries and a `<trk>` are emitted.
 *
 * Some tools show only waypoints and others only tracks, and a plan that opens
 * empty in the user's watch app is a plan they cannot use.
 *
 * The track is the routed path when there is one. It used to be the waypoints
 * alone, so a watch following an exported plan drew straight lines across
 * whatever lay between them — the route the planner had just measured along
 * real paths was on screen and nowhere in the file.
 */
export function buildGpx({
  name,
  waypoints,
  path,
  createdAt = new Date(),
}: BuildGpxOptions): string {
  const safeName = escapeXml(name.trim() || 'Fit Ready IQ route');
  const time = createdAt.toISOString();

  const wpts = waypoints
    .map((w) => {
      const [lng, lat] = w.coordinates;
      const ele = w.elevation == null ? '' : `\n    <ele>${w.elevation.toFixed(1)}</ele>`;
      return `  <wpt lat="${coord(lat)}" lon="${coord(lng)}">${ele}\n    <name>${escapeXml(w.name)}</name>\n  </wpt>`;
    })
    .join('\n');

  const trackPoints: Pick<PlannerWaypoint, 'coordinates' | 'elevation'>[] =
    path && path.length >= 2 ? path.map((coordinates) => ({ coordinates })) : waypoints;
  const trkpts = trackPoints
    .map((w) => {
      const [lng, lat] = w.coordinates;
      const ele = w.elevation == null ? '' : `<ele>${w.elevation.toFixed(1)}</ele>`;
      return `      <trkpt lat="${coord(lat)}" lon="${coord(lng)}">${ele}</trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fit Ready IQ" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
    <time>${time}</time>
  </metadata>
${wpts}
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** A filename that survives every filesystem the export might land on. */
export function gpxFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'route'}.gpx`;
}
