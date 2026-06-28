/**
 * Parses GPX (and basic TCX) files into a structured activity object.
 * Used for COROS, Garmin, and Komoot file uploads.
 */

export interface ParsedGpxActivity {
  name: string;
  sport_type: string;
  distance_km: number;
  elevation_gain_m: number;
  moving_time_s: number;
  start_date: string;
  polyline: [number, number][]; // [lng, lat] pairs
  start_latlng?: [number, number]; // [lng, lat]
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inferSportType(distanceKm: number, elevGainM: number): string {
  const gradeRatio = distanceKm > 0 ? elevGainM / (distanceKm * 1000) : 0;
  if (gradeRatio > 0.07) return 'Hike';
  if (distanceKm < 15) return 'Run';
  return 'Ride';
}

export async function parseGpxFile(file: File): Promise<ParsedGpxActivity> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid GPX file — could not be parsed');
  }

  const rawName =
    doc.querySelector('trk > name')?.textContent ||
    doc.querySelector('name')?.textContent ||
    file.name.replace(/\.(gpx|fit|tcx)$/i, '');
  const name = rawName.trim();

  const trkpts = Array.from(doc.querySelectorAll('trkpt'));
  if (trkpts.length === 0) {
    throw new Error('No track points found — file may be empty or unsupported');
  }

  const polyline: [number, number][] = [];
  let totalDistance = 0;
  let elevationGain = 0;
  let prevEle: number | null = null;
  let prevLat: number | null = null;
  let prevLon: number | null = null;

  const firstTime = trkpts[0].querySelector('time')?.textContent ?? null;
  const lastTime = trkpts[trkpts.length - 1].querySelector('time')?.textContent ?? null;

  trkpts.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') ?? '0');
    const lon = parseFloat(pt.getAttribute('lon') ?? '0');
    const eleText = pt.querySelector('ele')?.textContent;
    const ele = eleText !== undefined && eleText !== null ? parseFloat(eleText) : null;

    polyline.push([lon, lat]);

    if (prevLat !== null && prevLon !== null) {
      totalDistance += haversineDistanceKm(prevLat, prevLon, lat, lon);
    }

    if (ele !== null && prevEle !== null && ele > prevEle) {
      elevationGain += ele - prevEle;
    }

    prevLat = lat;
    prevLon = lon;
    prevEle = ele;
  });

  let movingTimeSec = 0;
  if (firstTime && lastTime) {
    movingTimeSec = Math.max(
      0,
      (new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 1000
    );
  }

  const distKm = Math.round(totalDistance * 100) / 100;
  const elevM = Math.round(elevationGain);

  return {
    name,
    sport_type: inferSportType(distKm, elevM),
    distance_km: distKm,
    elevation_gain_m: elevM,
    moving_time_s: Math.round(movingTimeSec),
    start_date: firstTime ?? new Date().toISOString(),
    polyline,
    start_latlng: polyline.length > 0 ? polyline[0] : undefined,
  };
}
