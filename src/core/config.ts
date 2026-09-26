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

export interface GeneratorConfig {
  readonly maxAttempts: number;
  readonly historyLength: number;
  readonly repeatPenalty: readonly number[];
  readonly crowdedFullness: number;
  readonly sizeFactor: Readonly<Record<number, readonly [open: number, crowded: number]>>;
  readonly familyWeight: Readonly<Record<string, number>>;
  readonly solvableTrio: boolean;
}

/** Fair piece generator tuning (README §3.5, docs/PLAN.md §6). Tune with the simulator (T1.10). */
export const GENERATOR: GeneratorConfig = {
  /** Weighted trio draws before falling back to a guaranteed-fitting replacement. */
  maxAttempts: 20,
  /** Number of previous trays remembered for repeat limiting. */
  historyLength: 2,
  /** Weight multiplier for a shape seen 1 tray ago, 2 trays ago. */
  repeatPenalty: [0.4, 0.7],
  /** Fullness at which the "crowded" size factors fully apply. */
  crowdedFullness: 0.6,
  /** Weight factor by piece size: [open board, crowded board], interpolated by fullness. */
  sizeFactor: {
    1: [0.6, 1.6],
    2: [0.6, 1.6],
    3: [1.0, 1.3],
    4: [1.0, 0.9],
    5: [0.9, 0.5],
    9: [0.6, 0.15],
  },
  /** Base weight per family, split evenly across its rotation variants. Missing families = 1. */
  familyWeight: {},
  /** Stronger fairness: require an order in which all 3 pieces can be placed. Off until tuned. */
  solvableTrio: false,
};
