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

test.describe('readiness score', () => {
  test('asks for training data rather than showing a made-up score', async ({ page }) => {
    await page.goto('/app');
    const first = page
      .locator('aside button')
      .filter({ hasText: /Distance/ })
      .first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your readiness' })).toBeVisible();
    await expect(page.getByText(/Connect a device or import a GPX/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect your training' })).toBeVisible();
  });

  test('scores a route once training exists, and names the limiting factor', async ({ page }) => {
    await seedTraining(page);
    await page.goto('/app');

    const first = page
      .locator('aside button')
      .filter({ hasText: /Distance/ })
      .first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Your readiness' })).toBeVisible();

    // Every factor reports capacity against demand, so the number is checkable.
    // `exact` matters: the summary sentence also contains the factor name.
    await expect(dialog.getByText('Longest recent outing', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Weekly volume', { exact: true })).toBeVisible();
    // The training plan below adds its own "covers this route" sentence, so
    // match the readiness summary specifically.
    await expect(dialog.getByText(/Limited by|covers this route's/i).first()).toBeVisible();
    // And the plan itself now appears beneath it.
    await expect(dialog.getByText(/No training needed|weeks? of build-up/i)).toBeVisible();
    await expect(dialog.getByText(/of 18\.0 km|18\.0 km of/)).toBeVisible();
  });
});
