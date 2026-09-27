/**
 * Draws the board panel, its wells and the placed glass blocks (docs/PLAN.md §7.1), and plays
 * the basic placement and clear animations (§11). Logic never waits for these: cleared cells
 * are already gone from the game state and are drawn here only while they dissolve.
 */
import { emptyBoard, type Board } from '../core/board';
import { BOARD_SIZE } from '../core/config';
import type { GameEvent } from '../core/game';
import { getShape } from '../core/shapes';
import { FEEL } from './feel';
import type { SceneContext, SceneView } from './GameScene';
import type { Layout } from './layout';
import { CELL_STYLE, PANEL_RADIUS, roundRectPath } from './sprites';
import { Ease, Tweener, type TweenStep } from './tween';

interface CellFx {
  scale: number;
  /** Offset (CSS px) from the cell while snapping in from where the piece was dropped. */
  dx: number;
  dy: number;
}

/** Where a dropped piece's top-left was drawn when it was released (CSS px). */
export interface DropOrigin {
  x: number;
  y: number;
}

interface Dissolving {
  index: number;
  color: number;
  alpha: number;
  offsetY: number;
  scale: number;
  /** 0..1 extra brightness, drawn additively. */
  glow: number;
}

export class BoardView implements SceneView {
  private board: Board = emptyBoard();
  private readonly tweener = new Tweener();
  private readonly placing = new Map<number, CellFx>();
  private dissolving: Dissolving[] = [];
  /** Game over: per-cell opacity, and how desaturated the board is (0..1). */
  private readonly cellFade = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => ({ alpha: 1 }));
  private readonly fade = { desaturate: 0 };
  private idleWaiters: Array<() => void> = [];
  private layout: Layout | null = null;
  /** Reduced motion: staggered cell animations become one short fade (T2.15). */
  reducedMotion = false;

  constructor(
    private readonly invalidate: () => void = () => {},
    private readonly random: () => number = Math.random,
  ) {}

  onLayout({ layout }: SceneContext): void {
    this.layout = layout;
  }

  /** Shows a board without animation (new game, resume) and drops running effects. */
  setBoard(board: Board): void {
    if (board === this.board && this.tweener.active === 0) return;
    this.tweener.cancelAll();
    this.placing.clear();
    this.dissolving = [];
    this.resetFade();
    this.board = board;
    this.flushIdle();
    this.invalidate();
  }

  /** Resolves once no cleared cells are dissolving (immediately if none are). */
  whenIdle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /**
   * Game over: the blocks fade towards the sand one by one in random order while the board
   * desaturates slightly, then `done` is called.
   */
  fadeOut(done: () => void = () => {}): void {
    const { fadeTo, desaturate } = FEEL.gameOver;
    // Reduced motion: every cell at once, over the short fade.
    const quick = FEEL.reducedMotion.fadeDuration;
    const fadeDuration = this.reducedMotion ? quick : FEEL.gameOver.fadeDuration;
    const cellFadeDuration = this.reducedMotion ? quick : FEEL.gameOver.cellFadeDuration;
    const filled: number[] = [];
    this.board.cells.forEach((cell, i) => cell.color !== null && filled.push(i));
    // Fisher–Yates: a random order for the cells.
    for (let i = filled.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [filled[i], filled[j]] = [filled[j]!, filled[i]!];
    }
    const spread = Math.max(0, fadeDuration - cellFadeDuration);
    const steps = filled.map((index, k) => () => {
      const delay = filled.length > 1 ? (k / (filled.length - 1)) * spread : 0;
      return this.tweener.to(
        this.cellFade[index]!,
        { alpha: fadeTo },
        { duration: cellFadeDuration, delay, ease: Ease.quadOut },
      );
    });
    this.tweener
      .parallel(...steps, () =>
        this.tweener.to(
          this.fade,
          { desaturate },
          { duration: fadeDuration, ease: Ease.sineInOut },
        ),
      )
      .whenDone(done);
    this.invalidate();
  }

  /** Second chance: brings the faded blocks and their colour back. */
  fadeIn(): void {
    const duration = FEEL.gameOver.cellFadeDuration;
    for (const cell of this.cellFade) {
      if (cell.alpha < 1) this.tweener.to(cell, { alpha: 1 }, { duration, ease: Ease.quadOut });
    }
    this.tweener.to(this.fade, { desaturate: 0 }, { duration, ease: Ease.quadOut });
    this.invalidate();
  }

  private resetFade(): void {
    for (const cell of this.cellFade) cell.alpha = 1;
    this.fade.desaturate = 0;
  }

  private flushIdle(): void {
    if (this.busy) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /**
   * Shows the result of a move, animating the placement and any clears from its events. With
   * a `from` (a drag drop), the placed cells first snap in from where the piece was released,
   * then each squashes briefly.
   */
  applyMove(before: Board, events: readonly GameEvent[], after: Board, from?: DropOrigin): void {
    this.board = after;
    const placed = events.find((e) => e.type === 'placed');
    const cleared = events.find((e) => e.type === 'cleared');
    if (!placed) return this.invalidate();

    const shape = getShape(placed.shape);
    const layout = this.layout;
    const dx0 = from && layout ? from.x - (layout.board.x + placed.col * layout.cellSize) : 0;
    const dy0 = from && layout ? from.y - (layout.board.y + placed.row * layout.cellSize) : 0;
    const { snapDuration, squashScale, squashDuration } = FEEL.drop;
    const half = squashDuration / 2;
    for (const [r, c] of shape.cells) {
      const i = (placed.row + r) * BOARD_SIZE + placed.col + c;
      if (after.cells[i]!.color === null) continue; // cleared straight away
      const fx: CellFx = { scale: 1, dx: dx0, dy: dy0 };
      this.placing.set(i, fx);
      // Reduced motion keeps the snap (it follows the finger) but drops the squash.
      const steps: TweenStep[] = this.reducedMotion
        ? []
        : [
            () =>
              this.tweener.to(fx, { scale: squashScale }, { duration: half, ease: Ease.quadOut }),
            () => this.tweener.to(fx, { scale: 1 }, { duration: half, ease: Ease.quadIn }),
          ];
      if (from) {
        steps.unshift(() =>
          this.tweener.to(fx, { dx: 0, dy: 0 }, { duration: snapDuration, ease: Ease.quadOut }),
        );
      }
      this.tweener.sequence(...steps).whenDone(() => {
        if (this.placing.get(i) === fx) this.placing.delete(i);
      });
    }

    if (cleared) {
      const originRow = placed.row + (shape.height - 1) / 2;
      const originCol = placed.col + (shape.width - 1) / 2;
      for (const index of cleared.cells) {
        const color = before.cells[index]!.color ?? placed.color;
        const cell: Dissolving = { index, color, alpha: 1, offsetY: 0, scale: 1, glow: 0 };
        this.dissolving.push(cell);
        const dist = Math.hypot(
          Math.floor(index / BOARD_SIZE) - originRow,
          (index % BOARD_SIZE) - originCol,
        );
        const fx = FEEL.lineClear;
        const done = () => {
          this.dissolving = this.dissolving.filter((d) => d !== cell);
          this.flushIdle();
        };
        if (this.reducedMotion) {
          // All at once, just fading: no ripple, lift or shrink.
          this.tweener.to(
            cell,
            { alpha: 0 },
            { duration: FEEL.reducedMotion.fadeDuration, ease: Ease.quadOut, onComplete: done },
          );
          continue;
        }
        const delay = dist * fx.stagger;
        // Lift and brighten, then fade and shrink away.
        this.tweener.to(
          cell,
          { offsetY: -fx.lift, glow: 1 },
          { duration: fx.liftDuration, delay, ease: Ease.quadOut },
        );
        this.tweener.to(
          cell,
          { alpha: 0, scale: fx.scaleTo, glow: 0 },
          {
            duration: fx.duration,
            delay: delay + fx.liftDuration,
            ease: Ease.quadIn,
            onComplete: done,
          },
        );
      }
    }
    this.invalidate();
  }

  /** True while cleared cells are still dissolving (the Game Over screen waits for this). */
  get busy(): boolean {
    return this.dissolving.length > 0;
  }

  update(dt: number): void {
    this.tweener.update(dt);
  }

  isAnimating(): boolean {
    return this.tweener.active > 0;
  }

  draw(ctx: CanvasRenderingContext2D, { layout, sprites }: SceneContext): void {
    const { board: rect, cellSize: c } = layout;
    const m = c * CELL_STYLE.shadowMargin;
    const baseSize = c * (BOARD_SIZE + 2 * CELL_STYLE.shadowMargin);
    ctx.drawImage(sprites.boardBase, rect.x - m, rect.y - m, baseSize, baseSize);

    const blit = (index: number, color: number, scale: number, dy = 0, dx = 0) => {
      const size = c * scale;
      const x = rect.x + (index % BOARD_SIZE) * c + (c - size) / 2 + dx;
      const y = rect.y + Math.floor(index / BOARD_SIZE) * c + (c - size) / 2 + dy;
      ctx.drawImage(sprites.block(color), x, y, size, size);
    };

    ctx.save();
    this.board.cells.forEach((cell, i) => {
      if (cell.color === null) return;
      const fx = this.placing.get(i);
      ctx.globalAlpha = this.cellFade[i]!.alpha;
      blit(i, cell.color, fx?.scale ?? 1, fx?.dy ?? 0, fx?.dx ?? 0);
    });
    ctx.restore();

    if (this.fade.desaturate > 0) {
      // Game over: wash the colour out of the whole board panel.
      const pad = c * CELL_STYLE.panelPad;
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = this.fade.desaturate;
      ctx.fillStyle = '#808080';
      // The panel's own rounded shape, so the page around its corners stays untouched.
      roundRectPath(
        ctx,
        rect.x - pad,
        rect.y - pad,
        rect.width + 2 * pad,
        rect.height + 2 * pad,
        c * PANEL_RADIUS,
      );
      ctx.fill();
      ctx.restore();
    }

    if (this.dissolving.length > 0) {
      ctx.save();
      for (const d of this.dissolving) {
        ctx.globalAlpha = d.alpha;
        blit(d.index, d.color, d.scale, d.offsetY);
      }
      // The brief brighten: the same glass again, added on top.
      ctx.globalCompositeOperation = 'lighter';
      for (const d of this.dissolving) {
        const glow = d.alpha * d.glow * FEEL.lineClear.glow;
        if (glow <= 0) continue;
        ctx.globalAlpha = glow;
        blit(d.index, d.color, d.scale, d.offsetY);
      }
      ctx.restore();
    }
  }
}
