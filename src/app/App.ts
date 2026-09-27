/**
 * Composition root (docs/PLAN.md §3.1–3.3). Owns the Endless state, turns drag intents into
 * core moves, and fans the resulting events out to the renderer and the UI.
 */
import { canPlace } from '../core/board';
import { BOARD_SIZE } from '../core/config';
import {
  continueWithSecondChance,
  deserialize,
  newEndless,
  placePiece,
  serialize,
  type EndlessState,
  type GameEvent,
  type PlaceError,
} from '../core/game';
import { multiplier } from '../core/scoring';
import { getShape } from '../core/shapes';
import {
  bindPointerEvents,
  DragController,
  type DragHost,
  type PlaceIntent,
} from '../input/DragController';
import { CausticsView } from '../render/background';
import { BoardView, type DropOrigin } from '../render/BoardView';
import { ClearFx } from '../render/ClearFx';
import { DebugOverlay } from '../render/DebugOverlay';
import { DragView } from '../render/DragView';
import { GameScene } from '../render/GameScene';
import { GhostView } from '../render/GhostView';
import { FEEL } from '../render/feel';
import { ParticleView } from '../render/particles';
import { Shake } from '../render/shake';
import { PALETTES, TIDEPOOL, type Palette } from '../render/palettes';
import { Renderer, type RendererOptions } from '../render/Renderer';
import { domCanvasFactory, SpriteSet, type CanvasFactory } from '../render/sprites';
import { TrayView } from '../render/TrayView';
import { attachViewport, readSafeArea, type ViewportEnv } from '../render/viewport';
import type { Insets } from '../render/layout';
import type { HudClock } from '../ui/components/Hud';
import { Router } from '../ui/Router';
import type { AdManager } from '../services/ads/AdManager';
import type { AudioEngine } from '../services/audio/AudioEngine';
import { NoHaptics, type Haptics } from '../services/platform/haptics';
import { Lifecycle, type LifecycleEnv } from '../services/platform/lifecycle';
import type { SaveStore } from '../services/storage/SaveStore';
import { GameScreen } from '../ui/screens/GameScreen';
import { MenuScreen } from '../ui/screens/MenuScreen';
import {
  SettingsScreen,
  type SettingsModel,
  type SettingsValues,
} from '../ui/screens/SettingsScreen';
import { STRINGS } from '../ui/strings';
import { defaultSave, type Settings } from '../services/storage/SaveStore';
import type { Screen } from '../ui/Router';
import { EventBus } from './events';

export interface AppEvents {
  /** Every batch of core events produced by a move or a new run. */
  game: { events: readonly GameEvent[]; state: EndlessState };
  newRun: { state: EndlessState };
  /** A run is on screen: a fresh one (with its seed) or one resumed from the save. */
  runStart: { state: EndlessState; seed: string | null; resumed: boolean };
  /** A run was closed out (replaced by the next one, or found finished on boot). */
  runEnd: { state: EndlessState; durationMs: number };
  /** A piece was picked up from the tray. */
  pickUp: { slot: number };
  /** A drag ended without a placement: the piece floats back. */
  dropCancelled: { slot: number };
  /** A visual feature was turned off because frames were too slow (T2.06). */
  perfFallback: { feature: string; frameMs: number };
  /** Emitted once the Game Over panel is on screen. */
  gameOver: { score: number; best: number; newBest: boolean };
  pause: void;
  resume: void;
  menu: void;
  /** Settings opened (from the menu or the pause dialog). */
  settings: void;
  /** Progress was reset from Settings. */
  reset: void;
}

