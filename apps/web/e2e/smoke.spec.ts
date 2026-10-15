import { expect, test, type Page } from '@playwright/test';

/**
 * Two strangers: both start a text chat, get matched, exchange a message, then
 * one presses Next and both go back to searching. Uses fake camera/mic so the
 * same flow works in video mode (set E2E_MODE=video), though the face check
 * may hold a fake camera that shows no face.
 */
const MODE = process.env.E2E_MODE === 'video' ? /video/i : /text/i;

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'Chat type' }).getByRole('radio', { name: MODE }).first().click();
  await page.locator('#agree18').check();
  await page.getByRole('button', { name: /start/i }).first().click();
}

test('match → chat → next', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await Promise.all([start(a), start(b)]);

  const boxA = a.getByPlaceholder(/type your message/i);
  const boxB = b.getByPlaceholder(/type your message/i);
  await expect(boxA).toBeEnabled({ timeout: 30_000 });
  await expect(boxB).toBeEnabled({ timeout: 30_000 });

  await boxA.fill('hello from A');
  await boxA.press('Enter');
  await expect(b.getByText('hello from A')).toBeVisible();

  await a.getByRole('button', { name: /next stranger/i }).first().click();
  await expect(b.getByText(/skipped|searching|finding/i).first()).toBeVisible({ timeout: 15_000 });
});
