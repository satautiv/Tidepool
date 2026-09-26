import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anyFit, boardFromAscii, emptyBoard, fullness, type Board } from './board';
import { COLOR_COUNT, GENERATOR } from './config';
import {
  canPlaceAllInSomeOrder,
  candidateWeights,
  deal,
  sizeFactor,
  slotShape,
  type DealInput,
  type DealResult,
} from './generator';
import { createRng, type RngState } from './rng';
import { getShape, STANDARD_SHAPES, type ShapeId } from './shapes';
import { boardArb } from './testing';

const dot = getShape('dot');
const dealOn = (board: Board, seed: string, extra: Partial<DealInput> = {}): DealResult =>
  deal({ board, rng: createRng(seed), history: [], ...extra });

/** Deals `n` trays in a row on a fixed board, threading rng and history. */
function dealMany(board: Board, n: number, seed: string, extra: Partial<DealInput> = {}) {
  let rng: RngState = createRng(seed);
  let history: ShapeId[][] = [];
  const results: DealResult[] = [];
  for (let i = 0; i < n; i++) {
    const r = deal({ board, rng, history, ...extra });
    results.push(r);
    rng = r.rng;
    history = r.history;
  }
  return results;
}

const CROWDED = boardFromAscii([
  '#######.',
  '#######.',
  '#######.',
  '#######.',
  '#######.',
  '#######.',
  '........',
  '........',
]);

/** Only isolated cells on the anti-diagonal are free, so only the dot fits. */
const DIAGONAL = boardFromAscii([
  '#######.',
  '######.#',
  '#####.##',
  '####.###',
  '###.####',
  '##.#####',
  '#.######',
  '.#######',
]);

