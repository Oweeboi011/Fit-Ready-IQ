import { expect, test } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 14.5995, longitude: 120.9842 } });

/** Seeds imported activities the way the GPX importer does. */
async function seedTraining(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const now = Date.now();
    const day = 86_400_000;
    const acts = [0, 7, 14, 21].map((d, i) => ({
      id: `seed-${i}`,
      source: 'garmin',
      name: 'Training',
      sport_type: 'Hike',
      start_date: new Date(now - (d + 1) * day).toISOString(),
      distance_km: 18,
      elevation_gain_m: 1200,
      moving_time_s: 14400,
    }));
    localStorage.setItem('fri_activities', JSON.stringify(acts));
  });
}

/** Opens the first discovered route in the sidebar. */
async function openFirstRoute(page: import('@playwright/test').Page) {
  // A card is a container whose title is the button (see RouteListItem).
  const first = page
    .locator('aside [data-place-card]')
    .filter({ hasText: /Length/ })
    .first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.getByRole('button').first().click();
  return page.getByRole('dialog');
}

/**
 * A discovered route is a Google Places pin with no trail geometry, so its
 * length is unknown — and readiness, which compares a route's length to your
 * training, has nothing to compare. These pin down that the product says so,
 * rather than scoring against a length it invented (which is what it used to
 * do: the "length" was the distance from the viewer to the pin).
 */
test.describe('readiness score', () => {
  test('says a discovered route is unmeasured rather than scoring it', async ({ page }) => {
    await page.goto('/app');
    const dialog = await openFirstRoute(page);

    await expect(dialog.getByRole('heading', { name: 'Your readiness' })).toBeVisible();
    await expect(dialog.getByText(/length hasn't been measured/i)).toBeVisible();
  });

  test('does not invent a score, or ask for training, when training exists', async ({ page }) => {
    await seedTraining(page);
    await page.goto('/app');
    const dialog = await openFirstRoute(page);

    await expect(dialog.getByRole('heading', { name: 'Your readiness' })).toBeVisible();
    await expect(dialog.getByText(/length hasn't been measured/i)).toBeVisible();
    // Connecting more training cannot fix an unmeasured route, so the product
    // must not suggest it.
    await expect(dialog.getByRole('button', { name: 'Connect your training' })).toHaveCount(0);
    await expect(dialog.getByRole('img', { name: /^Readiness \d+ out of 100/ })).toHaveCount(0);
  });
});
