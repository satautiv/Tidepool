/** Draws the board panel, its wells and the placed glass blocks (docs/PLAN.md §7.1). */
import { emptyBoard, type Board } from '../core/board';
import { BOARD_SIZE } from '../core/config';
import type { SceneContext, SceneView } from './GameScene';
import { CELL_STYLE } from './sprites';

export class BoardView implements SceneView {
  private board: Board = emptyBoard();

  constructor(private readonly invalidate: () => void = () => {}) {}

  setBoard(board: Board): void {
    if (board === this.board) return;
    this.board = board;
    this.invalidate();
  }

  draw(ctx: CanvasRenderingContext2D, { layout, sprites }: SceneContext): void {
    const { board: rect, cellSize: c } = layout;
    const m = c * CELL_STYLE.shadowMargin;
    const baseSize = c * (BOARD_SIZE + 2 * CELL_STYLE.shadowMargin);
    ctx.drawImage(sprites.boardBase, rect.x - m, rect.y - m, baseSize, baseSize);

    this.board.cells.forEach((cell, i) => {
      if (cell.color === null) return;
      const x = rect.x + (i % BOARD_SIZE) * c;
      const y = rect.y + Math.floor(i / BOARD_SIZE) * c;
      ctx.drawImage(sprites.block(cell.color), x, y, c, c);
    });
  }
}
