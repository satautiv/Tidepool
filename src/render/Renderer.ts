/**
 * Canvas owner and frame loop (docs/PLAN.md §3.4, §7.1).
 *
 * Views register with the renderer. Frames are scheduled only when something is dirty or a
 * view is animating, so an idle game makes no requestAnimationFrame callbacks at all.
 * Drawing uses CSS pixels: the context transform maps them to device pixels.
 */
import { RENDER } from './config';

export interface Viewport {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Effective device pixel ratio after the cap. */
  readonly dpr: number;
}

export interface FrameInfo {
  /** Seconds since the previous frame, clamped to `maxDt`, times `timeScale`. 0 after idle. */
  readonly dt: number;
  readonly time: number;
  readonly viewport: Viewport;
}

export interface View {
  update?(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, frame: FrameInfo): void;
  /** True while the view needs continuous frames (tweens, particles, drag, ambient effects). */
  isAnimating?(): boolean;
  onLayout?(viewport: Viewport): void;
}

export interface FrameScheduler {
  request(cb: (timeMs: number) => void): number;
  cancel(id: number): void;
}

export interface RendererStats {
  /** Frames drawn since creation. */
  draws: number;
  /** Duration of the last frame's update + draw work, in ms. */
  lastFrameMs: number;
  /** Time between the last two frames, in ms (0 when idle). */
  lastIntervalMs: number;
}

export interface RendererOptions {
  maxDpr?: number;
  maxDt?: number;
  /** Animation speed: 0.25 = quarter-speed slow motion (dev `?slowmo=0.25`). Default 1. */
  timeScale?: number;
  scheduler?: FrameScheduler;
  /** Clock for frame-work timing; defaults to performance.now. */
  now?: () => number;
}

type CanvasLike = Pick<HTMLCanvasElement, 'width' | 'height' | 'getContext'>;

export const browserScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

export class Renderer {
  readonly stats: RendererStats = { draws: 0, lastFrameMs: 0, lastIntervalMs: 0 };
  /** Multiplies every frame's `dt`, so all animations speed up or slow down together. */
  timeScale: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly views: View[] = [];
  private readonly maxDpr: number;
  private readonly maxDt: number;
  private readonly scheduler: FrameScheduler;
  private readonly now: () => number;
  private viewportValue: Viewport = { width: 0, height: 0, dpr: 1 };
  private dirty = false;
  private paused = false;
  private frameId: number | null = null;
  private lastTime: number | null = null;

  constructor(
    private readonly canvas: CanvasLike,
    opts: RendererOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx as CanvasRenderingContext2D;
    this.maxDpr = opts.maxDpr ?? RENDER.maxDpr;
    this.maxDt = opts.maxDt ?? RENDER.maxDt;
    this.timeScale = opts.timeScale ?? 1;
    this.scheduler = opts.scheduler ?? browserScheduler;
    this.now = opts.now ?? (() => performance.now());
  }

  get viewport(): Viewport {
    return this.viewportValue;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  addView(view: View): void {
    this.views.push(view);
    if (this.viewportValue.width > 0) view.onLayout?.(this.viewportValue);
    this.requestRedraw();
  }

  removeView(view: View): void {
    const i = this.views.indexOf(view);
    if (i >= 0) this.views.splice(i, 1);
    this.requestRedraw();
  }

  /** Sizes the backing store to CSS size × capped DPR and notifies views. */
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const dpr = Math.max(1, Math.min(devicePixelRatio || 1, this.maxDpr));
    const width = Math.max(0, cssWidth);
    const height = Math.max(0, cssHeight);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.viewportValue = { width, height, dpr };
    for (const view of this.views) view.onLayout?.(this.viewportValue);
    this.requestRedraw();
  }

  /** Marks the frame dirty and makes sure a frame is scheduled. */
  requestRedraw(): void {
    this.dirty = true;
    this.schedule();
  }

  /** Stops scheduling frames (tab hidden, ad showing). */
  pause(): void {
    this.paused = true;
    if (this.frameId !== null) this.scheduler.cancel(this.frameId);
    this.frameId = null;
    this.lastTime = null;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.requestRedraw();
  }

  private anyAnimating(): boolean {
    return this.views.some((v) => v.isAnimating?.() ?? false);
  }

  private schedule(): void {
    if (this.paused || this.frameId !== null) return;
    this.frameId = this.scheduler.request((t) => this.frame(t));
  }

  private frame(timeMs: number): void {
    this.frameId = null;
    const started = this.now();
    const realDt =
      this.lastTime === null ? 0 : Math.min((timeMs - this.lastTime) / 1000, this.maxDt);
    const dt = realDt * this.timeScale;
    this.stats.lastIntervalMs = this.lastTime === null ? 0 : timeMs - this.lastTime;
    this.lastTime = timeMs;

    for (const view of this.views) view.update?.(dt);

    const { ctx } = this;
    const { width, height, dpr } = this.viewportValue;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const frame: FrameInfo = { dt, time: timeMs / 1000, viewport: this.viewportValue };
    for (const view of this.views) view.draw(ctx, frame);
    this.stats.draws++;
    this.dirty = false;
    this.stats.lastFrameMs = this.now() - started;

    if (this.anyAnimating() || this.dirty) this.schedule();
    else this.lastTime = null;
  }
}
