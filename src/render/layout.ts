/**
 * Screen layout as a pure function of the viewport (docs/PLAN.md §9).
 *
 * Portrait (aspect ≤ 0.8): HUD on top, board centred, tray of 3 slots below.
 * Landscape: HUD on top, board with the tray as a column of 3 slots on its right.
 * The cell size is a whole number of device pixels so the grid never shows seams.
 */
import { BOARD_SIZE, TRAY_SIZE } from '../core/config';
import { CELL_STYLE } from './sprites';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface LayoutInput {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly dpr?: number;
  readonly safeArea?: Insets;
  /** Fixed HUD height; derived from the viewport when omitted. */
  readonly hudHeight?: number;
}

export interface Layout {
  readonly orientation: 'portrait' | 'landscape';
  readonly dpr: number;
  readonly hud: Rect;
  /** The 8×8 grid itself. */
  readonly board: Rect;
  /** The board including its decorative panel padding. */
  readonly boardFrame: Rect;
  readonly cellSize: number;
  readonly tray: Rect;
  readonly traySlots: readonly Rect[];
  /** Scale of a piece in the tray relative to board cells. */
  readonly trayScale: number;
}

export const LAYOUT = {
  /** Aspect ratio (width / height) at or below which the layout is portrait. */
  portraitMaxAspect: 0.8,
  margin: 12,
  gap: 12,
  /** Tray depth (portrait height / landscape width) relative to the board size. */
  trayRatio: 0.45,
  /** On tall phones the tray grows into spare height, up to this (bigger touch targets). */
  trayRatioMax: 0.6,
  /** Cap on the grid size (CSS px), so large screens don't get a comically big board. */
  maxBoard: 720,
  maxTrayScale: 0.6,
  /** Pieces fill at most this share of a tray slot. */
  slotFill: 0.9,
  /** Largest piece extent in cells (5-long lines). */
  maxPieceCells: 5,
  hudShare: 0.1,
  hudMin: { portrait: 56, landscape: 48 },
  hudMax: { portrait: 96, landscape: 80 },
} as const;

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const rectContains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** Whether two rects overlap by more than `eps` (use a small eps to ignore floating-point noise). */
export const rectsOverlap = (a: Rect, b: Rect, eps = 0): boolean =>
  a.x + eps < b.x + b.width &&
  b.x + eps < a.x + a.width &&
  a.y + eps < b.y + b.height &&
  b.y + eps < a.y + a.height;

/** The usable area: viewport minus safe-area insets and the outer margin. */
export function contentArea(input: LayoutInput): Rect {
  const s = input.safeArea ?? NO_INSETS;
  const m = LAYOUT.margin;
  return {
    x: s.left + m,
    y: s.top + m,
    width: Math.max(0, input.width - s.left - s.right - 2 * m),
    height: Math.max(0, input.height - s.top - s.bottom - 2 * m),
  };
}

/** Board frame size relative to the grid size (the panel pads each side by `panelPad` cells). */
const frameFactor = () => 1 + (2 * CELL_STYLE.panelPad) / BOARD_SIZE;

export function orientationOf(width: number, height: number): Layout['orientation'] {
  return height > 0 && width / height <= LAYOUT.portraitMaxAspect ? 'portrait' : 'landscape';
}

function hudHeightFor(input: LayoutInput, area: Rect, orientation: Layout['orientation']): number {
  if (input.hudHeight !== undefined) return input.hudHeight;
  return clamp(
    area.height * LAYOUT.hudShare,
    LAYOUT.hudMin[orientation],
    LAYOUT.hudMax[orientation],
  );
}

/** The largest board size (before snapping to device pixels) the constraints allow. */
export function boardBound(input: LayoutInput): number {
  const area = contentArea(input);
  const orientation = orientationOf(input.width, input.height);
  const hud = hudHeightFor(input, area, orientation);
  const { gap, trayRatio, maxBoard } = LAYOUT;
  const below = area.height - hud - gap;
  const k = frameFactor();
  // Two device pixels of slack absorb rounding positions to the pixel grid.
  const slack = 2 / (input.dpr ?? 1);
  const bound =
    orientation === 'portrait'
      ? Math.min(area.width / k, (below - gap) / (k + trayRatio))
      : Math.min(below / k, (area.width - gap) / (k + trayRatio));
  return clamp(bound - slack, 0, maxBoard);
}

export function computeLayout(input: LayoutInput): Layout {
  const dpr = input.dpr ?? 1;
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const area = contentArea(input);
  const orientation = orientationOf(input.width, input.height);
  const hudHeight = hudHeightFor(input, area, orientation);
  const { gap, trayRatio } = LAYOUT;

  const cellSize = Math.floor((boardBound(input) / BOARD_SIZE) * dpr) / dpr;
  const size = cellSize * BOARD_SIZE;
  const pad = cellSize * CELL_STYLE.panelPad;
  const frame = size + 2 * pad;
  const trayDepth = snap(size * trayRatio);

  const top = area.y + hudHeight + gap;
  const below = area.y + area.height - top;

  let board: Rect;
  let tray: Rect;
  let traySlots: Rect[];
  let hud: Rect;
  if (orientation === 'portrait') {
    // Spare height (tall phones) first deepens the tray, then centres the group.
    // Floored to device pixels, with a pixel of slack, so rounding never pushes it outside.
    const spare = Math.max(0, below - frame - gap - trayDepth - 2 / dpr);
    const floor = (v: number) => Math.floor(v * dpr) / dpr;
    const depth = floor(Math.min(trayDepth + spare, size * LAYOUT.trayRatioMax));
    const y0 = top + Math.max(0, (below - frame - gap - depth) / 2) + pad;
    board = { x: snap(area.x + (area.width - size) / 2), y: snap(y0), width: size, height: size };
    tray = { x: board.x, y: snap(board.y + size + pad + gap), width: size, height: depth };
    hud = { x: area.x, y: area.y, width: area.width, height: hudHeight };
    const edge = (i: number) => snap(tray.x + (i * size) / TRAY_SIZE);
    traySlots = Array.from({ length: TRAY_SIZE }, (_, i) => ({
      x: edge(i),
      y: tray.y,
      width: edge(i + 1) - edge(i),
      height: tray.height,
    }));
  } else {
    const x0 = area.x + Math.max(0, (area.width - frame - gap - trayDepth) / 2) + pad;
    const y0 = top + Math.max(0, (below - frame) / 2) + pad;
    board = { x: snap(x0), y: snap(y0), width: size, height: size };
    tray = { x: snap(board.x + size + pad + gap), y: board.y, width: trayDepth, height: size };
    // The HUD spans the board and tray, not the whole (possibly very wide) window.
    const left = board.x - pad;
    hud = { x: snap(left), y: area.y, width: snap(tray.x + tray.width - left), height: hudHeight };
    const edge = (i: number) => snap(tray.y + (i * size) / TRAY_SIZE);
    traySlots = Array.from({ length: TRAY_SIZE }, (_, i) => ({
      x: tray.x,
      y: edge(i),
      width: tray.width,
      height: edge(i + 1) - edge(i),
    }));
  }
  const boardFrame: Rect = { x: board.x - pad, y: board.y - pad, width: frame, height: frame };

  const smallest = Math.min(...traySlots.map((r) => Math.min(r.width, r.height)));
  const fit = (LAYOUT.slotFill * smallest) / (LAYOUT.maxPieceCells * cellSize);
  const trayScale = cellSize > 0 ? Math.min(LAYOUT.maxTrayScale, fit) : 0;

  return { orientation, dpr, hud, board, boardFrame, cellSize, tray, traySlots, trayScale };
}
