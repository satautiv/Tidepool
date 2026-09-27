/** Test harness for the composition root: a started App on fake canvas, viewport and page. */
import { allFits } from '../core/board';
import { slotShape } from '../core/generator';
import type { FrameScheduler } from '../render/Renderer';
import { fakeCanvasFactory } from '../render/testing';
import type { ViewportEnv } from '../render/viewport';
import type { AdManager } from '../services/ads/AdManager';
import type { SaveStore } from '../services/storage/SaveStore';
import { App, type AppOptions, type PageEnv } from './App';

export const idleScheduler: FrameScheduler = { request: () => 0, cancel: () => {} };

/** A UI clock where every frame is far in the future: count-ups finish on their first frame. */
export function instantClock() {
  let t = 0;
  return { now: () => (t += 1e9), frame: (cb: () => void) => cb() };
}

export type FakePage = PageEnv & { hide(): void; show(): void; close(): void };

export function fakePage(): FakePage {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const window = new EventTarget();
  const setVisibility = (state: DocumentVisibilityState) => {
    document.visibilityState = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  return {
    window,
    document,
    hide: () => setVisibility('hidden'),
    show: () => setVisibility('visible'),
    close: () => window.dispatchEvent(new Event('pagehide')),
  };
}

export interface MakeAppOptions {
  extra?: Partial<AppOptions>;
  /** Runs between construction and `start()`, e.g. to attach listeners. */
  beforeStart?: (app: App) => void;
}

export function makeApp(
  seed = 'app-test',
  save?: SaveStore,
  ads?: AdManager,
  opts: MakeAppOptions = {},
) {
  const { factory } = fakeCanvasFactory();
  const canvas = factory(390, 844);
  const uiRoot = document.createElement('div');
  const app = new App({
    canvas,
    uiRoot,
    seed: () => seed,
    spriteFactory: factory,
    renderer: { scheduler: idleScheduler },
    // DOM animations finish instantly, so HUD text is final right after a move.
    uiClock: instantClock(),
    setInterval: () => 0, // no ambient ticker unless a test drives it
    startIn: 'game', // most tests play; menu tests pass startIn: 'menu'
    ...(save ? { save } : {}),
    ...(ads ? { ads } : {}),
    ...opts.extra,
  });
  const viewport: ViewportEnv = {
    observeResize: (_el, cb) => {
      cb(390, 844);
      return () => {};
    },
    devicePixelRatio: () => 2,
    onDprChange: () => () => {},
  };
  const page = fakePage();
  opts.beforeStart?.(app);
  app.start({ viewport, page });
  return { app, uiRoot, page, canvas };
}

/** The first valid move for the current tray. */
export function firstMove(app: App) {
  const s = app.state;
  const slot = s.tray.findIndex((t) => t && allFits(s.board, slotShape(t)).length > 0);
  const [row, col] = allFits(s.board, slotShape(s.tray[slot]!))[0]!;
  return { slot, row, col };
}

/** Plays first-fit moves until game over (or `max` moves). */
export function playMoves(app: App, max = 1000): void {
  for (let i = 0; i < max && !app.state.over; i++) app.place(firstMove(app));
}
