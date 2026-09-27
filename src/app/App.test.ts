// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { boardFromAscii, boardToAscii } from '../core/board';
import { slotShape } from '../core/generator';
import { FEEL } from '../render/feel';
import { readSafeArea } from '../render/viewport';
import { AdManager } from '../services/ads/AdManager';
import { AudioEngine } from '../services/audio/AudioEngine';
import { FakeAudioContext } from '../services/audio/testing';
import { NoAdsService } from '../services/ads/NoAdsService';
import { MemoryBackend } from '../services/storage/StorageBackend';
import { SAVE_KEY, SaveStore } from '../services/storage/SaveStore';
import { randomSeed, type App } from './App';
import { FIRST_RUN } from './tutorial';
import { firstMove, makeApp } from './testing';

const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent;

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
  async function withAds(opts: { rewardedReady?: boolean; returning?: boolean } = {}) {
    const save = new SaveStore(new MemoryBackend());
    await save.load();
    if (opts.returning) save.update((s) => (s.ads.sessionCount = 1));
    let t = 0;
    const service = new NoAdsService({
      wait: async () => {},
      rewardedReady: opts.rewardedReady ?? true,
    });
    const ads = new AdManager(service, save, { now: () => t });
    await ads.init();
    const signals: string[] = [];
    service.gameplayStart = () => signals.push('start');
    service.gameplayStop = () => signals.push('stop');
    const made = makeApp('ads', save, ads);
    return { ...made, ads, service, signals, tick: (ms: number) => (t += ms) };
  }

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  /** Plays first-fit moves until game over and lets the Game Over sequence finish. */
  async function playToGameOver(app: App) {
    for (let i = 0; i < 1000 && !app.state.over; i++) app.place(firstMove(app));
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      app.scene.update(1);
    }
    await tick();
  }

  const button = (root: HTMLElement, sel: string) => root.querySelector<HTMLButtonElement>(sel)!;

  it('offers a second chance once per run, which continues the same run', async () => {
    const { app, uiRoot } = await withAds();
    await playToGameOver(app);
    const offer = button(uiRoot, '.gameover__second-chance');
    expect(offer.hidden).toBe(false);
    const score = app.state.score;
    offer.click();
    await tick();
    expect(uiRoot.querySelector<HTMLElement>('.gameover')!.hidden).toBe(true);
    expect(app.state.over).toBe(false);
    expect(app.state.secondChanceUsed).toBe(true);
    expect(app.state.score).toBe(score);
    expect(app.drag.isLocked).toBe(false);

    await playToGameOver(app);
    expect(button(uiRoot, '.gameover__second-chance').hidden).toBe(true);
    button(uiRoot, '.gameover__again').click();
    await tick();
    await playToGameOver(app);
    expect(button(uiRoot, '.gameover__second-chance').hidden).toBe(false); // new run, new chance
  });

  it('shows no reward button when no ad is ready, and Play again still works', async () => {
    const { app, uiRoot } = await withAds({ rewardedReady: false });
    await playToGameOver(app);
    expect(button(uiRoot, '.gameover__second-chance').hidden).toBe(true);
    button(uiRoot, '.gameover__again').click();
    await tick();
    expect(app.state.over).toBe(false);
    expect(app.state.stats.placed).toBe(0);
  });

  it('hides the button and keeps the panel when the ad is not completed', async () => {
    const { app, uiRoot, service } = await withAds();
    service.showRewarded = async () => false;
    await playToGameOver(app);
    button(uiRoot, '.gameover__second-chance').click();
    await tick();
    expect(button(uiRoot, '.gameover__second-chance').hidden).toBe(true);
    expect(uiRoot.querySelector<HTMLElement>('.gameover')!.hidden).toBe(false);
    expect(app.state.over).toBe(true);
  });

  it('plays a break ad between runs when the policy allows, then starts the next run', async () => {
    const { app, uiRoot, service, tick: advance } = await withAds({ returning: true });
    const shown = vi.fn(async () => {});
    service.showInterstitial = shown;
    advance(200_000);
    await playToGameOver(app);
    button(uiRoot, '.gameover__again').click();
    button(uiRoot, '.gameover__again').click(); // a double tap doesn't start two ads
    expect(app.state.over).toBe(true);
    await tick();
    expect(shown).toHaveBeenCalledOnce();
    expect(shown).toHaveBeenCalledWith('runEnd');
    expect(app.state.over).toBe(false);
  });

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

