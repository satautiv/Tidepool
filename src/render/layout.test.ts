import { describe, expect, it } from 'vitest';
import { STANDARD_SHAPES } from '../core/shapes';
import {
  boardBound,
  computeLayout,
  contentArea,
  LAYOUT,
  orientationOf,
  rectContains,
  rectsOverlap,
  type Insets,
  type Layout,
  type LayoutInput,
  type Rect,
} from './layout';

const VIEWPORTS: Array<[number, number]> = [
  [360, 640],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1024, 768],
  [800, 450],
  [960, 600],
  [1366, 768],
  [1920, 1080],
];
const DPRS = [1, 2, 3, 2.625];
const NOTCH: Insets = { top: 47, right: 0, bottom: 34, left: 0 };

const inside = (outer: Rect, inner: Rect, eps = 1e-6) =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.width <= outer.x + outer.width + eps &&
  inner.y + inner.height <= outer.y + outer.height + eps;

function checkInvariants(input: LayoutInput, l: Layout) {
  const area = contentArea(input);
  const dpr = input.dpr ?? 1;

  // Everything inside the safe content area.
  for (const r of [l.hud, l.board, l.boardFrame, l.tray, ...l.traySlots]) {
    expect(inside(area, r)).toBe(true);
  }
  expect(inside(l.boardFrame, l.board)).toBe(true);

  // No overlaps between HUD, board and tray; slots don't overlap each other.
  expect(rectsOverlap(l.hud, l.boardFrame, 1e-6)).toBe(false);
  expect(rectsOverlap(l.hud, l.tray, 1e-6)).toBe(false);
  expect(rectsOverlap(l.boardFrame, l.tray, 1e-6)).toBe(false);
  for (let i = 0; i < l.traySlots.length; i++) {
    for (let j = i + 1; j < l.traySlots.length; j++) {
      expect(rectsOverlap(l.traySlots[i]!, l.traySlots[j]!, 1e-6)).toBe(false);
    }
  }

  // Slots inside the tray, touch-friendly.
  expect(l.traySlots).toHaveLength(3);
  for (const s of l.traySlots) {
    expect(inside(l.tray, s)).toBe(true);
    expect(Math.min(s.width, s.height)).toBeGreaterThanOrEqual(44);
  }

  // Square board of 8 whole-device-pixel cells.
  expect(l.board.width).toBe(l.board.height);
  expect(l.board.width).toBeCloseTo(l.cellSize * 8);
  expect(Number.isInteger(Math.round(l.cellSize * dpr * 1e6) / 1e6)).toBe(true);

  // Every shape fits its tray slot at trayScale.
  for (const s of l.traySlots) {
    for (const shape of STANDARD_SHAPES) {
      expect(shape.width * l.cellSize * l.trayScale).toBeLessThanOrEqual(s.width);
      expect(shape.height * l.cellSize * l.trayScale).toBeLessThanOrEqual(s.height);
    }
  }

  // As large as possible: one more device pixel per cell would break the bound.
  const bound = boardBound(input);
  expect(l.board.width).toBeLessThanOrEqual(bound + 1e-9);
  expect(l.board.width + 8 / dpr).toBeGreaterThan(bound);
}

describe('computeLayout invariants', () => {
  for (const [w, h] of VIEWPORTS) {
    for (const dpr of DPRS) {
      it(`${w}×${h} @${dpr}x`, () => {
        const input = { width: w, height: h, dpr };
        checkInvariants(input, computeLayout(input));
      });
    }
    it(`${w}×${h} with notch safe areas`, () => {
      const input = { width: w, height: h, dpr: 3, safeArea: NOTCH };
      checkInvariants(input, computeLayout(input));
    });
  }
});

