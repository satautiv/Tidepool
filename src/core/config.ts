/** Game tunables. Every rule constant lives here (docs/PLAN.md §3.1). */

export const BOARD_SIZE = 8;
export const TRAY_SIZE = 3;
export const COLOR_COUNT = 6;

export const SHAPES_CONFIG = {
  /** Deal the optional 4-cell L/J tetrominoes too (docs/PLAN.md §4.1). Off until playtests say otherwise. */
  includeL4: false,
} as const;

/** Scoring rules (README §3.4, docs/PLAN.md §5.2 and decisions D2–D6). */
export const SCORING = {
  /** Points per cell placed. */
  pointsPerPlacedCell: 1,
  /** Clear points = this × unique cells cleared × lines cleared × streak multiplier. */
  pointsPerClearedCell: 10,
  /** Multiplier = min(1 + streakStep × streak, maxMultiplier). */
  streakStep: 0.5,
  maxMultiplier: 4,
  /** Added when a clear leaves the board empty. Not multiplied. */
  cleanBoardBonus: 300,
  /** Minimum lines cleared in one placement for each callout tier. */
  calloutMinLines: { nice: 2, splash: 3, tidalWave: 4 },
} as const;