describe('App pause and lifecycle', () => {
  const dialog = (root: HTMLElement) => root.querySelector<HTMLElement>('.pause')!;
  const click = (root: HTMLElement, sel: string) =>
    root.querySelector<HTMLButtonElement>(sel)!.click();

  it('pauses from the HUD button and resumes from the dialog', () => {
    const { app, uiRoot } = makeApp();
    const onPause = vi.fn();
    app.bus.on('pause', onPause);
    click(uiRoot, '.hud__pause');
    expect(app.isPaused).toBe(true);
    expect(dialog(uiRoot).hidden).toBe(false);
    expect(app.drag.isLocked).toBe(true);
    expect(onPause).toHaveBeenCalledOnce();
    click(uiRoot, '.pause__resume');
    expect(app.isPaused).toBe(false);
    expect(dialog(uiRoot).hidden).toBe(true);
    expect(app.drag.isLocked).toBe(false);
  });

  it('restarts only after confirming', () => {
    const { app, uiRoot } = makeApp();
    app.place(firstMove(app));
    click(uiRoot, '.hud__pause');
    click(uiRoot, '.pause__restart');
    expect(app.state.stats.placed).toBe(1);
    click(uiRoot, '.pause__confirm');
    expect(app.state.stats.placed).toBe(0);
    expect(app.isPaused).toBe(false);
    expect(dialog(uiRoot).hidden).toBe(true);
    expect(app.drag.isLocked).toBe(false);
  });

  it('shows the pause dialog after returning from the background, with the run intact', async () => {
    const backend = new MemoryBackend();
    const save = new SaveStore(backend);
    await save.load();
    let frames = 0;
    const { app, uiRoot, page } = makeApp('bg', save, undefined, {
      extra: { renderer: { scheduler: { request: () => ++frames, cancel: () => {} } } },
    });
    app.place(firstMove(app));
    const before = app.state;
    page.hide();
    expect(save.isDirty).toBe(false); // flushed
    await save.flush(); // let the write land
    expect(JSON.parse((await backend.get(SAVE_KEY))!).endlessRun).not.toBeNull();

    const scheduled = frames;
    app.renderer.requestRedraw();
    expect(frames).toBe(scheduled); // no frames while hidden

    page.show();
    expect(app.isPaused).toBe(true);
    expect(dialog(uiRoot).hidden).toBe(false);
    expect(app.state).toBe(before);
    expect(app.renderer.isPaused).toBe(false);
    click(uiRoot, '.pause__resume');
    expect(app.drag.isLocked).toBe(false);
  });

  it('does not pause a finished run', () => {
    const { app, uiRoot } = makeApp();
    for (let i = 0; i < 1000 && !app.state.over; i++) app.place(firstMove(app));
    click(uiRoot, '.hud__pause');
    expect(app.isPaused).toBe(false);
    expect(dialog(uiRoot).hidden).toBe(true);
  });

  it('does not count paused time in the run duration', () => {
    let t = 0;
    const { app, uiRoot } = makeApp('clock', undefined, undefined, { extra: { now: () => t } });
    const ended = vi.fn();
    app.bus.on('runEnd', ended);
    app.place(firstMove(app));
    t += 1000;
    click(uiRoot, '.hud__pause');
    t += 60_000;
    click(uiRoot, '.pause__resume');
    t += 500;
    app.newRun();
    expect(ended.mock.calls[0]![0].durationMs).toBe(1500);
  });
});

