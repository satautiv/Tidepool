import { describe, expect, it } from 'vitest';
import { getShape } from '../../src/core/shapes';
import { evaluatePlacement, greedyBot, randomBot } from './bots';
import { distribution, formatReport, simulate } from './simulate';

describe('simulator', () => {
  it('plays 200 greedy games with zero unfair deals (CI invariant)', () => {
    const report = simulate({ games: 200, seed: 'ci', bot: greedyBot });
    expect(report.unfairDeals).toBe(0);
    expect(report.cappedGames).toBe(0);
    expect(report.games).toBe(200);
    expect(report.gameOverFullness.reduce((a, b) => a + b, 0)).toBe(200);
    expect(report.score.mean).toBeGreaterThan(0);
  }, 30_000);

  it('is deterministic for a fixed seed', () => {
    const a = simulate({ games: 15, seed: 'det', bot: greedyBot });
    const b = simulate({ games: 15, seed: 'det', bot: greedyBot });
    expect(a).toEqual(b);
  });

  it('greedy clearly outplays random', () => {
    const greedy = simulate({ games: 30, seed: 'cmp', bot: greedyBot });
    const random = simulate({ games: 30, seed: 'cmp', bot: randomBot });
    expect(random.unfairDeals).toBe(0);
    expect(greedy.placed.mean).toBeGreaterThan(random.placed.mean * 2);
  });

  it('respects the move cap', () => {
    const report = simulate({ games: 3, seed: 'cap', bot: greedyBot, maxMoves: 5 });
    expect(report.cappedGames).toBe(3);
    expect(report.placed.max).toBe(5);
  });

  it('formats a readable report', () => {
    const text = formatReport(simulate({ games: 5, seed: 'fmt', bot: randomBot }));
    expect(text).toContain('Unfair deals     0  ✓');
    expect(text).toContain('Shape frequency');
  });
});

describe('distribution', () => {
  it('computes summary statistics', () => {
    expect(distribution([5, 1, 3, 2, 4, 6, 7, 8, 9, 10])).toEqual({
      mean: 5.5,
      median: 6,
      p90: 10,
      min: 1,
      max: 10,
    });
    expect(distribution([])).toEqual({ mean: 0, median: 0, p90: 0, min: 0, max: 0 });
  });
});

describe('evaluatePlacement', () => {
  it('prefers completing a line over leaving it open', () => {
    const occ = new Uint8Array(64);
    for (let c = 0; c < 6; c++) occ[c] = 1;
    const i2h = getShape('i2h');
    expect(evaluatePlacement(occ, i2h, 0, 6)).toBeGreaterThan(evaluatePlacement(occ, i2h, 4, 3));
  });

  it('penalizes walling in a single empty cell', () => {
    // (1,0) is filled. A dot at (0,1) leaves (0,0) enclosed by the walls, (0,1) and (1,0).
    const occ = new Uint8Array(64);
    occ[8] = 1;
    const dot = getShape('dot');
    expect(evaluatePlacement(occ, dot, 0, 1)).toBeLessThan(evaluatePlacement(occ, dot, 1, 1));
  });
});