export interface AppOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  palette?: Palette;
  /** Seed source for new runs. Defaults to crypto-random. */
  seed?: () => string;
  renderer?: RendererOptions;
  spriteFactory?: CanvasFactory;
  debug?: boolean;
  /** A loaded save. Without one, nothing persists (tests, previews). */
  save?: SaveStore;
  /** Wall clock for run durations. Defaults to Date.now. */
  now?: () => number;
  /** Ad policy and provider. Without one, no ads (tests, previews). */
  ads?: AdManager;
  /** Whether this device can vibrate (the Settings haptics row). */
  hapticsSupported?: boolean;
  /** The first screen after boot. Default: the main menu. */
  startIn?: 'menu' | 'game';
  /** Safe-area insets for the canvas layout. Default: read from CSS `env()`. */
  safeArea?: () => Insets;
  /** Sound. Without one, the game is silent (tests, previews). */
  audio?: AudioEngine;
  /** Haptic taps on placements and clears. Default: none. */
  haptics?: Haptics;
  /** The system "reduce motion" preference. Default: the prefers-reduced-motion media query. */
  prefersReducedMotion?: () => boolean;
  /** Repeating timer for the ambient caustics redraw (tests pass a manual one). */
  setInterval?: (fn: () => void, ms: number) => unknown;
  /** Seconds clock for the caustics drift. */
  ambientClock?: () => number;
  /** Clock for DOM animations such as the score count-up (tests). */
  uiClock?: HudClock;
  /** Timer for removing finished DOM effects (tests). */
  uiTimer?: (fn: () => void, ms: number) => unknown;
}

/** Page lifecycle targets, injectable for tests. */
export type PageEnv = LifecycleEnv;

export function randomSeed(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36)).join('');
}

export class App {
  readonly bus = new EventBus<AppEvents>();
  readonly renderer: Renderer;
  readonly scene: GameScene;
  readonly drag: DragController;
  readonly router: Router;
  readonly gameScreen: GameScreen;
  readonly menuScreen: MenuScreen;
  readonly settingsScreen: SettingsScreen;
  /** Where Settings goes back to. */
  private settingsReturn: Screen | null = null;
  /** Settings when there is no save (tests, previews). */
  private readonly localSettings: Settings = defaultSave(0).settings;
  /** Which screen is up. The canvas draws under both; input only works in the game. */
  private screen: 'menu' | 'game' = 'menu';
  /** Whether the current run has been announced (ads run start, `runStart`) yet. */
  private announced = false;
  private runResumed = false;
  private readonly boardView: BoardView;
  private readonly trayView: TrayView;
  private readonly dragView: DragView;
  /** Bubbles, sparkles and droplets for effects (T2.03). */
  /** Screen shake on big clears; off with reduced motion. */
  readonly shake = new Shake(() => !this.reducedMotion());
  readonly particles = new ParticleView(undefined, this.shake);
  private readonly haptics: Haptics;
  readonly caustics: CausticsView;
  /** Frames too slow for the caustics: they stay off for the rest of the session. */
  private causticsDegraded = false;
  private slowSince: number | null = null;
  private readonly clearFx = new ClearFx(this.particles.system);
  private stateValue: EndlessState;
  private best = 0;
  private bestAtRunStart = 0;
  private readonly seed: () => string;
  private readonly sprites: SpriteSet;
  /** A break ad is running between Game Over and the next run. */
  private leaving = false;
  /** Whether this run has already played the "best beaten" glow. */
  private bestGlowed = false;
  private paused = false;
  private adShowing = false;
  private lifecycle: Lifecycle | null = null;
  private readonly now: () => number;
  private runSeed: string | null = null;
  /** Run play time before this page's stretch, and when this stretch started. */
  private runMsBefore = 0;
  private runStretchStart: number | null = 0;
  /** A finished run found in the save, closed out in `start()` once listeners exist. */
  private finishedOnBoot: { run: EndlessState; durationMs: number } | null = null;

