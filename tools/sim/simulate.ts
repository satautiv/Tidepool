/**
 * Plays many seeded Endless games with a bot and measures generator fairness and balance
 * (docs/PLAN.md §6.5). Deterministic for a given seed, bot and game count.
 */
import { anyFit, filledCount, fullness } from '../../src/core/board';
import { newEndless, placePiece, type EndlessState, type GameEvent } from '../../src/core/game';
import { slotShape } from '../../src/core/generator';
import { createRng, RngCursor } from '../../src/core/rng';
import { getShape, STANDARD_SHAPES } from '../../src/core/shapes';
import type { Bot } from './bots';

export interface SimOptions {
  games: number;
  seed: string | number;
  bot: Bot;
  /** Safety cap on placements per game; a game hitting it counts as `capped`. */
  maxMoves?: number;
}

export interface GameResult {
  score: number;
  placed: number;
  linesCleared: number;
  bestCombo: number;
  maxStreak: number;
  fullnessAtEnd: number;
  capped: boolean;
}

export interface SimReport {
  bot: string;
  seed: string;
  games: number;
  score: Distribution;
  placed: Distribution;
  linesPerGame: number;
  deals: number;
  fallbackRate: number;
  /** Deals where no piece fit although the board had an empty cell. Must be 0. */
  unfairDeals: number;
  cappedGames: number;
  /** Game-over fullness, bucketed by 10% (index 5 = 50–59%). */
  gameOverFullness: number[];
  /** Share of dealt pieces per shape ID. */
  shapeFrequency: Record<string, number>;
  /** Share of dealt pieces whose shape was also in the previous tray. */
  repeatRate: number;
  /** Mean streak value at the end of each tray-set. */
  meanStreak: number;
  maxStreak: number;
  meanBestCombo: number;
}

