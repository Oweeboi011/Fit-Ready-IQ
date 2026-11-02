import { expect, test } from './fixtures';

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

/** Opens a discovered route from the sidebar by name. */
async function openRoute(page: import('@playwright/test').Page, name: string) {
  // A card is a container whose title is the button (see RouteListItem).
  const card = page.locator('aside [data-place-card]').filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button').first().click();
  return page.getByRole('dialog');
}

/**
 * Readiness compares a route's length and climb with your training. A route
 * from Waymarked Trails has a measured length; a climbing area has none. The
 * product must score the first and say plainly that it cannot score the
 * second, rather than score against a length it invented (which it once did:
 * the "length" was the distance from the viewer to the pin).
 */
test.describe('readiness score', () => {
  test('says a place with no measured length is unmeasured rather than scoring it', async ({
    page,
  }) => {
    await seedTraining(page);
    await page.goto('/app');
    const dialog = await openRoute(page, 'Montalban Crag');

    await expect(dialog.getByRole('heading', { name: 'Your readiness' })).toBeVisible();
    await expect(dialog.getByText(/length hasn't been measured/i)).toBeVisible();
    // Connecting more training cannot fix an unmeasured route, so the product
    // must not suggest it.
    await expect(dialog.getByRole('button', { name: 'Connect your training' })).toHaveCount(0);
    await expect(dialog.getByRole('img', { name: /^Readiness \d+ out of 100/ })).toHaveCount(0);
  });

  test('scores a measured route against the training it has', async ({ page }) => {
    await seedTraining(page);
    await page.goto('/app');
    const dialog = await openRoute(page, 'Marikina Ridge Trail');

    await expect(dialog.getByRole('heading', { name: 'Your readiness' })).toBeVisible();
    await expect(dialog.getByRole('img', { name: /^Readiness \d+ out of 100/ })).toBeVisible();
  });
});
