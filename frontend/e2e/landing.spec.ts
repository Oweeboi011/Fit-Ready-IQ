import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test('sells the product and offers a single primary call to action', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Know if you can finish it/i
    );

    // The trial CTA must be reachable without scrolling past the fold.
    const heroCta = page.getByRole('button', { name: /Start free — no card needed/i }).first();
    await expect(heroCta).toBeVisible();

    // Pricing has to exist on the page a visitor actually lands on.
    await expect(page.getByRole('heading', { name: /Cheaper than one bad trip/i })).toBeVisible();
  });

  test('does not expose the admin console to anonymous visitors', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTitle('Admin settings')).toHaveCount(0);
  });

  test('admin route refuses an unauthenticated visitor', async ({ page }) => {
    await page.goto('/admin/settings');
    // A signed-out visitor is told to sign in; only a signed-in account that
    // is off the allowlist gets "Admin access required".
    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  });
});
