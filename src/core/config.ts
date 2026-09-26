/** Game tunables. Every rule constant lives here (docs/PLAN.md §3.1). */

export const BOARD_SIZE = 8;
export const TRAY_SIZE = 3;
export const COLOR_COUNT = 6;

export const SHAPES_CONFIG = {
  /** Deal the optional 4-cell L/J tetrominoes too (docs/PLAN.md §4.1). Off until playtests say otherwise. */
  includeL4: false,
} as const;
