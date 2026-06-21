import { expect, test } from "@playwright/test";

test("home page renders shell and key navigation text", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Fit Ready IQ|Fit-Ready-IQ/i);
  await expect(page.getByText("Fit Ready IQ")).toBeVisible();
  await expect(page.getByText("Connect Devices")).toBeVisible();
});
