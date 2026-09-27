import { expect, test, type Page } from '@playwright/test';

/** The run in the stored save (the active tab also writes its session counters). */
const savedRun = (page: Page) =>
  page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('tidepool.save') ?? '{}') as { endlessRun?: string })
        .endlessRun,
  );

/** Two tabs of the game: the newer one takes over, and the older one stops saving (#99). */
test('a second tab takes over, and the first can take it back', async ({ context }) => {
  const first = await context.newPage();
  await first.goto('/?seed=tabs');
  await first.locator('.menu__play').click();
  await first.waitForTimeout(700);
  await first.keyboard.press('3');
  await first.keyboard.press('ArrowUp');
  await first.keyboard.press('Enter');
  await expect.poll(() => first.evaluate(() => window.__tidepool.getState().placed)).toBe(1);

  const second = await context.newPage();
  await second.goto('/');
  await expect(first.locator('.elsewhere')).toBeVisible();
  await expect(second.locator('.elsewhere')).toBeHidden();
  await expect(second.locator('.menu__play')).toHaveText('Continue'); // the first tab's run

  // A change in the dormant tab never reaches the storage.
  const before = await savedRun(second);
  expect(before).toContain('"placed":1');
  await first.evaluate(() => window.__tidepool.setBoard(new Array<string>(8).fill('#......#')));
  await second.waitForTimeout(700); // longer than the save debounce
  expect(await savedRun(second)).toBe(before);

  await first.locator('.elsewhere__play').click();
  await expect(second.locator('.elsewhere')).toBeVisible();
  await expect(first.locator('.elsewhere')).toBeHidden();
  await expect(first.locator('.menu__play')).toHaveText('Continue');
});
