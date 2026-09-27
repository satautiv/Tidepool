/**
 * Composition root (docs/PLAN.md §3.1–3.3). Owns the Endless state, turns drag intents into
 * core moves, and fans the resulting events out to the renderer and the UI.
 */
import { canPlace } from '../core/board';
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
import { BoardView } from '../render/BoardView';
import { DebugOverlay } from '../render/DebugOverlay';
import { DragView } from '../render/DragView';
import { GameScene } from '../render/GameScene';
import { GhostView } from '../render/GhostView';
import { ParticleView } from '../render/particles';
import { TIDEPOOL, type Palette } from '../render/palettes';
import { Renderer, type RendererOptions } from '../render/Renderer';
import { SpriteSet, type CanvasFactory } from '../render/sprites';
import { TrayView } from '../render/TrayView';
import { attachViewport, type ViewportEnv } from '../render/viewport';
import { Router } from '../ui/Router';
import type { AdManager } from '../services/ads/AdManager';
import { Lifecycle, type LifecycleEnv } from '../services/platform/lifecycle';
import type { SaveStore } from '../services/storage/SaveStore';
import { GameScreen } from '../ui/screens/GameScreen';
import { EventBus } from './events';

export interface AppEvents {
  /** Every batch of core events produced by a move or a new run. */
  game: { events: readonly GameEvent[]; state: EndlessState };
  newRun: { state: EndlessState };
  /** A run is on screen: a fresh one (with its seed) or one resumed from the save. */
  runStart: { state: EndlessState; seed: string | null; resumed: boolean };
  /** A run was closed out (replaced by the next one, or found finished on boot). */
  runEnd: { state: EndlessState; durationMs: number };
  /** Emitted once the Game Over panel is on screen. */
  gameOver: { score: number; best: number; newBest: boolean };
  pause: void;
  resume: void;
  menu: void;
  /** Settings from the pause dialog (placeholder until T2.13). */
  settings: void;
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
  private readonly boardView: BoardView;
  private readonly trayView: TrayView;
  private readonly dragView: DragView;
  /** Bubbles, sparkles and droplets for effects (T2.03). */
  readonly particles = new ParticleView();
  private stateValue: EndlessState;
  private best = 0;
  private bestAtRunStart = 0;
  private readonly seed: () => string;
  private readonly palette: Palette;
  /** A break ad is running between Game Over and the next run. */
  private leaving = false;
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
    this.palette = opts.palette ?? TIDEPOOL;
    this.seed = opts.seed ?? randomSeed;
    this.now = opts.now ?? Date.now;
    this.renderer = new Renderer(opts.canvas, opts.renderer);
    const redraw = () => this.renderer.requestRedraw();

    this.scene = new GameScene(new SpriteSet(this.palette, opts.spriteFactory));
    this.boardView = new BoardView(redraw);
    this.trayView = new TrayView(redraw);
    this.best = opts.save?.current.stats.bestScore ?? 0;
    this.stateValue = this.restoreRun() ?? this.freshRun(this.seed());

    this.drag = new DragController(this.dragHost(), {
      onStart: (d) => this.trayView.setDragging(d.slot),
      onMove: redraw,
      onPlace: (intent) => this.place(intent),
      onCancel: (d) =>
        this.dragView.returnToTray(d, this.trayView.pieceRect(d.slot), () =>
          this.trayView.setDragging(null),
        ),
    });
    this.dragView = new DragView(() => this.drag.state);

    this.scene.add(this.boardView);
    this.scene.add(
      new GhostView(
        () => this.drag.state,
        () => this.stateValue.board,
      ),
    );
    this.scene.add(this.particles);
    this.scene.add(this.trayView);
    this.scene.add(this.dragView);
    this.scene.add({
      onLayout: ({ layout }) => this.gameScreen.hud.setRect(layout.hud),
      draw() {},
    });
    this.renderer.addView(this.scene);
    if (opts.debug) this.renderer.addView(new DebugOverlay(this.renderer.stats));

    this.router = new Router(opts.uiRoot);
    this.gameScreen = new GameScreen({
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      // Restarting abandons the run on purpose, so no break ad here.
      onRestart: () => this.newRun(),
      onSettings: () => this.bus.emit('settings', undefined),
      onPlayAgain: () => this.leaveRun(() => this.newRun()),
      // Until the main menu exists (T2.12), Menu also starts a new run.
      onMenu: () =>
        this.leaveRun(() => {
          this.bus.emit('menu', undefined);
          this.newRun();
        }),
      onSecondChance: () => void this.useSecondChance(),
    });

    if (opts.ads) {
      // The game sits still under an ad: no frames, no input.
      opts.ads.onAdStart = () => {
        this.adShowing = true;
        this.renderer.pause();
        this.syncInput();
      };
      opts.ads.onAdEnd = () => {
        this.adShowing = false;
        if (!this.lifecycle?.hidden) this.renderer.resume();
        this.syncInput();
      };
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Pauses a run in play: input off, clocks stopped, Pause dialog up. */
  pause(): void {
    if (this.paused || this.stateValue.over || this.adShowing) return;
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
    // Backgrounded: pause the run (it never auto-resumes), stop frames, save now.
    this.lifecycle.onHide(() => {
      this.pause();
      this.renderer.pause();
      this.opts.ads?.onHidden();
      this.persistRun();
      void this.opts.save?.flush();
    });
    this.lifecycle.onShow(() => {
      if (!this.adShowing) this.renderer.resume();
      this.opts.ads?.onVisible();
    });

    void this.router.show(this.gameScreen);
    const resumed = this.stateValue.stats.placed > 0;
    if (this.finishedOnBoot) {
      const { run, durationMs } = this.finishedOnBoot;
      this.finishedOnBoot = null;
      this.bus.emit('runEnd', { state: run, durationMs });
    }
    this.showRun(!resumed, resumed);
    if (!resumed) this.persistRun();
    this.opts.ads?.runStarted();
    this.bus.emit('runStart', { state: this.stateValue, seed: this.runSeed, resumed });
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
    this.opts.ads?.runStarted();
    this.bus.emit('newRun', { state: this.stateValue });
    this.bus.emit('runStart', { state: this.stateValue, seed, resumed: false });
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

  /** Applies a drop. Invalid intents (stale drags) are ignored and reported. */
  place({ slot, row, col }: PlaceIntent): { error: PlaceError } | undefined {
    this.trayView.setDragging(null);
    const step = placePiece(this.stateValue, slot, row, col);
    if ('error' in step) return step;

    const before = this.stateValue.board;
    this.stateValue = step.state;
    this.boardView.applyMove(before, step.events, step.state.board);
    this.trayView.setTray(
      step.state.tray,
      step.events.some((e) => e.type === 'dealt'),
    );
    this.updateHud();
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
    this.drag.setLocked(this.paused || this.adShowing || this.stateValue.over);
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
    this.boardView.setBoard(this.stateValue.board);
    this.trayView.setTray(this.stateValue.tray, animateTray);
    this.updateHud();
  }

  private updateHud(): void {
    const { score, streak } = this.stateValue;
    this.best = Math.max(this.best, score);
    const hud = this.gameScreen.hud;
    hud.setScore(score);
    hud.setBest(this.best);
    hud.setStreak(multiplier(streak));
  }

  private dragHost(): DragHost {
    return {
      slotAt: (x, y) => this.trayView.slotAt(x, y),
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
