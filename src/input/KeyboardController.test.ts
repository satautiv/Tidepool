import { describe, expect, it } from 'vitest';
import { boardFromAscii, canPlace, type Board } from '../core/board';
import { getShape } from '../core/shapes';
import { KeyboardController } from './KeyboardController';

function setup(rows: string[], tray: (string | null)[]) {
  const board: Board = boardFromAscii(rows);
  return new KeyboardController({
    pieceOf: (slot) => (tray[slot] ? getShape(tray[slot]!) : null),
    canPlace: (slot, row, col) => canPlace(board, getShape(tray[slot]!), row, col),
  });
}
const EMPTY = new Array<string>(8).fill('........');

describe('KeyboardController', () => {
  it('picks a piece at the valid spot nearest the centre', () => {
    const keys = setup(EMPTY, ['sq2', 'dot', null]);
    expect(keys.select(0)).toBe(true);
    expect(keys.state).toEqual({ slot: 0, row: 3, col: 3 });
    expect(keys.select(2)).toBe(false); // empty slot: keeps the selection
    expect(keys.state?.slot).toBe(0);
  });

  it('avoids occupied cells when picking', () => {
    const rows = [...EMPTY];
    rows[3] = '...##...';
    rows[4] = '...##...';
    const keys = setup(rows, ['sq2']);
    keys.select(0);
    const { row, col } = keys.state!;
    expect(row === 3 && col === 3).toBe(false);
  });

  it('moves by one, skipping spots where the piece does not fit', () => {
    const rows = [...EMPTY];
    rows[3] = '....#...';
    const keys = setup(rows, ['dot']);
    keys.select(0);
    expect(keys.state).toMatchObject({ row: 3, col: 3 });
    expect(keys.move(0, 1)).toBe(true);
    expect(keys.state).toMatchObject({ row: 3, col: 5 }); // jumped over the block
    expect(keys.move(-1, 0)).toBe(true);
    expect(keys.state).toMatchObject({ row: 2, col: 5 });
  });

  it('stays put at the edge', () => {
    const keys = setup(EMPTY, ['i5h']);
    keys.select(0);
    expect(keys.move(0, 1)).toBe(true);
    expect(keys.move(0, 1)).toBe(true);
    expect(keys.state?.col).toBe(3);
    expect(keys.move(0, 1)).toBe(false);
    expect(keys.state?.col).toBe(3);
  });

  it('confirms into a placement and cancels', () => {
    const keys = setup(EMPTY, ['dot']);
    expect(keys.confirm()).toBeNull();
    keys.select(0);
    expect(keys.confirm()).toEqual({ slot: 0, row: 3, col: 3 });
    expect(keys.state).toBeNull();
    keys.select(0);
    expect(keys.cancel()).toEqual({ slot: 0, row: 3, col: 3 });
    expect(keys.move(1, 0)).toBe(false);
  });

  it('refuses a piece that fits nowhere', () => {
    const full = new Array<string>(8).fill('########');
    expect(setup(full, ['dot']).select(0)).toBe(false);
  });
});
