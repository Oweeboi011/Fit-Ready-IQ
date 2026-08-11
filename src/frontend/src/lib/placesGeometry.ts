import { haversineDistanceKm } from '@/lib/gpxParser';

/**
 * How far from the user we are willing to call a place "nearby".
 *
 * Google's `textSearch` treats `location` + `radius` as a *bias*, not a filter,
 * so a query for hiking trails run from Manila reliably returns campgrounds in
 * California. Those results then landed in the sidebar and, worse, in the map's
 * `fitBounds`, which is why the map opened zoomed out to the whole planet.
 * Nothing upstream enforces this, so we enforce it here.
 */
export const SEARCH_RADIUS_KM = 80;

/** Drop anything the Places API returned that is not actually near the user. */
export function withinSearchRadius<T extends { coordinates: [number, number] }>(
  items: T[],
  from: { lat: number; lng: number } | null
): T[] {
  if (!from) return items;
  return items.filter((item) => {
    const [lng, lat] = item.coordinates;
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    return haversineDistanceKm(from.lat, from.lng, lat, lng) <= SEARCH_RADIUS_KM;
  });
}
