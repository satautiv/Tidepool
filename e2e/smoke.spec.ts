import { expect, test, type Page } from '@playwright/test';
import type { Point, TestHook } from '../src/app/devHook';

declare global {
  interface Window {
    __tidepool: TestHook;
  }
}

const gameState = (page: Page) => page.evaluate(() => window.__tidepool.getState());
const filledCells = (board: string[]) => board.join('').replaceAll('.', '').length;

/** Boots a seeded run and waits until the tray has dealt in. */
async function boot(page: Page, seed = 'e2e') {
  await page.goto(`/?seed=${seed}`);
  await page.waitForFunction(() => window.__tidepool?.slotCenter(0) != null);
  await page.waitForTimeout(700); // deal-in animation
}

/** Drags with a real mouse, or a real touch via CDP on the mobile project. */
async function drag(page: Page, from: Point, to: Point, touch: boolean) {
  if (!touch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const touchAt = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Point) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
    });
  await touchAt('touchStart', from);
  for (let i = 1; i <= 8; i++) {
    await touchAt('touchMove', {
      x: from.x + ((to.x - from.x) * i) / 8,
      y: from.y + ((to.y - from.y) * i) / 8,
    });
  }
  await touchAt('touchEnd');
}

test('boots with the canvas and a zero score', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('.hud__score')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('dragging a piece onto the board scores its size', async ({ page, isMobile }) => {
  await boot(page);
  const { from, to } = await page.evaluate(
    ({ row, col, touch }) => {
      const h = window.__tidepool;
      return {
        from: h.slotCenter(0)!,
        to: h.dropPoint(0, row, col, touch ? 'touch' : 'mouse')!,
      };
    },
    { row: 2, col: 2, touch: isMobile },
  );
  expect(filledCells((await gameState(page)).board)).toBe(0);

  await drag(page, from, to, isMobile);
  await expect.poll(async () => (await gameState(page)).placed).toBe(1);
  const state = await gameState(page);
  // 1 point per placed cell, and nothing can clear on an empty board.
  expect(filledCells(state.board)).toBeGreaterThan(0);
  expect(state.score).toBe(filledCells(state.board));
  expect(state.tray[0]).toBeNull();
  await expect(page.locator('.hud__score')).toHaveText(String(state.score));
});

test('placing the last piece that fits ends the game, and Play again resets', async ({
  page,
  isMobile,
}) => {
  await boot(page);
  const { from, to } = await page.evaluate(
    ({ touch }) => {
      const h = window.__tidepool;
      h.setBoard(
        [
          '#.#.#.#.',
          '.#.#.#.#',
          '#.#.#.#.',
          '.#.#.#.#',
          '#.#.#.#.',
          '.#.#.#.#',
          '#.#.#.#.',
          '.#.#.#.#',
        ],
        ['dot', 'sq2', 'i2h'],
      );
      return { from: h.slotCenter(0)!, to: h.dropPoint(0, 0, 1, touch ? 'touch' : 'mouse')! };
    },
    { touch: isMobile },
  );
  await page.waitForTimeout(100);
  await drag(page, from, to, isMobile);
  await expect(page.locator('.gameover')).toBeVisible();
  expect((await gameState(page)).over).toBe(true);

  await page.locator('.gameover__again').click();
  await expect(page.locator('.gameover')).toBeHidden();
  const state = await gameState(page);
  expect(state).toMatchObject({ over: false, score: 0, placed: 0 });
  await expect(page.locator('.hud__score')).toHaveText('0');
});

test('a reload mid-run restores the same run', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const h = window.__tidepool;
    const s = h.app.state;
    const slot = s.tray.findIndex((t) => t !== null);
    h.app.place({ slot, row: 0, col: 0 });
  });
  const before = await gameState(page);
  expect(before.placed).toBe(1);
  await page.waitForTimeout(700); // past the 500 ms save debounce
  await page.reload();
  await page.waitForFunction(() => window.__tidepool?.cellCenter(0, 0) != null);
  const after = await gameState(page);
  expect(after).toEqual(before);
});
