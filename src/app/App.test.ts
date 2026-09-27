// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { allFits, boardFromAscii } from '../core/board';
import { slotShape } from '../core/generator';
import type { FrameScheduler } from '../render/Renderer';
import { fakeCanvasFactory } from '../render/testing';
import type { ViewportEnv } from '../render/viewport';
import { AdManager } from '../services/ads/AdManager';
import { NoAdsService } from '../services/ads/NoAdsService';
import { MemoryBackend } from '../services/storage/StorageBackend';
import { SAVE_KEY, SaveStore } from '../services/storage/SaveStore';
import { App, randomSeed, type PageEnv } from './App';

const idleScheduler: FrameScheduler = { request: () => 0, cancel: () => {} };

function fakePage(): PageEnv & { hide(): void } {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const window = new EventTarget();
  return {
    window,
    document,
    hide() {
      document.visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

function makeApp(seed = 'app-test', save?: SaveStore, ads?: AdManager) {
  const { factory } = fakeCanvasFactory();
  const canvas = factory(390, 844);
  const uiRoot = document.createElement('div');
  const app = new App({
    canvas,
    uiRoot,
    seed: () => seed,
    spriteFactory: factory,
    renderer: { scheduler: idleScheduler },
    ...(save ? { save } : {}),
    ...(ads ? { ads } : {}),
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
  app.start({ viewport, page });
  return { app, uiRoot, page };
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

describe('App persistence', () => {
  async function loadedSave(backend: MemoryBackend) {
    const save = new SaveStore(backend, { now: () => 1 });
    await save.load();
    return save;
  }

  function play(app: App, moves: number) {
    for (let i = 0; i < moves && !app.state.over; i++) app.place(firstMove(app));
  }

  it('saves the run and best score, and resumes the exact run after a reload', async () => {
    const backend = new MemoryBackend();
    const { app, page } = makeApp('resume', await loadedSave(backend));
    play(app, 5);
    const snapshot = app.state;
    page.hide(); // flushes the debounced save
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse((await backend.get(SAVE_KEY))!);
    expect(stored.stats.bestScore).toBe(snapshot.score);
    expect(stored.endlessRun).not.toBeNull();

    const { app: reloaded, uiRoot } = makeApp('other-seed', await loadedSave(backend));
    expect(reloaded.state).toEqual(snapshot);
    expect(text(uiRoot, '.hud__score')).toBe(String(snapshot.score));

    // The next deal after the reload is identical to continuing without one.
    play(app, 10);
    play(reloaded, 10);
    expect(reloaded.state).toEqual(app.state);
  });

  it('starts fresh and keeps the best score when the saved run is unreadable', async () => {
    const backend = new MemoryBackend();
    const save = await loadedSave(backend);
    save.update((s) => {
      s.endlessRun = '{"schemaVersion":99}';
      s.stats.bestScore = 1234;
    });
    const { app, uiRoot } = makeApp('fresh', save);
    expect(app.state.stats.placed).toBe(0);
    expect(app.bestScore).toBe(1234);
    expect(text(uiRoot, '.hud__best-value')).toBe('1\u2009234');
    expect(save.current.endlessRun).not.toContain('"schemaVersion":99');
  });

  it('counts a finished run when a new one starts, and on boot if it was left at game over', async () => {
    const backend = new MemoryBackend();
    const save = await loadedSave(backend);
    const { app } = makeApp('count', save);
    play(app, 1000);
    expect(app.state.over).toBe(true);
    const lines = app.state.stats.linesCleared;
    expect(save.current.stats.gamesPlayed).toBe(0); // not yet: a second chance may follow

    app.newRun('next');
    expect(save.current.stats.gamesPlayed).toBe(1);
    expect(save.current.stats.linesCleared).toBe(lines);

    // Leave the next run at game over and "reload".
    play(app, 1000);
    await save.flush();
    const save2 = await loadedSave(backend);
    const { app: booted } = makeApp('boot', save2);
    expect(save2.current.stats.gamesPlayed).toBe(2);
    expect(booted.state.stats.placed).toBe(0);
  });

  it('keeps "New best!" working for a resumed run', async () => {
    const backend = new MemoryBackend();
    const save = await loadedSave(backend);
    save.update((s) => (s.stats.bestScore = 3));
    const { app } = makeApp('newbest', save);
    play(app, 3);
    await save.flush();
    expect(save.current.endlessRunBestAtStart).toBe(3);
    const { app: resumed } = makeApp('x', await loadedSave(backend));
    expect(resumed.bestScore).toBe(app.bestScore);
    expect(resumed['bestAtRunStart' as keyof App]).toBe(3);
  });
});

describe('App ads', () => {
  async function withAds() {
    const save = new SaveStore(new MemoryBackend());
    await save.load();
    let t = 0;
    const service = new NoAdsService({ wait: async () => {} });
    const ads = new AdManager(service, save, { now: () => t });
    await ads.init();
    const signals: string[] = [];
    service.gameplayStart = () => signals.push('start');
    service.gameplayStop = () => signals.push('stop');
    const made = makeApp('ads', save, ads);
    return { ...made, ads, signals, tick: (ms: number) => (t += ms) };
  }

  it('signals gameplay for the run, stops it at game over and restarts it for the next run', async () => {
    const { app, signals, ads, tick } = await withAds();
    expect(signals).toEqual(['start']);
    tick(5000);
    for (let i = 0; i < 1000 && !app.state.over; i++) app.place(firstMove(app));
    await Promise.resolve();
    expect(signals).toEqual(['start', 'stop']);
    expect(ads.gameplayMs).toBe(5000);
    app.newRun();
    expect(signals).toEqual(['start', 'stop', 'start']);
  });

  it('stops gameplay while the page is hidden', async () => {
    const { page, signals } = await withAds();
    page.hide();
    expect(signals).toEqual(['start', 'stop']);
  });

  it('pauses rendering and input while an ad plays', async () => {
    const { app, ads } = await withAds();
    let during: [boolean, boolean] | undefined;
    const start = ads.onAdStart;
    ads.onAdStart = () => {
      start();
      during = [app.renderer.isPaused, app.drag.isLocked];
    };
    await ads.rewarded('secondChance');
    expect(during).toEqual([true, true]);
    expect(app.renderer.isPaused).toBe(false);
    expect(app.drag.isLocked).toBe(false);
  });
});
