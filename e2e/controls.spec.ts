import { expect, test, type Page } from '@playwright/test';

interface StubPad {
  axes: number[];
  buttons: { pressed: boolean; touched: boolean; value: number }[];
}

const A = 0;
const B = 1;
const START = 9;
const DPAD_DOWN = 13;

/** A standard-layout gamepad the page sees through `navigator.getGamepads()`. */
async function plugGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'e2e pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
}

/** Press and release a pad button (held for a few frames, like a thumb). */
async function tap(page: Page, button: number): Promise<void> {
  const set = (pressed: boolean) =>
    page.evaluate(
      ([b, on]) => {
        const pad = (window as unknown as { __pad: StubPad }).__pad;
        pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 };
      },
      [button, pressed] as [number, boolean],
    );
  await set(true);
  await page.waitForTimeout(120);
  await set(false);
  await page.waitForTimeout(120);
}

test.describe('Controls', () => {
  test('a key rebound in Settings is the one the jump answers to', async ({ page }) => {
    await page.goto('/settings');
    const slot = page.getByRole('button', { name: /Jump · chute · flare, key 1/ });
    await slot.click();
    await expect(page.getByText(/Press a key for/)).toBeVisible();
    await page.keyboard.press('j');
    await expect(slot).toHaveText('J');

    await page.goto('/game');
    await expect(page.locator('.brief__keys')).toContainText('J: jump');
    await page.getByRole('button', { name: 'Jump!' }).click();
    await expect(page.locator('.game__phase')).toHaveText(/jump run/i);
    await page.keyboard.press('Space'); // no longer the jump key
    await expect(page.locator('.game__phase')).toHaveText(/jump run/i);
    await page.keyboard.press('j');
    await expect(page.locator('.game__phase')).toHaveText(/free fall/i);
  });

  test('Escape cancels a rebind and stays on Settings', async ({ page }) => {
    await page.goto('/settings');
    const slot = page.getByRole('button', { name: /Turn left, key 1/ });
    await slot.click();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Press a key for/)).toHaveCount(0);
    await expect(slot).toHaveText('←');
    await expect(page).toHaveURL(/settings/);
  });

  test('a gamepad drives the title menu', async ({ page }) => {
    await plugGamepad(page);
    await page.goto('/');
    await expect(page.getByRole('option', { name: 'Grand Tour' })).toBeFocused({ timeout: 5000 });
    await tap(page, DPAD_DOWN);
    await expect(page.getByRole('option', { name: 'Grand Tour' })).not.toBeFocused();
    await tap(page, A);
    await expect(page).not.toHaveURL(/\/$/);
  });

  test('a gamepad flies the jump: A jumps, Start pauses, B resumes', async ({ page }) => {
    await plugGamepad(page);
    await page.goto('/game');
    await expect(page.getByRole('button', { name: 'Jump!' })).toBeFocused({ timeout: 15000 });
    await tap(page, A); // presses the focused "Jump!"
    await expect(page.locator('.game__phase')).toHaveText(/jump run/i);
    await tap(page, A);
    await expect(page.locator('.game__phase')).toHaveText(/free fall/i);

    await tap(page, START);
    await expect(page.getByText('Paused')).toBeVisible();
    await expect(page.locator('.game__keys')).toContainText('START');
    await tap(page, B);
    await expect(page.getByText('Paused')).toBeHidden();
  });

  test('Reduced motion is applied app-wide and cuts the screen wipe', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Reduced' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.wipe')).toHaveCount(0);
  });
});
