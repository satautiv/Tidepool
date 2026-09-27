/**
 * Ghost preview and would-clear highlight (README §3.2, §12, docs/PLAN.md §8, §11).
 * While a dragged piece has a valid target, shows where it will land and gently pulses the
 * cells of every line it would complete.
 */
import { lineCells, previewClears, type Board } from '../core/board';
import { BOARD_SIZE } from '../core/config';
import type { DragState } from '../input/DragController';
import { FEEL } from './feel';
import type { SceneContext, SceneView } from './GameScene';

interface Preview {
  key: string;
  ghostCells: number[];
  clearCells: number[];
}

export class GhostView implements SceneView {
  private preview: Preview | null = null;
  private previewBoard: Board | null = null;
  private clock = 0;

  constructor(
    private readonly drag: () => DragState | null,
    private readonly board: () => Board,
  ) {}

  /** Recomputes the preview only when the target cell (or board) changes. */
  current(): Preview | null {
    const d = this.drag();
    if (!d?.target) return (this.preview = null);
    const board = this.board();
    const key = `${d.slot}:${d.shape.id}:${d.target.row}:${d.target.col}`;
    if (this.preview?.key === key && this.previewBoard === board) return this.preview;

    const { row, col } = d.target;
    const ghostCells = d.shape.cells.map(([r, c]) => (row + r) * BOARD_SIZE + col + c);
    const clearCells = lineCells(previewClears(board, d.shape, row, col));
    this.previewBoard = board;
    return (this.preview = { key, ghostCells, clearCells });
  }

  update(dt: number): void {
    this.clock = (this.clock + dt) % FEEL.ghost.pulsePeriod;
  }

  /** Keeps frames coming while the would-clear highlight pulses. */
  isAnimating(): boolean {
    return (this.current()?.clearCells.length ?? 0) > 0;
  }

  pulseAlpha(): number {
    const { pulseMin, pulseMax, pulsePeriod } = FEEL.ghost;
    const wave = (1 - Math.cos((this.clock / pulsePeriod) * Math.PI * 2)) / 2;
    return pulseMin + (pulseMax - pulseMin) * wave;
  }

  draw(ctx: CanvasRenderingContext2D, { layout, sprites }: SceneContext): void {
    const p = this.current();
    const d = this.drag();
    if (!p || !d) return;
    const { board: rect, cellSize: c } = layout;
    const at = (i: number): [number, number] => [
      rect.x + (i % BOARD_SIZE) * c,
      rect.y + Math.floor(i / BOARD_SIZE) * c,
    ];

    ctx.save();
    ctx.globalAlpha = FEEL.ghost.fillAlpha;
    const block = sprites.block(d.color);
    for (const i of p.ghostCells) ctx.drawImage(block, ...at(i), c, c);
    ctx.globalAlpha = 1;
    for (const i of p.ghostCells) ctx.drawImage(sprites.ghostOutline, ...at(i), c, c);

    if (p.clearCells.length > 0) {
      ctx.globalAlpha = this.pulseAlpha();
      for (const i of p.clearCells) ctx.drawImage(sprites.clearHighlight, ...at(i), c, c);
    }
    ctx.restore();
  }
}
