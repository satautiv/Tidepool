/**
 * Draws the piece being dragged (docs/PLAN.md §8, §11). On pick-up it grows from its tray size
 * and position to full board size over `liftDuration`, following the pointer.
 */
import type { DragState } from '../input/DragController';
import type { SceneContext, SceneView } from './GameScene';

export const DRAG_FEEL = {
  liftDuration: 0.09,
} as const;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export class DragView implements SceneView {
  private lift = 1;
  private current: DragState | null = null;

  /** `source` returns the live drag state (the DragController's `state`). */
  constructor(private readonly source: () => DragState | null) {}

  update(dt: number): void {
    const drag = this.source();
    if (drag && (drag.pointerId !== this.current?.pointerId || drag.slot !== this.current.slot)) {
      this.lift = 0;
    }
    this.current = drag;
    if (drag && this.lift < 1) this.lift = Math.min(1, this.lift + dt / DRAG_FEEL.liftDuration);
  }

  isAnimating(): boolean {
    return this.source() !== null && this.lift < 1;
  }

  /** The rect the piece is drawn at, interpolating from its tray rect while lifting. */
  pieceBox(drag: DragState, cellSize: number) {
    const t = easeOutCubic(this.lift);
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
    const drag = this.source();
    if (!drag) return;
    const box = this.pieceBox(drag, layout.cellSize);
    const sprite = sprites.block(drag.color);
    for (const [r, c] of drag.shape.cells) {
      ctx.drawImage(sprite, box.x + c * box.cell, box.y + r * box.cell, box.cell, box.cell);
    }
  }
}
