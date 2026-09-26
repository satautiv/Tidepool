/**
 * Pre-rendered sprites (docs/PLAN.md §7.2). Everything with gradients is drawn once per
 * (palette, cell size, DPR) into offscreen canvases; the frame loop only blits them.
 */
import { BOARD_SIZE } from '../core/config';
import { darken, lighten, rgba } from './color';
import type { Palette } from './palettes';

/** Sprites are plain canvases; tests inject fakes through the factory. */
export type SpriteCanvas = HTMLCanvasElement;

export type CanvasFactory = (width: number, height: number) => SpriteCanvas;

export const domCanvasFactory: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/** Geometry shared by sprites and views, in CSS pixels relative to a cell's top-left. */
export const CELL_STYLE = {
  /** Gap between a block and its cell edge, as a share of the cell. */
  inset: 0.06,
  /** Corner radius as a share of the block size. */
  radius: 0.22,
  glassAlpha: 0.88,
  /** Board panel padding around the grid, as a share of a cell. */
  panelPad: 0.18,
  /** Extra room around the board sprite for its shadow, as a share of a cell. */
  shadowMargin: 0.6,
} as const;

/** Adds a rounded-rectangle path (works where ctx.roundRect is missing). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function context(canvas: SpriteCanvas, dpr: number): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sprite canvas has no 2D context');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** One sea-glass block filling a cell of size `c` (CSS px). */
export function drawGlassBlock(ctx: CanvasRenderingContext2D, c: number, color: string): void {
  const pad = c * CELL_STYLE.inset;
  const s = c - 2 * pad;
  const r = s * CELL_STYLE.radius;

  ctx.save();
  ctx.globalAlpha = CELL_STYLE.glassAlpha;

  // Body: light top-left to deeper bottom-right.
  const body = ctx.createLinearGradient(pad, pad, pad + s, pad + s);
  body.addColorStop(0, lighten(color, 0.28));
  body.addColorStop(0.55, color);
  body.addColorStop(1, darken(color, 0.18));
  roundRectPath(ctx, pad, pad, s, s, r);
  ctx.fillStyle = body;
  ctx.fill();

  // Inner glow.
  const glow = ctx.createRadialGradient(c / 2, c / 2, 0, c / 2, c / 2, s * 0.6);
  glow.addColorStop(0, rgba(lighten(color, 0.45), 0.45));
  glow.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = glow;
  ctx.fill();

  // Rim.
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(1, c * 0.03);
  ctx.strokeStyle = rgba(darken(color, 0.3), 0.45);
  ctx.stroke();

  // Specular highlight: a soft tilted ellipse near the top-left corner.
  const hx = pad + s * 0.32;
  const hy = pad + s * 0.24;
  const shine = ctx.createRadialGradient(hx, hy, 0, hx, hy, s * 0.3);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.ellipse(hx, hy, s * 0.3, s * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** An empty, slightly recessed sand cell. */
export function drawWell(ctx: CanvasRenderingContext2D, c: number, palette: Palette): void {
  const pad = c * CELL_STYLE.inset;
  const s = c - 2 * pad;
  const shade = ctx.createLinearGradient(0, pad, 0, pad + s);
  shade.addColorStop(0, palette.board.wellShade);
  shade.addColorStop(0.35, palette.board.well);
  shade.addColorStop(1, lighten(palette.board.well, 0.25));
  roundRectPath(ctx, pad, pad, s, s, s * CELL_STYLE.radius);
  ctx.fillStyle = shade;
  ctx.fill();
}

/** Ghost preview outline: a soft white rounded border, drawn over a faded block. */
export function drawGhostOutline(ctx: CanvasRenderingContext2D, c: number, palette: Palette): void {
  const pad = c * CELL_STYLE.inset;
  const s = c - 2 * pad;
  const w = Math.max(1.5, c * 0.05);
  roundRectPath(ctx, pad + w / 2, pad + w / 2, s - w, s - w, s * CELL_STYLE.radius);
  ctx.lineWidth = w;
  ctx.strokeStyle = rgba(palette.highlight, 0.85);
  ctx.stroke();
}

/** Would-clear highlight drawn over cells in lines the ghost would complete. */
export function drawClearHighlight(
  ctx: CanvasRenderingContext2D,
  c: number,
  palette: Palette,
): void {
  const pad = c * CELL_STYLE.inset;
  const s = c - 2 * pad;
  const g = ctx.createRadialGradient(c / 2, c / 2, s * 0.1, c / 2, c / 2, s * 0.75);
  g.addColorStop(0, rgba(palette.highlight, 0.55));
  g.addColorStop(1, rgba(palette.highlight, 0.15));
  roundRectPath(ctx, pad, pad, s, s, s * CELL_STYLE.radius);
  ctx.fillStyle = g;
  ctx.fill();
}

/** The board panel with all 64 empty wells, including room for its drop shadow. */
export function drawBoardBase(ctx: CanvasRenderingContext2D, c: number, palette: Palette): void {
  const m = c * CELL_STYLE.shadowMargin;
  const pad = c * CELL_STYLE.panelPad;
  const size = c * BOARD_SIZE;

  ctx.save();
  ctx.shadowColor = rgba(palette.board.shadow, 0.28);
  ctx.shadowBlur = c * 0.45;
  ctx.shadowOffsetY = c * 0.12;
  roundRectPath(ctx, m - pad, m - pad, size + 2 * pad, size + 2 * pad, c * 0.4);
  ctx.fillStyle = palette.board.panel;
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = Math.max(1, c * 0.03);
  ctx.strokeStyle = palette.board.panelEdge;
  ctx.stroke();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      ctx.save();
      ctx.translate(m + col * c, m + r * c);
      drawWell(ctx, c, palette);
      ctx.restore();
    }
  }
}

