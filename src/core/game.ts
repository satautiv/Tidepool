/**
 * One Endless run as a pure state machine (README §3.2, docs/PLAN.md §3.3, §4, §5).
 *
 * Every function returns a new state plus the events that happened, in order. The state is
 * plain JSON (including the RNG), so it can be saved, resumed, replayed and snapshotted.
 */
import {
  anyFit,
  canPlace,
  clearLines,
  findFullLines,
  isEmpty,
  lineCount,
  place,
  type Board,
  emptyBoard,
} from './board';
import { TRAY_SIZE } from './config';
import { deal, slotShape, type DealMode, type TraySlot } from './generator';
import { createRng, type RngState } from './rng';
import { endTraySet, multiplier, scorePlacement, type CalloutKey } from './scoring';
import { SHAPES, type ShapeId } from './shapes';

export const ENDLESS_SCHEMA_VERSION = 1;

export interface EndlessStats {
  readonly placed: number;
  readonly linesCleared: number;
  /** Most lines cleared by a single placement. */
  readonly bestCombo: number;
}

export interface EndlessState {
  readonly schemaVersion: typeof ENDLESS_SCHEMA_VERSION;
  readonly board: Board;
  /** Three slots; null once a slot's piece has been placed. */
  readonly tray: readonly (TraySlot | null)[];
  readonly score: number;
  readonly streak: number;
  /** Whether the current tray-set has cleared at least one line (PLAN D3). */
  readonly setHadClear: boolean;
  readonly rng: RngState;
  readonly genHistory: readonly (readonly ShapeId[])[];
  readonly secondChanceUsed: boolean;
  readonly over: boolean;
  readonly stats: EndlessStats;
}

export type GameEvent =
  | {
      type: 'placed';
      slot: number;
      shape: ShapeId;
      row: number;
      col: number;
      color: number;
      points: number;
    }
  | {
      type: 'cleared';
      rows: readonly number[];
      cols: readonly number[];
      cells: readonly number[];
      points: number;
      multiplier: number;
      callouts: readonly CalloutKey[];
    }
  | { type: 'cleanBoard'; points: number }
  | { type: 'streak'; streak: number; multiplier: number }
  | { type: 'dealt'; tray: readonly TraySlot[]; mode: DealMode; usedFallback: boolean }
  | { type: 'gameOver'; score: number };

export interface Step {
  readonly state: EndlessState;
  readonly events: readonly GameEvent[];
}

export type PlaceError = 'gameOver' | 'badSlot' | 'emptySlot' | 'invalidPosition';
export type SecondChanceError = 'notOver' | 'alreadyUsed';

/** Starts a new run and deals the first tray. */
export function newEndless(seed: string | number): Step {
  const initial: EndlessState = {
    schemaVersion: ENDLESS_SCHEMA_VERSION,
    board: emptyBoard(),
    tray: new Array<TraySlot | null>(TRAY_SIZE).fill(null),
    score: 0,
    streak: 0,
    setHadClear: false,
    rng: createRng(seed),
    genHistory: [],
    secondChanceUsed: false,
    over: false,
    stats: { placed: 0, linesCleared: 0, bestCombo: 0 },
  };
  const dealt = dealTray(initial, 'normal');
  return { state: dealt.state, events: [dealt.event] };
}

/** Whether no remaining tray piece fits anywhere (PLAN D7). */
export function isGameOver(board: Board, tray: readonly (TraySlot | null)[]): boolean {
  return tray.every((slot) => slot === null || !anyFit(board, slotShape(slot)));
}

