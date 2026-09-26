import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allFits,
  anyFit,
  boardFromAscii,
  boardToAscii,
  canPlace,
  cellIndex,
  emptyBoard,
  filledCount,
  fullness,
  getCell,
  isEmpty,
  place,
} from './board';
import { getShape, STANDARD_SHAPES } from './shapes';
import { boardArb, colorArb, deepFreeze, positionArb, shapeArb } from './testing';

const FULL_EXCEPT_CORNER = [
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '########',
  '#######.',
];

describe('emptyBoard', () => {
  it('has 64 empty cells', () => {
    const b = emptyBoard();
    expect(b.cells).toHaveLength(64);
    expect(isEmpty(b)).toBe(true);
    expect(fullness(b)).toBe(0);
  });
});

describe('canPlace', () => {
  it('accepts every shape in every corner of an empty board', () => {
    const b = emptyBoard();
    for (const s of STANDARD_SHAPES) {
      expect(canPlace(b, s, 0, 0)).toBe(true);
      expect(canPlace(b, s, 0, 8 - s.width)).toBe(true);
      expect(canPlace(b, s, 8 - s.height, 0)).toBe(true);
      expect(canPlace(b, s, 8 - s.height, 8 - s.width)).toBe(true);
    }
  });

  it('rejects placements that stick out of the board', () => {
    const b = emptyBoard();
    const line5 = getShape('i5h');
    expect(canPlace(b, line5, 0, 3)).toBe(true);
    expect(canPlace(b, line5, 0, 4)).toBe(false);
    expect(canPlace(b, line5, -1, 0)).toBe(false);
    expect(canPlace(b, line5, 8, 0)).toBe(false);
    expect(canPlace(b, getShape('i5v'), 4, 0)).toBe(false);
  });

  it('rejects overlap with filled cells', () => {
    const b = boardFromAscii([
      '........',
      '.#......',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(canPlace(b, getShape('sq2'), 0, 0)).toBe(false);
    expect(canPlace(b, getShape('sq2'), 0, 2)).toBe(true);
  });

  it('lets a shape wrap around a filled cell it does not cover', () => {
    // l3_nw covers (0,0) (0,1) (1,0), leaving (1,1) free.
    const b = boardFromAscii([
      '........',
      '.#......',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    expect(canPlace(b, getShape('l3_nw'), 0, 0)).toBe(true);
  });
});

describe('place', () => {
  it('fills the shape cells with the colour', () => {
    const b = place(emptyBoard(), getShape('t4_u'), 2, 3, 4);
    expect(boardToAscii(b)).toEqual([
      '........',
      '........',
      '....4...',
      '...444..',
      '........',
      '........',
      '........',
      '........',
    ]);
  });

  it('throws on invalid placements and colours', () => {
    const b = boardFromAscii(FULL_EXCEPT_CORNER);
    expect(() => place(b, getShape('i2h'), 7, 6, 0)).toThrow('Cannot place');
    expect(() => place(b, getShape('dot'), 7, 7, 6)).toThrow('Invalid colour');
    expect(() => place(b, getShape('dot'), 7, 7, -1)).toThrow('Invalid colour');
  });

  it('never mutates the input board', () => {
    const b = deepFreeze(emptyBoard());
    const after = place(b, getShape('sq3'), 0, 0, 1);
    expect(isEmpty(b)).toBe(true);
    expect(filledCount(after)).toBe(9);
  });
});

describe('fit queries', () => {
  it('finds the only fitting spot', () => {
    const b = boardFromAscii(FULL_EXCEPT_CORNER);
    expect(allFits(b, getShape('dot'))).toEqual([[7, 7]]);
    expect(anyFit(b, getShape('dot'))).toBe(true);
    expect(anyFit(b, getShape('i2h'))).toBe(false);
    expect(allFits(b, getShape('i2h'))).toEqual([]);
  });

  it('counts every position on an empty board', () => {
    const b = emptyBoard();
    expect(allFits(b, getShape('dot'))).toHaveLength(64);
    expect(allFits(b, getShape('sq3'))).toHaveLength(36);
    expect(allFits(b, getShape('i5h'))).toHaveLength(32);
  });
});

describe('fullness', () => {
  it('reports the filled ratio', () => {
    expect(fullness(boardFromAscii(FULL_EXCEPT_CORNER))).toBeCloseTo(63 / 64);
    expect(filledCount(boardFromAscii(FULL_EXCEPT_CORNER))).toBe(63);
  });
});

describe('getCell', () => {
  it('reads cells and rejects out-of-bounds coordinates', () => {
    const b = place(emptyBoard(), getShape('dot'), 3, 5, 2);
    expect(getCell(b, 3, 5).color).toBe(2);
    expect(getCell(b, 0, 0).color).toBeNull();
    expect(() => getCell(b, 0, 8)).toThrow(RangeError);
    expect(() => getCell(b, -1, 0)).toThrow(RangeError);
  });
});

describe('ASCII helpers', () => {
  it('round-trips digits and maps # to colour 0', () => {
    const rows = [
      '0123450.',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.......5',
    ];
    expect(boardToAscii(boardFromAscii(rows))).toEqual(rows);
    expect(getCell(boardFromAscii(FULL_EXCEPT_CORNER), 0, 0).color).toBe(0);
  });

  it.each([
    [['........'], 'Expected 8 rows'],
    [[...FULL_EXCEPT_CORNER.slice(0, 7), '.......'], 'Row 7 has 7 characters'],
    [[...FULL_EXCEPT_CORNER.slice(0, 7), '.......x'], "unexpected character 'x'"],
    [[...FULL_EXCEPT_CORNER.slice(0, 7), '.......6'], "unexpected character '6'"],
  ])('rejects malformed input %#', (rows, message) => {
    expect(() => boardFromAscii(rows)).toThrow(message);
  });
});

describe('properties', () => {
  it('placement never overwrites filled cells and adds exactly shape.size cells', () => {
    fc.assert(
      fc.property(boardArb, shapeArb, positionArb, colorArb, (board, shape, [r, c], color) => {
        fc.pre(canPlace(board, shape, r, c));
        const after = place(board, shape, r, c, color);
        expect(filledCount(after)).toBe(filledCount(board) + shape.size);
        board.cells.forEach((cell, i) => {
          if (cell.color !== null) expect(after.cells[i]).toBe(cell);
        });
        for (const [dr, dc] of shape.cells) {
          expect(after.cells[cellIndex(r + dr, c + dc)]!.color).toBe(color);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('anyFit agrees with allFits, and every reported fit is placeable', () => {
    fc.assert(
      fc.property(boardArb, shapeArb, (board, shape) => {
        const fits = allFits(board, shape);
        expect(anyFit(board, shape)).toBe(fits.length > 0);
        for (const [r, c] of fits) expect(canPlace(board, shape, r, c)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('canPlace is false whenever any shape cell is outside the board', () => {
    fc.assert(
      fc.property(boardArb, shapeArb, positionArb, (board, shape, [r, c]) => {
        const outside = shape.cells.some(
          ([dr, dc]) => r + dr < 0 || r + dr > 7 || c + dc < 0 || c + dc > 7,
        );
        if (outside) expect(canPlace(board, shape, r, c)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});
