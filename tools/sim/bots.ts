/**
 * Headless bots for the simulator (docs/PLAN.md §6.5). A bot picks a move for an Endless state.
 * The greedy bot evaluates every (slot, position) on a fast occupancy-array copy of the board.
 */
import { allFits } from '../../src/core/board';
import { BOARD_SIZE } from '../../src/core/config';
import type { EndlessState } from '../../src/core/game';
import { slotShape } from '../../src/core/generator';
import type { RngCursor } from '../../src/core/rng';
import type { Shape } from '../../src/core/shapes';

export interface Move {
  slot: number;
  row: number;
  col: number;
}

export interface Bot {
  readonly name: string;
  /** Returns a legal move, or null if none exists. `rng` is the bot's own RNG, separate from the game's. */
  choose(state: EndlessState, rng: RngCursor): Move | null;
}

function legalMoves(state: EndlessState): Array<Move & { shape: Shape }> {
  const moves: Array<Move & { shape: Shape }> = [];
  state.tray.forEach((slot, i) => {
    if (!slot) return;
    const shape = slotShape(slot);
    for (const [row, col] of allFits(state.board, shape)) moves.push({ slot: i, row, col, shape });
  });
  return moves;
}

export const randomBot: Bot = {
  name: 'random',
  choose(state, rng) {
    const moves = legalMoves(state);
    if (moves.length === 0) return null;
    const { slot, row, col } = moves[rng.int(moves.length)]!;
    return { slot, row, col };
  },
};

/** Heuristic weights for the greedy bot. */
export const GREEDY_WEIGHTS = {
  line: 100,
  cleanBoard: 500,
  /** Empty cells with no empty orthogonal neighbour: only a dot can ever fill them. */
  isolated: 18,
  /** Filled/empty boundary edges, a measure of how ragged the board is. */
  roughness: 1.5,
  /** Filled cells after the move. */
  filled: 0.5,
};

const N = BOARD_SIZE;

/** Evaluates the board after a placement on a raw occupancy array. Higher is better. */
export function evaluatePlacement(occ: Uint8Array, shape: Shape, row: number, col: number): number {
  const b = occ.slice();
  for (const [dr, dc] of shape.cells) b[(row + dr) * N + col + dc] = 1;

  const fullRows: number[] = [];
  const fullCols: number[] = [];
  for (let i = 0; i < N; i++) {
    let r = true;
    let c = true;
    for (let j = 0; j < N; j++) {
      if (!b[i * N + j]) r = false;
      if (!b[j * N + i]) c = false;
    }
    if (r) fullRows.push(i);
    if (c) fullCols.push(i);
  }
  for (const r of fullRows) for (let j = 0; j < N; j++) b[r * N + j] = 0;
  for (const c of fullCols) for (let j = 0; j < N; j++) b[j * N + c] = 0;

  let filled = 0;
  let isolated = 0;
  let roughness = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = b[r * N + c]!;
      filled += v;
      const right = c + 1 < N ? b[r * N + c + 1]! : 1;
      const down = r + 1 < N ? b[(r + 1) * N + c]! : 1;
      roughness += (v ^ right) + (v ^ down);
      if (!v) {
        const up = r > 0 ? b[(r - 1) * N + c]! : 1;
        const left = c > 0 ? b[r * N + c - 1]! : 1;
        if (up && down && left && right) isolated++;
      }
    }
  }

  const lines = fullRows.length + fullCols.length;
  const W = GREEDY_WEIGHTS;
  return (
    lines * W.line +
    (lines > 0 && filled === 0 ? W.cleanBoard : 0) -
    isolated * W.isolated -
    roughness * W.roughness -
    filled * W.filled
  );
}

export function occupancy(state: EndlessState): Uint8Array {
  return Uint8Array.from(state.board.cells, (cell) => (cell.color === null ? 0 : 1));
}

export const greedyBot: Bot = {
  name: 'greedy',
  choose(state, rng) {
    const occ = occupancy(state);
    let best: Move | null = null;
    let bestScore = -Infinity;
    for (const m of legalMoves(state)) {
      // Tiny random jitter breaks ties without biasing towards the top-left.
      const score = evaluatePlacement(occ, m.shape, m.row, m.col) + rng.float() * 1e-3;
      if (score > bestScore) {
        bestScore = score;
        best = { slot: m.slot, row: m.row, col: m.col };
      }
    }
    return best;
  },
};

export const BOTS: Readonly<Record<string, Bot>> = { random: randomBot, greedy: greedyBot };