/** Places the piece in `slot` with its top-left cell at (row, col), then resolves the move (PLAN §5.1). */
export function placePiece(
  state: EndlessState,
  slot: number,
  row: number,
  col: number,
): Step | { error: PlaceError } {
  if (state.over) return { error: 'gameOver' };
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.tray.length) return { error: 'badSlot' };
  const traySlot = state.tray[slot];
  if (!traySlot) return { error: 'emptySlot' };
  const shape = slotShape(traySlot);
  if (!canPlace(state.board, shape, row, col)) return { error: 'invalidPosition' };

  const events: GameEvent[] = [];
  const placed = place(state.board, shape, row, col, traySlot.color);
  const lines = findFullLines(placed);
  const cleared = clearLines(placed, lines);
  const linesCleared = lineCount(lines);
  const score = scorePlacement({
    shapeSize: shape.size,
    uniqueCellsCleared: cleared.clearedCells.length,
    linesCleared,
    streak: state.streak,
    boardEmptyAfter: isEmpty(cleared.board),
  });

  events.push({
    type: 'placed',
    slot,
    shape: shape.id,
    row,
    col,
    color: traySlot.color,
    points: score.placement,
  });
  if (linesCleared > 0) {
    events.push({
      type: 'cleared',
      rows: lines.rows,
      cols: lines.cols,
      cells: cleared.clearedCells,
      points: score.clear,
      multiplier: score.multiplier,
      callouts: score.callouts,
    });
  }
  if (score.cleanBonus > 0) events.push({ type: 'cleanBoard', points: score.cleanBonus });

  let next: EndlessState = {
    ...state,
    board: cleared.board,
    tray: state.tray.map((s, i) => (i === slot ? null : s)),
    score: state.score + score.total,
    setHadClear: state.setHadClear || linesCleared > 0,
    stats: {
      placed: state.stats.placed + 1,
      linesCleared: state.stats.linesCleared + linesCleared,
      bestCombo: Math.max(state.stats.bestCombo, linesCleared),
    },
  };

  if (next.tray.every((s) => s === null)) {
    const ended = endSet(next);
    const dealt = dealTray(ended.state, 'normal');
    next = dealt.state;
    events.push(ended.event, dealt.event);
  }

  return finish(next, events);
}

/**
 * Once per run, after game over: ends the interrupted tray-set and deals 3 small pieces that
 * all fit (PLAN D11). The new tray counts as a normal tray-set for streaks.
 */
export function continueWithSecondChance(state: EndlessState): Step | { error: SecondChanceError } {
  if (!state.over) return { error: 'notOver' };
  if (state.secondChanceUsed) return { error: 'alreadyUsed' };

  const ended = endSet({ ...state, over: false, secondChanceUsed: true });
  const dealt = dealTray(ended.state, 'secondChance');
  return finish(dealt.state, [ended.event, dealt.event]);
}

function endSet(state: EndlessState): { state: EndlessState; event: GameEvent } {
  const streak = endTraySet(state.streak, state.setHadClear);
  return {
    state: { ...state, streak, setHadClear: false },
    event: { type: 'streak', streak, multiplier: multiplier(streak) },
  };
}

function dealTray(state: EndlessState, mode: DealMode): { state: EndlessState; event: GameEvent } {
  const result = deal({ board: state.board, rng: state.rng, history: state.genHistory, mode });
  return {
    state: { ...state, tray: result.tray, rng: result.rng, genHistory: result.history },
    event: { type: 'dealt', tray: result.tray, mode, usedFallback: result.usedFallback },
  };
}

function finish(state: EndlessState, events: GameEvent[]): Step {
  if (!isGameOver(state.board, state.tray)) return { state, events };
  return {
    state: { ...state, over: true },
    events: [...events, { type: 'gameOver', score: state.score }],
  };
}

export function serialize(state: EndlessState): string {
  return JSON.stringify(state);
}

/** Parses a saved run. Throws if the data is from another schema version or malformed. */
export function deserialize(json: string): EndlessState {
  const data: unknown = JSON.parse(json);
  const fail = (why: string): never => {
    throw new Error(`Invalid saved run: ${why}`);
  };
  if (!data || typeof data !== 'object') fail('not an object');
  const s = data as Partial<EndlessState>;
  if (s.schemaVersion !== ENDLESS_SCHEMA_VERSION) fail(`schema version ${s.schemaVersion}`);
  if (!Array.isArray(s.board?.cells) || s.board.cells.length !== 64) fail('board');
  if (!Array.isArray(s.tray) || s.tray.length !== TRAY_SIZE) fail('tray');
  for (const slot of s.tray!) {
    if (slot !== null && !SHAPES.has(slot.shape)) fail(`unknown shape ${slot.shape}`);
  }
  if (!Array.isArray(s.rng) || s.rng.length !== 4) fail('rng');
  for (const key of ['score', 'streak'] as const) {
    if (typeof s[key] !== 'number') fail(key);
  }
  if (!Array.isArray(s.genHistory) || !s.stats) fail('history/stats');
  return s as EndlessState;
}
