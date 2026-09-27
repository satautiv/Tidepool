// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { boardFromAscii } from '../core/board';
import { slotShape } from '../core/generator';
import { FEEL } from '../render/feel';
import { AdManager } from '../services/ads/AdManager';
import { NoAdsService } from '../services/ads/NoAdsService';
import { MemoryBackend } from '../services/storage/StorageBackend';
import { SAVE_KEY, SaveStore } from '../services/storage/SaveStore';
import { randomSeed, type App } from './App';
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

  it('stays idle with reduced motion (no redraws, nothing drawn)', () => {
    const { app, tick } = withTicker({ reduced: true });
    const redraw = vi.spyOn(app.renderer, 'requestRedraw');
    tick();
    expect(redraw).not.toHaveBeenCalled();
    expect(app.caustics.enabled()).toBe(false);
  });

  it('turns itself off after 3 s of slow frames and reports it', () => {
    const { app, tick, advance } = withTicker();
    const fallback = vi.fn();
    app.bus.on('perfFallback', fallback);
    app.renderer.stats.lastFrameMs = 25;
    for (let i = 0; i < 3; i++) {
      tick();
      advance(1000);
    }
    tick();
    expect(fallback).toHaveBeenCalledWith({ feature: 'caustics', frameMs: 25 });
    expect(app.caustics.enabled()).toBe(false);

    // A short slow spell doesn't count.
    const other = withTicker();
    const spy = vi.fn();
    other.app.bus.on('perfFallback', spy);
    other.app.renderer.stats.lastFrameMs = 25;
    other.tick();
    other.advance(2000);
    other.app.renderer.stats.lastFrameMs = 5;
    other.tick();
    other.app.renderer.stats.lastFrameMs = 25;
    other.advance(2000);
    other.tick();
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
