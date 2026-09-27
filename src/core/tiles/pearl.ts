/**
 * 🦪 Pearl (README §5, docs/PLAN.md §14.2): a pearl sits inside pre-filled glass. The cell
 * blocks placement and counts as filled; when its line clears, the cell empties as usual and
 * the pearl is collected (`pearlCollected`), once even if a row and a column clear it together.
 * The Voyage goal counter is T4.06.
 */
import type { TileBehaviour } from '../tiles';

export const PEARL: TileBehaviour = {
  blocksPlacement: () => true,
  countsAsFilled: () => true,
  onLineClear: (_cell, { index }) => ({
    cell: { color: null },
    events: [{ type: 'pearlCollected', index }],
  }),
};
