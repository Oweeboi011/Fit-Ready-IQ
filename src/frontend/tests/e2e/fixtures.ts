import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every E2E test runs against a fixed set of places instead of live discovery.
 *
 * Discovery used to be Google Places, called from the browser with a key whose
 * project had billing off, so every spec that needed a place failed in CI for
 * months. It is now `/api/discover` (OpenStreetMap, free), but a test that
 * depends on volunteer-run services and on what is mapped near Manila this week
 * is a test of them, not of us. These places are chosen to exercise the cases
 * the product distinguishes: a measured route with a climb, a place with no
 * length at all, a peak with a height, and a campsite.
 *
 * Coordinates sit near the geolocation the specs grant (14.5995, 120.9842).
 */
export const DISCOVERY_FIXTURE = {
  routes: [
    {
      id: 'wmt-hiking-900001',
      name: 'Marikina Ridge Trail',
      coordinates: [121.01, 14.61],
      distance_km: 12.4,
      elevation_gain_m: 480,
      difficulty: 'moderate',
      activity_type: 'hike',
      place_id: 'osm:relation/900001',
      photos: [],
    },
    {
      id: 'osm-node-900002',
      name: 'Montalban Crag',
      coordinates: [121.02, 14.62],
      distance_km: null,
      elevation_gain_m: null,
      difficulty: 'unknown',
      activity_type: 'rock_climb',
      place_id: 'osm:node/900002',
      photos: [],
    },
  ],
  mountains: [
    {
      id: 'osm-node-900003',
      name: 'Mount Puting Bato',
      coordinates: [121.03, 14.63],
      elevation_m: 332,
      summit_elevation: 332,
      mountain_type: 'peak',
      place_id: 'osm:node/900003',
      photos: [],
    },
  ],
  campsites: [
    {
      id: 'osm-way-900004',
      name: 'Quest Adventure Camp',
      coordinates: [121.04, 14.58],
      type: 'campground',
      amenities: [],
      place_id: 'osm:way/900004',
      photos: [],
    },
  ],
  failed: [],
};

export async function stubDiscovery(page: Page) {
  // A miss on the shared tier, so the page goes on to /api/discover.
  await page.route('**/api/places/cache**', (route) =>
    route.fulfill({ status: 404, json: { hit: false } })
  );
  await page.route('**/api/discover**', (route) =>
    route.fulfill({ status: 200, json: DISCOVERY_FIXTURE })
  );
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({
      status: 200,
      json: { address: { city: 'Manila', state: 'Metro Manila' } },
    })
  );
  await page.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({ status: 200, json: { features: [] } })
  );
}

export const test = base.extend({
  // Playwright's fixture callback, named `provide` so the React hooks lint
  // rule does not mistake it for React's `use`.
  page: async ({ page }, provide) => {
    await stubDiscovery(page);
    await provide(page);
  },
});

export { expect };
