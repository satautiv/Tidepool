import { afterEach, describe, expect, it } from 'vitest';
import {
  boardFromAscii,
  canPlace,
  cellIndex,
  clearLines,
  countsAsFilled,
  findFullLines,
  isBlocking,
  placeWithTiles,
  type Board,
  type Cell,
} from './board';
import { newEndless, placePiece, type EndlessState } from './game';
import { getShape } from './shapes';
import { defineTile, EMPTY_CELL, tileBehaviour, type TileState } from './tiles';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((undo) => undo()));

/** A tile of a test-only kind (not part of the real union). */
const testTile = (kind: string, extra: object = {}) => ({ kind, ...extra }) as unknown as TileState;

/**
 * Dummy tiles proving the hook pipeline:
 * - `t-clear`: clears and reports a pearlCollected
 * - `t-stay`: survives every clear unchanged
 * - `t-transform`: turns into plain glass of colour 5 (like frozen thawing)
 * - `t-float`: doesn't block; a piece landing on it removes the tile (like a bubble)
 */
function defineDummies() {
  const solid = { blocksPlacement: () => true, countsAsFilled: () => true };
  cleanups.push(
    defineTile('t-clear', {
      ...solid,
      onLineClear: (_cell, { index }) => ({
        cell: EMPTY_CELL,
        events: [{ type: 'pearlCollected', index }],
      }),
    }),
    defineTile('t-stay', { ...solid, onLineClear: (cell) => ({ cell, events: [] }) }),
    defineTile('t-transform', {
      ...solid,
      onLineClear: (_cell, { index }) => ({
        cell: { color: 5 },
        events: [{ type: 'coralCracked', index }],
      }),
    }),
    defineTile('t-float', {
      blocksPlacement: (cell) => cell.color !== null,
      countsAsFilled: (cell) => cell.color !== null,
      onPlacedOver: (cell, index) => ({
        cell: { color: cell.color },
        events: [{ type: 'bubblePopped', index }],
      }),
    }),
  );
}

/** Row 0 full of glass, with tiles at the given columns. */
function rowWithTiles(tiles: Record<number, Cell>): Board {
  const board = boardFromAscii(['########', ...Array<string>(7).fill('........')]);
  const cells = board.cells.slice();
  for (const [col, cell] of Object.entries(tiles)) cells[Number(col)] = cell;
  return { cells };
}

describe('tile hooks', () => {
  it('delegate blocking and line filling to the tile behaviour', () => {
    defineDummies();
    const floatEmpty: Cell = { color: null, tile: testTile('t-float') };
    const solidNoColour: Cell = { color: null, tile: testTile('t-stay') };
    expect(isBlocking(floatEmpty)).toBe(false);
    expect(countsAsFilled(floatEmpty)).toBe(false);
    expect(isBlocking(solidNoColour)).toBe(true);
    expect(countsAsFilled(solidNoColour)).toBe(true);
    // Unknown kinds fall back to the cell's glass.
    expect(isBlocking({ color: null, tile: testTile('nope') })).toBe(false);
    expect(isBlocking({ color: 2, tile: testTile('nope') })).toBe(true);
  });

  it('let a line clear clear, keep or transform tile cells', () => {
    defineDummies();
    const board = rowWithTiles({
      1: { color: 0, tile: testTile('t-clear') },
      3: { color: null, tile: testTile('t-stay') },
      5: { color: 0, tile: testTile('t-transform') },
    });
    const lines = findFullLines(board);
    expect(lines).toEqual({ rows: [0], cols: [] });
    const result = clearLines(board, lines);

    expect(result.board.cells[1]).toEqual(EMPTY_CELL);
    expect(result.board.cells[3]).toBe(board.cells[3]);
    expect(result.board.cells[5]).toEqual({ color: 5 });
    // Kept and transformed cells are not "cleared" (they aren't empty).
    expect(result.clearedCells).toEqual([0, 1, 2, 4, 6, 7]);
    expect(result.tileEvents).toEqual([
      { type: 'pearlCollected', index: 1 },
      { type: 'coralCracked', index: 5 },
    ]);
    // The surviving tile still fills its cell: the row is not left full.
    expect(findFullLines(result.board)).toEqual({ rows: [], cols: [] });
  });

  it('resolve a cell once where a cleared row and column cross (D1)', () => {
    defineDummies();
    const rows = Array<string>(8).fill('#.......');
    rows[0] = '########';
    const base = boardFromAscii(rows);
    const cells = base.cells.slice();
    cells[0] = { color: 0, tile: testTile('t-clear') };
    const result = clearLines({ cells }, findFullLines({ cells }));
    expect(result.tileEvents).toEqual([{ type: 'pearlCollected', index: 0 }]);
    expect(result.clearedCells).toHaveLength(15);
  });

  it('run onPlacedOver for tiles under a placed piece', () => {
    defineDummies();
    const cells = boardFromAscii(Array<string>(8).fill('........')).cells.slice();
    cells[cellIndex(2, 3)] = { color: null, tile: testTile('t-float') };
    const board: Board = { cells };
    const i2h = getShape('i2h');
    expect(canPlace(board, i2h, 2, 2)).toBe(true);
    const { board: after, tileEvents } = placeWithTiles(board, i2h, 2, 2, 4);
    expect(after.cells[cellIndex(2, 3)]).toEqual({ color: 4 });
    expect(after.cells[cellIndex(2, 2)]).toEqual({ color: 4 });
    expect(tileEvents).toEqual([{ type: 'bubblePopped', index: cellIndex(2, 3) }]);
  });

  it('emit tile events from a game move, after the placement and after the clear', () => {
    defineDummies();
    const start = newEndless('tiles').state;
    const rows = ['#######.', ...Array<string>(7).fill('........')];
    const cells = boardFromAscii(rows).cells.slice();
    cells[2] = { color: 0, tile: testTile('t-clear') };
    cells[cellIndex(3, 3)] = { color: null, tile: testTile('t-float') };
    const state: EndlessState = {
      ...start,
      board: { cells },
      tray: [{ shape: 'dot', color: 1 }, { shape: 'dot', color: 2 }, null],
    };
    const first = placePiece(state, 1, 3, 3);
    if ('error' in first) throw new Error(first.error);
    expect(first.events.map((e) => e.type)).toEqual(['placed', 'bubblePopped']);

    const second = placePiece(first.state, 0, 0, 7);
    if ('error' in second) throw new Error(second.error);
    expect(second.events.slice(0, 3)).toMatchObject([
      { type: 'placed' },
      { type: 'cleared', cells: [0, 1, 2, 3, 4, 5, 6, 7] },
      { type: 'pearlCollected', index: 2 },
    ]);
  });
});

describe('built-in tile rules (PLAN §14.2)', () => {
  it('pearl, coral, urchin and frozen block and fill; a bubble over sand does neither', () => {
    const solid: TileState[] = [
      { kind: 'pearl' },
      { kind: 'coral', hp: 2 },
      { kind: 'coral', hp: 1 },
      { kind: 'urchin' },
      { kind: 'frozen' },
    ];
    for (const tile of solid) {
      const cell: Cell = {
        color: tile.kind === 'coral' || tile.kind === 'urchin' ? null : 1,
        tile,
      };
      expect(isBlocking(cell), tile.kind).toBe(true);
      expect(countsAsFilled(cell), tile.kind).toBe(true);
    }
    const bubble: Cell = { color: null, tile: { kind: 'bubble' } };
    expect(isBlocking(bubble)).toBe(false);
    expect(countsAsFilled(bubble)).toBe(false);
    expect(tileBehaviour({ kind: 'unknown' })).toBeUndefined();
  });
});