describe('App clear effects', () => {
  it('lets the next piece be placed while a clear is still animating', () => {
    const { app } = makeApp();
    const rows = ['#######.', ...new Array<string>(7).fill('........')];
    app.loadState({
      ...app.state,
      board: boardFromAscii(rows),
      tray: [
        { shape: 'dot', color: 1 },
        { shape: 'dot', color: 2 },
        { shape: 'sq2', color: 3 },
      ],
    });
    app.place({ slot: 0, row: 0, col: 7 });
    expect(app.state.stats.linesCleared).toBe(1);
    expect(app.particles.system.count).toBeGreaterThan(0);
    app.scene.update(0.05);
    expect(app.place({ slot: 1, row: 0, col: 0 })).toBeUndefined();
    expect(app.place({ slot: 2, row: 0, col: 6 })).toBeUndefined();
    for (let i = 0; i < 120; i++) app.scene.update(1 / 60);
    expect(app.scene.isAnimating()).toBe(false);
    expect(app.state.board.cells.filter((c) => c.color !== null)).toHaveLength(5);
  });

  it('shows D6 callouts and floating points for clears', () => {
    const { app, uiRoot } = makeApp();
    const fill = '#######.';
    app.loadState({
      ...app.state,
      board: boardFromAscii([fill, fill, ...new Array<string>(5).fill('........'), '#.......']),
      tray: [
        { shape: 'i2v', color: 1 },
        { shape: 'dot', color: 2 },
        { shape: 'dot', color: 3 },
      ],
    });
    app.place({ slot: 0, row: 0, col: 7 });
    const texts = [...uiRoot.querySelectorAll('.callout')].map((e) => e.textContent);
    expect(texts).toEqual(['Nice!']);
    const float = uiRoot.querySelector<HTMLElement>('.float-points')!;
    const cleared = app.state.stats.linesCleared;
    expect(cleared).toBe(2);
    expect(float.textContent).toMatch(/^\+/);
    // Single line: points only, no callout.
    app.loadState({
      ...app.state,
      board: boardFromAscii([fill, ...new Array<string>(6).fill('........'), '#.......']),
    });
    app.place({ slot: 1, row: 0, col: 7 });
    // (Loading a state cleared the earlier effects.)
    expect(uiRoot.querySelectorAll('.callout')).toHaveLength(0);
    expect(uiRoot.querySelectorAll('.float-points')).toHaveLength(1);
  });

  it('keeps the streak chip in step with state.streak and setHadClear', () => {
    const { app, uiRoot } = makeApp('streak-chip');
    const chip = uiRoot.querySelector<HTMLElement>('.hud__streak')!;
    for (let i = 0; i < 400 && !app.state.over; i++) {
      app.place(firstMove(app));
      const { streak, setHadClear } = app.state;
      const visible = !chip.hidden && !chip.classList.contains('hud__streak--leaving');
      expect(visible).toBe(streak > 0);
      if (streak > 0) {
        expect(chip.dataset.multiplier).toBe(String(Math.min(4, 1 + streak * 0.5)));
        expect(chip.classList.contains('hud__streak--at-risk')).toBe(!setHadClear);
      }
    }
  });

  it('glows the best score once per run when a previous best is beaten', async () => {
    const save = new SaveStore(new MemoryBackend());
    await save.load();
    save.update((s) => (s.stats.bestScore = 3));
    const { app, uiRoot } = makeApp('glow', save);
    const best = uiRoot.querySelector('.hud__best')!;
    app.place(firstMove(app));
    app.place(firstMove(app));
    expect(app.state.score).toBeGreaterThan(3);
    expect(best.classList.contains('hud__best--glow')).toBe(true);
    best.classList.remove('hud__best--glow');
    app.place(firstMove(app));
    expect(best.classList.contains('hud__best--glow')).toBe(false);
  });
});

describe('App shake and haptics', () => {
  const fill = '#######.';
  const empty = '........';

  function setupClear(opts: { reduced?: boolean } = {}) {
    const impacts: string[] = [];
    const { app } = makeApp('shake', undefined, undefined, {
      extra: {
        haptics: { impact: (level) => void impacts.push(level) },
        prefersReducedMotion: () => opts.reduced ?? false,
      },
    });
    return { app, impacts };
  }

  it('taps light on placement, medium on a clear, heavy and shakes on 3+ lines', () => {
    const { app, impacts } = setupClear();
    app.loadState({
      ...app.state,
      board: boardFromAscii([fill, empty, empty, empty, empty, empty, fill, '#.......']),
      tray: [
        { shape: 'dot', color: 1 },
        { shape: 'dot', color: 2 },
        { shape: 'i3v', color: 3 },
      ],
    });
    app.place({ slot: 0, row: 3, col: 3 });
    app.place({ slot: 1, row: 0, col: 7 });
    expect(impacts).toEqual(['light', 'medium']);
    expect(app.shake.active).toBe(false);

    app.loadState({
      ...app.state,
      board: boardFromAscii([fill, fill, fill, empty, empty, empty, empty, '#.......']),
    });
    app.place({ slot: 2, row: 0, col: 7 });
    expect(impacts.at(-1)).toBe('heavy');
    expect(app.shake.active).toBe(true);
  });

  it('does not shake with reduced motion, and input ignores the shake', () => {
    const { app } = setupClear({ reduced: true });
    app.loadState({
      ...app.state,
      board: boardFromAscii([fill, fill, fill, empty, empty, empty, empty, '#.......']),
      tray: [{ shape: 'i3v', color: 3 }, null, { shape: 'dot', color: 1 }],
    });
    app.place({ slot: 0, row: 0, col: 7 });
    expect(app.shake.active).toBe(false);

    // Even mid-shake, a press on the drawn tray piece picks it up at its layout position.
    const shaking = setupClear().app;
    shaking.scene.update(1); // let the tray finish dealing in
    shaking.shake.start(20, 1);
    shaking.scene.update(0.1);
    expect(shaking.shake.active).toBe(true);
    const rect = shaking.slotPieceRect(0)!;
    const picked = shaking.drag.pointerDown({
      id: 1,
      kind: 'mouse',
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    });
    expect(picked).toBe(true);
    expect(shaking.drag.state?.slot).toBe(0);
  });
});

