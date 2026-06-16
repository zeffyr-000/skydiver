import { expect, test } from '@playwright/test';

test.describe('Sky Diver game', () => {
  test('mounts the canvas and a jump resolves', async ({ page }) => {
    // `fast=1` shrinks the jump so it completes in a few seconds.
    await page.goto('/game?fast=1');

    const canvas = page.locator('canvas.game__canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // Open the chute, then wait for the jump to resolve into a result dialog.
    await page.keyboard.press('Space');
    await expect(page.getByText('Next Jump')).toBeVisible({ timeout: 15000 });
  });

  test('a run is three jumps then the cloud bonus round', async ({ page }) => {
    // `fast=1` shrinks every segment (jumps and the cloud dive) to a few seconds.
    await page.goto('/game?fast=1');
    await expect(page.locator('canvas.game__canvas')).toBeVisible();

    // Jumps 1 and 2 each end on a recap with a "Next Jump" button.
    for (let i = 0; i < 2; i++) {
      const next = page.getByRole('button', { name: 'Next Jump' });
      await expect(next).toBeVisible({ timeout: 15000 });
      await next.click();
    }

    // The third jump leads into the cloud round instead.
    const toClouds = page.getByRole('button', { name: 'To the Clouds' });
    await expect(toClouds).toBeVisible({ timeout: 15000 });
    await toClouds.click();

    // The cloud bonus dive resolves into its own recap…
    const cont = page.getByRole('button', { name: 'Continue' });
    await expect(cont).toBeVisible({ timeout: 15000 });
    await cont.click();

    // …and the run is then complete.
    await expect(page.getByText('Run Complete')).toBeVisible({ timeout: 15000 });
  });

  test('starts on the jump run and Space skips to free fall', async ({ page }) => {
    await page.goto('/game');
    await expect(page.locator('canvas.game__canvas')).toBeVisible();

    // The plane-approach intro plays first…
    await expect(page.locator('.game__phase')).toHaveText(/jump run/i);

    // …and a key press skips straight to the jump.
    await page.keyboard.press('Space');
    await expect(page.locator('.game__phase')).toHaveText(/free fall/i);
  });

  test('Escape opens the pause dialog', async ({ page }) => {
    await page.goto('/game');
    await expect(page.locator('canvas.game__canvas')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText('Paused')).toBeVisible();
  });
});
