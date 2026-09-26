/**
 * Dev-only stats overlay (`?debug=1`): FPS, frame work time, draw count and viewport.
 * It never requests frames itself, so an idle game shows a frozen draw count, which is
 * exactly how to check that idle frames are skipped. Layout rects are added in T1.12.
 */
import type { FrameInfo, RendererStats, View } from './Renderer';

/** Smoothed frames-per-second from frame intervals (exponential moving average). */
export class FpsMeter {
  private avgMs = 0;

  sample(intervalMs: number): void {
    if (intervalMs <= 0) return;
    this.avgMs = this.avgMs === 0 ? intervalMs : this.avgMs * 0.9 + intervalMs * 0.1;
  }

  get fps(): number {
    return this.avgMs > 0 ? 1000 / this.avgMs : 0;
  }
}

export class DebugOverlay implements View {
  private readonly meter = new FpsMeter();

  constructor(private readonly stats: RendererStats) {}

  lines(frame: FrameInfo): string[] {
    const { width, height, dpr } = frame.viewport;
    const idle = this.stats.lastIntervalMs === 0;
    return [
      idle ? 'fps  idle' : `fps  ${this.meter.fps.toFixed(0)}`,
      `work ${this.stats.lastFrameMs.toFixed(2)} ms`,
      `draws ${this.stats.draws + 1}`,
      `view ${Math.round(width)}×${Math.round(height)} @${dpr}x`,
    ];
  }

  draw(ctx: CanvasRenderingContext2D, frame: FrameInfo): void {
    this.meter.sample(this.stats.lastIntervalMs);
    const lines = this.lines(frame);
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(4, 4, 150, lines.length * 14 + 8);
    ctx.fillStyle = '#fff';
    lines.forEach((line, i) => ctx.fillText(line, 10, 8 + i * 14));
    ctx.restore();
  }
}
