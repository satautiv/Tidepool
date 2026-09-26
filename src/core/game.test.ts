import { describe, expect, it } from 'vitest';
import { allFits, boardFromAscii, boardToAscii, filledCount, isEmpty } from './board';
import {
  continueWithSecondChance,
  deserialize,
  isGameOver,
  newEndless,
  placePiece,
  serialize,
  type EndlessState,
  type GameEvent,
  type Step,
} from './game';
import { slotShape, type TraySlot } from './generator';
import { getShape } from './shapes';

const slot = (shape: string, color = 1): TraySlot => ({ shape, color });

/** A state with a chosen board and tray, starting from a real run so the RNG etc. are valid. */
function stateWith(rows: string[], tray: (TraySlot | null)[], extra: Partial<EndlessState> = {}) {
  return { ...newEndless('scenario').state, board: boardFromAscii(rows), tray, ...extra };
}

function ok(result: Step | { error: string }): Step {
  if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
  return result;
}

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

/** Plays deterministically: the first valid (slot, position) in row-major order, each move. */
function autoplay(start: EndlessState, maxMoves: number) {
  let state = start;
  const log: GameEvent[] = [];
  for (let m = 0; m < maxMoves && !state.over; m++) {
    const i = state.tray.findIndex((s) => s && allFits(state.board, slotShape(s)).length > 0);
    const [r, c] = allFits(state.board, slotShape(state.tray[i]!))[0]!;
    const step = ok(placePiece(state, i, r, c));
    state = step.state;
    log.push(...step.events);
  }
  return { state, log };
}

const EMPTY = new Array<string>(8).fill('........');

describe('newEndless', () => {
  it('starts with an empty board, score 0 and a dealt tray', () => {
    const { state, events } = newEndless('start');
    expect(isEmpty(state.board)).toBe(true);
    expect(state.score).toBe(0);
    expect(state.tray.every((s) => s !== null)).toBe(true);
    expect(state.over).toBe(false);
    expect(events).toEqual([
      { type: 'dealt', tray: state.tray, mode: 'normal', usedFallback: false },
    ]);
  });

  it('is deterministic per seed', () => {
    expect(newEndless(7)).toEqual(newEndless(7));
    expect(newEndless(7).state.tray).not.toEqual(newEndless(8).state.tray);
  });
});

describe('placePiece', () => {
  it('places a piece, scores it and empties the slot', () => {
    const s = stateWith(EMPTY, [slot('sq2', 3), slot('dot'), slot('i3h')]);
    const { state, events } = ok(placePiece(s, 0, 2, 2));
    expect(state.score).toBe(4);
    expect(state.tray[0]).toBeNull();
    expect(filledCount(state.board)).toBe(4);
    expect(events).toEqual([
      { type: 'placed', slot: 0, shape: 'sq2', row: 2, col: 2, color: 3, points: 4 },
    ]);
    expect(state.stats).toEqual({ placed: 1, linesCleared: 0, bestCombo: 0 });
  });

  it('clears a line and emits events in order', () => {
    const s = stateWith(
      ['######..', '#.......', ...EMPTY.slice(2)],
      [slot('i2h'), slot('dot'), slot('i3h')],
    );
    const { state, events } = ok(placePiece(s, 0, 0, 6));
    expect(types(events)).toEqual(['placed', 'cleared']);
    expect(events[1]).toMatchObject({
      rows: [0],
      cols: [],
      points: 80,
      multiplier: 1,
      callouts: [],
    });
    expect(state.score).toBe(82);
    expect(state.setHadClear).toBe(true);
    expect(filledCount(state.board)).toBe(1);
  });

  it('awards the clean-board bonus', () => {
    const s = stateWith(['######..', ...EMPTY.slice(1)], [slot('i2h'), slot('dot'), slot('dot')]);
    const { state, events } = ok(placePiece(s, 0, 0, 6));
    expect(types(events)).toEqual(['placed', 'cleared', 'cleanBoard']);
    expect(events[1]).toMatchObject({ callouts: ['crystalClear'] });
    expect(state.score).toBe(2 + 80 + 300);
  });

  it('scores a row + column cross with unique cells', () => {
    const rows = ['...#....', '...#....', '...#....', '###.####', ...new Array(4).fill('...#....')];
    const s = stateWith(rows, [slot('dot'), slot('dot'), slot('i2h')]);
    const { events, state } = ok(placePiece(s, 0, 3, 3));
    expect(events[1]).toMatchObject({ rows: [3], cols: [3], points: 10 * 15 * 2 });
    expect(events[1]).toMatchObject({ callouts: ['nice', 'crystalClear'] });
    expect(state.stats.bestCombo).toBe(2);
  });

  it('deals a new tray after the third piece and updates the streak', () => {
    let s = stateWith(['######..', ...EMPTY.slice(1)], [slot('i2h'), slot('dot'), slot('dot')]);
    s = ok(placePiece(s, 0, 0, 6)).state;
    s = ok(placePiece(s, 1, 5, 5)).state;
    const { state, events } = ok(placePiece(s, 2, 7, 7));
    expect(types(events)).toEqual(['placed', 'streak', 'dealt']);
    expect(events[1]).toEqual({ type: 'streak', streak: 1, multiplier: 1.5 });
    expect(state.streak).toBe(1);
    expect(state.setHadClear).toBe(false);
    expect(state.tray.every((t) => t !== null)).toBe(true);
    expect(state.genHistory[0]).toEqual(state.tray.map((t) => t!.shape));
  });

  it('applies the streak multiplier to clears and resets the streak after a set without clears', () => {
    const base = stateWith(
      ['######..', ...EMPTY.slice(1)],
      [slot('i2h'), slot('dot'), slot('dot')],
      {
        streak: 2,
      },
    );
    const cleared = ok(placePiece(base, 0, 0, 6));
    expect(cleared.events[1]).toMatchObject({ points: 160, multiplier: 2 });

    let s = stateWith(EMPTY, [slot('dot'), slot('dot'), slot('dot')], { streak: 3 });
    s = ok(placePiece(s, 0, 0, 0)).state;
    s = ok(placePiece(s, 1, 2, 2)).state;
    const end = ok(placePiece(s, 2, 4, 4));
    expect(end.events).toContainEqual({ type: 'streak', streak: 0, multiplier: 1 });
  });

  it('rejects invalid moves without changing the state', () => {
    const s = stateWith(['#.......', ...EMPTY.slice(1)], [slot('sq2'), null, slot('dot')]);
    expect(placePiece(s, 0, 0, 0)).toEqual({ error: 'invalidPosition' });
    expect(placePiece(s, 0, 7, 7)).toEqual({ error: 'invalidPosition' });
    expect(placePiece(s, 1, 3, 3)).toEqual({ error: 'emptySlot' });
    expect(placePiece(s, 3, 3, 3)).toEqual({ error: 'badSlot' });
    expect(placePiece(s, -1, 3, 3)).toEqual({ error: 'badSlot' });
    expect(placePiece({ ...s, over: true }, 0, 3, 3)).toEqual({ error: 'gameOver' });
    expect(boardToAscii(s.board)[0]).toBe('0.......');
  });
});

