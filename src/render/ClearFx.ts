/**
 * The line-clear "wash away" (README §10, docs/PLAN.md §11): a wave band sweeps along each
 * cleared row or column, and bubbles, sparkles and droplets burst out, more for bigger clears.
 * The cells themselves lift, brighten and dissolve in BoardView. Nothing here touches game
 * state, so placing the next piece mid-effect is safe.
 */
import type { Board } from '../core/board';
import { BOARD_SIZE } from '../core/config';
import type { GameEvent } from '../core/game';
import { FEEL } from './feel';
import type { SceneContext, SceneView } from './GameScene';
import type { Layout } from './layout';
import type { ParticleSystem } from './particles';
import { Ease } from './tween';

interface Wave {
  vertical: boolean;
  /** Row or column index. */
  line: number;
  /** Seconds since it started. */
  time: number;
  /** Travels towards lower x / y (it starts at the end nearer the placed piece). */
  reverse: boolean;
}

/** Horizontal slices a band is drawn in, each shifted by the sine wobble. */
const SLICES = 4;

export class ClearFx implements SceneView {
  private waves: Wave[] = [];
  private layout: Layout | null = null;

  constructor(
    private readonly particles: ParticleSystem,
    private readonly random: () => number = Math.random,
  ) {}

  onLayout({ layout }: SceneContext): void {
    this.layout = layout;
  }

  /** Starts the effect for a move's events. `before` is the board before the move. */
  play(before: Board, events: readonly GameEvent[]): void {
    const placed = events.find((e) => e.type === 'placed');
    const cleared = events.find((e) => e.type === 'cleared');
    const layout = this.layout;
    if (!placed || !cleared || !layout) return;

    const { board: rect, cellSize: c } = layout;
    const fx = FEEL.lineClear;
    const lines = cleared.rows.length + cleared.cols.length;
    const tier = Math.min(1, (lines - 1) / 3);
    const colorAt = (index: number) => before.cells[index]?.color ?? placed.color;
    const cellX = (col: number) => rect.x + (col + 0.5) * c;
    const cellY = (row: number) => rect.y + (row + 0.5) * c;
    const centreRow = placed.row + 0.5;
    const centreCol = placed.col + 0.5;

    const bubbles = fx.bubblesMin + (fx.bubblesMax - fx.bubblesMin) * tier;
    const sparkles = fx.sparklesPerLine + fx.sparklesPerExtraLine * (lines - 1);
    const length = BOARD_SIZE * c;

    const sparkleAlong = (index: (k: number) => number) => {
      for (let i = 0; i < sparkles; i++) {
        const cell = index(Math.floor(this.random() * BOARD_SIZE));
        const x = cellX(cell % BOARD_SIZE);
        const y = cellY(Math.floor(cell / BOARD_SIZE));
        this.particles.burst('sparkle', x, y, 1, Math.PI * 2, fx.sparkleSpeed, {
          color: colorAt(cell),
        });
      }
    };

    // Bubbles in the line's glass colours, so they read on the light sand.
    const lineColor = (index: (k: number) => number) =>
      colorAt(index(Math.floor(this.random() * BOARD_SIZE)));

    for (const row of cleared.rows) {
      this.waves.push({ vertical: false, line: row, time: 0, reverse: centreCol > BOARD_SIZE / 2 });
      const y = cellY(row);
      this.particles.line(
        'bubble',
        rect.x,
        y,
        rect.x + length,
        y,
        bubbles / length,
        fx.bubbleSpeed,
        {
          color: lineColor((k) => row * BOARD_SIZE + k),
        },
      );
      sparkleAlong((k) => row * BOARD_SIZE + k);
    }
    for (const col of cleared.cols) {
      this.waves.push({ vertical: true, line: col, time: 0, reverse: centreRow > BOARD_SIZE / 2 });
      const x = cellX(col);
      // Bubbles still rise: spawn them spread down the column.
      this.particles.line(
        'bubble',
        x,
        rect.y,
        x,
        rect.y + length,
        bubbles / length,
        fx.bubbleSpeed,
        {
          color: lineColor((k) => k * BOARD_SIZE + col),
        },
      );
      sparkleAlong((k) => k * BOARD_SIZE + col);
    }

    for (const row of cleared.rows) {
      for (const col of cleared.cols) {
        const color = colorAt(row * BOARD_SIZE + col);
        const x = cellX(col);
        const y = cellY(row);
        this.particles.burst('sparkle', x, y, fx.crossSparkles, Math.PI * 2, fx.sparkleSpeed, {
          color,
        });
        this.particles.burst('droplet', x, y, fx.crossDroplets, Math.PI, fx.splashSpeed, { color });
      }
    }

    if (lines >= fx.splashLines) {
      let sx = 0;
      let sy = 0;
      for (const cell of cleared.cells) {
        sx += cellX(cell % BOARD_SIZE);
        sy += cellY(Math.floor(cell / BOARD_SIZE));
      }
      const n = cleared.cells.length;
      this.particles.burst(
        'droplet',
        sx / n,
        sy / n,
        fx.splashDropletsPerLine * lines,
        Math.PI * 0.9,
        fx.splashSpeed,
        { color: placed.color },
      );
    }
  }

  /** Drops running waves (new run, board reset). */
  reset(): void {
    this.waves = [];
  }

  update(dt: number): void {
    if (this.waves.length === 0) return;
    const end = FEEL.lineClear.waveDuration;
    for (const w of this.waves) w.time += dt;
    this.waves = this.waves.filter((w) => w.time < end);
  }

  isAnimating(): boolean {
    return this.waves.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, { layout, sprites }: SceneContext): void {
    if (this.waves.length === 0) return;
    const { board: rect, cellSize: c } = layout;
    const fx = FEEL.lineClear;
    const bandLength = fx.waveWidth * c;
    const travel = BOARD_SIZE * c + bandLength;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, BOARD_SIZE * c, BOARD_SIZE * c);
    ctx.clip();
    for (const w of this.waves) {
      const t = Math.min(1, w.time / fx.waveDuration);
      ctx.globalAlpha = fx.waveAlpha * Math.sin(Math.PI * t);
      const along = Ease.sineInOut(w.reverse ? 1 - t : t) * travel - bandLength;
      const sprite = sprites.waveBand(w.vertical);
      const sw = sprite.width;
      const sh = sprite.height;
      for (let k = 0; k < SLICES; k++) {
        const wobble = fx.waveWobble * Math.sin(2 * Math.PI * (2 * t + k / SLICES));
        if (w.vertical) {
          // Slices across the column's width, each nudged along the column.
          const x = rect.x + w.line * c + (k * c) / SLICES;
          const y = rect.y + along + wobble;
          ctx.drawImage(
            sprite,
            (k * sw) / SLICES,
            0,
            sw / SLICES,
            sh,
            x,
            y,
            c / SLICES,
            bandLength,
          );
        } else {
          const x = rect.x + along + wobble;
          const y = rect.y + w.line * c + (k * c) / SLICES;
          ctx.drawImage(
            sprite,
            0,
            (k * sh) / SLICES,
            sw,
            sh / SLICES,
            x,
            y,
            bandLength,
            c / SLICES,
          );
        }
      }
    }
    ctx.restore();
  }
}
