import { expect, test } from '@playwright/test';

/**
 * Denying location used to fail silently: the app dropped the user in San
 * Francisco, drew a "Your Location" marker on it, and told them how far every
 * trail was "away". These tests hold the line on saying so instead.
 */
test.describe('location permission denied', () => {
  test.use({ permissions: [] });

  test('tells the user location is off instead of pretending it worked', async ({
    page,
    context,
  }) => {
    await context.clearPermissions();
    // Make the prompt resolve as a denial rather than hanging on the dialog.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) => {
            fail?.({
              code: 1,
              message: 'User denied Geolocation',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          },
          watchPosition: () => 0,
          clearWatch: () => undefined,
        },
      });
    });

    await page.goto('/app');

    const notice = page.getByText(/Location access is off/i);
    await expect(notice).toBeVisible({ timeout: 15_000 });

    // The fallback must not be dressed up as the user's own position.
    await expect(page.getByText('Your Location')).toHaveCount(0);
    await expect(page.getByText(/km away/i)).toHaveCount(0);

    // And the notice has to offer a way forward, not just bad news.
    await expect(page.getByRole('button', { name: /Try again/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Search a place/i })).toBeVisible();
  });

  test('the notice can be dismissed', async ({ page, context }) => {
    await context.clearPermissions();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) => {
            fail?.({
              code: 1,
              message: 'denied',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          },
          watchPosition: () => 0,
          clearWatch: () => undefined,
        },
      });
    });

    await page.goto('/app');
    await expect(page.getByText(/Location access is off/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Dismiss location notice' }).click();
    await expect(page.getByText(/Location access is off/i)).toHaveCount(0);
  });
});

test.describe('location granted', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 14.5995, longitude: 120.9842 },
  });

  test('shows the user marker only when the fix is real', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('toolbar', { name: 'Navigation dock' })).toBeVisible({
      timeout: 20_000,
    });

    // The legend is collapsed by default and lives under the dock's More panel;
    // its "Your Location" entry is the visible proof the blue marker is claimed.
    // Scope to the dock: RouteFilter also has a "More" disclosure.
    const dock = page.getByRole('toolbar', { name: 'Navigation dock' });
    await dock.getByRole('button', { name: /^More/ }).click();
    await page.getByRole('button', { name: 'Show map legend' }).click();
    await expect(page.getByText('Your Location')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Location access is off/i)).toHaveCount(0);
  });
});
