/**
 * Scoring (README §3.4, docs/PLAN.md §5.2, decisions D2–D6).
 * Pure functions; all numbers come from `SCORING` in config.ts.
 */
import { SCORING } from './config';

export type CalloutKey = 'nice' | 'splash' | 'tidalWave' | 'crystalClear';

/** Points for placing a piece: one per cell. */
export function placementPoints(shapeSize: number): number {
  return shapeSize * SCORING.pointsPerPlacedCell;
}

/** Streak multiplier: ×1, ×1.5, ×2 … capped at ×4 (D3). */
export function multiplier(streak: number): number {
  return Math.min(1 + SCORING.streakStep * streak, SCORING.maxMultiplier);
}

/** Line-clear points (D2). `uniqueCells` counts crossing cells once (D1). */
export function clearPoints(uniqueCells: number, lines: number, streak: number): number {
  if (lines <= 0) return 0;
  return Math.floor(SCORING.pointsPerClearedCell * uniqueCells * lines * multiplier(streak));
}

/**
 * Callouts for one placement (D6), in display order. A line-tier callout (2 / 3 / 4+ lines)
 * and "Crystal Clear" for an emptied board can both appear. Returns keys, not display text.
 */
export function callouts(lines: number, cleanBoard: boolean): CalloutKey[] {
  const { nice, splash, tidalWave } = SCORING.calloutMinLines;
  const out: CalloutKey[] = [];
  if (lines >= tidalWave) out.push('tidalWave');
  else if (lines >= splash) out.push('splash');
  else if (lines >= nice) out.push('nice');
  if (cleanBoard) out.push('crystalClear');
  return out;
}

/** The streak after a tray-set ends (D3): +1 if the set had a clear, otherwise back to 0. */
export function endTraySet(streak: number, setHadClear: boolean): number {
  return setHadClear ? streak + 1 : 0;
}

export interface PlacementScore {
  readonly placement: number;
  readonly clear: number;
  readonly cleanBonus: number;
  readonly total: number;
  /** The multiplier applied to `clear` (D4: placement and clean bonus are never multiplied). */
  readonly multiplier: number;
  readonly callouts: readonly CalloutKey[];
}

/** Scores one resolved placement. */
export function scorePlacement(input: {
  shapeSize: number;
  uniqueCellsCleared: number;
  linesCleared: number;
  streak: number;
  boardEmptyAfter: boolean;
}): PlacementScore {
  const { shapeSize, uniqueCellsCleared, linesCleared, streak, boardEmptyAfter } = input;
  const placement = placementPoints(shapeSize);
  const clear = clearPoints(uniqueCellsCleared, linesCleared, streak);
  const clean = linesCleared > 0 && boardEmptyAfter;
  const cleanBonus = clean ? SCORING.cleanBoardBonus : 0;
  return {
    placement,
    clear,
    cleanBonus,
    total: placement + clear + cleanBonus,
    multiplier: multiplier(streak),
    callouts: linesCleared > 0 ? callouts(linesCleared, clean) : [],
  };
}