describe('deal basics', () => {
  it('deals 3 known shapes with valid colours', () => {
    const { tray } = dealOn(emptyBoard(), 'basic');
    expect(tray).toHaveLength(3);
    for (const slot of tray) {
      expect(slotShape(slot).id).toBe(slot.shape);
      expect(slot.color).toBeGreaterThanOrEqual(0);
      expect(slot.color).toBeLessThan(COLOR_COUNT);
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(dealMany(CROWDED, 20, 'det')).toEqual(dealMany(CROWDED, 20, 'det'));
  });

  it('varies with the seed', () => {
    const a = dealMany(emptyBoard(), 10, 'a').map((r) => r.tray);
    const b = dealMany(emptyBoard(), 10, 'b').map((r) => r.tray);
    expect(a).not.toEqual(b);
  });

  it('keeps a bounded, most-recent-first history', () => {
    const results = dealMany(emptyBoard(), 5, 'hist');
    const last = results[4]!;
    expect(last.history).toHaveLength(GENERATOR.historyLength);
    expect(last.history[0]).toEqual(last.tray.map((s) => s.shape));
    expect(last.history[1]).toEqual(results[3]!.tray.map((s) => s.shape));
  });

  it('throws when no candidate shapes exist', () => {
    expect(() => dealOn(emptyBoard(), 'x', { families: ['nope'] })).toThrow('no candidate shapes');
  });
});

describe('fairness', () => {
  it('always deals at least one fitting piece when any cell is empty (PLAN D8)', () => {
    fc.assert(
      fc.property(boardArb, fc.string(), (board, seed) => {
        fc.pre(anyFit(board, dot));
        const { tray } = dealOn(board, seed);
        expect(tray.some((s) => anyFit(board, slotShape(s)))).toBe(true);
      }),
      { numRuns: 400 },
    );
  });

  it('forces a dot when only isolated single cells are free', () => {
    for (let i = 0; i < 20; i++) {
      const { tray } = dealOn(DIAGONAL, `single-${i}`);
      const fitting = tray.filter((s) => anyFit(DIAGONAL, slotShape(s)));
      expect(fitting.length).toBeGreaterThan(0);
      expect(fitting.every((s) => slotShape(s).size === 1)).toBe(true);
    }
  });

  it('reports the fallback when it had to force a piece in', () => {
    const used = dealMany(DIAGONAL, 30, 'fb').filter((r) => r.usedFallback);
    expect(used.length).toBeGreaterThan(0);
    expect(dealMany(emptyBoard(), 30, 'fb').some((r) => r.usedFallback)).toBe(false);
  });

  it('breaks up a single-family fallback trio even when only that family fits', () => {
    // Only dots fit; sq3 is nearly never drawn, so the one attempt yields three dots.
    const cfg = { ...GENERATOR, maxAttempts: 1 };
    const r = dealOn(DIAGONAL, 'mono', {
      cfg,
      families: ['dot', 'square3'],
      familyWeights: { square3: 1e-9 },
    });
    expect(r.usedFallback).toBe(true);
    const ids = r.tray.map((s) => s.shape).sort();
    expect(ids).toEqual(['dot', 'dot', 'sq3']);
  });

  it('never deals three pieces of the same family', () => {
    fc.assert(
      fc.property(boardArb, fc.string(), (board, seed) => {
        fc.pre(anyFit(board, dot));
        const families = dealOn(board, seed).tray.map((s) => slotShape(s).family);
        expect(new Set(families).size).toBeGreaterThan(1);
      }),
      { numRuns: 400 },
    );
  });
});

describe('second chance mode (PLAN D11)', () => {
  it('deals only small pieces that all fit', () => {
    fc.assert(
      fc.property(boardArb, fc.string(), (board, seed) => {
        fc.pre(anyFit(board, dot));
        const { tray } = dealOn(board, seed, { mode: 'secondChance' });
        for (const slot of tray) {
          const s = slotShape(slot);
          expect(s.sizeClass).toBe('small');
          expect(anyFit(board, s)).toBe(true);
        }
      }),
      { numRuns: 400 },
    );
  });
});

describe('adaptive piece sizes', () => {
  const meanSize = (board: Board) => {
    const sizes = dealMany(board, 400, 'mean').flatMap((r) => r.tray.map((s) => slotShape(s).size));
    return sizes.reduce((a, b) => a + b, 0) / sizes.length;
  };

  it('deals clearly smaller pieces on a crowded board', () => {
    expect(fullness(CROWDED)).toBeGreaterThan(GENERATOR.crowdedFullness);
    const open = meanSize(emptyBoard());
    const crowded = meanSize(CROWDED);
    expect(crowded).toBeLessThan(open - 0.5);
  });

  it('interpolates the size factor between the open and crowded values', () => {
    expect(sizeFactor(9, 0)).toBe(0.6);
    expect(sizeFactor(9, GENERATOR.crowdedFullness)).toBeCloseTo(0.15);
    expect(sizeFactor(9, 1)).toBeCloseTo(0.15);
    expect(sizeFactor(9, GENERATOR.crowdedFullness / 2)).toBeCloseTo(0.375);
    expect(sizeFactor(7, 0.5)).toBe(1); // unknown sizes are neutral
  });
});

describe('candidate weights', () => {
  it('splits family weight across rotation variants', () => {
    const { shapes, weights } = candidateWeights(emptyBoard(), []);
    const w = (id: string) => weights[shapes.findIndex((s) => s.id === id)]!;
    // t4 (4 variants) and square2 (1 variant) are both size 4, so only the split differs.
    expect(w('sq2')).toBeCloseTo(4 * w('t4_u'));
    expect(w('i2h')).toBeCloseTo(w('i2v'));
  });

  it('damps shapes from recent trays', () => {
    const base = candidateWeights(emptyBoard(), []);
    const damped = candidateWeights(emptyBoard(), [['sq3'], ['i5h']]);
    const idx = (id: string) => base.shapes.findIndex((s) => s.id === id);
    expect(damped.weights[idx('sq3')]).toBeCloseTo(base.weights[idx('sq3')]! * 0.4);
    expect(damped.weights[idx('i5h')]).toBeCloseTo(base.weights[idx('i5h')]! * 0.7);
    expect(damped.weights[idx('dot')]).toBeCloseTo(base.weights[idx('dot')]!);
  });

  it('lowers the repeat rate of the previous tray', () => {
    let repeats = 0;
    const results = dealMany(emptyBoard(), 300, 'repeat');
    for (let i = 1; i < results.length; i++) {
      const prev = new Set(results[i - 1]!.tray.map((s) => s.shape));
      repeats += results[i]!.tray.filter((s) => prev.has(s.shape)).length;
    }
    const noPenalty = { ...GENERATOR, repeatPenalty: [1, 1] };
    let baseline = 0;
    const plain = dealMany(emptyBoard(), 300, 'repeat', { cfg: noPenalty });
    for (let i = 1; i < plain.length; i++) {
      const prev = new Set(plain[i - 1]!.tray.map((s) => s.shape));
      baseline += plain[i]!.tray.filter((s) => prev.has(s.shape)).length;
    }
    expect(repeats).toBeLessThan(baseline);
  });

  it('respects family pools and weight overrides (Voyage)', () => {
    const results = dealMany(emptyBoard(), 50, 'pool', { families: ['line3', 'square2'] });
    for (const r of results) {
      for (const s of r.tray) expect(['line3', 'square2']).toContain(slotShape(s).family);
    }
    const only = dealMany(emptyBoard(), 50, 'w', { familyWeights: { dot: 1000 } });
    const dots = only.flatMap((r) => r.tray).filter((s) => s.shape === 'dot').length;
    expect(dots).toBeGreaterThan(50);
  });

  it('includes the L/J tetrominoes only when enabled', () => {
    expect(candidateWeights(emptyBoard(), []).shapes).toHaveLength(STANDARD_SHAPES.length);
    expect(candidateWeights(emptyBoard(), [], { includeL4: true }).shapes).toHaveLength(35);
  });
});

describe('solvable trio option', () => {
  it('detects whether pieces can be placed in some order', () => {
    // Free cells: column 7 in rows 0–6, and columns 3–7 in row 7.
    const board = boardFromAscii([
      '#######.',
      '#######.',
      '#######.',
      '#######.',
      '#######.',
      '#######.',
      '#######.',
      '###.....',
    ]);
    expect(canPlaceAllInSomeOrder(board, [getShape('i3h'), getShape('i2h')])).toBe(true);
    expect(canPlaceAllInSomeOrder(emptyBoard(), [])).toBe(true);
    expect(canPlaceAllInSomeOrder(board, [getShape('sq3')])).toBe(false);
  });

  it('only deals trios that can all be placed when enabled', () => {
    const cfg = { ...GENERATOR, solvableTrio: true };
    for (const r of dealMany(CROWDED, 30, 'solv', { cfg })) {
      if (r.usedFallback) continue;
      expect(canPlaceAllInSomeOrder(CROWDED, r.tray.map(slotShape))).toBe(true);
    }
  });
});
