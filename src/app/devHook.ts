/**
 * Dev-only handle for debugging and browser tests: `window.__tidepool` (docs/PLAN.md §17).
 * main.ts imports this module only under `import.meta.env.DEV`, so production builds don't
 * contain it (CI checks `dist/`).
 */
import { boardFromAscii, boardToAscii } from '../core/board';
import { isGameOver } from '../core/game';
import { slotShape } from '../core/generator';
import type { ShapeId } from '../core/shapes';
import { DRAG } from '../input/DragController';
import type { App } from './App';

export interface Point {
  x: number;
  y: number;
}

/** Only isolated cells free: a dot fits (without completing a line), nothing bigger does. */
export const NEAR_GAME_OVER = [
  '#.#.#.#.',
  '.#.#.#.#',
  '#.#.#.#.',
  '.#.#.#.#',
  '#.#.#.#.',
  '.#.#.#.#',
  '#.#.#.#.',
  '.#.#.#.#',
];

export interface TestHook {
  app: App;
  getState(): {
    score: number;
    over: boolean;
    placed: number;
    secondChanceUsed: boolean;
    tray: (ShapeId | null)[];
    board: string[];
  };
  /** Starts a new run with this seed. */
  setSeed(seed: string): void;
  /** Replaces the board (ASCII rows, `#` = filled) and, optionally, the tray. */
  setBoard(rows: string[], tray?: (ShapeId | null)[]): void;
  /** Sets up NEAR_GAME_OVER with a dot, a 2×2 and a domino, then places the dot. */
  forceGameOver(): void;
  /** Centre of a tray slot's piece, in page CSS px. */
  slotCenter(slot: number): Point | null;
  /** Centre of a board cell, in page CSS px. */
  cellCenter(row: number, col: number): Point | null;
  /** Where to release a piece grabbed at `slotCenter` so it lands with its top-left at (row, col). */
  dropPoint(slot: number, row: number, col: number, kind?: 'mouse' | 'touch'): Point | null;
}

export function createTestHook(app: App, canvas: HTMLCanvasElement): TestHook {
  const offset = () => canvas.getBoundingClientRect();
  const geometry = () => app.scene.layout;

  const hook: TestHook = {
    app,
    getState() {
      const s = app.state;
      return {
        score: s.score,
        over: s.over,
        placed: s.stats.placed,
        secondChanceUsed: s.secondChanceUsed,
        tray: s.tray.map((t) => t?.shape ?? null),
        board: boardToAscii(s.board),
      };
    },
    setSeed(seed) {
      app.newRun(seed);
    },
    setBoard(rows, tray) {
      const board = boardFromAscii(rows);
      const slots = tray
        ? tray.map((shape, i) => (shape ? { shape, color: i } : null))
        : app.state.tray;
      app.loadState({ ...app.state, board, tray: slots, over: isGameOver(board, slots) });
    },
    forceGameOver() {
      hook.setBoard(NEAR_GAME_OVER, ['dot', 'sq2', 'i2h']);
      app.place({ slot: 0, row: 0, col: 1 });
    },
    slotCenter(slot) {
      const r = app.slotPieceRect(slot);
      if (!r) return null;
      const o = offset();
      return { x: o.left + r.x + r.width / 2, y: o.top + r.y + r.height / 2 };
    },
    cellCenter(row, col) {
      const g = geometry();
      if (!g) return null;
      const o = offset();
      return {
        x: o.left + g.board.x + (col + 0.5) * g.cellSize,
        y: o.top + g.board.y + (row + 0.5) * g.cellSize,
      };
    },
    dropPoint(slot, row, col, kind = 'mouse') {
      const g = geometry();
      const piece = app.state.tray[slot];
      if (!g || !piece) return null;
      const shape = slotShape(piece);
      const c = g.cellSize;
      const o = offset();
      const x = o.left + g.board.x + col * c + (shape.width * c) / 2;
      const top = o.top + g.board.y + row * c;
      // Mirrors DragController.positioned: mouse keeps the grab point (the centre), touch
      // floats the piece above the finger.
      const y =
        kind === 'touch'
          ? top + shape.height * c + DRAG.touchLiftCells * c
          : top + (shape.height * c) / 2;
      return { x, y };
    },
  };
  return hook;
}
