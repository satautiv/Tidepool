/**
 * The sunlit tidepool atmosphere (README §10, docs/PLAN.md §7.5): a procedural sand grain and
 * shimmering water caustics. Both are generated once into offscreen canvases; per frame the
 * caustics only blit and drift.
 */
import { BOARD_SIZE } from '../core/config';
import { hexToRgb } from './color';
import { FEEL } from './feel';
import type { SceneContext, SceneView } from './GameScene';
import type { CanvasFactory, SpriteCanvas } from './sprites';

/** A small deterministic PRNG, so the texture is the same on every launch. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a `cells`×`cells` lattice that wraps, so the tile repeats seamlessly. */
function valueNoise(random: () => number, cells: number) {
  const grid = Array.from({ length: cells * cells }, random);
  const at = (x: number, y: number) =>
    grid[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/**
 * A seamless sand-grain overlay tile of `size` px: soft light/dark mottling, fine grain and a
 * few tiny pebbles, on a transparent background (it tints whatever is under it).
 */
export function drawSandTile(
  ctx: CanvasRenderingContext2D,
  size: number,
  colors: { dark: string; light: string },
  seed = 7,
): void {
  const img = ctx.createImageData(size, size) as ImageData | undefined;
  if (!img) return; // test doubles
  const random = prng(seed);
  const coarse = valueNoise(random, 4);
  const fine = valueNoise(random, 16);
  const dark = hexToRgb(colors.dark);
  const light = hexToRgb(colors.light);
  const { grainAlpha, mottleAlpha } = FEEL.sand;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const mottle = coarse(u, v) * 0.6 + fine(u, v) * 0.4 - 0.5; // −0.5..0.5
      const grain = random() - 0.5;
      const value = mottle * mottleAlpha + grain * grainAlpha;
      const [r, g, b] = value < 0 ? dark : light;
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.min(255, Math.abs(value) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Pebbles: a handful of tiny rounded specks.
  for (let i = 0; i < FEEL.sand.pebbles; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 0.6 + random() * 1.1;
    ctx.fillStyle = random() < 0.5 ? colors.dark : colors.light;
    ctx.globalAlpha = 0.12 + random() * 0.15;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.3, r, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * One caustics layer: a network of soft, wavy light lines (white on transparent), `w`×`h` px.
 * `variant` changes the frequencies and phases so the layers don't line up.
 */
export function drawCausticLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  variant: number,
): void {
  const img = ctx.createImageData(w, h) as ImageData | undefined;
  if (!img) return;
  const random = prng(100 + variant);
  const scale = FEEL.caustics.scale / Math.max(w, h);
  const k = [1 + random(), 1 + random(), 1 + random(), 1 + random()].map((f) => f * scale * 40);
  const phase = [random(), random(), random(), random()].map((p) => p * Math.PI * 2);
  const sharp = FEEL.caustics.sharpness;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = x * k[0]! + 1.6 * Math.sin(y * k[1]! + phase[0]!) + phase[1]!;
      const b = y * k[2]! + 1.6 * Math.sin(x * k[3]! + phase[2]!) + phase[3]!;
      const line = Math.max(1 - Math.abs(Math.sin(a)), 1 - Math.abs(Math.sin(b)));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = 255 * line ** sharp;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Builds the caustic layers for a board of `boardSize` CSS px, at half resolution (soft). */
export function buildCausticLayers(factory: CanvasFactory, boardSize: number): SpriteCanvas[] {
  const margin = FEEL.caustics.drift;
  const px = Math.max(1, Math.round((boardSize + 2 * margin) * FEEL.caustics.resolution));
  return Array.from({ length: FEEL.caustics.layers }, (_, i) => {
    const canvas = factory(px, px);
    const ctx = canvas.getContext('2d');
    if (ctx) drawCausticLayer(ctx as CanvasRenderingContext2D, px, px, i);
    return canvas;
  });
}

/**
 * Caustics over the board: the layers drift on slow sines and are added with `screen` at low
 * opacity. It has its own clock (seconds), because the app redraws it from a 30 fps ticker
 * rather than the frame loop, which stays idle between redraws.
 */
export class CausticsView implements SceneView {
  private layers: SpriteCanvas[] = [];
  private builtFor = 0;

  constructor(
    readonly enabled: () => boolean,
    private readonly factory: CanvasFactory,
    private readonly now: () => number = () => performance.now() / 1000,
  ) {}

  onLayout({ layout }: SceneContext): void {
    const size = layout.cellSize * BOARD_SIZE;
    if (size === this.builtFor) return;
    this.builtFor = size;
    this.layers = this.enabled() ? buildCausticLayers(this.factory, size) : [];
  }

  draw(ctx: CanvasRenderingContext2D, { layout }: SceneContext): void {
    if (!this.enabled()) return;
    if (this.layers.length === 0) {
      this.layers = buildCausticLayers(this.factory, this.builtFor || layout.board.width);
    }
    const { board } = layout;
    const { drift, speed, alpha } = FEEL.caustics;
    const t = this.now() * speed;
    const size = board.width + 2 * drift;
    ctx.save();
    ctx.beginPath();
    ctx.rect(board.x, board.y, board.width, board.height);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    this.layers.forEach((layer, i) => {
      const ox = drift * Math.sin(t * (0.7 + 0.3 * i) + i * 2.1);
      const oy = drift * Math.cos(t * (0.5 + 0.25 * i) + i * 1.3);
      ctx.drawImage(layer, board.x - drift + ox, board.y - drift + oy, size, size);
    });
    ctx.restore();
  }
}