  constructor(private readonly opts: AppOptions) {
    const palette = PALETTES[this.settings.palette] ?? opts.palette ?? TIDEPOOL;
    this.sprites = new SpriteSet(palette, opts.spriteFactory);
    this.sprites.setPatterns(this.settings.patterns);
    this.seed = opts.seed ?? randomSeed;
    this.haptics = opts.haptics ?? new NoHaptics();
    this.now = opts.now ?? Date.now;
    this.renderer = new Renderer(opts.canvas, opts.renderer);
    const redraw = () => this.renderer.requestRedraw();

    this.scene = new GameScene(this.sprites, opts.safeArea ?? (() => readSafeArea()));
    this.boardView = new BoardView(redraw);
    this.trayView = new TrayView(redraw);
    this.best = opts.save?.current.stats.bestScore ?? 0;
    this.stateValue = this.restoreRun() ?? this.freshRun(this.seed());

    this.drag = new DragController(this.dragHost(), {
      onStart: (d) => {
        this.trayView.setDragging(d.slot);
        this.bus.emit('pickUp', { slot: d.slot });
      },
      onMove: redraw,
      onPlace: (intent, d) => {
        const cell = this.scene.layout?.cellSize ?? 0;
        const box = this.dragView.pieceBox(d, cell);
        this.place(intent, { x: box.x, y: box.y });
      },
      onCancel: (d) => {
        this.bus.emit('dropCancelled', { slot: d.slot });
        this.dragView.returnToTray(d, this.trayView.pieceRect(d.slot), () =>
          this.trayView.setDragging(null),
        );
      },
    });
    this.dragView = new DragView(() => this.drag.state);

    // Board-side views move with the shake; the dragged piece stays under the finger.
    this.scene.add(this.shake);
    this.scene.setShake(this.shake);
    this.scene.add(this.boardView, { shake: true });
    this.caustics = new CausticsView(
      () => this.ambientOn(),
      opts.spriteFactory ?? domCanvasFactory,
      opts.ambientClock,
    );
    this.scene.add(this.caustics, { shake: true });
    this.scene.add(
      new GhostView(
        () => this.drag.state,
        () => this.stateValue.board,
      ),
      { shake: true },
    );
    this.scene.add(this.clearFx, { shake: true });
    this.scene.add(this.particles);
    this.scene.add(this.trayView, { shake: true });
    this.scene.add(this.dragView);
    this.scene.add({
      onLayout: ({ layout }) => {
        // Rotation or resize mid-drag: the piece goes back rather than jumping.
        if (this.drag.state) this.drag.cancel();
        this.gameScreen.hud.setRect(layout.hud);
        this.gameScreen.fx.setRect(layout.board);
      },
      draw() {},
    });
    this.renderer.addView(this.scene);
    if (opts.debug) this.renderer.addView(new DebugOverlay(this.renderer.stats));

    this.router = new Router(opts.uiRoot);
    // CSS-driven feel values (§11): the Game Over panel slide and the button press.
    opts.uiRoot.style.setProperty('--panel-slide', `${FEEL.gameOver.panelSlideDuration}s`);
    opts.uiRoot.style.setProperty('--press-scale', String(FEEL.button.pressScale));
    this.gameScreen = new GameScreen(
      {
        onPause: () => this.pause(),
        onResume: () => this.resume(),
        // Restarting abandons the run on purpose, so no break ad here.
        onRestart: () => this.newRun(),
        onSettings: () => this.openSettings(),
        onPlayAgain: () => this.leaveRun(() => this.newRun()),
        // From the pause dialog the run stays saved for Continue; after Game Over a fresh run
        // waits behind the menu (a break point, so a break ad may play first).
        onMenu: () => {
          if (!this.stateValue.over) return this.showMenu();
          this.leaveRun(() => {
            this.showMenu();
            this.newRun();
          });
        },
        onSecondChance: () => void this.useSecondChance(),
      },
      {
        callout: FEEL.callout,
        score: FEEL.score,
        ...(opts.uiClock ? { clock: opts.uiClock } : {}),
        ...(opts.uiTimer ? { setTimer: opts.uiTimer } : {}),
      },
    );
    this.menuScreen = new MenuScreen({
      onPlay: () => this.play(),
      onSettings: () => this.openSettings(),
    });
    this.settingsScreen = new SettingsScreen(this.settingsModel(), {
      onBack: () => this.closeSettings(),
    });

    if (opts.ads) {
      // The game sits still under an ad: no frames, no input.
      opts.ads.onAdStart = () => {
        this.adShowing = true;
        this.renderer.pause();
        this.opts.audio?.suspend();
        this.syncInput();
      };
      opts.ads.onAdEnd = () => {
        this.adShowing = false;
        if (!this.lifecycle?.hidden) {
          this.renderer.resume();
          this.opts.audio?.resume();
        }
        this.syncInput();
      };
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Pauses a run in play: input off, clocks stopped, Pause dialog up. */
  pause(): void {
    if (this.screen !== 'game' || this.paused || this.stateValue.over || this.adShowing) return;
    this.paused = true;
    this.stopRunClock();
    this.opts.ads?.gameplayStop();
    this.syncInput();
    this.gameScreen.pause.show();
    this.bus.emit('pause', undefined);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.gameScreen.pause.hide();
    this.startRunClock();
    this.opts.ads?.gameplayStart();
    this.syncInput();
    this.bus.emit('resume', undefined);
  }

  get state(): EndlessState {
    return this.stateValue;
  }

  get bestScore(): number {
    return this.best;
  }

  /**
   * Attaches to the real viewport, pointer and page lifecycle events, and shows the game.
   * A resumed run appears without the deal-in animation.
   */
  start(env?: { viewport?: ViewportEnv; page?: PageEnv }): void {
    const page = env?.page ?? { window, document };
    attachViewport(this.renderer, this.opts.canvas, env?.viewport);
    bindPointerEvents(this.opts.canvas, this.drag, page.window);
    this.lifecycle = new Lifecycle(page);
    const every = this.opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    every(() => this.ambientTick(), 1000 / FEEL.caustics.fps);
    // Backgrounded: pause the run (it never auto-resumes), stop frames, save now.
    this.lifecycle.onHide(() => {
      this.pause();
      this.renderer.pause();
      this.opts.audio?.suspend();
      this.opts.ads?.onHidden();
      this.persistRun();
      void this.opts.save?.flush();
    });
    this.lifecycle.onShow(() => {
      if (!this.adShowing) {
        this.renderer.resume();
        this.opts.audio?.resume();
      }
      this.opts.ads?.onVisible();
    });

    const resumed = this.stateValue.stats.placed > 0;
    if (this.finishedOnBoot) {
      const { run, durationMs } = this.finishedOnBoot;
      this.finishedOnBoot = null;
      this.bus.emit('runEnd', { state: run, durationMs });
    }
    this.showRun(!resumed, resumed);
    if (!resumed) this.persistRun();
    this.runResumed = resumed;
    this.announced = false;
    // The run clock only runs in the game; `play()` starts it.
    this.screen = 'menu';
    this.stopRunClock();
    this.syncInput();
    if ((this.opts.startIn ?? 'menu') === 'game') this.play();
    else this.showMenu();
  }

  /** Main menu → game: Play, or Continue for a saved run. */
  play(): void {
    if (this.screen === 'game') return;
    this.screen = 'game';
    void this.router.show(this.gameScreen);
    if (this.announced) this.opts.ads?.gameplayStart();
    else this.announce();
    this.startRunClock();
    this.syncInput();
  }

  /** Shows the main menu over the tidepool. The run waits, saved, for Continue. */
  showMenu(): void {
    this.gameScreen.pause.hide();
    this.paused = false;
    if (this.screen !== 'menu') {
      this.screen = 'menu';
      this.stopRunClock();
      this.opts.ads?.gameplayStop();
      this.syncInput();
      void this.router.show(this.menuScreen);
    } else if (this.router.screen !== this.menuScreen) {
      void this.router.show(this.menuScreen);
    }
    this.refreshMenu();
    this.bus.emit('menu', undefined);
  }

  get currentScreen(): 'menu' | 'game' {
    return this.screen;
  }

  /** Opens Settings over the menu or the paused game; Back returns there. */
  openSettings(): void {
    if (this.router.screen === this.settingsScreen) return;
    this.settingsReturn = this.router.screen;
    void this.router.show(this.settingsScreen);
    this.bus.emit('settings', undefined);
  }

  closeSettings(): void {
    const back =
      this.settingsReturn ?? (this.screen === 'game' ? this.gameScreen : this.menuScreen);
    this.settingsReturn = null;
    void this.router.show(back);
  }

  /** The persisted settings (or local ones without a save). */
  get settings(): Readonly<Settings> {
    return this.opts.save?.current.settings ?? this.localSettings;
  }

  /** Applies and persists a settings change right away. */
  applySettings(change: Partial<SettingsValues>): void {
    const save = this.opts.save;
    if (save) save.update((s) => Object.assign(s.settings, change));
    else Object.assign(this.localSettings, change);
    this.opts.audio?.refresh();
    if ('palette' in change || 'patterns' in change) this.applyLook();
    this.renderer.requestRedraw();
  }

  /** The palette and glyphs from the settings, rebuilt into the sprites at once. */
  private applyLook(): void {
    this.sprites.setPalette(PALETTES[this.settings.palette] ?? TIDEPOOL);
    this.sprites.setPatterns(this.settings.patterns);
    this.scene.refreshSprites();
  }

  get palette(): Palette {
    return this.sprites.currentPalette;
  }

  get glyphsOn(): boolean {
    return this.sprites.glyphsOn;
  }

  /** Reset progress: the save back to defaults, a fresh run, and the main menu. */
  resetProgress(): void {
    this.opts.save?.reset();
    this.applyLook();
    this.best = 0;
    this.bestAtRunStart = 0;
    this.stateValue = this.freshRun(this.seed());
    this.runResumed = false;
    this.announced = false;
    this.gameScreen.gameOver.hide();
    this.showRun(true);
    this.persistRun();
    this.opts.audio?.refresh();
    this.settingsReturn = this.menuScreen;
    this.showMenu();
    this.bus.emit('reset', undefined);
  }

  private settingsModel(): SettingsModel {
    return {
      get: () => ({ ...this.settings, reducedMotion: this.reducedMotion() }),
      set: (change) => this.applySettings(change),
      resetProgress: () => this.resetProgress(),
      hapticsSupported: this.opts.hapticsSupported ?? false,
      palettes: [
        { id: 'tidepool', label: STRINGS.paletteDefault },
        { id: 'colorblind', label: STRINGS.paletteColorblind },
      ],
      paletteHasGlyphs: (id) => !!PALETTES[id]?.glyphs,
      version: __APP_VERSION__,
      build: __BUILD_SHA__,
      privacyUrl: 'privacy.html',
      credits: STRINGS.creditsText,
    };
  }

  /** The run's start signals (ads per-run limits and gameplay, `runStart`), once per run. */
  private announce(): void {
    if (this.announced) return;
    this.announced = true;
    this.opts.ads?.runStarted();
    this.bus.emit('runStart', {
      state: this.stateValue,
      seed: this.runResumed ? null : this.runSeed,
      resumed: this.runResumed,
    });
  }

  private refreshMenu(): void {
    const run = this.stateValue;
    this.menuScreen.update({ canContinue: run.stats.placed > 0 && !run.over, best: this.best });
  }

  /** Starts a fresh Endless run, closing out the current one first. */
  newRun(seed = this.seed()): void {
    this.finishRun(this.stateValue, this.runElapsed());
    this.stateValue = this.freshRun(seed);
    this.gameScreen.gameOver.hide();
    this.gameScreen.pause.hide();
    this.paused = false;
    this.syncInput();
    this.showRun(true);
    this.persistRun();
    this.runResumed = false;
    this.announced = false;
    this.bus.emit('newRun', { state: this.stateValue });
    if (this.screen === 'game') this.announce();
    else this.refreshMenu();
  }

  /**
   * Replaces the run in progress with `state` (dev tools and E2E tests), as if it were resumed.
   * A state that is already over goes straight to Game Over.
   */
  loadState(state: EndlessState): void {
    this.stateValue = state;
    this.gameScreen.gameOver.hide();
    this.gameScreen.pause.hide();
    this.paused = false;
    this.syncInput();
    this.showRun(false, true);
    this.persistRun();
    if (state.over) void this.showGameOver();
  }

  /** Where a tray slot's piece is drawn, in canvas CSS px (dev tools and E2E tests). */
  slotPieceRect(slot: number): { x: number; y: number; width: number; height: number } | null {
    return this.trayView.pieceRect(slot);
  }

  /**
   * Applies a drop. Invalid intents (stale drags) are ignored and reported. `from` is where the
   * dragged piece was drawn when released, so the placed cells snap in from there.
   */
  place({ slot, row, col }: PlaceIntent, from?: DropOrigin): { error: PlaceError } | undefined {
    this.trayView.setDragging(null);
    const step = placePiece(this.stateValue, slot, row, col);
    if ('error' in step) return step;

    const before = this.stateValue.board;
    this.stateValue = step.state;
    this.boardView.applyMove(before, step.events, step.state.board, from);
    this.clearFx.play(before, step.events);
    this.trayView.setTray(
      step.state.tray,
      step.events.some((e) => e.type === 'dealt'),
    );
    this.updateHud();
    this.showScoreFx(step.events);
    this.feedback(step.events);
    this.persistRun(step.events);
    this.bus.emit('game', { events: step.events, state: step.state });
    if (step.state.over) void this.showGameOver();
    return undefined;
  }

  /** Locks input, lets clears finish, fades the board, then shows the Game Over panel. */
  private async showGameOver(): Promise<void> {
    this.syncInput();
    this.stopRunClock();
    this.opts.ads?.gameplayStop();
    const run = this.stateValue;
    await this.boardView.whenIdle();
    await new Promise<void>((resolve) => this.boardView.fadeOut(resolve));
    if (this.stateValue !== run) return; // a new run started meanwhile
    const info = {
      score: run.score,
      best: this.best,
      newBest: run.score > this.bestAtRunStart,
    };
    const secondChance =
      !run.secondChanceUsed && !!this.opts.ads?.isRewardedAvailable('secondChance');
    this.gameScreen.gameOver.show({ ...info, secondChance });
    this.bus.emit('gameOver', info);
  }

  /**
   * Game Over → Play again / Menu: a break point, so an interstitial may play first (the
   * AdManager decides, and never blocks). Leaving from the pause dialog, or without ads,
   * is immediate.
   */
  private leaveRun(next: () => void): void {
    const ads = this.opts.ads;
    if (!ads || !this.stateValue.over) return next();
    if (this.leaving) return;
    this.leaving = true;
    void ads.requestBreak('runEnd').then(() => {
      this.leaving = false;
      next();
    });
  }

  /** The opt-in rewarded second chance (D11). A failed or skipped ad just hides the button. */
  private async useSecondChance(): Promise<void> {
    const ads = this.opts.ads;
    const run = this.stateValue;
    if (!ads || !run.over || this.leaving) return;
    const panel = this.gameScreen.gameOver;
    panel.setSecondChance('busy');
    const earned = await ads.rewarded('secondChance');
    if (this.stateValue !== run) return;
    const step = earned ? continueWithSecondChance(run) : null;
    if (!step || 'error' in step) {
      panel.setSecondChance('hidden');
      return;
    }
    this.stateValue = step.state;
    panel.hide();
    this.boardView.fadeIn();
    this.trayView.setTray(step.state.tray, true);
    this.syncInput();
    this.startRunClock();
    this.updateHud();
    this.persistRun(step.events);
    ads.gameplayStart();
    this.bus.emit('game', { events: step.events, state: step.state });
  }

  /** Saves the run after every change, plus the best score and lifetime counters. */
  private persistRun(events: readonly GameEvent[] = []): void {
    const tidalWaves = events.filter(
      (e) => e.type === 'cleared' && e.callouts.includes('tidalWave'),
    ).length;
    this.opts.save?.update((s) => {
      s.endlessRun = serialize(this.stateValue);
      s.endlessRunBestAtStart = this.bestAtRunStart;
      s.endlessRunMs = this.runElapsed();
      s.stats.bestScore = Math.max(s.stats.bestScore, this.best);
      s.stats.tidalWaves += tidalWaves;
    });
  }

  /**
   * Counts a finished run in the lifetime stats and clears it from the save. Runs are counted
   * when they are replaced (Play again, or on boot), not at game over, so a second chance
   * (T1.23) can still continue the same run.
   */
  private finishRun(run: EndlessState, durationMs: number, emit = true): void {
    if (run.stats.placed === 0) return;
    this.opts.save?.update((s) => {
      s.stats.gamesPlayed++;
      s.stats.linesCleared += run.stats.linesCleared;
      s.stats.totalPlaytimeMs += durationMs;
      s.endlessRun = null;
      s.endlessRunMs = 0;
    });
    if (emit) this.bus.emit('runEnd', { state: run, durationMs });
  }

  private freshRun(seed: string): EndlessState {
    this.runSeed = seed;
    this.runMsBefore = 0;
    this.runStretchStart = this.now();
    return newEndless(seed).state;
  }

  /** How long the current run has been played (not paused), including before a reload. */
  private runElapsed(): number {
    const stretch = this.runStretchStart === null ? 0 : this.now() - this.runStretchStart;
    return this.runMsBefore + Math.max(0, stretch);
  }

  private stopRunClock(): void {
    this.runMsBefore = this.runElapsed();
    this.runStretchStart = null;
  }

  private startRunClock(): void {
    if (this.runStretchStart === null) this.runStretchStart = this.now();
  }

  /** Input is on only while a run is in play: not paused, not over, no ad on screen. */
  private syncInput(): void {
    this.trayView.hidden = this.screen !== 'game';
    this.renderer.requestRedraw();
    this.drag.setLocked(
      this.screen !== 'game' || this.paused || this.adShowing || this.stateValue.over,
    );
  }

  /** The saved in-progress run, if there is a valid one. Finished runs are closed out. */
  private restoreRun(): EndlessState | null {
    const save = this.opts.save;
    const json = save?.current.endlessRun;
    if (!save || !json) return null;
    let run: EndlessState;
    try {
      run = deserialize(json);
    } catch {
      save.update((s) => (s.endlessRun = null)); // unreadable or from another version
      return null;
    }
    if (run.over) {
      const durationMs = save.current.endlessRunMs;
      this.finishRun(run, durationMs, false);
      this.finishedOnBoot = { run, durationMs };
      return null;
    }
    this.runMsBefore = save.current.endlessRunMs;
    this.runStretchStart = this.now();
    this.bestAtRunStart = save.current.endlessRunBestAtStart;
    return run;
  }

  private showRun(animateTray: boolean, resumed = false): void {
    if (!resumed) this.bestAtRunStart = this.best;
    this.clearFx.reset();
    this.particles.system.clear();
    this.gameScreen.fx.clear();
    this.bestGlowed = this.bestAtRunStart > 0 && this.stateValue.score > this.bestAtRunStart;
    this.boardView.setBoard(this.stateValue.board);
    this.trayView.setTray(this.stateValue.tray, animateTray);
    this.updateHud(false);
  }

  private updateHud(animate = true): void {
    const { score, streak, setHadClear } = this.stateValue;
    this.best = Math.max(this.best, score);
    // Glow once per run, when it first passes a real previous best.
    const beaten = !this.bestGlowed && this.bestAtRunStart > 0 && score > this.bestAtRunStart;
    if (beaten) this.bestGlowed = true;
    const hud = this.gameScreen.hud;
    hud.setScore(score, animate);
    hud.setBest(this.best, beaten);
    hud.setStreak(multiplier(streak), !setHadClear);
  }

  /**
   * Ambient effects (caustics) run unless reduced motion or low power is on, or frames were
   * too slow.
   */
  private ambientOn(): boolean {
    const lowPower = this.settings.lowPower;
    return !this.causticsDegraded && !lowPower && !this.reducedMotion();
  }

  /**
   * 30 fps: redraws for the caustics, and turns them off if frames stay slower than
   * `maxFrameMs` for `slowSeconds` (a one-time `perfFallback`, logged to analytics).
   */
  private ambientTick(): void {
    if (!this.ambientOn() || this.renderer.isPaused) {
      this.slowSince = null;
      return;
    }
    const { maxFrameMs, slowSeconds } = FEEL.caustics;
    const frameMs = this.renderer.stats.lastFrameMs;
    const now = this.now();
    if (frameMs > maxFrameMs) {
      this.slowSince ??= now;
      if (now - this.slowSince >= slowSeconds * 1000) {
        this.causticsDegraded = true;
        this.bus.emit('perfFallback', { feature: 'caustics', frameMs });
      }
    } else {
      this.slowSince = null;
    }
    this.renderer.requestRedraw();
  }

  /** Reduced motion: the setting, or the system preference when the setting is "auto". */
  private reducedMotion(): boolean {
    const setting = this.settings.reducedMotion;
    if (setting !== null) return setting;
    if (this.opts.prefersReducedMotion) return this.opts.prefersReducedMotion();
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /** Haptics and screen shake for a move: the strongest that applies. */
  private feedback(events: readonly GameEvent[]): void {
    const cleared = events.find((e) => e.type === 'cleared');
    const lines = cleared ? cleared.rows.length + cleared.cols.length : 0;
    const clean = events.some((e) => e.type === 'cleanBoard');
    const big = lines >= 3 || clean;
    this.haptics.impact(big ? 'heavy' : lines > 0 ? 'medium' : 'light');
    if (lines >= 3) {
      const { amplitude3, amplitude4, duration } = FEEL.shake;
      this.shake.start(lines >= 4 ? amplitude4 : amplitude3, duration);
    }
  }

  /** Callouts (D6) and the floating "+N" at the centre of the cleared cells. */
  private showScoreFx(events: readonly GameEvent[]): void {
    const cleared = events.find((e) => e.type === 'cleared');
    const layout = this.scene.layout;
    if (!cleared || !layout) return;
    const fx = this.gameScreen.fx;
    fx.showCallouts(cleared.callouts);
    const bonus = events.find((e) => e.type === 'cleanBoard')?.points ?? 0;
    const c = layout.cellSize;
    let x = 0;
    let y = 0;
    for (const cell of cleared.cells) {
      x += ((cell % BOARD_SIZE) + 0.5) * c;
      y += (Math.floor(cell / BOARD_SIZE) + 0.5) * c;
    }
    const n = cleared.cells.length;
    fx.showPoints(cleared.points + bonus, x / n, y / n);
  }

  private dragHost(): DragHost {
    return {
      // Pieces can't be grabbed while the tray deals in (≤ FEEL.deal.maxInputLock).
      slotAt: (x, y) => (this.trayView.dealing ? null : this.trayView.slotAt(x, y)),
      pieceRect: (slot) => this.trayView.pieceRect(slot),
      pieceOf: (slot) => {
        const piece = this.stateValue.tray[slot];
        return piece ? { shape: getShape(piece.shape), color: piece.color } : null;
      },
      geometry: () =>
        this.scene.layout && {
          board: this.scene.layout.board,
          cellSize: this.scene.layout.cellSize,
        },
      canPlace: (slot, row, col) => {
        const piece = this.stateValue.tray[slot];
        return !!piece && canPlace(this.stateValue.board, getShape(piece.shape), row, col);
      },
    };
  }
}
