import { describe, expect, it } from 'vitest';
import {
  createRng,
  nextFloat,
  nextInt,
  nextUint32,
  pickWeighted,
  RngCursor,
  shuffle,
  type RngState,
} from './rng';

function take(state: RngState, n: number): { values: number[]; state: RngState } {
  const values: number[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    let v: number;
    [v, s] = nextUint32(s);
    values.push(v);
  }
  return { values, state: s };
}

describe('createRng / nextUint32', () => {
  it('produces the pinned golden sequence for seed "tidepool"', () => {
    // Cross-checked against an independent Python implementation of cyrb128 + sfc32.
    expect(take(createRng('tidepool'), 10).values).toEqual([
      1892453447, 2053943127, 2744824427, 2575196272, 4062870130, 3893188597, 1618434304,
      3576395207, 3713310438, 3945069210,
    ]);
  });

  it('is deterministic for the same seed', () => {
    expect(take(createRng('daily-2026-09-26'), 50).values).toEqual(
      take(createRng('daily-2026-09-26'), 50).values,
    );
  });

  it('diverges for different seeds', () => {
    const a = take(createRng('a'), 10).values;
    const b = take(createRng('b'), 10).values;
    expect(a).not.toEqual(b);
    expect(a.filter((v, i) => v === b[i])).toHaveLength(0);
  });

  it('seeds numbers by their string form', () => {
    expect(createRng(42)).toEqual(createRng('42'));
  });

  it('keeps state as four uint32 values', () => {
    let s = createRng('x');
    for (let i = 0; i < 1000; i++) {
      [, s] = nextUint32(s);
      for (const part of s) {
        expect(Number.isInteger(part) && part >= 0 && part <= 0xffffffff).toBe(true);
      }
    }
  });

  it('never mutates the input state', () => {
    const s = Object.freeze(createRng('frozen')) as RngState;
    expect(() => nextUint32(s)).not.toThrow();
  });

  it('continues the same sequence after a JSON round-trip', () => {
    const { state } = take(createRng('save'), 25);
    const restored = JSON.parse(JSON.stringify(state)) as RngState;
    expect(take(restored, 20).values).toEqual(take(state, 20).values);
  });
});

describe('nextFloat', () => {
  it('stays in [0, 1)', () => {
    let s = createRng('floats');
    for (let i = 0; i < 10_000; i++) {
      let f: number;
      [f, s] = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('nextInt', () => {
  it('is roughly uniform (chi-square over 100k draws)', () => {
    const n = 10;
    const draws = 100_000;
    const counts = new Array<number>(n).fill(0);
    let s = createRng('uniform');
    for (let i = 0; i < draws; i++) {
      let v: number;
      [v, s] = nextInt(s, n);
      counts[v]!++;
    }
    const expected = draws / n;
    const chi2 = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: critical value at p = 0.001 is 27.88.
    expect(chi2).toBeLessThan(27.88);
  });

  it('returns 0 for n = 1', () => {
    expect(nextInt(createRng('one'), 1)[0]).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, 2 ** 33])('rejects n = %s', (n) => {
    expect(() => nextInt(createRng('bad'), n)).toThrow(RangeError);
  });
});

describe('pickWeighted', () => {
  it('respects weights within tolerance', () => {
    const items = ['a', 'b', 'c'] as const;
    const weights = [1, 2, 7];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    let s = createRng('weights');
    const draws = 50_000;
    for (let i = 0; i < draws; i++) {
      let v: string;
      [v, s] = pickWeighted(s, items, weights);
      counts[v]!++;
    }
    expect(counts.a! / draws).toBeCloseTo(0.1, 1);
    expect(counts.b! / draws).toBeCloseTo(0.2, 1);
    expect(counts.c! / draws).toBeCloseTo(0.7, 1);
  });

  it('never picks a zero-weight item', () => {
    let s = createRng('zero');
    for (let i = 0; i < 10_000; i++) {
      let v: string;
      [v, s] = pickWeighted(s, ['never', 'yes', 'never2', 'also'], [0, 1, 0, 3]);
      expect(v === 'yes' || v === 'also').toBe(true);
    }
  });

  it('works when the last item has zero weight', () => {
    let s = createRng('tail');
    for (let i = 0; i < 1_000; i++) {
      let v: string;
      [v, s] = pickWeighted(s, ['only', 'none'], [1, 0]);
      expect(v).toBe('only');
    }
  });

  it.each([
    [['a'], [1, 2]],
    [
      ['a', 'b'],
      [0, 0],
    ],
    [
      ['a', 'b'],
      [1, -1],
    ],
    [['a'], [Number.POSITIVE_INFINITY]],
    [[], []],
  ])('rejects invalid input %j / %j', (items, weights) => {
    expect(() => pickWeighted(createRng('bad'), items, weights)).toThrow(RangeError);
  });
});

describe('shuffle', () => {
  it('returns a permutation and leaves the input untouched', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const [out] = shuffle(createRng('shuffle'), input);
    expect(out).not.toBe(input);
    expect([...out].sort((a, b) => a - b)).toEqual([...input]);
  });

  it('is deterministic and actually shuffles', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const [a] = shuffle(createRng('s'), input);
    const [b] = shuffle(createRng('s'), input);
    expect(a).toEqual(b);
    expect(a).not.toEqual(input);
  });

  it('handles empty and single-item arrays', () => {
    expect(shuffle(createRng('e'), [])[0]).toEqual([]);
    expect(shuffle(createRng('e'), ['x'])[0]).toEqual(['x']);
  });
});

describe('RngCursor', () => {
  it('matches the functional API and exposes the final state', () => {
    const seed = createRng('cursor');
    const cursor = new RngCursor(seed);
    const values = [cursor.float(), cursor.int(6), cursor.pick(['x', 'y'], [1, 1])];

    const [f, s1] = nextFloat(seed);
    const [i, s2] = nextInt(s1, 6);
    const [p, s3] = pickWeighted(s2, ['x', 'y'], [1, 1]);

    expect(values).toEqual([f, i, p]);
    expect(cursor.state).toEqual(s3);
    expect(cursor.shuffle([1, 2, 3])).toEqual(shuffle(s3, [1, 2, 3])[0]);
  });
});
