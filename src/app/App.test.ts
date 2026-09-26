// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { allFits, boardFromAscii } from '../core/board';
import { slotShape } from '../core/generator';
import type { FrameScheduler } from '../render/Renderer';
import { fakeCanvasFactory } from '../render/testing';
import type { ViewportEnv } from '../render/viewport';
import { App, randomSeed } from './App';

const idleScheduler: FrameScheduler = { request: () => 0, cancel: () => {} };

function makeApp(seed = 'app-test') {
  const { factory } = fakeCanvasFactory();
  const canvas = factory(390, 844);
  const uiRoot = document.createElement('div');
  const app = new App({
    canvas,
    uiRoot,
    seed: () => seed,
    spriteFactory: factory,
    renderer: { scheduler: idleScheduler },
  });
  const viewport: ViewportEnv = {
    observeResize: (_el, cb) => {
      cb(390, 844);
      return () => {};
    },
    devicePixelRatio: () => 2,
    onDprChange: () => () => {},
  };
  app.start({ viewport, blurTarget: new EventTarget() });
  return { app, uiRoot };
}

const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent;

/** The first valid move for the current tray. */
function firstMove(app: App) {
  const s = app.state;
  const slot = s.tray.findIndex((t) => t && allFits(s.board, slotShape(t)).length > 0);
  const [row, col] = allFits(s.board, slotShape(s.tray[slot]!))[0]!;
  return { slot, row, col };
}

describe('App', () => {
  it('starts a seeded run with the HUD at zero and a laid-out scene', () => {
    const { app, uiRoot } = makeApp();
    expect(app.state.score).toBe(0);
    expect(app.scene.layout?.orientation).toBe('portrait');
    expect(text(uiRoot, '.hud__score')).toBe('0');
    expect(uiRoot.querySelector('.hud')).not.toBeNull();
  });

  it('applies valid drops, updates the HUD and emits game events', () => {
    const { app, uiRoot } = makeApp();
    const listener = vi.fn();
    app.bus.on('game', listener);
    const move = firstMove(app);
    const size = slotShape(app.state.tray[move.slot]!).size;
    expect(app.place(move)).toBeUndefined();
    expect(app.state.score).toBe(size);
    expect(text(uiRoot, '.hud__score')).toBe(String(size));
    expect(text(uiRoot, '.hud__best-value')).toBe(String(size));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].events[0].type).toBe('placed');
  });

  it('reports invalid drops without changing anything', () => {
    const { app } = makeApp();
    const before = app.state;
    expect(app.place({ slot: 0, row: 99, col: 0 })).toEqual({ error: 'invalidPosition' });
    expect(app.state).toBe(before);
  });

  // Only isolated cells free: a dot fits (without completing lines), nothing else does.
  const CHECKER = boardFromAscii([
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
  ]);

  function forceEndgame(app: App, score: number) {
    Object.assign(app, {
      stateValue: {
        ...app.state,
        board: CHECKER,
        score,
        tray: [
          { shape: 'dot', color: 0 },
          { shape: 'sq2', color: 1 },
          { shape: 'i2h', color: 2 },
        ],
      },
    });
  }

  /** Runs frames until the async game-over sequence has shown the panel. */
  async function settle(app: App) {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      app.scene.update(1);
    }
    await Promise.resolve();
  }

  it('locks input, fades the board and shows the Game Over panel', async () => {
    const { app, uiRoot } = makeApp();
    const onOver = vi.fn();
    app.bus.on('gameOver', onOver);
    forceEndgame(app, 500);
    app.place({ slot: 0, row: 0, col: 1 });
    expect(app.state.over).toBe(true);
    expect(app.drag.isLocked).toBe(true);
    const panel = uiRoot.querySelector<HTMLElement>('.gameover')!;
    expect(panel.hidden).toBe(true);

    await settle(app);
    expect(panel.hidden).toBe(false);
    expect(text(uiRoot, '.gameover__score')).toBe('501');
    expect(text(uiRoot, '.gameover__best')).toBe('Best 501');
    expect(uiRoot.querySelector<HTMLElement>('.gameover__ribbon')!.hidden).toBe(false);
    expect(onOver).toHaveBeenCalledWith({ score: 501, best: 501, newBest: true });
    expect(app.bestScore).toBe(501);
  });

  it('restarts with Play again, keeping the best score, and reports no new best below it', async () => {
    const { app, uiRoot } = makeApp();
    forceEndgame(app, 500);
    app.place({ slot: 0, row: 0, col: 1 });
    await settle(app);

    const onNew = vi.fn();
    app.bus.on('newRun', onNew);
    uiRoot.querySelector<HTMLButtonElement>('.gameover__again')!.click();
    expect(uiRoot.querySelector<HTMLElement>('.gameover')!.hidden).toBe(true);
    expect(app.state.over).toBe(false);
    expect(app.state.score).toBe(0);
    expect(app.drag.isLocked).toBe(false);
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(text(uiRoot, '.hud__best-value')).toBe('501');

    forceEndgame(app, 10);
    app.place({ slot: 0, row: 0, col: 1 });
    await settle(app);
    expect(uiRoot.querySelector<HTMLElement>('.gameover__ribbon')!.hidden).toBe(true);
    expect(text(uiRoot, '.gameover__best')).toBe('Best 501');
  });

  it('Menu also starts a new run until the main menu exists', async () => {
    const { app, uiRoot } = makeApp();
    const onMenu = vi.fn();
    app.bus.on('menu', onMenu);
    forceEndgame(app, 5);
    app.place({ slot: 0, row: 0, col: 1 });
    await settle(app);
    uiRoot.querySelector<HTMLButtonElement>('.gameover__menu')!.click();
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(app.state.over).toBe(false);
  });

  it('does not show a stale panel if a new run starts during the fade', async () => {
    const { app, uiRoot } = makeApp();
    forceEndgame(app, 5);
    app.place({ slot: 0, row: 0, col: 1 });
    app.newRun('quick');
    await settle(app);
    expect(uiRoot.querySelector<HTMLElement>('.gameover')!.hidden).toBe(true);
  });

  it('forwards the HUD pause button to the bus', () => {
    const { app, uiRoot } = makeApp();
    const pause = vi.fn();
    app.bus.on('pause', pause);
    uiRoot.querySelector<HTMLButtonElement>('.hud__pause')!.click();
    expect(pause).toHaveBeenCalledTimes(1);
  });
});

describe('randomSeed', () => {
  it('produces distinct seeds', () => {
    expect(randomSeed()).not.toBe(randomSeed());
  });
});
