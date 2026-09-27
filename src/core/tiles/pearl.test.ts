import { describe, expect, it } from 'vitest';
import {
  boardFromAscii,
  canPlace,
  cellIndex,
  clearLines,
  findFullLines,
  type Board,
  type Cell,
} from '../board';
import { newEndless, placePiece, type EndlessState } from '../game';
import { parseLevel, levelBoard } from '../level';
import { getShape } from '../shapes';

const pearl = (color = 3): Cell => ({ color, tile: { kind: 'pearl' } });

function withPearls(rows: string[], at: Array<[number, number]>): Board {
  const cells = boardFromAscii(rows).cells.slice();
  for (const [r, c] of at) cells[cellIndex(r, c)] = pearl();
  return { cells };
}

const EMPTY = '........';

describe('pearl tile', () => {
  it('is filled glass: blocks placement and completes lines', () => {
    const board = withPearls(['###.####', ...Array<string>(7).fill(EMPTY)], [[0, 3]]);
    expect(canPlace(board, getShape('dot'), 0, 3)).toBe(false);
    expect(findFullLines(board)).toEqual({ rows: [0], cols: [] });
  });

  it('is collected when its row clears, and the cell empties', () => {
    const board = withPearls(['###.####', ...Array<string>(7).fill(EMPTY)], [[0, 3]]);
    const result = clearLines(board, findFullLines(board));
    expect(result.tileEvents).toEqual([{ type: 'pearlCollected', index: 3 }]);
    expect(result.board.cells[3]).toEqual({ color: null });
    expect(result.clearedCells).toContain(3);
    expect(result.clearedCells).toHaveLength(8);
  });

  it('is collected once when a cleared row and column both contain it', () => {
    const rows = Array<string>(8).fill('..#.....');
    rows[4] = '########';
    const board = withPearls(rows, [[4, 2]]);
    const lines = findFullLines(board);
    expect(lines).toEqual({ rows: [4], cols: [2] });
    const result = clearLines(board, lines);
    expect(result.tileEvents).toEqual([{ type: 'pearlCollected', index: cellIndex(4, 2) }]);
    expect(result.clearedCells).toHaveLength(15);
  });

  it('stays when its lines do not clear', () => {
    const rows = ['########', '#.......', ...Array<string>(6).fill(EMPTY)];
    const board = withPearls(rows, [[1, 0]]);
    const result = clearLines(board, findFullLines(board));
    expect(result.tileEvents).toEqual([]);
    expect(result.board.cells[cellIndex(1, 0)]).toEqual(pearl());
  });

  it('reports pearlCollected from a game move on a level board', () => {
    const level = parseLevel({
      id: 'shallows-900',
      area: 'shallows',
      index: 900,
      moves: 10,
      goals: [{ type: 'pearls', count: 1 }],
      stars: [2, 4],
      board: ['##P####.', EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    });
    if (Array.isArray(level)) throw new Error(JSON.stringify(level));
    const start = newEndless('pearl').state;
    const state: EndlessState = {
      ...start,
      board: levelBoard(level),
      tray: [{ shape: 'dot', color: 0 }, null, null],
    };
    const step = placePiece(state, 0, 0, 7);
    if ('error' in step) throw new Error(step.error);
    expect(step.events.filter((e) => e.type === 'pearlCollected')).toEqual([
      { type: 'pearlCollected', index: 2 },
    ]);
    expect(step.state.board.cells[2]!.tile).toBeUndefined();
  });
});
