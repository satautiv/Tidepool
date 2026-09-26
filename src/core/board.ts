/**
 * The 8×8 board (README §3.1–3.2, docs/PLAN.md §4, §5.1).
 *
 * Pure functions over an immutable board: nothing here mutates its input.
 * Cells are stored row-major in a flat array (index = row * 8 + col).
 */
import { BOARD_SIZE, COLOR_COUNT } from './config';
import type { Shape } from './shapes';
import type { TileEffect, TileState } from './tiles';

export interface Cell {
  /** null = empty sand; 0..5 = sea-glass colour. */
  readonly color: number | null;
  /** Voyage special tile on this cell (T4.02). */
  readonly tile?: TileState;
}

export interface Board {
  readonly cells: readonly Cell[];
}

export type Position = readonly [row: number, col: number];

const EMPTY_CELL: Cell = Object.freeze({ color: null });
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export const cellIndex = (row: number, col: number): number => row * BOARD_SIZE + col;

export const inBounds = (row: number, col: number): boolean =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

export function emptyBoard(): Board {
  return { cells: new Array<Cell>(CELL_COUNT).fill(EMPTY_CELL) };
}

export function getCell(board: Board, row: number, col: number): Cell {
  const cell = board.cells[cellIndex(row, col)];
  if (!cell || !inBounds(row, col)) throw new RangeError(`Cell out of bounds: ${row},${col}`);
  return cell;
}

/** Whether a piece may not be placed on this cell. Tiles hook in here in T4.02. */
export function isBlocking(cell: Cell): boolean {
  return cell.color !== null;
}

/** Whether this cell counts towards completing a line. Tiles hook in here in T4.02. */
export function countsAsFilled(cell: Cell): boolean {
  return cell.color !== null;
}

/** True when every shape cell lands inside the board on a non-blocking cell. */
export function canPlace(board: Board, shape: Shape, row: number, col: number): boolean {
  if (!inBounds(row, col) || !inBounds(row + shape.height - 1, col + shape.width - 1)) {
    return false;
  }
  for (const [dr, dc] of shape.cells) {
    if (isBlocking(board.cells[cellIndex(row + dr, col + dc)]!)) return false;
  }
  return true;
}

/** Returns a new board with the shape placed. Throws if the placement is invalid; check `canPlace` first. */
export function place(board: Board, shape: Shape, row: number, col: number, color: number): Board {
  if (!Number.isInteger(color) || color < 0 || color >= COLOR_COUNT) {
    throw new RangeError(`Invalid colour: ${color}`);
  }
  if (!canPlace(board, shape, row, col)) {
    throw new Error(`Cannot place ${shape.id} at ${row},${col}`);
  }
  const cells = board.cells.slice();
  for (const [dr, dc] of shape.cells) {
    const i = cellIndex(row + dr, col + dc);
    cells[i] = { ...cells[i]!, color };
  }
  return { cells };
}

/** Every top-left position where the shape fits, row-major. */
export function allFits(board: Board, shape: Shape): Position[] {
  const fits: Position[] = [];
  for (let row = 0; row <= BOARD_SIZE - shape.height; row++) {
    for (let col = 0; col <= BOARD_SIZE - shape.width; col++) {
      if (canPlace(board, shape, row, col)) fits.push([row, col]);
    }
  }
  return fits;
}

/** Whether the shape fits anywhere (stops at the first fit). */
export function anyFit(board: Board, shape: Shape): boolean {
  for (let row = 0; row <= BOARD_SIZE - shape.height; row++) {
    for (let col = 0; col <= BOARD_SIZE - shape.width; col++) {
      if (canPlace(board, shape, row, col)) return true;
    }
  }
  return false;
}

export interface Lines {
  readonly rows: readonly number[];
  readonly cols: readonly number[];
}

export interface ClearResult {
  readonly board: Board;
  /** Indices of cells that became empty, ascending. Each cell appears once, even where lines cross. */
  readonly clearedCells: readonly number[];
  readonly tileEffects: readonly TileEffect[];
}

