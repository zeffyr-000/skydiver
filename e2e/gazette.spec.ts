import { expect, test } from '@playwright/test';

test.describe('The Sky Gazette', () => {
  test('opens from the menu on issue No. 1 and reads on, issue after issue', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('option', { name: 'Gazette' }).click();
    await expect(page).toHaveURL(/gazette/);
    await expect(page.locator('.wipe')).toHaveCount(0);
    await expect(page.locator('.issue__headline')).toHaveText('The professors of the air');
    await expect(page.locator('.plate__img').first()).toBeVisible();

    await page.getByRole('button', { name: /Next issue/ }).click();
    await expect(page.locator('.issue__headline')).toHaveText('The sky turned upside down');
    // The new issue starts at its standfirst, ready to be read with the arrows.
    await expect(page.locator('.issue__standfirst')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
  });

  test('reading with the arrows scrolls the page', async ({ page }) => {
    await page.goto('/gazette?issue=professors');
    const story = page.locator('.story__body').first();
    await story.focus();
    const before = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0))
      .toBeGreaterThan(before);
  });

  test('the drift calculator answers its sliders', async ({ page }) => {
    await page.goto('/gazette?issue=trade');
    const readout = page.locator('.drift__readout');
    await expect(readout).toContainText('Drift: 500 m');
    await page.getByRole('slider', { name: 'Wind speed' }).fill('10');
    await expect(readout).toContainText('Drift: 1000 m');
  });
});
