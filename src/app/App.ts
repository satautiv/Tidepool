/**
 * Composition root (docs/PLAN.md §3.1–3.3). Owns the Endless state, turns drag intents into
 * core moves, and fans the resulting events out to the renderer and the UI.
 */
import { canPlace } from '../core/board';
import {
  newEndless,
  placePiece,
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
import { TIDEPOOL, type Palette } from '../render/palettes';
import { Renderer, type RendererOptions } from '../render/Renderer';
import { SpriteSet, type CanvasFactory } from '../render/sprites';
import { TrayView } from '../render/TrayView';
import { attachViewport, type ViewportEnv } from '../render/viewport';
import { Router } from '../ui/Router';
import { GameScreen } from '../ui/screens/GameScreen';
import { EventBus } from './events';

export interface AppEvents {
  /** Every batch of core events produced by a move or a new run. */
  game: { events: readonly GameEvent[]; state: EndlessState };
  newRun: { state: EndlessState };
  /** Emitted once the Game Over panel is on screen. */
  gameOver: { score: number; best: number; newBest: boolean };
  pause: void;
  menu: void;
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
}

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
  private stateValue: EndlessState;
  private best = 0;
  private bestAtRunStart = 0;
  private readonly seed: () => string;
  private readonly palette: Palette;

  constructor(private readonly opts: AppOptions) {
    this.palette = opts.palette ?? TIDEPOOL;
    this.seed = opts.seed ?? randomSeed;
    this.renderer = new Renderer(opts.canvas, opts.renderer);
    const redraw = () => this.renderer.requestRedraw();

    this.scene = new GameScene(new SpriteSet(this.palette, opts.spriteFactory));
    this.boardView = new BoardView(redraw);
    this.trayView = new TrayView(redraw);
    this.stateValue = newEndless(this.seed()).state;

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
      onPause: () => this.bus.emit('pause', undefined),
      onPlayAgain: () => this.newRun(),
      // Until the main menu exists (T2.12), Menu also starts a new run.
      onMenu: () => {
        this.bus.emit('menu', undefined);
        this.newRun();
      },
    });
  }

  get state(): EndlessState {
    return this.stateValue;
  }

  get bestScore(): number {
    return this.best;
  }

  /** Attaches to the real viewport and pointer events, and shows the game. */
  start(env?: { viewport?: ViewportEnv; blurTarget?: EventTarget }): void {
    attachViewport(this.renderer, this.opts.canvas, env?.viewport);
    bindPointerEvents(this.opts.canvas, this.drag, env?.blurTarget ?? window);
    void this.router.show(this.gameScreen);
    this.showRun(true);
  }

  /** Starts a fresh Endless run. */
  newRun(seed = this.seed()): void {
    this.stateValue = newEndless(seed).state;
    this.gameScreen.gameOver.hide();
    this.drag.setLocked(false);
    this.showRun(true);
    this.bus.emit('newRun', { state: this.stateValue });
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
    this.bus.emit('game', { events: step.events, state: step.state });
    if (step.state.over) void this.showGameOver();
    return undefined;
  }

  /** Locks input, lets clears finish, fades the board, then shows the Game Over panel. */
  private async showGameOver(): Promise<void> {
    this.drag.setLocked(true);
    const run = this.stateValue;
    await this.boardView.whenIdle();
    await new Promise<void>((resolve) => this.boardView.fadeOut(resolve));
    if (this.stateValue !== run) return; // a new run started meanwhile
    const info = {
      score: run.score,
      best: this.best,
      newBest: run.score > this.bestAtRunStart,
    };
    this.gameScreen.gameOver.show(info);
    this.bus.emit('gameOver', info);
  }

  private showRun(animateTray: boolean): void {
    this.bestAtRunStart = this.best;
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