describe('orientation', () => {
  it('uses portrait at or below the aspect threshold', () => {
    expect(orientationOf(390, 844)).toBe('portrait');
    expect(orientationOf(800, 1000)).toBe('portrait');
    expect(orientationOf(801, 1000)).toBe('landscape');
    expect(orientationOf(1024, 768)).toBe('landscape');
    expect(orientationOf(100, 0)).toBe('landscape');
  });

  it('puts the tray below the board in portrait and beside it in landscape', () => {
    const p = computeLayout({ width: 390, height: 844 });
    expect(p.tray.y).toBeGreaterThan(p.board.y + p.board.height);
    expect(p.traySlots[1]!.x).toBeGreaterThan(p.traySlots[0]!.x);

    const l = computeLayout({ width: 1366, height: 768 });
    expect(l.tray.x).toBeGreaterThan(l.board.x + l.board.width);
    expect(l.traySlots[1]!.y).toBeGreaterThan(l.traySlots[0]!.y);
  });
});

describe('sizing', () => {
  it('caps the board on very large screens', () => {
    const l = computeLayout({ width: 3840, height: 2160, dpr: 1 });
    expect(l.board.width).toBeLessThanOrEqual(LAYOUT.maxBoard);
  });

  it('honours an explicit HUD height', () => {
    expect(computeLayout({ width: 390, height: 844, hudHeight: 100 }).hud.height).toBe(100);
  });

  it('degrades to an empty layout for a zero-size viewport', () => {
    const l = computeLayout({ width: 0, height: 0 });
    expect(l.cellSize).toBe(0);
    expect(l.trayScale).toBe(0);
  });

  it('matches the snapshot for common viewports', () => {
    const summary = VIEWPORTS.map(([w, h]) => {
      const l = computeLayout({ width: w, height: h, dpr: 2 });
      return {
        viewport: `${w}×${h}`,
        orientation: l.orientation,
        cellSize: l.cellSize,
        board: l.board,
        tray: l.tray,
        trayScale: Number(l.trayScale.toFixed(3)),
      };
    });
    expect(summary).toMatchSnapshot();
  });
});

describe('rect helpers', () => {
  it('tests containment and overlap', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectContains(r, 0, 0)).toBe(true);
    expect(rectContains(r, 10, 5)).toBe(false);
    expect(rectsOverlap(r, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
    expect(rectsOverlap(r, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe('final responsive pass (T2.11)', () => {
  it('spans the landscape HUD over the board and tray only', () => {
    const l = computeLayout({ width: 1920, height: 1080, dpr: 1 });
    expect(l.hud.x).toBeCloseTo(l.boardFrame.x, 0);
    expect(l.hud.x + l.hud.width).toBeCloseTo(l.tray.x + l.tray.width, 0);
    expect(l.hud.width).toBeLessThan(1920 * 0.6);
  });

  it('caps the board on big screens', () => {
    const l = computeLayout({ width: 3840, height: 2160, dpr: 1 });
    expect(l.board.width).toBeLessThanOrEqual(LAYOUT.maxBoard);
    expect(l.board.width).toBeGreaterThan(640);
  });

  it('deepens the tray on tall phones (bigger touch targets), within its limit', () => {
    const tall = computeLayout({ width: 412, height: 915, dpr: 2.625 });
    expect(tall.tray.height / tall.board.width).toBeGreaterThan(LAYOUT.trayRatio);
    expect(tall.tray.height / tall.board.width).toBeLessThanOrEqual(LAYOUT.trayRatioMax + 1e-9);
    // Where height is the constraint (landscape-ish tablets), it keeps the base depth.
    const tablet = computeLayout({ width: 768, height: 1024, dpr: 2 });
    expect(tablet.tray.height / tablet.board.width).toBeGreaterThanOrEqual(LAYOUT.trayRatio - 0.01);
  });

  it('keeps small portal iframes playable', () => {
    for (const [w, h] of [
      [800, 450],
      [960, 600],
    ] as const) {
      const l = computeLayout({ width: w, height: h, dpr: 1 });
      expect(l.cellSize).toBeGreaterThanOrEqual(38);
      for (const slot of l.traySlots)
        expect(Math.min(slot.width, slot.height)).toBeGreaterThanOrEqual(44);
    }
  });
});
