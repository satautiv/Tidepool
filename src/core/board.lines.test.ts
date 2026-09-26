import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  boardFromAscii,
  boardToAscii,
  canPlace,
  clearLines,
  emptyBoard,
  filledCount,
  findFullLines,
  isEmpty,
  lineCells,
  lineCount,
  place,
  previewClears,
} from './board';
import { getShape } from './shapes';
import { boardArb, deepFreeze, positionArb, shapeArb } from './testing';

const resolve = (rows: string[]) => {
  const board = boardFromAscii(rows);
  const lines = findFullLines(board);
  return { lines, ...clearLines(board, lines) };
};

describe('findFullLines / clearLines', () => {
  it('finds nothing on a board without full lines', () => {
    const { lines, clearedCells, board } = resolve([
      '#######.',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '#.......',
      '........',
    ]);
    expect(lines).toEqual({ rows: [], cols: [] });
    expect(clearedCells).toEqual([]);
    expect(filledCount(board)).toBe(13);
  });

  it('clears a single row', () => {
    const { lines, clearedCells, board } = resolve([
      '........',
      '........',
      '##345###',
      '...1....',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(lines).toEqual({ rows: [2], cols: [] });
    expect(clearedCells).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
    expect(boardToAscii(board)).toEqual([
      '........',
      '........',
      '........',
      '...1....',
      '........',
      '........',
      '........',
      '........',
    ]);
  });

  it('clears a single column', () => {
    const { lines, clearedCells } = resolve([
      '.....#..',
      '.....#..',
      '.....#..',
      '.....#..',
      '.....#..',
      '.....#..',
      '.....#..',
      '.....#..',
    ]);
    expect(lines).toEqual({ rows: [], cols: [5] });
    expect(clearedCells).toHaveLength(8);
  });

  it('clears two parallel rows (16 cells)', () => {
    const { lines, clearedCells, board } = resolve([
      '........',
      '########',
      '########',
      '#.......',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(lineCount(lines)).toBe(2);
    expect(clearedCells).toHaveLength(16);
    expect(filledCount(board)).toBe(1);
  });

  it('counts a crossing row and column once each (15 unique cells, PLAN D1)', () => {
    const { lines, clearedCells } = resolve([
      '...#....',
      '...#....',
      '...#....',
      '########',
      '...#....',
      '...#....',
      '...#....',
      '...#....',
    ]);
    expect(lines).toEqual({ rows: [3], cols: [3] });
    expect(clearedCells).toHaveLength(15);
    expect(new Set(clearedCells).size).toBe(15);
  });

  it('clears three or more lines at once', () => {
    const { lines, clearedCells } = resolve([
      '##......',
      '##......',
      '########',
      '##......',
      '##......',
      '##......',
      '##......',
      '##......',
    ]);
    expect(lines).toEqual({ rows: [2], cols: [0, 1] });
    expect(clearedCells).toHaveLength(8 + 8 + 8 - 2);
  });

  it('empties a completely full board', () => {
    const { lines, board, clearedCells } = resolve(new Array<string>(8).fill('########'));
    expect(lineCount(lines)).toBe(16);
    expect(clearedCells).toHaveLength(64);
    expect(isEmpty(board)).toBe(true);
  });

  it('clears only filled cells when asked to clear a partial line (Wave booster)', () => {
    const board = boardFromAscii([
      '#.#.....',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    const { clearedCells, board: after } = clearLines(board, { rows: [0], cols: [] });
    expect(clearedCells).toEqual([0, 2]);
    expect(isEmpty(after)).toBe(true);
  });

  it('returns the same board when there is nothing to clear', () => {
    const board = emptyBoard();
    expect(clearLines(board, { rows: [], cols: [] }).board).toBe(board);
  });

  it('never mutates the input board', () => {
    const board = deepFreeze(boardFromAscii(new Array<string>(8).fill('########')));
    clearLines(board, findFullLines(board));
    expect(filledCount(board)).toBe(64);
  });
});

describe('lineCells', () => {
  it('lists unique cell indices in ascending order', () => {
    expect(lineCells({ rows: [0], cols: [0] })).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 16, 24, 32, 40, 48, 56,
    ]);
  });
});

describe('previewClears', () => {
  const almost = boardFromAscii([
    '######..',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);

  it('reports the lines a placement would clear', () => {
    expect(previewClears(almost, getShape('i2h'), 0, 6)).toEqual({ rows: [0], cols: [] });
    expect(previewClears(almost, getShape('i2h'), 1, 6)).toEqual({ rows: [], cols: [] });
  });

  it('reports nothing for an invalid placement', () => {
    expect(previewClears(almost, getShape('i3h'), 0, 5)).toEqual({ rows: [], cols: [] });
  });
});

describe('properties', () => {
  it('leaves no full lines after resolving', () => {
    fc.assert(
      fc.property(boardArb, (board) => {
        const { board: after } = clearLines(board, findFullLines(board));
        expect(findFullLines(after)).toEqual({ rows: [], cols: [] });
      }),
      { numRuns: 500 },
    );
  });

  it('clears exactly the unique cells of the full lines', () => {
    fc.assert(
      fc.property(boardArb, (board) => {
        const lines = findFullLines(board);
        const { board: after, clearedCells } = clearLines(board, lines);
        expect(clearedCells).toEqual(lineCells(lines));
        expect(filledCount(after)).toBe(filledCount(board) - clearedCells.length);
      }),
      { numRuns: 500 },
    );
  });

  it('previewClears matches placing and then finding full lines', () => {
    fc.assert(
      fc.property(boardArb, shapeArb, positionArb, (board, shape, [r, c]) => {
        fc.pre(canPlace(board, shape, r, c));
        expect(previewClears(board, shape, r, c)).toEqual(
          findFullLines(place(board, shape, r, c, 3)),
        );
      }),
      { numRuns: 500 },
    );
  });
});
