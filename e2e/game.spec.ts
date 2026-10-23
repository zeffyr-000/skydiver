import { expect, test, type Page } from '@playwright/test';

/** Every jump opens on its briefing card; this flies it. */
async function jump(page: Page): Promise<void> {
  const go = page.getByRole('button', { name: 'Jump!' });
  await expect(go).toBeVisible({ timeout: 15000 });
  await go.click();
}

test.describe('Sky Diver game', () => {
  test('fills the window with a whole-number-scaled canvas', async ({ page }) => {
    await page.goto('/game');
    const canvas = page.locator('canvas.game__canvas');
    await expect(canvas).toBeVisible();

    const { width, height, cssW, cssH } = await canvas.evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      height: c.height,
      cssW: c.getBoundingClientRect().width,
      cssH: c.getBoundingClientRect().height,
    }));
    const viewport = page.viewportSize()!;
    // Pixel-perfect: CSS size is an exact multiple of the internal resolution…
    expect(cssW / width).toBe(Math.round(cssW / width));
    expect(cssH / height).toBe(cssW / width);
    // …and it takes most of the window, not a box in a panel.
    expect(cssW).toBeGreaterThan(viewport.width * 0.7);
  });

  test('briefs the jump, then Space jumps from the plane into free fall', async ({ page }) => {
    await page.goto('/game');
    await expect(page.getByRole('img', { name: 'Map of the drop zone' })).toBeVisible();
    await jump(page);

    // The jump opens on its silent-film title card, then the run starts.
    await expect(page.locator('.game__phase')).toHaveText(/title card/i);
    await expect(page.locator('.game__phase')).toHaveText(/jump run/i);
    await page.keyboard.press('Space');
    await expect(page.locator('.game__phase')).toHaveText(/free fall/i);
  });

  test('the action key cuts the title card short', async ({ page }) => {
    await page.goto('/game');
    await jump(page);
    await expect(page.locator('.game__phase')).toHaveText(/title card/i);
    await page.keyboard.press('Space');
    await expect(page.locator('.game__phase')).toHaveText(/jump run/i, { timeout: 1000 });
  });

  test('a jump resolves into a result card', async ({ page }) => {
    // `fast=1` starts in free fall from low altitude: never pulling ends it quickly.
    await page.goto('/game?fast=1');
    await jump(page);
    await expect(page.getByRole('button', { name: 'Next Jump' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Jump Score')).toBeVisible();
  });

  test('an arcade run is three jumps, then the run total', async ({ page }) => {
    await page.goto('/game?mode=arcade&fast=1');
    for (let i = 0; i < 2; i++) {
      await jump(page);
      const next = page.getByRole('button', { name: 'Next Jump' });
      await expect(next).toBeVisible({ timeout: 15000 });
      await next.click();
    }
    await jump(page);
    await expect(page.getByText('Run total')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
  });

  test('a circuit event is briefed with its medals and judged against them', async ({ page }) => {
    await page.goto('/game?mode=circuit&event=fair-first&fast=1');
    await expect(page.getByRole('heading', { name: 'First Jump' })).toBeVisible();
    await expect(page.getByText('Medals', { exact: true })).toBeVisible();
    await jump(page);
    await expect(page.getByText(/medal/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('button', { name: 'Jump!' })).toBeVisible();
  });

  test('the daily jump is briefed as the day’s jump', async ({ page }) => {
    await page.goto('/game?mode=daily&fast=1');
    await expect(page.getByText(/Daily Jump/).first()).toBeVisible();
    await jump(page);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 15000 });
  });

  test('Escape opens the pause dialog with the controls while flying', async ({ page }) => {
    await page.goto('/game');
    await jump(page);
    await page.keyboard.press('Escape');
    await expect(page.getByText('Paused')).toBeVisible();
    await expect(page.getByText('Jump · open the chute · flare')).toBeVisible();
    await expect(page.locator('.game__keys')).toContainText('Space');
  });

  test('the Grand Tour opens only its first event', async ({ page }) => {
    await page.goto('/circuit');
    const first = page.getByRole('button', { name: /First Jump/ });
    await expect(first).toBeEnabled();
    await expect(page.getByRole('button', { name: /Fairground Hoops/ })).toBeDisabled();
    await first.click();
    await expect(page).toHaveURL(/mode=circuit&event=fair-first/);
    await expect(page.getByRole('heading', { name: 'First Jump' })).toBeVisible();
  });
});
