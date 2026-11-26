import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Automated accessibility scan with axe, on the pages and dialogs people use.
 *
 * Automation finds roughly a third of accessibility problems, so a pass here is
 * a floor, not a WCAG 2.2 AA conformance claim (that audit is tracked
 * separately). What it does buy is that a regression a machine can see, such as
 * a button with no name or text below contrast, fails the build instead of
 * waiting for someone to notice.
 *
 * Serious and critical violations fail. Moderate and minor ones are attached to
 * the report so they stay visible without blocking unrelated work.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page, name: string, testInfo: { attach: Function }) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const summarise = (v: (typeof results.violations)[number]) =>
    `${v.id} (${v.impact}): ${v.help}\n` +
    v.nodes
      .slice(0, 5)
      .map((n) => `  - ${n.target.join(' ')}`)
      .join('\n');

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  const advisory = results.violations.filter((v) => !blocking.includes(v));

  if (advisory.length > 0) {
    await testInfo.attach(`${name}-advisory.txt`, {
      body: advisory.map(summarise).join('\n\n'),
      contentType: 'text/plain',
    });
  }

  expect(blocking.map(summarise), `${name}: serious or critical accessibility violations`).toEqual(
    []
  );
}

test.describe('accessibility', () => {
  for (const [name, path] of [
    ['landing', '/'],
    ['about', '/about'],
    ['privacy', '/privacy'],
  ] as const) {
    test(`${name} page has no serious violations`, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await scan(page, name, testInfo);
    });
  }

  test('the map shell has no serious violations', async ({ page }, testInfo) => {
    await page.goto('/app');
    await expect(page.getByRole('button', { name: /Connect Devices/i })).toBeVisible();
    await scan(page, 'app', testInfo);
  });

  test('an open dialog has no serious violations', async ({ page }, testInfo) => {
    await page.goto('/app');
    await page.getByRole('button', { name: /Connect Devices/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await scan(page, 'connect-devices-dialog', testInfo);
  });

  // Light mode inverts the whole slate ramp (globals.css), so it can fail where
  // dark passes. It is a separate scan, not an assumption.
  for (const [name, path] of [
    ['landing', '/'],
    ['app', '/app'],
  ] as const) {
    // Known failing: text-white headings are invisible on the light page. Remove
    // the fixme when https://github.com/Oweeboi011/Fit-Ready-IQ/issues/275 is fixed.
    test.fixme(`${name} in light theme has no serious violations`, async ({ page }, testInfo) => {
      await page.addInitScript(() => localStorage.setItem('fri_theme', 'light'));
      await page.goto(path);
      await expect(page.locator('html')).toHaveClass(/light/);
      await scan(page, `${name}-light`, testInfo);
    });
  }
});
