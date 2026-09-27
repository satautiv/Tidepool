import { describe, expect, it } from 'vitest';
import { isLevel, levelBoard, parseLevel, type ValidationError } from './level';

const VALID = {
  id: 'shallows-003',
  area: 'shallows',
  index: 3,
  moves: 18,
  goals: [{ type: 'pearls', count: 1 }],
  stars: [4, 8],
  board: [
    '........',
    '..#P#...',
    '........',
    '...CC...',
    '........',
    '.B....B.',
    '##.####.',
    '...c....',
  ],
  colors: null,
  generator: { families: null, weights: null },
  tutorial: null,
};

/** Parses a variant of VALID and returns its messages (or [] if valid). */
function errorsOf(change: Record<string, unknown>): string[] {
  const result = parseLevel({ ...VALID, ...change });
  return isLevel(result) ? [] : (result as ValidationError[]).map((e) => `${e.path}: ${e.message}`);
}

describe('parseLevel', () => {
  it('accepts a valid level and normalises optional fields', () => {
    const level = parseLevel(VALID);
    expect(isLevel(level)).toBe(true);
    if (!isLevel(level)) return;
    expect(level.stars).toEqual([4, 8]);
    expect(level.tutorial).toBeNull();
    const minimal = parseLevel({
      ...VALID,
      colors: undefined,
      generator: undefined,
      tutorial: undefined,
    });
    expect(isLevel(minimal) && minimal.generator).toBeNull();
    expect(isLevel(parseLevel({ ...VALID, $schema: '../level.schema.json' }))).toBe(true);
  });

  it.each([['not an object', null, ': a level must be a JSON object']])(
    'rejects %s',
    (_, json, message) => {
      expect((parseLevel(json) as ValidationError[]).map((e) => `${e.path}: ${e.message}`)).toEqual(
        [message],
      );
    },
  );

  it.each<[string, Record<string, unknown>, RegExp]>([
    ['an unknown field', { movse: 3 }, /movse: unknown field "movse"/],
    ['a bad id', { id: 'Shallows_3' }, /id: id must look like/],
    [
      'an id not matching area/index',
      { id: 'shallows-004' },
      /doesn't match area and index \(expected "shallows-003"\)/,
    ],
    ['a bad area', { area: 'Coral Garden' }, /area: area must be lowercase/],
    ['a bad index', { index: 0 }, /index: index must be a whole number/],
    ['bad moves', { moves: 2.5 }, /moves: moves must be a whole number/],
    ['a short board', { board: VALID.board.slice(1) }, /board: board has 7 rows, needs 8/],
    [
      'a long row',
      { board: ['.........', ...VALID.board.slice(1)] },
      /board\[0\]: row 0 has 9 chars, needs 8/,
    ],
    [
      'an unknown character',
      { board: ['...X....', ...VALID.board.slice(1)] },
      /row 0, column 3: unknown character "X"/,
    ],
    [
      'a full row',
      { board: [...VALID.board.slice(0, 7), '###PC1#c'] },
      /board\[7\]: row 7 is already full/,
    ],
    [
      'a full column',
      { board: VALID.board.map((r) => `#${r.slice(1)}`) },
      /board: column 0 is already full/,
    ],
    ['no goals', { goals: [] }, /goals: goals must be a non-empty array/],
    [
      'an unknown goal',
      { goals: [{ type: 'shells', count: 1 }] },
      /goals\[0\].type: unknown goal type "shells"/,
    ],
    [
      'a zero count',
      { goals: [{ type: 'score', count: 0 }] },
      /goals\[0\].count: count must be a whole number/,
    ],
    [
      'a duplicate goal',
      {
        goals: [
          { type: 'score', count: 9 },
          { type: 'score', count: 5 },
        ],
      },
      /goals\[1\].type: goal "score" appears twice/,
    ],
    [
      'too many pearls',
      { goals: [{ type: 'pearls', count: 4 }] },
      /goal pearls=4 but the board has 1 pearls/,
    ],
    [
      'too many coral',
      { goals: [{ type: 'coral', count: 4 }] },
      /goal coral=4 but the board has 3 coral tiles/,
    ],
    [
      'too many bubbles',
      { goals: [{ type: 'bubbles', count: 3 }] },
      /goal bubbles=3 but the board has 2 bubbles/,
    ],
    ['a malformed goal', { goals: ['pearls'] }, /goals\[0\]: a goal must be an object/],
    ['stars not a pair', { stars: [4] }, /stars: stars must be \[movesLeftFor2Stars/],
    ['descending stars', { stars: [8, 4] }, /stars must be ascending \(got \[8, 4\]\)/],
    ['a zero 2★ threshold', { stars: [0, 4] }, /2★ threshold must be at least 1/],
    ['stars reaching moves', { stars: [4, 18] }, /3★ threshold \(18\) must be below moves \(18\)/],
    ['a bad colours grid', { colors: ['12'] }, /colors: colors must be null or 8 strings/],
    [
      'a bad colours row',
      { colors: [...Array(7).fill('........'), '1234567.'] },
      /colors\[7\]: colors row 7 must be/,
    ],
    [
      'a colour pin on a non-glass cell',
      { colors: [...Array(3).fill('........'), '...1....', ...Array(4).fill('........')] },
      /row 3, column 3: a colour pin needs a "#" or "P" cell, not "C"/,
    ],
    ['a bad generator', { generator: 'fast' }, /generator: generator must be null or/],
    ['bad families', { generator: { families: [1] } }, /generator.families: families must be null/],
    [
      'negative weights',
      { generator: { weights: { line: -1 } } },
      /generator.weights: weights must be null/,
    ],
    ['an unknown tutorial', { tutorial: 'kelp' }, /tutorial: tutorial must be null or a tile/],
  ])('reports %s', (_, change, expected) => {
    const errors = errorsOf(change);
    expect(
      errors.some((e) => expected.test(e)),
      errors.join('\n'),
    ).toBe(true);
  });

  it('reports every problem at once', () => {
    expect(errorsOf({ id: 'x', moves: 0, goals: [], stars: [9, 1] }).length).toBeGreaterThanOrEqual(
      4,
    );
  });
});

describe('levelBoard', () => {
  const level = parseLevel(VALID);
  if (!isLevel(level)) throw new Error('fixture must be valid');

  it('turns the legend into cells and tiles', () => {
    const cells = levelBoard(level).cells;
    expect(cells).toHaveLength(64);
    expect(cells[0]).toEqual({ color: null });
    expect(cells[11]!.tile).toEqual({ kind: 'pearl' });
    expect(cells[11]!.color).not.toBeNull();
    expect(cells[27]).toEqual({ color: null, tile: { kind: 'coral', hp: 2 } });
    expect(cells[59]).toEqual({ color: null, tile: { kind: 'coral', hp: 1 } });
    expect(cells[41]).toEqual({ color: null, tile: { kind: 'bubble' } });
  });

  it('seeds glass colours from the level id, so a level always looks the same', () => {
    const a = levelBoard(level).cells.map((c) => c.color);
    expect(levelBoard(level).cells.map((c) => c.color)).toEqual(a);
    const other = parseLevel({ ...VALID, id: 'shallows-004', index: 4 });
    if (!isLevel(other)) throw new Error('valid');
    expect(levelBoard(other).cells.map((c) => c.color)).not.toEqual(a);
  });

  it('honours digit cells and colour pins', () => {
    const pinned = parseLevel({
      ...VALID,
      board: ['1.6.....', ...VALID.board.slice(1)],
      colors: ['........', '..3.....', ...Array(6).fill('........')],
    });
    if (!isLevel(pinned)) throw new Error(JSON.stringify(pinned));
    const cells = levelBoard(pinned).cells;
    expect(cells[0]!.color).toBe(0);
    expect(cells[2]!.color).toBe(5);
    expect(cells[10]!.color).toBe(2); // the pinned "#"
  });
});
