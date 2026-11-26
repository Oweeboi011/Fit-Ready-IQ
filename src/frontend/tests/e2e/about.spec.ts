import { expect, test } from '@playwright/test';

test.describe('about page', () => {
  test('draws the diagram and explains a box when it is selected', async ({ page }) => {
    await page.goto('/about');

    await expect(page.getByRole('heading', { level: 1, name: /How it works/i })).toBeVisible();
    // React Flow renders its boxes as real DOM nodes once it has measured them.
    const box = page.locator('.react-flow__node', { hasText: 'Route handlers' });
    await expect(box).toBeVisible();

    await box.click();
    await expect(page.locator('[aria-live="polite"]')).toContainText(/Every secret lives here/i);
  });

  test('switches diagram with the keyboard and keeps a text version', async ({ page }) => {
    await page.goto('/about');

    const first = page.getByRole('tab', { name: 'The whole system' });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Finding a route' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await page.getByText('Read this diagram as text').click();
    await expect(page.getByText('useUserLocation').first()).toBeVisible();
  });
});
