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

  it('locks input at game over and unlocks for a new run, keeping the best score', () => {
    const { app, uiRoot } = makeApp();
    // Force a near-dead board: only isolated cells free, tray of dot + unplaceable pieces.
    const checker = boardFromAscii([
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
      '#.#.#.#.',
      '.#.#.#.#',
    ]);
    Object.assign(app, {
      stateValue: {
        ...app.state,
        board: checker,
        score: 500,
        tray: [
          { shape: 'dot', color: 0 },
          { shape: 'sq2', color: 1 },
          { shape: 'i2h', color: 2 },
        ],
      },
    });
    app.place({ slot: 0, row: 0, col: 1 });
    expect(app.state.over).toBe(true);
    expect(app.drag.isLocked).toBe(true);
    expect(app.bestScore).toBe(501);

    const onNew = vi.fn();
    app.bus.on('newRun', onNew);
    app.newRun('fresh');
    expect(app.state.over).toBe(false);
    expect(app.state.score).toBe(0);
    expect(app.drag.isLocked).toBe(false);
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(text(uiRoot, '.hud__best-value')).toBe('501');
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
