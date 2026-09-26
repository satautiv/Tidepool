import { describe, expect, it } from 'vitest';
import { SHAPES_CONFIG } from './config';
import {
  buildShapes,
  cellsKey,
  getShape,
  L4_SHAPES,
  rotateCellsCW,
  SHAPES,
  shapeList,
  STANDARD_SHAPES,
  type Shape,
} from './shapes';

const ALL = [...STANDARD_SHAPES, ...L4_SHAPES];

describe('shape catalogue', () => {
  it('has the 27 standard shapes from PLAN §4.1', () => {
    expect(STANDARD_SHAPES).toHaveLength(27);
    const families = new Map<string, number>();
    for (const s of STANDARD_SHAPES) families.set(s.family, (families.get(s.family) ?? 0) + 1);
    expect(Object.fromEntries(families)).toEqual({
      dot: 1,
      line2: 2,
      line3: 2,
      line4: 2,
      line5: 2,
      square2: 1,
      square3: 1,
      corner3: 4,
      corner5: 4,
      t4: 4,
      s4: 2,
      z4: 2,
    });
  });

  it('has unique IDs and unique cell sets', () => {
    expect(new Set(ALL.map((s) => s.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((s) => cellsKey(s.cells))).size).toBe(ALL.length);
    expect(SHAPES.size).toBe(ALL.length);
  });

  it('uses only the sizes the README allows (1–5 and 9)', () => {
    expect(new Set(STANDARD_SHAPES.map((s) => s.size))).toEqual(new Set([1, 2, 3, 4, 5, 9]));
  });

  it.each(ALL.map((s) => [s.id, s] as const))('%s is well-formed', (_id, s: Shape) => {
    expect(s.size).toBe(s.cells.length);
    expect(Math.min(...s.cells.map(([r]) => r))).toBe(0);
    expect(Math.min(...s.cells.map(([, c]) => c))).toBe(0);
    expect(new Set(s.cells.map(([r, c]) => `${r},${c}`)).size).toBe(s.size);
    expect(Math.max(...s.cells.map(([r]) => r))).toBe(s.height - 1);
    expect(Math.max(...s.cells.map(([, c]) => c))).toBe(s.width - 1);
    expect(s.sizeClass).toBe(s.size <= 3 ? 'small' : s.size === 4 ? 'medium' : 'large');
  });

  it('has the expected size classes', () => {
    expect(getShape('dot').sizeClass).toBe('small');
    expect(getShape('l3_ne').sizeClass).toBe('small');
    expect(getShape('sq2').sizeClass).toBe('medium');
    expect(getShape('i5h').sizeClass).toBe('large');
    expect(getShape('sq3').sizeClass).toBe('large');
  });

  it('draws shapes as specified (spot check)', () => {
    expect(getShape('l5_ne').cells).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(getShape('t4_u').cells).toEqual([
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });
});

describe('rotation', () => {
  it.each(ALL.map((s) => [s.id]))('%s returns to itself after four clockwise turns', (id) => {
    let cur = getShape(id);
    for (let i = 0; i < 4; i++) cur = getShape(cur.rotateCW);
    expect(cur.id).toBe(id);
  });

  it.each(ALL.map((s) => [s.id]))('%s rotateCW matches the rotated cells', (id) => {
    const s = getShape(id);
    expect(cellsKey(getShape(s.rotateCW).cells)).toBe(cellsKey(rotateCellsCW(s.cells)));
  });

  it('keeps rotations within the same family', () => {
    for (const s of ALL) expect(getShape(s.rotateCW).family).toBe(s.family);
  });

  it('maps symmetric shapes to themselves and swaps line orientations', () => {
    expect(getShape('dot').rotateCW).toBe('dot');
    expect(getShape('sq2').rotateCW).toBe('sq2');
    expect(getShape('sq3').rotateCW).toBe('sq3');
    expect(getShape('i4h').rotateCW).toBe('i4v');
    expect(getShape('i4v').rotateCW).toBe('i4h');
    expect(getShape('t4_u').rotateCW).toBe('t4_r');
    expect(getShape('l3_nw').rotateCW).toBe('l3_ne');
  });

  it('rotates cells clockwise', () => {
    // X.      XXX
    // X.  ->  X..
    // XX
    expect(rotateCellsCW(getShape('l4_0').cells)).toEqual(getShape('l4_90').cells);
  });
});

describe('shapeList / getShape', () => {
  it('excludes the L/J tetrominoes unless enabled', () => {
    expect(SHAPES_CONFIG.includeL4).toBe(false);
    expect(shapeList({ includeL4: false })).toHaveLength(27);
    expect(shapeList({ includeL4: true })).toHaveLength(35);
  });

  it('throws for unknown IDs', () => {
    expect(() => getShape('nope')).toThrow('Unknown shape: nope');
  });
});

describe('buildShapes validation', () => {
  const d = (id: string, art: string[], family = 'f') => ({ id, family, art });

  it.each([
    ['ragged art', [d('a', ['XX', 'X'])], 'ragged ASCII art'],
    ['unknown characters', [d('a', ['X#'])], "unexpected character '#'"],
    ['empty shapes', [d('a', ['..'])], 'no cells'],
    ['duplicate cell sets', [d('a', ['X']), d('b', ['.X'])], 'duplicate cell sets'],
    ['missing rotations', [d('a', ['XX'])], 'clockwise rotation is not in the catalogue'],
  ])('rejects %s', (_name, defs, message) => {
    expect(() => buildShapes(defs)).toThrow(message);
  });
});