export interface Distribution {
  mean: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { mean: 0, median: 0, p90: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: at(0.5),
    p90: at(0.9),
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

interface Tally {
  deals: number;
  fallbacks: number;
  unfair: number;
  shapes: Map<string, number>;
  pieces: number;
  repeats: number;
  streakSum: number;
  streakCount: number;
}

function tallyDeal(
  t: Tally,
  ev: Extract<GameEvent, { type: 'dealt' }>,
  state: EndlessState,
  prev: Set<string>,
) {
  t.deals++;
  if (ev.usedFallback) t.fallbacks++;
  const anyEmpty = filledCount(state.board) < 64;
  if (anyEmpty && !ev.tray.some((s) => anyFit(state.board, slotShape(s)))) t.unfair++;
  for (const s of ev.tray) {
    t.pieces++;
    t.shapes.set(s.shape, (t.shapes.get(s.shape) ?? 0) + 1);
    if (prev.has(s.shape)) t.repeats++;
  }
}

/** Plays one game to the end (or the move cap). */
export function playGame(seed: string, bot: Bot, maxMoves: number, t: Tally): GameResult {
  const botRng = new RngCursor(createRng(`bot:${seed}`));
  let { state, events } = newEndless(seed);
  let prevTray = new Set<string>();
  let maxStreak = 0;

  const absorb = (evs: readonly GameEvent[], s: EndlessState) => {
    for (const ev of evs) {
      if (ev.type === 'dealt') {
        tallyDeal(t, ev, s, prevTray);
        prevTray = new Set(ev.tray.map((x) => x.shape));
      } else if (ev.type === 'streak') {
        t.streakSum += ev.streak;
        t.streakCount++;
        maxStreak = Math.max(maxStreak, ev.streak);
      }
    }
  };
  absorb(events, state);

  let moves = 0;
  while (!state.over && moves < maxMoves) {
    const move = bot.choose(state, botRng);
    if (!move) throw new Error(`Bot ${bot.name} found no move in a live game (seed ${seed})`);
    const step = placePiece(state, move.slot, move.row, move.col);
    if ('error' in step) throw new Error(`Bot ${bot.name} made an illegal move: ${step.error}`);
    ({ state, events } = step);
    absorb(events, state);
    moves++;
  }

  return {
    score: state.score,
    placed: state.stats.placed,
    linesCleared: state.stats.linesCleared,
    bestCombo: state.stats.bestCombo,
    maxStreak,
    fullnessAtEnd: fullness(state.board),
    capped: !state.over,
  };
}

export function simulate(opts: SimOptions): SimReport {
  const maxMoves = opts.maxMoves ?? 5000;
  const t: Tally = {
    deals: 0,
    fallbacks: 0,
    unfair: 0,
    shapes: new Map(),
    pieces: 0,
    repeats: 0,
    streakSum: 0,
    streakCount: 0,
  };
  const results: GameResult[] = [];
  for (let i = 0; i < opts.games; i++) {
    results.push(playGame(`${opts.seed}-${i}`, opts.bot, maxMoves, t));
  }

  const gameOverFullness = new Array<number>(10).fill(0);
  for (const r of results) {
    if (!r.capped) gameOverFullness[Math.min(9, Math.floor(r.fullnessAtEnd * 10))]!++;
  }
  const shapeFrequency: Record<string, number> = {};
  for (const s of STANDARD_SHAPES) shapeFrequency[s.id] = 0;
  for (const [id, n] of t.shapes) shapeFrequency[getShape(id).id] = n / Math.max(1, t.pieces);

  return {
    bot: opts.bot.name,
    seed: String(opts.seed),
    games: opts.games,
    score: distribution(results.map((r) => r.score)),
    placed: distribution(results.map((r) => r.placed)),
    linesPerGame: results.reduce((a, r) => a + r.linesCleared, 0) / Math.max(1, results.length),
    deals: t.deals,
    fallbackRate: t.fallbacks / Math.max(1, t.deals),
    unfairDeals: t.unfair,
    cappedGames: results.filter((r) => r.capped).length,
    gameOverFullness,
    shapeFrequency,
    repeatRate: t.repeats / Math.max(1, t.pieces),
    meanStreak: t.streakSum / Math.max(1, t.streakCount),
    maxStreak: Math.max(0, ...results.map((r) => r.maxStreak)),
    meanBestCombo: results.reduce((a, r) => a + r.bestCombo, 0) / Math.max(1, results.length),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Human-readable report. */
export function formatReport(r: SimReport): string {
  const dist = (d: Distribution) =>
    `mean ${num(d.mean)} · median ${num(d.median)} · p90 ${num(d.p90)} · min ${num(d.min)} · max ${num(d.max)}`;
  const lines = [
    `Tidepool simulation — bot: ${r.bot}, seed: ${r.seed}, games: ${r.games}`,
    '',
    `Score            ${dist(r.score)}`,
    `Pieces placed    ${dist(r.placed)}`,
    `Lines / game     ${num(r.linesPerGame)}`,
    `Best combo       mean ${num(r.meanBestCombo)} lines`,
    `Streak           mean ${r.meanStreak.toFixed(2)} at set end · max ${r.maxStreak}`,
    '',
    `Deals            ${r.deals}`,
    `Fallback deals   ${pct(r.fallbackRate)}`,
    `Unfair deals     ${r.unfairDeals}${r.unfairDeals === 0 ? '  ✓' : '  ✗ MUST BE 0'}`,
    `Repeat rate      ${pct(r.repeatRate)} of pieces were in the previous tray`,
    `Capped games     ${r.cappedGames}`,
    '',
    'Game-over fullness',
    ...r.gameOverFullness.map((n, i) => {
      const bar = '█'.repeat(Math.round((n / Math.max(1, r.games)) * 50));
      return `  ${String(i * 10).padStart(2)}–${i * 10 + 9}%  ${String(n).padStart(6)}  ${bar}`;
    }),
    '',
    'Shape frequency',
    ...Object.entries(r.shapeFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([id, f]) => `  ${id.padEnd(7)} ${pct(f).padStart(6)}`),
  ];
  return lines.join('\n');
}
