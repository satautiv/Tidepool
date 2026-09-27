/**
 * Draws the piece being dragged (docs/PLAN.md §8, §11). On pick-up it grows from its tray size
 * and position to full board size over `liftDuration`, following the pointer.
 */
import type { Shape } from '../core/shapes';
import type { Box, DragState } from '../input/DragController';
import { FEEL } from './feel';
import type { SceneContext, SceneView } from './GameScene';
import { Ease, Tweener } from './tween';

interface Returning {
  shape: Shape;
  color: number;
  x: number;
  y: number;
  width: number;
}

export class DragView implements SceneView {
  private lift = 1;
  private current: DragState | null = null;
  private cellSize = 0;
  private returning: Returning | null = null;
  private readonly tweener = new Tweener();

  /** `source` returns the live drag state (the DragController's `state`). */
  constructor(private readonly source: () => DragState | null) {}

  onLayout({ layout }: SceneContext): void {
    this.cellSize = layout.cellSize;
  }

  /**
   * Animates a cancelled drag's piece from where it was to its tray rect, then calls `done`
   * (typically: un-dim the tray slot). Without a layout it finishes immediately.
   */
  returnToTray(drag: DragState, to: Box | null, done: () => void): void {
    this.tweener.cancelAll();
    if (!to || this.cellSize <= 0) {
      this.returning = null;
      done();
      return;
    }
    const box = this.pieceBox(drag, this.cellSize);
    const piece: Returning = {
      shape: drag.shape,
      color: drag.color,
      x: box.x,
      y: box.y,
      width: box.width,
    };
    this.returning = piece;
    this.tweener.to(
      piece,
      { x: to.x, y: to.y, width: to.width },
      {
        duration: FEEL.invalidDrop.returnDuration,
        ease: Ease.backOut,
        onComplete: () => {
          if (this.returning === piece) this.returning = null;
          done();
        },
      },
    );
  }

  update(dt: number): void {
    this.tweener.update(dt);
    const drag = this.source();
    if (drag && (drag.pointerId !== this.current?.pointerId || drag.slot !== this.current.slot)) {
      this.lift = 0;
    }
    this.current = drag;
    if (drag && this.lift < 1) this.lift = Math.min(1, this.lift + dt / FEEL.pickUp.liftDuration);
  }

  isAnimating(): boolean {
    return (this.source() !== null && this.lift < 1) || this.tweener.active > 0;
  }

  /** The rect the piece is drawn at, interpolating from its tray rect while lifting. */
  pieceBox(drag: DragState, cellSize: number) {
    const t = Ease.cubicOut(this.lift);
    const fullW = drag.shape.width * cellSize;
    const fullH = drag.shape.height * cellSize;
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const width = lerp(drag.from.width, fullW);
    return {
      x: lerp(drag.from.x, drag.x),
      y: lerp(drag.from.y, drag.y),
      cell: width / drag.shape.width,
      width,
      height: lerp(drag.from.height, fullH),
    };
  }

  draw(ctx: CanvasRenderingContext2D, { layout, sprites }: SceneContext): void {
    const back = this.returning;
    if (back) {
      const cell = back.width / back.shape.width;
      const sprite = sprites.block(back.color);
      for (const [r, c] of back.shape.cells) {
        ctx.drawImage(sprite, back.x + c * cell, back.y + r * cell, cell, cell);
      }
    }

    const drag = this.source();
    if (!drag) return;
    const box = this.pieceBox(drag, layout.cellSize);

    // A soft shadow under the lifted piece, growing in as it lifts.
    const lift = Ease.cubicOut(this.lift);
    const { shadowOffset, shadowAlpha } = FEEL.pickUp;
    if (shadowAlpha > 0 && lift > 0) {
      const off = shadowOffset * box.cell * lift;
      ctx.save();
      ctx.globalAlpha = shadowAlpha * lift;
      for (const [r, c] of drag.shape.cells) {
        const x = box.x + c * box.cell + off / 2;
        const y = box.y + r * box.cell + off;
        ctx.drawImage(sprites.blockShadow, x, y, box.cell, box.cell);
      }
      ctx.restore();
    }

    const sprite = sprites.block(drag.color);
    for (const [r, c] of drag.shape.cells) {
      ctx.drawImage(sprite, box.x + c * box.cell, box.y + r * box.cell, box.cell, box.cell);
    }
  }
}
