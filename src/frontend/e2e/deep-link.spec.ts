import { expect, test } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 14.5995, longitude: 120.9842 } });

/**
 * Nothing in /app used to be addressable: no tab, no place, no viewport.
 */
test.describe('deep links and URL state', () => {
  test('selecting a place puts it in the URL, and the link reopens it', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('tablist')).toBeVisible();

    // A card is a container whose title is the button (see RouteListItem).
    const firstRoute = page.locator('aside [data-place-card]').filter({ hasText: /km/ }).first();
    await expect(firstRoute).toBeVisible({ timeout: 45_000 });
    const open = firstRoute.getByRole('button').first();
    const name = (await open.innerText()).trim();
    await open.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/[?&]place=route%3A/);

    const sharedUrl = page.url();
    await page.goto(sharedUrl);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('dialog')).toContainText(name.slice(0, 12));
  });

  test('closing a place clears it from the URL', async ({ page }) => {
    await page.goto('/app');
    const firstRoute = page.locator('aside [data-place-card]').filter({ hasText: /km/ }).first();
    await expect(firstRoute).toBeVisible({ timeout: 45_000 });
    await firstRoute.getByRole('button').first().click();
    await expect(page).toHaveURL(/place=/);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).not.toHaveURL(/place=/);
  });

  test('the active tab survives a reload', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('tab', { name: /Camps/ }).click();
    await expect(page.getByRole('tab', { name: /Camps/ })).toHaveAttribute('aria-selected', 'true');

    await page.reload();
    await expect(page.getByRole('tab', { name: /Camps/ })).toHaveAttribute(
      'aria-selected',
      'true',
      {
        timeout: 20_000,
      }
    );
  });

  test('a stale link explains itself instead of hanging', async ({ page }) => {
    await page.goto('/app?place=route%3Adoes-not-exist');
    await expect(page.getByText(/can't find near you/i)).toBeVisible({ timeout: 25_000 });
  });
});