describe('game over', () => {
  // Checkerboard: only isolated cells are free, so only dots fit, and one dot never completes a line.
  const CHECKER = [
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
    '#.#.#.#.',
    '.#.#.#.#',
  ];

  it('detects when no tray piece fits', () => {
    expect(isGameOver(boardFromAscii(CHECKER), [slot('i2h'), null, slot('sq2')])).toBe(true);
    expect(isGameOver(boardFromAscii(CHECKER), [slot('i2h'), slot('dot'), null])).toBe(false);
  });

  it('ends the run when the remaining pieces cannot be placed', () => {
    const s = stateWith(CHECKER, [slot('dot'), slot('i2h'), slot('sq2')]);
    const { state, events } = ok(placePiece(s, 0, 0, 1));
    expect(state.over).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'gameOver', score: state.score });
  });

  it('offers exactly one second chance with small pieces that all fit', () => {
    const over = ok(
      placePiece(stateWith(CHECKER, [slot('dot'), slot('i2h'), slot('sq2')]), 0, 0, 1),
    ).state;
    expect(continueWithSecondChance({ ...over, over: false })).toEqual({ error: 'notOver' });

    const { state, events } = ok(continueWithSecondChance(over));
    expect(types(events)).toEqual(['streak', 'dealt']);
    expect(events[1]).toMatchObject({ mode: 'secondChance' });
    expect(state.over).toBe(false);
    expect(state.secondChanceUsed).toBe(true);
    for (const t of state.tray) {
      expect(slotShape(t!).sizeClass).toBe('small');
      expect(allFits(state.board, slotShape(t!)).length).toBeGreaterThan(0);
    }
    expect(continueWithSecondChance({ ...state, over: true })).toEqual({ error: 'alreadyUsed' });
  });
});

describe('replay & persistence', () => {
  it('replays identically from the same seed and moves', () => {
    const a = autoplay(newEndless('replay').state, 200);
    const b = autoplay(newEndless('replay').state, 200);
    expect(a.state).toEqual(b.state);
    expect(a.log).toEqual(b.log);
    expect(a.log.length).toBeGreaterThan(10);
  });

  it('continues identically after a serialize/deserialize round-trip mid-run', () => {
    const start = newEndless('resume').state;
    const straight = autoplay(start, 60);
    const half = autoplay(start, 30);
    const restored = deserialize(serialize(half.state));
    const rest = autoplay(restored, 30);
    expect(rest.state).toEqual(straight.state);
    expect([...half.log, ...rest.log]).toEqual(straight.log);
  });

  it('plays a whole game to game over with consistent bookkeeping', () => {
    const { state, log } = autoplay(newEndless('full').state, 10_000);
    expect(state.over).toBe(true);
    const placed = log.filter((e) => e.type === 'placed');
    expect(state.stats.placed).toBe(placed.length);
    const points = log.reduce((sum, e) => ('points' in e ? sum + e.points : sum), 0);
    expect(state.score).toBe(points);
    expect(log.at(-1)).toEqual({ type: 'gameOver', score: state.score });
  });

  it.each([
    ['not JSON', '{'],
    ['wrong version', JSON.stringify({ ...newEndless('v').state, schemaVersion: 99 })],
    ['bad board', JSON.stringify({ ...newEndless('v').state, board: { cells: [] } })],
    ['bad tray', JSON.stringify({ ...newEndless('v').state, tray: [] })],
    [
      'unknown shape',
      JSON.stringify({ ...newEndless('v').state, tray: [slot('nope'), null, null] }),
    ],
    ['bad rng', JSON.stringify({ ...newEndless('v').state, rng: [1] })],
    ['bad score', JSON.stringify({ ...newEndless('v').state, score: 'x' })],
    ['missing stats', JSON.stringify({ ...newEndless('v').state, stats: undefined })],
    ['null', 'null'],
  ])('deserialize rejects %s', (_name, json) => {
    expect(() => deserialize(json)).toThrow();
  });

  it('keeps state JSON-serializable without loss', () => {
    const s = autoplay(newEndless('json').state, 20).state;
    expect(JSON.parse(serialize(s))).toEqual(s);
    expect(getShape(s.tray.find((t) => t)!.shape)).toBeDefined();
  });
});
