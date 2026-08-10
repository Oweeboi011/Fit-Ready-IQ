import { expect, test } from '@playwright/test';

/**
 * Before the shared Modal shell, none of these modals was a dialog: no role,
 * no Escape, no backdrop dismissal, and Tab walked straight out of the panel
 * into the page behind it.
 */
test.describe('modal dialog behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: /Connect Devices/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('is a labelled dialog', async ({ page }) => {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Connect Devices');
  });

  test('closes on Escape', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('closes on a backdrop click but not on a click inside the panel', async ({ page }) => {
    // A click on the panel itself must not dismiss.
    await page.getByRole('heading', { name: 'Connect Devices' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Top-left corner of the viewport is backdrop on a centred dialog.
    await page.mouse.click(5, 5);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('traps focus inside the panel', async ({ page }) => {
    const dialog = page.getByRole('dialog');

    // Tab well past the number of controls in the dialog; focus must still be
    // inside it rather than out in the map behind.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
      expect(inside).toBe(true);
    }
  });

  test('locks background scroll while open', async ({ page }) => {
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });

  test('returns focus to the trigger on close', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const trigger = page.getByRole('button', { name: /Connect Devices/i });
    await expect(trigger).toBeFocused();
  });
});
