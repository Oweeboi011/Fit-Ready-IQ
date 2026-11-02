import { DISCOVERY_FIXTURE, expect, test } from './fixtures';

test.describe('map loading overlay', () => {
  test('announces progress and can be dismissed without blocking the map', async ({ page }) => {
    // The fixture answers instantly, which would close the overlay before
    // there is anything to dismiss. Hold discovery open long enough to act.
    await page.route('**/api/discover**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      await route.fulfill({ status: 200, json: DISCOVERY_FIXTURE }).catch(() => {});
    });
    await page.goto('/app');

    const overlay = page.getByRole('status', { name: 'Map loading progress' });
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(/Finding routes near you|Locating you/);

    // The backdrop must not swallow pointer events, or the map underneath
    // would be frozen for as long as the fetch takes.
    const backdrop = page.locator('div.pointer-events-none:has(> [role="status"])');
    await expect(backdrop).toHaveCSS('pointer-events', 'none');

    await page.getByRole('button', { name: 'Hide loading indicator' }).click();
    await expect(overlay).toBeHidden();
  });

  test('does not report a hydration mismatch on first paint', async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /hydrat/i.test(msg.text())) hydrationErrors.push(msg.text());
    });

    await page.goto('/app');
    await expect(page.getByText('Fit Ready IQ')).toBeVisible();

    expect(hydrationErrors).toEqual([]);
  });
});
