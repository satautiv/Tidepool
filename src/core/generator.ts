/**
 * Fair, seedable piece generator (README §3.5, docs/PLAN.md §6).
 *
 * Deterministic for a given (rng, board, history, options). Guarantees that at least one
 * dealt piece fits whenever any candidate shape fits (PLAN D8), adapts piece sizes to how
 * full the board is, avoids three pieces of one family, and damps recent repeats.
 */
import { anyFit, allFits, clearLines, findFullLines, fullness, place, type Board } from './board';
import { COLOR_COUNT, GENERATOR, SHAPES_CONFIG, TRAY_SIZE, type GeneratorConfig } from './config';
import { RngCursor, type RngState } from './rng';
import { getShape, shapeList, type Shape, type ShapeId } from './shapes';

export interface TraySlot {
  readonly shape: ShapeId;
  readonly color: number;
}

/**
 * `normal`: regular deals.
 * `secondChance`: only small (1–3 cell) shapes, and every piece must fit (PLAN D11).
 */
export type DealMode = 'normal' | 'secondChance';

export type { GeneratorConfig };

export interface DealOptions {
  mode?: DealMode;
  /** Restrict to these families (Voyage level pools, T4.07). */
  families?: readonly string[];
  /** Per-family weight overrides on top of the config. */
  familyWeights?: Readonly<Record<string, number>>;
  includeL4?: boolean;
  cfg?: GeneratorConfig;
}

export interface DealInput extends DealOptions {
  board: Board;
  rng: RngState;
  /** Shape IDs of previous trays, most recent first. */
  history: readonly (readonly ShapeId[])[];
}

export interface DealResult {
  tray: TraySlot[];
  rng: RngState;
  history: ShapeId[][];
  /** True when no weighted draw passed the checks and a fitting piece was forced in. */
  usedFallback: boolean;
}

/** The size-factor for a piece, interpolated between the open and crowded values. */
export function sizeFactor(
  size: number,
  boardFullness: number,
  cfg: GeneratorConfig = GENERATOR,
): number {
  const pair = cfg.sizeFactor[size] ?? [1, 1];
  const t = Math.min(boardFullness / cfg.crowdedFullness, 1);
  return pair[0] + (pair[1] - pair[0]) * t;
}

/** Candidate shapes for a deal and their weights (PLAN §6.1). Exported for tests and tuning. */
export function candidateWeights(
  board: Board,
  history: readonly (readonly ShapeId[])[],
  opts: DealOptions = {},
): { shapes: Shape[]; weights: number[] } {
  const cfg = opts.cfg ?? GENERATOR;
  let shapes = [...shapeList({ includeL4: opts.includeL4 ?? SHAPES_CONFIG.includeL4 })];
  if (opts.families) shapes = shapes.filter((s) => opts.families!.includes(s.family));
  if (opts.mode === 'secondChance') shapes = shapes.filter((s) => s.sizeClass === 'small');

  const variants = new Map<string, number>();
  for (const s of shapes) variants.set(s.family, (variants.get(s.family) ?? 0) + 1);

  const f = fullness(board);
  const weights = shapes.map((s) => {
    const family = opts.familyWeights?.[s.family] ?? cfg.familyWeight[s.family] ?? 1;
    let w = (family / variants.get(s.family)!) * sizeFactor(s.size, f, cfg);
    for (let age = 0; age < history.length && age < cfg.repeatPenalty.length; age++) {
      if (history[age]!.includes(s.id)) {
        w *= cfg.repeatPenalty[age]!;
        break;
      }
    }
    return w;
  });
  return { shapes, weights };
}

const allSameFamily = (trio: readonly Shape[]): boolean =>
  trio.every((s) => s.family === trio[0]!.family);

