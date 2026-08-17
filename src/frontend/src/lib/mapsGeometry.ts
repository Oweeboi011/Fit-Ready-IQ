// Google Maps geometry and batch-lookup helpers (Elevation, Distance Matrix, haversine).
// Pure functions — no React, no component state.

export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Look up ground elevation for a batch of points.
 *
 * A `null` entry means "we do not know", and callers must treat it that way —
 * never as zero, and never as a licence to substitute a plausible-looking
 * number. Silently swallowing a failed status here is what previously made
 * every route report exactly 50 m of gain and emptied the peaks tab, because
 * downstream code coerced the nulls into 0 and then floored or filtered them.
 */
export function fetchElevations(
  locations: google.maps.LatLngLiteral[]
): Promise<{ values: (number | null)[]; failed: boolean }> {
  return new Promise((resolve) => {
    if (!locations.length) {
      resolve({ values: [], failed: false });
      return;
    }
    const elevationService = new google.maps.ElevationService();
    const CHUNK = 512;
    const chunks: google.maps.LatLngLiteral[][] = [];
    for (let i = 0; i < locations.length; i += CHUNK) chunks.push(locations.slice(i, i + CHUNK));
    Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<{ values: (number | null)[]; failed: boolean }>((res) => {
            elevationService.getElevationForLocations({ locations: chunk }, (results, status) => {
              if (status === google.maps.ElevationStatus.OK && results) {
                res({
                  values: results.map((r) =>
                    r.elevation != null ? Math.round(r.elevation) : null
                  ),
                  failed: false,
                });
              } else {
                // OVER_QUERY_LIMIT / REQUEST_DENIED / INVALID_REQUEST all land
                // here. Surface it — an unenabled or over-quota Elevation API
                // is a configuration problem, not missing terrain.
                console.error(`ElevationService failed: ${status}`);
                res({ values: chunk.map(() => null), failed: true });
              }
            });
          })
      )
    ).then((all) =>
      resolve({
        values: all.flatMap((r) => r.values),
        failed: all.some((r) => r.failed),
      })
    );
  });
}

/**
 * Google's cap on samples for one `getElevationAlongPath` call.
 *
 * 256 is plenty for a profile strip a few hundred pixels wide — more samples
 * than pixels buys nothing but quota.
 */
const MAX_PATH_SAMPLES = 256;

/**
 * Elevation sampled at even intervals *along* a path.
 *
 * Distinct from {@link fetchElevations}, which answers for points you name. A
 * profile needs the ground between the waypoints, and asking for the waypoints
 * alone is how the planner ended up reporting ascent as the sum of a handful of
 * corner elevations — a route that climbs a hill and comes back down between two
 * waypoints reads as flat.
 *
 * `getElevationAlongPath` does the interpolation server-side and returns exactly
 * `samples` results, evenly spaced, which is what a distance axis wants.
 *
 * Failure yields nulls rather than an exception, on the same principle as its
 * sibling: an unknown elevation must stay unknown rather than becoming zero.
 */
export function fetchElevationAlongPath(
  path: google.maps.LatLngLiteral[],
  samples = 128
): Promise<{ values: (number | null)[]; failed: boolean }> {
  return new Promise((resolve) => {
    // Two points is the minimum that describes a path; one is a location.
    if (path.length < 2) {
      resolve({ values: [], failed: false });
      return;
    }

    const count = Math.max(2, Math.min(samples, MAX_PATH_SAMPLES));
    const elevationService = new google.maps.ElevationService();

    elevationService.getElevationAlongPath({ path, samples: count }, (results, status) => {
      if (status === google.maps.ElevationStatus.OK && results) {
        resolve({
          values: results.map((r) => (r.elevation != null ? Math.round(r.elevation) : null)),
          failed: false,
        });
        return;
      }
      // Surfaced rather than swallowed: an unenabled or over-quota Elevation API
      // is a configuration problem, and a silent empty profile hides it.
      console.error(`ElevationService (along path) failed: ${status}`);
      resolve({ values: [], failed: true });
    });
  });
}

export function fetchTravelDistances(
  origin: google.maps.LatLngLiteral,
  destinations: google.maps.LatLngLiteral[]
): Promise<(number | null)[]> {
  return new Promise((resolve) => {
    if (!destinations.length) {
      resolve([]);
      return;
    }

    const service = new google.maps.DistanceMatrixService();
    const CHUNK = 25;
    const chunks: google.maps.LatLngLiteral[][] = [];
    for (let i = 0; i < destinations.length; i += CHUNK) {
      chunks.push(destinations.slice(i, i + CHUNK));
    }

    Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<(number | null)[]>((res) => {
            service.getDistanceMatrix(
              {
                origins: [origin],
                destinations: chunk,
                travelMode: google.maps.TravelMode.WALKING,
                unitSystem: google.maps.UnitSystem.METRIC,
              },
              (result, status) => {
                if (status === google.maps.DistanceMatrixStatus.OK && result?.rows?.[0]?.elements) {
                  res(
                    result.rows[0].elements.map((el) =>
                      el.status === 'OK' ? (el.distance?.value ?? null) : null
                    )
                  );
                  return;
                }
                res(chunk.map(() => null));
              }
            );
          })
      )
    ).then((all) => resolve(all.flat()));
  });
}

// Yosemite Decimal System trail class derived from summit elevation. Without a
// known elevation there is no class to give — say so rather than guess Class 1.
export function trailClassFromElevation(elevationM: number | null): string | undefined {
  if (elevationM == null) return undefined;
  if (elevationM >= 3000) return 'Class 4-5';
  if (elevationM >= 2000) return 'Class 3-4';
  if (elevationM >= 1000) return 'Class 2-3';
  if (elevationM >= 500) return 'Class 2';
  return 'Class 1';
}
