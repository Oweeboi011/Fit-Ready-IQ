import { expect, test } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 14.5995, longitude: 120.9842 } });

test.describe('route planner', () => {
  test('builds a route from map clicks and exports it as GPX', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('toolbar', { name: 'Navigation dock' })).toBeVisible({
      timeout: 20_000,
    });

    // Clicks are ignored until the map surface exists.
    await expect(page.locator('.gm-style').first()).toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: /Planner/ }).click();
    await expect(page.getByRole('heading', { name: 'Planner' })).toBeVisible();
    await expect(page.getByText(/Tap anywhere on the map/i)).toBeVisible();

    await page.mouse.click(760, 250);
    await page.waitForTimeout(500);
    await page.mouse.click(1000, 480);
    // Either the router answered, or it said why it could not. There is no
    // straight-line fallback any more, so "no route" is a valid outcome here —
    // what must never appear is a distance the router did not produce.
    await expect(
      page.getByText(/Following walking paths|Following cycling routes|No route/i)
    ).toBeVisible({ timeout: 15_000 });

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export as GPX' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.gpx$/);
  });

  test('saves a plan and reloads it after a refresh', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('toolbar', { name: 'Navigation dock' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.gm-style').first()).toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: /Planner/ }).click();

    await page.getByPlaceholder('Name this route').fill('Ridge loop');
    await page.mouse.click(760, 250);
    await page.waitForTimeout(500);
    await page.mouse.click(1000, 300);

    await page.getByRole('button', { name: 'Save plan' }).click();
    // "Saved" alone also matches the dock's Saved tab, so assert on the count.
    await expect(page.getByRole('button', { name: /Saved plans \(1\)/ })).toBeVisible();

    // The plan must outlive the session it was made in.
    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Navigation dock' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /Planner/ }).click();
    await page.getByRole('button', { name: /Saved plans \(1\)/ }).click();
    await expect(page.getByText('Ridge loop')).toBeVisible();

    await page.getByText('Ridge loop').click();
    await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(2);
  });

  test('waypoints can be removed and cleared', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('toolbar', { name: 'Navigation dock' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.gm-style').first()).toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: /Planner/ }).click();

    // Two clicks on empty map, well clear of the panel and the dock.
    await page.mouse.click(760, 250);
    await page.waitForTimeout(500);
    await page.mouse.click(1000, 300);

    const removeButtons = page.getByRole('button', { name: /^Remove/ });
    await expect.poll(() => removeButtons.count()).toBeGreaterThanOrEqual(2);
    const before = await removeButtons.count();

    await removeButtons.first().click();
    await expect.poll(() => removeButtons.count()).toBe(before - 1);

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText(/Tap anywhere on the map/i)).toBeVisible();
  });
});
