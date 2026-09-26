import { describe, expect, it } from 'vitest';
import {
  callouts,
  clearPoints,
  endTraySet,
  multiplier,
  placementPoints,
  scorePlacement,
} from './scoring';

describe('placementPoints', () => {
  it('gives one point per cell', () => {
    expect(placementPoints(1)).toBe(1);
    expect(placementPoints(9)).toBe(9);
  });
});

describe('multiplier', () => {
  it.each([
    [0, 1],
    [1, 1.5],
    [2, 2],
    [3, 2.5],
    [5, 3.5],
    [6, 4],
    [7, 4],
    [100, 4],
  ])('streak %i → ×%s', (streak, expected) => {
    expect(multiplier(streak)).toBe(expected);
  });
});

describe('clearPoints', () => {
  it('is zero with no lines', () => {
    expect(clearPoints(0, 0, 3)).toBe(0);
  });

  it('always yields whole points (half-step multipliers × 10 points per cell)', () => {
    for (let streak = 0; streak <= 8; streak++) {
      for (let cells = 1; cells <= 64; cells++) {
        expect(Number.isInteger(clearPoints(cells, 1 + (cells % 4), streak))).toBe(true);
      }
    }
  });
});

describe('PLAN §5.2 worked examples (streak 0)', () => {
  const score = (shapeSize: number, cells: number, lines: number, streak = 0, empty = false) =>
    scorePlacement({
      shapeSize,
      uniqueCellsCleared: cells,
      linesCleared: lines,
      streak,
      boardEmptyAfter: empty,
    }).total;

  it('place sq3, no clear → 9', () => expect(score(9, 0, 0)).toBe(9));
  it('place i2h completing 1 row → 82', () => expect(score(2, 8, 1)).toBe(82));
  it('complete 2 parallel rows → size + 320', () => expect(score(3, 16, 2)).toBe(3 + 320));
  it('row + column crossing → size + 300', () => expect(score(5, 15, 2)).toBe(5 + 300));
  it('row + column crossing at streak 2 (×2) → size + 600', () =>
    expect(score(5, 15, 2, 2)).toBe(5 + 600));
  it('README example: 2 lines, 16 cells → 320 before the multiplier', () =>
    expect(clearPoints(16, 2, 0)).toBe(320));
});

describe('scorePlacement', () => {
  it('adds the clean-board bonus without multiplying it or the placement points (D4, D5)', () => {
    const s = scorePlacement({
      shapeSize: 4,
      uniqueCellsCleared: 8,
      linesCleared: 1,
      streak: 2,
      boardEmptyAfter: true,
    });
    expect(s).toEqual({
      placement: 4,
      clear: 160,
      cleanBonus: 300,
      total: 464,
      multiplier: 2,
      callouts: ['crystalClear'],
    });
  });

  it('never awards the clean bonus without a clear', () => {
    const s = scorePlacement({
      shapeSize: 1,
      uniqueCellsCleared: 0,
      linesCleared: 0,
      streak: 0,
      boardEmptyAfter: true,
    });
    expect(s.cleanBonus).toBe(0);
    expect(s.callouts).toEqual([]);
  });
});

describe('callouts (D6)', () => {
  it.each([
    [1, false, []],
    [2, false, ['nice']],
    [3, false, ['splash']],
    [4, false, ['tidalWave']],
    [6, false, ['tidalWave']],
    [1, true, ['crystalClear']],
    [2, true, ['nice', 'crystalClear']],
  ] as const)('%i lines, clean=%s → %j', (lines, clean, expected) => {
    expect(callouts(lines, clean)).toEqual(expected);
  });
});

describe('endTraySet (D3)', () => {
  it('increments after a set with a clear and resets after a set without', () => {
    expect(endTraySet(0, true)).toBe(1);
    expect(endTraySet(4, true)).toBe(5);
    expect(endTraySet(4, false)).toBe(0);
    expect(endTraySet(0, false)).toBe(0);
  });

  it('builds the ×1, ×1.5, ×2 … ladder over consecutive sets', () => {
    let streak = 0;
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(multiplier(streak));
      streak = endTraySet(streak, true);
    }
    expect(seen).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 4]);
  });
});
