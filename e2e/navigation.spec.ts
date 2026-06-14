import { expect, test } from '@playwright/test';

test.describe('Screen navigation', () => {
  test('menu activation wipes to settings and Escape wipes back home', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.title__logo')).toBeVisible();

    const settingsOption = page.getByRole('option', { name: 'Settings' });
    await expect(settingsOption).toBeVisible();
    await settingsOption.click();
    await expect(page.locator('.wipe')).toBeVisible();

    await expect(page).toHaveURL(/settings/);
    await expect(page.locator('.settings__panel')).toBeVisible();
    // Input is ignored mid-wipe (by design); wait for the reveal to finish.
    await expect(page.locator('.wipe')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.title__logo')).toBeVisible();
  });

  test('the wipe overlay is decoration-only and unmounts after the transition', async ({
    page,
  }) => {
    await page.goto('/');

    const recordsOption = page.getByRole('option', { name: 'Records' });
    await expect(recordsOption).toBeVisible();
    await recordsOption.click();
    const wipe = page.locator('.wipe');
    await expect(wipe).toHaveAttribute('aria-hidden', 'true');

    await expect(page).toHaveURL(/records/);
    await expect(wipe).toHaveCount(0); // detached once the reveal finishes
  });
});
