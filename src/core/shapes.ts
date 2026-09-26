/**
 * Piece shape catalogue (README §3.3, docs/PLAN.md §4.1).
 *
 * Shapes are written as ASCII art ('X' = cell) so the catalogue is easy to review.
 * Each rotation variant is its own shape; `rotateCW` links them (Rotate booster)
 * and is computed, not hand-written, so it can't get out of sync.
 */

export type ShapeId = string;
export type SizeClass = 'small' | 'medium' | 'large';
export type Cell = readonly [row: number, col: number];

export interface Shape {
  readonly id: ShapeId;
  /** Groups the rotation variants of one piece, e.g. 't4'. */
  readonly family: string;
  /** Normalized: the minimum row and column are both 0. Sorted row-major. */
  readonly cells: readonly Cell[];
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly sizeClass: SizeClass;
  /** The shape rotated 90° clockwise (itself for rotation-symmetric shapes). */
  readonly rotateCW: ShapeId;
}

export type ShapeDef = { id: ShapeId; family: string; art: readonly string[] };

const def = (id: ShapeId, family: string, art: readonly string[]): ShapeDef => ({
  id,
  family,
  art,
});

/** The 27 standard shapes. Corner/T/S/Z IDs name the elbow corner or the direction of the stem. */
const STANDARD_DEFS: readonly ShapeDef[] = [
  def('dot', 'dot', ['X']),

  def('i2h', 'line2', ['XX']),
  def('i2v', 'line2', ['X', 'X']),
  def('i3h', 'line3', ['XXX']),
  def('i3v', 'line3', ['X', 'X', 'X']),
  def('i4h', 'line4', ['XXXX']),
  def('i4v', 'line4', ['X', 'X', 'X', 'X']),
  def('i5h', 'line5', ['XXXXX']),
  def('i5v', 'line5', ['X', 'X', 'X', 'X', 'X']),

  def('sq2', 'square2', ['XX', 'XX']),
  def('sq3', 'square3', ['XXX', 'XXX', 'XXX']),

  // Small corners (3 cells), named by where the elbow sits.
  def('l3_nw', 'corner3', ['XX', 'X.']),
  def('l3_ne', 'corner3', ['XX', '.X']),
  def('l3_se', 'corner3', ['.X', 'XX']),
  def('l3_sw', 'corner3', ['X.', 'XX']),

  // Big corners (5 cells, 3 + 3 arms), named by where the elbow sits.
  def('l5_nw', 'corner5', ['XXX', 'X..', 'X..']),
  def('l5_ne', 'corner5', ['XXX', '..X', '..X']),
  def('l5_se', 'corner5', ['..X', '..X', 'XXX']),
  def('l5_sw', 'corner5', ['X..', 'X..', 'XXX']),

  // T tetrominoes, named by the direction the stem points.
  def('t4_u', 't4', ['.X.', 'XXX']),
  def('t4_r', 't4', ['X.', 'XX', 'X.']),
  def('t4_d', 't4', ['XXX', '.X.']),
  def('t4_l', 't4', ['.X', 'XX', '.X']),

  def('s4h', 's4', ['.XX', 'XX.']),
  def('s4v', 's4', ['X.', 'XX', '.X']),
  def('z4h', 'z4', ['XX.', '.XX']),
  def('z4v', 'z4', ['.X', 'XX', 'X.']),
];

/** Optional 4-cell L/J tetrominoes (PLAN §4.1), enabled by `SHAPES_CONFIG.includeL4`. */
const L4_DEFS: readonly ShapeDef[] = [
  def('l4_0', 'l4', ['X.', 'X.', 'XX']),
  def('l4_90', 'l4', ['XXX', 'X..']),
  def('l4_180', 'l4', ['XX', '.X', '.X']),
  def('l4_270', 'l4', ['..X', 'XXX']),
  def('j4_0', 'j4', ['.X', '.X', 'XX']),
  def('j4_90', 'j4', ['X..', 'XXX']),
  def('j4_180', 'j4', ['XX', 'X.', 'X.']),
  def('j4_270', 'j4', ['XXX', '..X']),
];

function parseArt(id: ShapeId, art: readonly string[]): Cell[] {
  const width = art[0]?.length ?? 0;
  const cells: Cell[] = [];
  art.forEach((line, r) => {
    if (line.length !== width) throw new Error(`Shape ${id}: ragged ASCII art`);
    [...line].forEach((ch, c) => {
      if (ch === 'X') cells.push([r, c]);
      else if (ch !== '.') throw new Error(`Shape ${id}: unexpected character '${ch}'`);
    });
  });
  if (cells.length === 0) throw new Error(`Shape ${id}: no cells`);
  return normalize(cells);
}

/** Shifts cells so the min row/col is 0, and sorts them row-major. */
export function normalize(cells: readonly Cell[]): Cell[] {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]): Cell => [r - minR, c - minC])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Rotates cells 90° clockwise: (r, c) → (c, maxRow − r). */
export function rotateCellsCW(cells: readonly Cell[]): Cell[] {
  const maxR = Math.max(...cells.map(([r]) => r));
  return normalize(cells.map(([r, c]): Cell => [c, maxR - r]));
}

export const cellsKey = (cells: readonly Cell[]): string =>
  normalize(cells)
    .map(([r, c]) => `${r},${c}`)
    .join(';');

function sizeClassOf(size: number): SizeClass {
  if (size <= 3) return 'small';
  if (size === 4) return 'medium';
  return 'large';
}

/** Parses and validates shape definitions. Exported for tests. */
export function buildShapes(defs: readonly ShapeDef[]): Shape[] {
  const parsed = defs.map((d) => ({ ...d, cells: parseArt(d.id, d.art) }));
  const byKey = new Map(parsed.map((p) => [cellsKey(p.cells), p.id]));
  if (byKey.size !== parsed.length) throw new Error('Shape catalogue has duplicate cell sets');

  return parsed.map(({ id, family, cells }) => {
    const rotateCW = byKey.get(cellsKey(rotateCellsCW(cells)));
    if (!rotateCW) throw new Error(`Shape ${id}: its clockwise rotation is not in the catalogue`);
    return {
      id,
      family,
      cells,
      width: Math.max(...cells.map(([, c]) => c)) + 1,
      height: Math.max(...cells.map(([r]) => r)) + 1,
      size: cells.length,
      sizeClass: sizeClassOf(cells.length),
      rotateCW,
    };
  });
}

/** The 27 standard shapes, in catalogue order. */
export const STANDARD_SHAPES: readonly Shape[] = buildShapes(STANDARD_DEFS);
/** The optional L/J tetrominoes. */
export const L4_SHAPES: readonly Shape[] = buildShapes(L4_DEFS);

/** Every known shape by ID, including optional ones, so saved games always resolve. */
export const SHAPES: ReadonlyMap<ShapeId, Shape> = new Map(
  [...STANDARD_SHAPES, ...L4_SHAPES].map((s) => [s.id, s]),
);

/** The shapes the generator may deal. */
export function shapeList(opts: { includeL4: boolean }): readonly Shape[] {
  return opts.includeL4 ? [...STANDARD_SHAPES, ...L4_SHAPES] : STANDARD_SHAPES;
}

export function getShape(id: ShapeId): Shape {
  const shape = SHAPES.get(id);
  if (!shape) throw new Error(`Unknown shape: ${id}`);
  return shape;
}
