/**
 * Precipitation radar tiles, via RainViewer's public API.
 *
 * No key required and nothing here ever touches our own servers or Google's
 * quota — it's a separate, free, unauthenticated tile source, so this talks
 * to it directly from the client.
 */

const FRAME_LIST_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const FRAME_TTL_MS = 5 * 60 * 1000; // RainViewer publishes a new frame roughly every 10 min

export interface RadarFrame {
  host: string;
  /** e.g. "/v2/radar/1699999999" */
  path: string;
  /** Unix seconds this frame represents. */
  time: number;
}

interface RainViewerResponse {
  host?: string;
  radar?: {
    past?: { time: number; path: string }[];
    nowcast?: { time: number; path: string }[];
  };
}

let cached: { frame: RadarFrame | null; fetchedAt: number } | null = null;

/** The most recent radar frame, cached for a few minutes since RainViewer only updates every ~10. */
export async function fetchLatestRadarFrame(): Promise<RadarFrame | null> {
  if (cached && Date.now() - cached.fetchedAt < FRAME_TTL_MS) {
    return cached.frame;
  }

  try {
    const res = await fetch(FRAME_LIST_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`RainViewer ${res.status}`);
    const data = (await res.json()) as RainViewerResponse;
    const past = data.radar?.past ?? [];
    const latest = past[past.length - 1];
    const frame: RadarFrame | null =
      data.host && latest ? { host: data.host, path: latest.path, time: latest.time } : null;
    cached = { frame, fetchedAt: Date.now() };
    return frame;
  } catch {
    cached = { frame: null, fetchedAt: Date.now() };
    return null;
  }
}

/**
 * Tile URL template for a Google Maps `ImageMapType`.
 *
 * Color scheme 2 is RainViewer's "universal blue" — readable on both the
 * light and terrain base maps this app uses. `1_1` smooths the radar and
 * shows snow separately, which are the two settings their docs recommend
 * for a general-audience map rather than a meteorologist's tool.
 */
export function radarTileUrl(frame: RadarFrame, x: number, y: number, z: number): string {
  return `${frame.host}${frame.path}/256/${z}/${x}/${y}/2/1_1.png`;
}
