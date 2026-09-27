import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Playtest mode (T2.18): the variant switches reach the game and the log exports as JSON. */
test('records a playtest session and exports it from Settings', async ({ page }) => {
  await page.goto('/?seed=pt&playtest=1&magnet=0&l4=1');
  await page.locator('.menu__play').click();
  await page.waitForTimeout(700); // deal-in animation
  await page.keyboard.press('3');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__tidepool.getState().placed)).toBe(1);

  await page.keyboard.press('Escape');
  await page.locator('.pause__menu').click();
  await page.locator('.menu__settings').click();
  const download = page.waitForEvent('download');
  await page.locator('.settings__export-log').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^tidepool-playtest-\d{4}-\d\d-\d\d-\d{4}\.json$/);

  const log = JSON.parse(readFileSync((await file.path())!, 'utf8')) as {
    entries: { name: string; props: Record<string, unknown> }[];
  };
  const names = log.entries.map((e) => e.name);
  expect(log.entries[0]).toMatchObject({ name: 'page_open', props: { magnet: false, l4: true } });
  expect(names).toContain('run_start');
  expect(names).toContain('placement');
});

test('Settings has no export button outside playtest mode', async ({ page }) => {
  await page.goto('/');
  await page.locator('.menu__settings').click();
  await expect(page.locator('.settings')).toBeVisible();
  await expect(page.locator('.settings__export-log')).toHaveCount(0);
});
