/**
 * The first-run experience (T2.16): a friendly fixed start where the first move clears a line,
 * and where the ghost hand should drag.
 */
import { boardFromAscii } from '../core/board';
import { newEndless, type EndlessState } from '../core/game';
import type { TraySlot } from '../core/generator';

export const FIRST_RUN = {
  seed: 'tidepool-first-run',
  /** The bottom row is full except a 2-cell gap in the middle. */
  board: [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '012..345',
  ],
  /** Slot 0 fills the gap. */
  tray: [
    { shape: 'i2h', color: 1 },
    { shape: 'dot', color: 4 },
    { shape: 'sq2', color: 0 },
  ] as TraySlot[],
  /** Where the hint drags slot 0 to (its top-left cell). */
  target: { slot: 0, row: 7, col: 3 },
};

export function firstRunState(): EndlessState {
  const base = newEndless(FIRST_RUN.seed).state;
  return { ...base, board: boardFromAscii(FIRST_RUN.board), tray: FIRST_RUN.tray };
}
