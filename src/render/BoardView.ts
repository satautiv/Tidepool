/**
 * Draws the board panel, its wells and the placed glass blocks (docs/PLAN.md §7.1), and plays
 * the basic placement and clear animations (§11). Logic never waits for these: cleared cells
 * are already gone from the game state and are drawn here only while they dissolve.
 */
import { emptyBoard, type Board } from '../core/board';
import { BOARD_SIZE } from '../core/config';
import type { GameEvent } from '../core/game';
import { getShape } from '../core/shapes';
import type { SceneContext, SceneView } from './GameScene';
import { CELL_STYLE } from './sprites';
import { Ease, Tweener } from './tween';

export const BOARD_FEEL = {
  /** Placed cells pop in from this scale with a slight overshoot. */
  placeFrom: 0.86,
  placeDuration: 0.16,
  clearDuration: 0.26,
  /** Delay per cell of distance from the placed piece, so clears ripple outward. */
  clearStagger: 0.022,
  /** How far (CSS px) dissolving cells lift, and the scale they shrink to. */
  clearLift: 6,
  clearScaleTo: 0.8,
  /** Game over: blocks fade towards the sand to this opacity over this long (s). */
  fadeTo: 0.25,
  fadeDuration: 0.5,
} as const;

interface CellFx {
  scale: number;
}

interface Dissolving {
  index: number;
  color: number;
  alpha: number;
  offsetY: number;
  scale: number;
}

export class BoardView implements SceneView {
  private board: Board = emptyBoard();
  private readonly tweener = new Tweener();
  private readonly placing = new Map<number, CellFx>();
  private dissolving: Dissolving[] = [];
  private readonly fade = { alpha: 1 };
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly invalidate: () => void = () => {}) {}

  /** Shows a board without animation (new game, resume) and drops running effects. */
  setBoard(board: Board): void {
    if (board === this.board && this.tweener.active === 0) return;
    this.tweener.cancelAll();
    this.placing.clear();
    this.dissolving = [];
    this.fade.alpha = 1;
    this.board = board;
    this.flushIdle();
    this.invalidate();
  }

  /** Resolves once no cleared cells are dissolving (immediately if none are). */
  whenIdle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Game over: fades the blocks towards the sand, then calls `done`. */
  fadeOut(done: () => void = () => {}): void {
    this.tweener.to(
      this.fade,
      { alpha: BOARD_FEEL.fadeTo },
      { duration: BOARD_FEEL.fadeDuration, ease: Ease.quadOut, onComplete: done },
    );
    this.invalidate();
  }

  /** Second chance: brings the faded blocks back. */
  fadeIn(): void {
    this.tweener.to(
      this.fade,
      { alpha: 1 },
      { duration: BOARD_FEEL.fadeDuration, ease: Ease.quadOut },
    );
    this.invalidate();
  }

  private flushIdle(): void {
    if (this.busy) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Shows the result of a move, animating the placement and any clears from its events. */
  applyMove(before: Board, events: readonly GameEvent[], after: Board): void {
    this.board = after;
    const placed = events.find((e) => e.type === 'placed');
    const cleared = events.find((e) => e.type === 'cleared');
    if (!placed) return this.invalidate();

    const shape = getShape(placed.shape);
    for (const [r, c] of shape.cells) {
      const i = (placed.row + r) * BOARD_SIZE + placed.col + c;
      if (after.cells[i]!.color === null) continue; // cleared straight away
      const fx: CellFx = { scale: BOARD_FEEL.placeFrom };
      this.placing.set(i, fx);
      this.tweener.to(
        fx,
        { scale: 1 },
        {
          duration: BOARD_FEEL.placeDuration,
          ease: Ease.backOut,
          onComplete: () => {
            if (this.placing.get(i) === fx) this.placing.delete(i);
          },
        },
      );
    }

    if (cleared) {
      const originRow = placed.row + (shape.height - 1) / 2;
      const originCol = placed.col + (shape.width - 1) / 2;
      for (const index of cleared.cells) {
        const color = before.cells[index]!.color ?? placed.color;
        const cell: Dissolving = { index, color, alpha: 1, offsetY: 0, scale: 1 };
        this.dissolving.push(cell);
        const dist = Math.hypot(
          Math.floor(index / BOARD_SIZE) - originRow,
          (index % BOARD_SIZE) - originCol,
        );
        this.tweener.to(
          cell,
          { alpha: 0, offsetY: -BOARD_FEEL.clearLift, scale: BOARD_FEEL.clearScaleTo },
          {
            duration: BOARD_FEEL.clearDuration,
            delay: dist * BOARD_FEEL.clearStagger,
            ease: Ease.quadOut,
            onComplete: () => {
              this.dissolving = this.dissolving.filter((d) => d !== cell);
              this.flushIdle();
            },
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

    const blit = (index: number, color: number, scale: number, dy = 0) => {
      const size = c * scale;
      const x = rect.x + (index % BOARD_SIZE) * c + (c - size) / 2;
      const y = rect.y + Math.floor(index / BOARD_SIZE) * c + (c - size) / 2 + dy;
      ctx.drawImage(sprites.block(color), x, y, size, size);
    };

    ctx.save();
    ctx.globalAlpha = this.fade.alpha;
    this.board.cells.forEach((cell, i) => {
      if (cell.color !== null) blit(i, cell.color, this.placing.get(i)?.scale ?? 1);
    });
    ctx.restore();

    if (this.dissolving.length > 0) {
      ctx.save();
      for (const d of this.dissolving) {
        ctx.globalAlpha = d.alpha;
        blit(d.index, d.color, d.scale, d.offsetY);
      }
      ctx.restore();
    }
  }
}