describe('App ambient caustics', () => {
  function withTicker(opts: { lowPower?: boolean; reduced?: boolean } = {}) {
    let tick: () => void = () => {};
    let t = 0;
    const made = makeApp('ambient', undefined, undefined, {
      extra: {
        setInterval: (fn) => void (tick = fn),
        prefersReducedMotion: () => opts.reduced ?? false,
        now: () => t,
      },
    });
    return { ...made, tick: () => tick(), advance: (ms: number) => (t += ms) };
  }

  it('redraws at the ticker rate while caustics are on', () => {
    const { app, tick } = withTicker();
    const redraw = vi.spyOn(app.renderer, 'requestRedraw');
    tick();
    tick();
    expect(redraw).toHaveBeenCalledTimes(2);
  });

  it('keeps still caustics with reduced motion, so the ticker never redraws', () => {
    const { app, tick } = withTicker({ reduced: true });
    const redraw = vi.spyOn(app.renderer, 'requestRedraw');
    tick();
    expect(redraw).not.toHaveBeenCalled();
    expect(app.caustics.enabled()).toBe(true);
    expect(app.caustics.drift).toBe(false);
  });

  it('stays idle in low power (no caustics at all)', () => {
    const { app, tick } = withTicker();
    app.applySettings({ lowPower: true });
    const redraw = vi.spyOn(app.renderer, 'requestRedraw');
    tick();
    expect(redraw).not.toHaveBeenCalled();
    expect(app.caustics.enabled()).toBe(false);
  });

  /** A tick with a newly drawn frame that took `ms`. */
  function slowFrame(t: ReturnType<typeof withTicker>, ms: number) {
    t.app.renderer.stats.draws++;
    t.app.renderer.stats.lastFrameMs = ms;
    t.tick();
  }

  it('switches battery saver on after 3 s of slow frames, with a one-time toast', () => {
    const t = withTicker();
    const fallback = vi.fn();
    t.app.bus.on('perfFallback', fallback);
    for (let i = 0; i < 3; i++) {
      slowFrame(t, 25);
      t.advance(1000);
    }
    slowFrame(t, 25);
    expect(fallback).toHaveBeenCalledWith({ feature: 'lowPower', frameMs: 25 });
    expect(t.app.settings.lowPower).toBe(true);
    expect(t.app.settings.autoLowPowerNotified).toBe(true);
    expect(t.app.toast.visible).toBe(true);
    expect(t.app.caustics.enabled()).toBe(false);
  });

  it('ignores short slow spells and idle time', () => {
    const t = withTicker();
    const spy = vi.fn();
    t.app.bus.on('perfFallback', spy);
    slowFrame(t, 25);
    t.advance(2000);
    slowFrame(t, 5); // a fast frame resets it
    slowFrame(t, 25);
    t.advance(2000);
    slowFrame(t, 25);
    t.advance(5000);
    t.tick(); // idle: no new frame, not slow
    slowFrame(t, 25);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('App polish', () => {
  function press(app: ReturnType<typeof makeApp>['app'], slot: number) {
    const r = app.slotPieceRect(slot)!;
    return app.drag.pointerDown({
      id: 1,
      kind: 'mouse',
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
    });
  }

  it('locks picking up while a new tray deals in, for at most maxInputLock', () => {
    const { app } = makeApp();
    expect(press(app, 0)).toBe(false);
    app.scene.update(FEEL.deal.maxInputLock);
    expect(press(app, 0)).toBe(true);
  });

  it('a resumed tray (no deal-in) can be picked up at once', () => {
    const { app } = makeApp();
    app.loadState(app.state);
    expect(press(app, 0)).toBe(true);
  });

  it('snaps a dragged piece in from where it was released', () => {
    const { app } = makeApp();
    app.scene.update(1);
    const move = firstMove(app);
    const r = app.slotPieceRect(move.slot)!;
    const layout = app.scene.layout!;
    const target = {
      x: layout.board.x + move.col * layout.cellSize,
      y: layout.board.y + move.row * layout.cellSize,
    };
    app.drag.pointerDown({ id: 1, kind: 'mouse', x: r.x + 1, y: r.y + 1 });
    app.scene.update(1); // lifted
    app.drag.pointerUp({ id: 1, kind: 'mouse', x: target.x + 1 + 5, y: target.y + 1 + 3 });
    expect(app.state.stats.placed).toBe(1);
    expect(app.scene.isAnimating()).toBe(true);
  });

  it('drives the CSS feel values from feel.ts', () => {
    const { uiRoot } = makeApp();
    expect(uiRoot.style.getPropertyValue('--panel-slide')).toBe(
      `${FEEL.gameOver.panelSlideDuration}s`,
    );
    expect(uiRoot.style.getPropertyValue('--press-scale')).toBe(String(FEEL.button.pressScale));
  });
});

describe('App audio lifecycle', () => {
  async function withAudio() {
    const ctx = new FakeAudioContext();
    const audio = new AudioEngine({
      createContext: () => ctx as unknown as AudioContext,
      settings: () => ({ sfx: 1, music: 0.35, sfxMuted: false, musicMuted: false }),
    });
    audio.unlock();
    const save = new SaveStore(new MemoryBackend());
    await save.load();
    const service = new NoAdsService({ wait: async () => {} });
    const ads = new AdManager(service, save);
    await ads.init();
    const made = makeApp('audio', save, ads, { extra: { audio } });
    return { ...made, audio, ctx, ads };
  }

  it('suspends audio while the page is hidden and resumes when it is shown', async () => {
    const { audio, page, ctx } = await withAudio();
    page.hide();
    expect(audio.isSuspended).toBe(true);
    expect(ctx.suspends).toBe(1);
    page.show();
    expect(audio.isSuspended).toBe(false);
  });

  it('suspends audio during an ad', async () => {
    const { audio, ads } = await withAudio();
    let during = false;
    const start = ads.onAdStart;
    ads.onAdStart = () => {
      start();
      during = audio.isSuspended;
    };
    await ads.rewarded('secondChance');
    expect(during).toBe(true);
    expect(audio.isSuspended).toBe(false);
  });
});

describe('App drag events', () => {
  it('reports pick-ups and cancelled drops on the bus', () => {
    const { app } = makeApp();
    app.scene.update(1);
    const picked = vi.fn();
    const cancelled = vi.fn();
    app.bus.on('pickUp', picked);
    app.bus.on('dropCancelled', cancelled);
    const r = app.slotPieceRect(0)!;
    app.drag.pointerDown({ id: 1, kind: 'mouse', x: r.x + 1, y: r.y + 1 });
    app.drag.pointerUp({ id: 1, kind: 'mouse', x: 1, y: 1 });
    expect(picked).toHaveBeenCalledWith({ slot: 0 });
    expect(cancelled).toHaveBeenCalledWith({ slot: 0 });
  });
});

describe('App responsive', () => {
  it('reads safe-area insets without failing where env() is unsupported', () => {
    expect(readSafeArea()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(document.body.children).toHaveLength(0); // the probe is removed
  });

  it('lays out with the given safe area', () => {
    const { app } = makeApp('safe', undefined, undefined, {
      extra: { safeArea: () => ({ top: 47, right: 0, bottom: 34, left: 0 }) },
    });
    expect(app.scene.layout!.hud.y).toBeGreaterThanOrEqual(47);
  });

  it('cancels a drag when the layout changes (rotation mid-drag)', () => {
    const { app } = makeApp();
    app.scene.update(1);
    const cancelled = vi.fn();
    app.bus.on('dropCancelled', cancelled);
    const r = app.slotPieceRect(0)!;
    app.drag.pointerDown({ id: 1, kind: 'touch', x: r.x + 1, y: r.y + 1 });
    expect(app.drag.state).not.toBeNull();
    app.renderer.resize(844, 390, 2);
    expect(app.drag.state).toBeNull();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(app.scene.layout!.orientation).toBe('landscape');
  });
});

describe('App main menu', () => {
  const click = (root: HTMLElement, sel: string) =>
    root.querySelector<HTMLButtonElement>(sel)!.click();
  const flushRouter = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

  it('boots into the menu, with input off and the run not started yet', async () => {
    const started = vi.fn();
    const { app, uiRoot } = makeApp('menu', undefined, undefined, {
      extra: { startIn: 'menu' },
      beforeStart: (a) => a.bus.on('runStart', started),
    });
    expect(app.currentScreen).toBe('menu');
    expect(uiRoot.querySelector('.menu')).not.toBeNull();
    expect(uiRoot.querySelector('.menu__play')!.textContent).toBe('Play');
    expect(app.drag.isLocked).toBe(true);
    expect(started).not.toHaveBeenCalled();

    click(uiRoot, '.menu__play');
    expect(app.currentScreen).toBe('game');
    expect(started).toHaveBeenCalledOnce();
    await flushRouter();
    expect(uiRoot.querySelector('.menu')).toBeNull();
    expect(uiRoot.querySelector('.hud')).not.toBeNull();
    expect(app.drag.isLocked).toBe(false);
  });

  it('boot → Play → pause → Menu → Continue resumes the same run', async () => {
    const save = new SaveStore(new MemoryBackend());
    await save.load();
    const { app, uiRoot } = makeApp('flow', save, undefined, { extra: { startIn: 'menu' } });
    click(uiRoot, '.menu__play');
    app.place(firstMove(app));
    const run = app.state;
    click(uiRoot, '.hud__pause');
    click(uiRoot, '.pause__menu');
    expect(app.currentScreen).toBe('menu');
    expect(app.isPaused).toBe(false);
    expect(app.drag.isLocked).toBe(true);
    await flushRouter();
    expect(uiRoot.querySelector('.menu__play')!.textContent).toBe('Continue');
    click(uiRoot, '.menu__play');
    expect(app.state).toBe(run);
    expect(app.drag.isLocked).toBe(false);
  });

  it('shows the best score under Play', () => {
    const { app, uiRoot } = makeApp('best', undefined, undefined, { extra: { startIn: 'menu' } });
    expect(uiRoot.querySelector<HTMLElement>('.menu__best')!.hidden).toBe(true);
    app.play();
    app.place(firstMove(app));
    app.showMenu();
    expect(uiRoot.querySelector('.menu__best')!.textContent).toBe(`Best ${app.bestScore}`);
  });

  it('Game Over → Menu waits with a fresh run, which starts on Play', async () => {
    const { app, uiRoot } = makeApp();
    const starts = vi.fn();
    app.bus.on('runStart', starts);
    for (let i = 0; i < 1000 && !app.state.over; i++) app.place(firstMove(app));
    click(uiRoot, '.gameover__menu');
    expect(app.currentScreen).toBe('menu');
    expect(app.state.stats.placed).toBe(0);
    expect(starts).not.toHaveBeenCalled();
    await flushRouter();
    expect(uiRoot.querySelector('.menu__play')!.textContent).toBe('Play');
    click(uiRoot, '.menu__play');
    expect(starts).toHaveBeenCalledOnce();
  });

  it('does not pause or count run time while in the menu', () => {
    let t = 0;
    const { app, page } = makeApp('clock-menu', undefined, undefined, {
      extra: { startIn: 'menu', now: () => t },
    });
    const ended = vi.fn();
    app.bus.on('runEnd', ended);
    t += 60_000; // idling on the menu
    page.hide();
    page.show();
    expect(app.isPaused).toBe(false);
    app.play();
    app.place(firstMove(app));
    t += 2000;
    app.newRun();
    expect(ended.mock.calls[0]![0].durationMs).toBe(2000);
  });
});

describe('App settings', () => {
  const click = (root: HTMLElement, sel: string) =>
    root.querySelector<HTMLButtonElement>(sel)!.click();
  const flushRouter = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

  it('opens from the menu and the pause dialog, and Back returns there', async () => {
    const { app, uiRoot } = makeApp('settings', undefined, undefined, {
      extra: { startIn: 'menu' },
    });
    click(uiRoot, '.menu__settings');
    await flushRouter();
    expect(uiRoot.querySelector('.settings')).not.toBeNull();
    click(uiRoot, '.settings__back');
    await flushRouter();
    expect(uiRoot.querySelector('.menu')).not.toBeNull();

    click(uiRoot, '.menu__play');
    await flushRouter();
    click(uiRoot, '.hud__pause');
    click(uiRoot, '.pause__settings');
    await flushRouter();
    expect(uiRoot.querySelector('.settings')).not.toBeNull();
    click(uiRoot, '.settings__back');
    await flushRouter();
    expect(uiRoot.querySelector<HTMLElement>('.pause')!.hidden).toBe(false);
    expect(app.isPaused).toBe(true);
  });

  it('applies changes at once and keeps them across a reload', async () => {
    const backend = new MemoryBackend();
    const save = new SaveStore(backend);
    await save.load();
    const ctx = new FakeAudioContext();
    const audio = new AudioEngine({
      createContext: () => ctx as unknown as AudioContext,
      settings: () => save.current.settings,
    });
    audio.unlock();
    const { app } = makeApp('persist', save, undefined, { extra: { audio } });
    app.applySettings({ music: 0.8, sfxMuted: true, lowPower: true, reducedMotion: true });
    expect(audio.busLevel('music')).toBeCloseTo(0.8);
    expect(audio.busLevel('sfx')).toBe(0);
    expect(app.caustics.enabled()).toBe(false);
    await save.flush();
    const reloaded = new SaveStore(backend);
    await reloaded.load();
    expect(reloaded.current.settings).toMatchObject({
      music: 0.8,
      sfxMuted: true,
      lowPower: true,
      reducedMotion: true,
    });
  });

  it('reset progress clears the best score and the run, and returns to the menu', async () => {
    const save = new SaveStore(new MemoryBackend());
    await save.load();
    const { app, uiRoot } = makeApp('reset', save);
    app.place(firstMove(app));
    app.showMenu();
    app.openSettings();
    await flushRouter();
    click(uiRoot, '.settings__reset');
    click(uiRoot, '.settings__reset-yes');
    click(uiRoot, '.settings__reset-final');
    await flushRouter();
    expect(app.bestScore).toBe(0);
    expect(app.state.stats.placed).toBe(0);
    expect(save.current.stats.bestScore).toBe(0);
    expect(app.currentScreen).toBe('menu');
    expect(uiRoot.querySelector('.menu')).not.toBeNull();
    expect(uiRoot.querySelector('.menu__play')!.textContent).toBe('Play');
  });
});

describe('App palettes', () => {
  it('switches to the colour-blind palette with glyphs at once, and boots with it', async () => {
    const backend = new MemoryBackend();
    const save = new SaveStore(backend);
    await save.load();
    const { app } = makeApp('palette', save);
    expect(app.palette.id).toBe('tidepool');
    app.applySettings({ palette: 'colorblind' });
    expect(app.palette.id).toBe('colorblind');
    expect(app.glyphsOn).toBe(true);
    await save.flush();
    const reloaded = new SaveStore(backend);
    await reloaded.load();
    expect(makeApp('palette', reloaded).app.palette.id).toBe('colorblind');
  });

  it('turns shape patterns on for the default palette', () => {
    const { app } = makeApp();
    app.applySettings({ patterns: true });
    expect(app.palette.id).toBe('tidepool');
    expect(app.glyphsOn).toBe(true);
  });
});

describe('App reduced motion and low power', () => {
  it('respects prefers-reduced-motion on first launch', () => {
    const { app, uiRoot } = makeApp('rm', undefined, undefined, {
      extra: { prefersReducedMotion: () => true },
    });
    expect(app.settings.reducedMotion).toBeNull(); // still "auto"
    expect(uiRoot.classList.contains('reduced-motion')).toBe(true);
    expect(app.particles.system.density).toBe(FEEL.reducedMotion.particleScale);
    expect(app.caustics.drift).toBe(false);
  });

  it('switches both modes live, and they combine', () => {
    const { app, uiRoot } = makeApp('modes', undefined, undefined, {
      extra: { prefersReducedMotion: () => false },
    });
    expect(app.particles.system.density).toBe(1);
    expect(app.renderer.viewport.dpr).toBe(2);
    app.applySettings({ lowPower: true });
    expect(app.particles.system.density).toBe(FEEL.lowPower.particleScale);
    expect(app.renderer.viewport.dpr).toBe(FEEL.lowPower.maxDpr);
    expect(app.renderer.maxFps).toBe(FEEL.lowPower.fps);
    expect(uiRoot.classList.contains('low-power')).toBe(true);
    app.applySettings({ reducedMotion: true });
    expect(app.particles.system.density).toBe(FEEL.reducedMotion.particleScale);
    app.applySettings({ lowPower: false, reducedMotion: false });
    expect(app.renderer.viewport.dpr).toBe(2);
    expect(app.renderer.maxFps).toBe(0);
    expect(uiRoot.classList.contains('reduced-motion')).toBe(false);
  });

  it('turns off shake and the wave sweep with reduced motion', () => {
    const { app } = makeApp('rm2', undefined, undefined, {
      extra: { prefersReducedMotion: () => true },
    });
    const fill = '#######.';
    app.loadState({
      ...app.state,
      board: boardFromAscii([
        fill,
        fill,
        fill,
        '........',
        '........',
        '........',
        '........',
        '#.......',
      ]),
      tray: [{ shape: 'i3v', color: 0 }, null, null],
    });
    app.place({ slot: 0, row: 0, col: 7 });
    expect(app.shake.active).toBe(false);
    app.scene.update(FEEL.reducedMotion.fadeDuration);
    // Cells faded in one short step, with no waves left running.
    app.scene.update(0.01);
    expect(app.scene.isAnimating()).toBe(app.particles.system.count > 0);
  });
});

describe('App first-time hint', () => {
  async function fresh(backend = new MemoryBackend()) {
    const save = new SaveStore(backend);
    await save.load();
    const made = makeApp('any-seed', save, undefined, {
      extra: { tutorial: true, startIn: 'menu', coarsePointer: () => false },
    });
    return { ...made, save, backend };
  }
  const hintEl = (root: HTMLElement) => root.querySelector<HTMLElement>('.hint')!;

  it('starts a fresh install on the friendly board and shows the hand in the game', async () => {
    const { app, uiRoot } = await fresh();
    expect(boardToAscii(app.state.board)).toEqual(FIRST_RUN.board);
    expect(app.state.tray.map((t) => t?.shape)).toEqual(['i2h', 'dot', 'sq2']);
    uiRoot.querySelector<HTMLButtonElement>('.menu__play')!.click();
    const hint = hintEl(uiRoot);
    expect(hint.hidden).toBe(false);
    // It drags from the slot-0 piece to where the domino fills the gap.
    const rect = app.slotPieceRect(0)!;
    expect(hint.style.getPropertyValue('--from-x')).toBe(`${rect.x + rect.width / 2}px`);
    app.pause();
    expect(hint.hidden).toBe(true);
    app.resume();
    expect(hint.hidden).toBe(false);
  });

  it('the suggested move clears a line at once', async () => {
    const { app } = await fresh();
    const { slot, row, col } = FIRST_RUN.target;
    app.place({ slot, row, col });
    expect(app.state.stats.linesCleared).toBe(1);
  });

  it('is gone for good after the first drag, even across reloads', async () => {
    const { app, uiRoot, save, backend } = await fresh();
    app.play();
    app.scene.update(1);
    const r = app.slotPieceRect(1)!;
    app.drag.pointerDown({ id: 1, kind: 'mouse', x: r.x + 1, y: r.y + 1 });
    expect(hintEl(uiRoot).hidden).toBe(true);
    expect(save.current.tutorialDone).toBe(true);
    app.drag.cancel();
    await save.flush();
    const { app: again, uiRoot: root2 } = await fresh(backend);
    again.play();
    expect(hintEl(root2).hidden).toBe(true);
  });

  it('only on a first install: a player with games behind them gets a normal run', async () => {
    const save = new SaveStore(new MemoryBackend());
    await save.load();
    save.update((s) => (s.stats.gamesPlayed = 3));
    const { app } = makeApp('normal', save, undefined, { extra: { tutorial: true } });
    expect(boardToAscii(app.state.board)).not.toEqual(FIRST_RUN.board);
  });
});

describe('App keyboard play', () => {
  function key(app: App, k: string) {
    const e = new KeyboardEvent('keydown', { key: k, cancelable: true });
    app.onKey(e);
    return e.defaultPrevented;
  }

  it('plays a full game with the keyboard only', () => {
    const { app } = makeApp('keys');
    let moves = 0;
    for (let i = 0; i < 2000 && !app.state.over; i++) {
      app.scene.update(1); // let the tray deal in
      const slot = app.state.tray.findIndex(
        (t, s) => t !== null && app.keys.select(s) && (app.keys.cancel(), true),
      );
      expect(slot).toBeGreaterThanOrEqual(0);
      key(app, String(slot + 1));
      key(app, 'ArrowLeft');
      key(app, 'ArrowUp');
      expect(key(app, 'Enter')).toBe(true);
      moves++;
    }
    expect(app.state.over).toBe(true);
    expect(app.state.stats.placed).toBe(moves);
  });

  it('shows the piece on the board and the ghost, and Esc puts it back', () => {
    const { app } = makeApp('keys2');
    app.scene.update(1);
    key(app, '1');
    expect(app.keys.state).not.toBeNull();
    const picked = vi.fn();
    app.bus.on('dropCancelled', picked);
    expect(key(app, 'Escape')).toBe(true);
    expect(app.keys.state).toBeNull();
    expect(picked).toHaveBeenCalledOnce();
    expect(app.isPaused).toBe(false);
  });

  it('Esc toggles pause; keys do nothing while paused or on the menu', () => {
    const { app } = makeApp('keys3');
    app.scene.update(1);
    expect(key(app, 'Escape')).toBe(true);
    expect(app.isPaused).toBe(true);
    expect(key(app, '1')).toBe(false);
    key(app, 'Escape');
    expect(app.isPaused).toBe(false);
    app.showMenu();
    expect(key(app, 'ArrowDown')).toBe(false); // the page may use arrows on the menu
    expect(key(app, 'Escape')).toBe(false);
  });

  it('stops arrows and space from scrolling during play', () => {
    const { app } = makeApp('keys4');
    app.scene.update(1);
    expect(key(app, 'ArrowDown')).toBe(true);
    expect(key(app, ' ')).toBe(true);
    expect(key(app, 'x')).toBe(false);
  });

  it('closes Settings with Esc', async () => {
    const { app, uiRoot } = makeApp('keys5', undefined, undefined, { extra: { startIn: 'menu' } });
    app.openSettings();
    expect(key(app, 'Escape')).toBe(true);
    await new Promise((r) => setTimeout(r, 250));
    expect(uiRoot.querySelector('.menu')).not.toBeNull();
  });
});