/** Whether the pieces can all be placed one after another in some order, clearing lines in between. */
export function canPlaceAllInSomeOrder(board: Board, pieces: readonly Shape[]): boolean {
  if (pieces.length === 0) return true;
  for (let i = 0; i < pieces.length; i++) {
    const rest = pieces.filter((_, j) => j !== i);
    for (const [r, c] of allFits(board, pieces[i]!)) {
      const placed = place(board, pieces[i]!, r, c, 0);
      const next = clearLines(placed, findFullLines(placed)).board;
      if (canPlaceAllInSomeOrder(next, rest)) return true;
    }
  }
  return false;
}

/** Deals a new tray of 3 pieces. */
export function deal(input: DealInput): DealResult {
  const { board, history } = input;
  const mode = input.mode ?? 'normal';
  const cfg = input.cfg ?? GENERATOR;
  const rng = new RngCursor(input.rng);
  const { shapes, weights } = candidateWeights(board, history, input);
  if (shapes.length === 0 || weights.every((w) => w <= 0)) {
    throw new Error('deal: no candidate shapes');
  }

  const fits = new Map<ShapeId, boolean>();
  const fitsBoard = (s: Shape): boolean => {
    let v = fits.get(s.id);
    if (v === undefined) fits.set(s.id, (v = anyFit(board, s)));
    return v;
  };
  const acceptable = (trio: Shape[]): boolean => {
    if (allSameFamily(trio)) return false;
    if (mode === 'secondChance') return trio.every(fitsBoard);
    if (!trio.some(fitsBoard)) return false;
    return !cfg.solvableTrio || canPlaceAllInSomeOrder(board, trio);
  };

  let trio: Shape[] = [];
  let usedFallback = false;
  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    trio = Array.from({ length: TRAY_SIZE }, () => rng.pick(shapes, weights));
    if (acceptable(trio)) break;
    if (attempt === cfg.maxAttempts - 1) {
      trio = fallback(trio, shapes, weights, mode, fitsBoard, rng);
      usedFallback = true;
    }
  }

  const tray = trio.map((s) => ({ shape: s.id, color: rng.int(COLOR_COUNT) }));
  const ids = trio.map((s) => s.id);
  return {
    tray,
    rng: rng.state,
    history: [ids, ...history.map((h) => [...h])].slice(0, cfg.historyLength),
    usedFallback,
  };
}

/**
 * Repairs a rejected trio (PLAN §6.1 fallback). Replaces pieces with weighted draws restricted
 * to fitting shapes: one random slot in normal mode, every non-fitting slot in second-chance
 * mode. Then breaks up a single-family trio if another family is available.
 * If no candidate fits at all, the trio is returned as is and the game will end.
 */
function fallback(
  trio: Shape[],
  shapes: Shape[],
  weights: number[],
  mode: DealMode,
  fitsBoard: (s: Shape) => boolean,
  rng: RngCursor,
): Shape[] {
  const out = trio.slice();
  const fitting = shapes.map((s, i) => (fitsBoard(s) ? weights[i]! : 0));
  if (fitting.every((w) => w <= 0)) return out;

  if (mode === 'secondChance') {
    for (let i = 0; i < out.length; i++) {
      if (!fitsBoard(out[i]!)) out[i] = rng.pick(shapes, fitting);
    }
  } else {
    out[rng.int(out.length)] = rng.pick(shapes, fitting);
  }

  if (allSameFamily(out)) {
    const family = out[0]!.family;
    const otherFitting = shapes.map((s, i) => (s.family !== family ? fitting[i]! : 0));
    const other = shapes.map((s, i) => (s.family !== family ? weights[i]! : 0));
    // Keep at least one fitting piece: replace a slot other than a guaranteed fitting one.
    if (otherFitting.some((w) => w > 0)) out[out.length - 1] = rng.pick(shapes, otherFitting);
    else if (mode === 'normal' && other.some((w) => w > 0)) {
      const keep = out.findIndex(fitsBoard);
      out[keep === 0 ? 1 : 0] = rng.pick(shapes, other);
    }
  }
  return out;
}

/** Resolves a tray slot's shape. */
export const slotShape = (slot: TraySlot): Shape => getShape(slot.shape);
