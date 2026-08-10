'use client';

/**
 * Client for `/api/elevation` — ground elevation for a batch of points, with
 * a free public fallback when Google's Elevation API is unavailable.
 *
 * `values[i] === null` means "we do not know", never "sea level" or "0 m".
 * Callers must keep treating a null the same way they already treat a
 * missing measurement — an unrated difficulty band, a blank stat, never an
 * invented number.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ElevationBatchResult {
  values: (number | null)[];
  /** True when neither Google nor the fallback returned usable data. */
  failed: boolean;
}

export async function fetchElevationBatch(locations: LatLng[]): Promise<ElevationBatchResult> {
  if (locations.length === 0) return { values: [], failed: false };

  try {
    const res = await fetch('/api/elevation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as { values?: unknown; source?: string | null };
    if (!Array.isArray(data.values)) throw new Error('Malformed elevation response');

    return { values: data.values as (number | null)[], failed: data.source == null };
  } catch (err) {
    console.error('Elevation fetch failed:', err);
    return { values: locations.map(() => null), failed: true };
  }
}
