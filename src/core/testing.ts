/** fast-check arbitraries shared by core tests. Test-only: never import from game code. */
import fc from 'fast-check';
import type { Board, Cell } from './board';
import { BOARD_SIZE, COLOR_COUNT } from './config';
import { STANDARD_SHAPES } from './shapes';

const cellArb = (fillRatio: number): fc.Arbitrary<Cell> =>
  fc
    .tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 0, max: COLOR_COUNT - 1 }))
    .map(([roll, color]): Cell => (roll < fillRatio ? { color } : { color: null }));

/** Random boards with a random fill ratio, so both open and crowded boards are covered. */
export const boardArb: fc.Arbitrary<Board> = fc
  .double({ min: 0, max: 1, noNaN: true })
  .chain((ratio) =>
    fc.array(cellArb(ratio), { minLength: BOARD_SIZE ** 2, maxLength: BOARD_SIZE ** 2 }),
  )
  .map((cells) => ({ cells }));

export const shapeArb = fc.constantFrom(...STANDARD_SHAPES);

/** Positions including out-of-bounds ones, to exercise the bounds checks. */
export const positionArb = fc.tuple(
  fc.integer({ min: -2, max: 9 }),
  fc.integer({ min: -2, max: 9 }),
);

export const colorArb = fc.integer({ min: 0, max: COLOR_COUNT - 1 });

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
