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
    await expect(page.locator('.settings__panel').first()).toBeVisible();
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

  test('the title runs the attract demo behind a focused menu; Enter opens the Grand Tour', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('app-world-backdrop canvas')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Grand Tour' })).toBeFocused({ timeout: 5000 });
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/circuit/);
    await expect(page.getByRole('button', { name: /First Jump/ })).toBeVisible();
  });

  test('progress can be reset from Settings, after a confirmation', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Reset progress' }).click();
    await expect(page.getByText(/Erase every Grand Tour medal/)).toBeVisible();
    await page.getByRole('button', { name: 'Erase', exact: true }).click();
    await expect(page.getByText('Progress erased')).toBeVisible();
  });
});