export const lineCount = (lines: Lines): number => lines.rows.length + lines.cols.length;

/** All completely filled rows and columns, ascending. */
export function findFullLines(board: Board): Lines {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    let rowFull = true;
    let colFull = true;
    for (let j = 0; j < BOARD_SIZE && (rowFull || colFull); j++) {
      if (rowFull && !countsAsFilled(board.cells[cellIndex(i, j)]!)) rowFull = false;
      if (colFull && !countsAsFilled(board.cells[cellIndex(j, i)]!)) colFull = false;
    }
    if (rowFull) rows.push(i);
    if (colFull) cols.push(i);
  }
  return { rows, cols };
}

/** The unique cell indices covered by the given lines, ascending. */
export function lineCells(lines: Lines): number[] {
  const set = new Set<number>();
  for (const r of lines.rows) for (let c = 0; c < BOARD_SIZE; c++) set.add(cellIndex(r, c));
  for (const c of lines.cols) for (let r = 0; r < BOARD_SIZE; r++) set.add(cellIndex(r, c));
  return [...set].sort((a, b) => a - b);
}

/**
 * Clears every cell in the given lines at once (PLAN D1: crossing lines share cells).
 * Tile hooks (coral surviving a hit, pearls collected, …) are added in T4.02.
 */
export function clearLines(board: Board, lines: Lines): ClearResult {
  const indices = lineCells(lines);
  if (indices.length === 0) return { board, clearedCells: [], tileEffects: [] };
  const cells = board.cells.slice();
  const clearedCells: number[] = [];
  for (const i of indices) {
    if (!countsAsFilled(cells[i]!)) continue;
    cells[i] = EMPTY_CELL;
    clearedCells.push(i);
  }
  return { board: { cells }, clearedCells, tileEffects: [] };
}

/** The lines that would clear if the shape were placed there; empty when it can't be placed. Drives the ghost highlight. */
export function previewClears(board: Board, shape: Shape, row: number, col: number): Lines {
  if (!canPlace(board, shape, row, col)) return { rows: [], cols: [] };
  return findFullLines(place(board, shape, row, col, 0));
}

export function filledCount(board: Board): number {
  let n = 0;
  for (const cell of board.cells) if (countsAsFilled(cell)) n++;
  return n;
}

/** Filled ratio, 0..1. Used by the generator to adapt piece sizes. */
export function fullness(board: Board): number {
  return filledCount(board) / CELL_COUNT;
}

export function isEmpty(board: Board): boolean {
  return filledCount(board) === 0;
}

/**
 * Builds a board from 8 rows of 8 characters: '.' empty, '#' colour 0, '0'–'5' that colour.
 * Intended for tests and debug tools.
 */
export function boardFromAscii(rows: readonly string[]): Board {
  if (rows.length !== BOARD_SIZE)
    throw new Error(`Expected ${BOARD_SIZE} rows, got ${rows.length}`);
  const cells: Cell[] = [];
  rows.forEach((line, r) => {
    if (line.length !== BOARD_SIZE) throw new Error(`Row ${r} has ${line.length} characters`);
    for (const ch of line) {
      if (ch === '.') cells.push(EMPTY_CELL);
      else if (ch === '#') cells.push({ color: 0 });
      else if (/^[0-9]$/.test(ch) && Number(ch) < COLOR_COUNT) cells.push({ color: Number(ch) });
      else throw new Error(`Row ${r}: unexpected character '${ch}'`);
    }
  });
  return { cells };
}

/** The inverse of `boardFromAscii`, using digits for colours. */
export function boardToAscii(board: Board): string[] {
  const rows: string[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let line = '';
    for (let c = 0; c < BOARD_SIZE; c++) {
      const { color } = board.cells[cellIndex(r, c)]!;
      line += color === null ? '.' : String(color);
    }
    rows.push(line);
  }
  return rows;
}
