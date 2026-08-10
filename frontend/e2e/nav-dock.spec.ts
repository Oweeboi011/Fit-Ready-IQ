import { expect, test } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 14.5995, longitude: 120.9842 } });

test.describe('navigation dock', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('toolbar', { name: 'Navigation dock' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('switches the sidebar list from the map', async ({ page }) => {
    await page.getByRole('button', { name: /Camps/ }).click();
    await expect(page.getByRole('tab', { name: /Camps/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('layer toggles hide markers and survive a reload', async ({ page }) => {
    // Markers only — the search input's label also mentions campsites.
    const campMarkers = page.locator('[role="button"][aria-label*="campsite"]');
    await expect.poll(() => campMarkers.count(), { timeout: 25_000 }).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^Layers/ }).click();
    await page.getByRole('button', { name: /Campsites/ }).click();
    await expect.poll(() => campMarkers.count()).toBe(0);

    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Navigation dock' })).toBeVisible({
      timeout: 20_000,
    });
    await expect.poll(() => campMarkers.count(), { timeout: 20_000 }).toBe(0);
  });

  test('panels close on Escape', async ({ page }) => {
    await page.getByRole('button', { name: /Terrain/ }).click();
    await expect(page.getByRole('heading', { name: 'Terrain pulse' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Terrain pulse' })).toHaveCount(0);
  });

  test('alerts panel reports a clean run when nothing failed', async ({ page }) => {
    await page.getByRole('button', { name: /Alerts/ }).click();
    await expect(page.getByText(/Nothing needs your attention/i)).toBeVisible();
  });
});