/** All sprites for one palette at one cell size. Rebuilt only when the key changes. */
export class SpriteSet {
  private key = '';
  private blocks: SpriteCanvas[] = [];
  private ghost: SpriteCanvas | null = null;
  private highlight: SpriteCanvas | null = null;
  private base: SpriteCanvas | null = null;
  /** Number of full rebuilds, for tests and the debug overlay. */
  builds = 0;
  cellSize = 0;

  constructor(
    private palette: Palette,
    private readonly factory: CanvasFactory = domCanvasFactory,
  ) {}

  setPalette(palette: Palette): void {
    if (palette === this.palette) return;
    this.palette = palette;
    this.key = '';
  }

  /** (Re)builds the sprites for this cell size (CSS px) and DPR, if they changed. */
  build(cellSize: number, dpr: number): void {
    const key = `${this.palette.id}|${cellSize}|${dpr}`;
    if (key === this.key || cellSize <= 0) return;
    this.key = key;
    this.cellSize = cellSize;
    this.builds++;

    const px = Math.max(1, Math.round(cellSize * dpr));
    const make = (draw: (ctx: CanvasRenderingContext2D) => void, size = px) => {
      const canvas = this.factory(size, size);
      draw(context(canvas, dpr));
      return canvas;
    };
    this.blocks = this.palette.glass.map((color) =>
      make((ctx) => drawGlassBlock(ctx, cellSize, color)),
    );
    this.ghost = make((ctx) => drawGhostOutline(ctx, cellSize, this.palette));
    this.highlight = make((ctx) => drawClearHighlight(ctx, cellSize, this.palette));
    const baseCss = cellSize * (BOARD_SIZE + 2 * CELL_STYLE.shadowMargin);
    this.base = make(
      (ctx) => drawBoardBase(ctx, cellSize, this.palette),
      Math.round(baseCss * dpr),
    );
  }

  get ready(): boolean {
    return this.base !== null;
  }

  block(color: number): SpriteCanvas {
    const sprite = this.blocks[color];
    if (!sprite) throw new Error(`No sprite for colour ${color}`);
    return sprite;
  }

  get ghostOutline(): SpriteCanvas {
    return this.need(this.ghost);
  }

  get clearHighlight(): SpriteCanvas {
    return this.need(this.highlight);
  }

  get boardBase(): SpriteCanvas {
    return this.need(this.base);
  }

  private need(sprite: SpriteCanvas | null): SpriteCanvas {
    if (!sprite) throw new Error('Sprites not built yet');
    return sprite;
  }
}
