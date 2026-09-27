import { describe, expect, it, vi } from 'vitest';
import { DebugOverlay, FpsMeter } from './DebugOverlay';
import { Renderer, type FrameInfo, type FrameScheduler, type View } from './Renderer';
import { attachViewport, type ViewportEnv } from './viewport';

/** Manual frame scheduler: frames run only when the test calls `tick`. */
class FakeScheduler implements FrameScheduler {
  private queue = new Map<number, (t: number) => void>();
  private nextId = 1;
  time = 1000;

  request(cb: (t: number) => void): number {
    const id = this.nextId++;
    this.queue.set(id, cb);
    return id;
  }

  cancel(id: number): void {
    this.queue.delete(id);
  }

  get pending(): number {
    return this.queue.size;
  }

  /** Advances time and runs the frames that were scheduled before this tick. */
  tick(ms = 16): void {
    this.time += ms;
    const due = [...this.queue.values()];
    this.queue.clear();
    for (const cb of due) cb(this.time);
  }
}

function fakeCanvas() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    font: '',
    textBaseline: '',
    fillStyle: '',
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx };
}

function setup(opts: { maxDpr?: number; timeScale?: number } = {}) {
  const scheduler = new FakeScheduler();
  const { canvas, ctx } = fakeCanvas();
  const renderer = new Renderer(canvas, { scheduler, now: () => scheduler.time, ...opts });
  return { scheduler, canvas, ctx, renderer };
}

function spyView(animatingFrames = 0) {
  let remaining = animatingFrames;
  const frames: FrameInfo[] = [];
  const view: View & { frames: FrameInfo[] } = {
    frames,
    update: vi.fn(),
    draw: vi.fn((_ctx, frame: FrameInfo) => {
      frames.push(frame);
      if (remaining > 0) remaining--;
    }),
    isAnimating: () => remaining > 0,
    onLayout: vi.fn(),
  };
  return view;
}

describe('Renderer sizing', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [1.5, 1.5],
    [4, 3],
    [0, 1],
  ])('dpr %s → effective %s, backing store scaled, CSS transform set', (dpr, effective) => {
    const { renderer, canvas, ctx, scheduler } = setup();
    renderer.resize(390, 844, dpr);
    expect(canvas.width).toBe(Math.round(390 * effective));
    expect(canvas.height).toBe(Math.round(844 * effective));
    expect(renderer.viewport).toEqual({ width: 390, height: 844, dpr: effective });
    scheduler.tick();
    expect(ctx.setTransform).toHaveBeenLastCalledWith(effective, 0, 0, effective, 0, 0);
    expect(ctx.clearRect).toHaveBeenLastCalledWith(0, 0, 390, 844);
  });

  it('respects a custom DPR cap (low-power mode)', () => {
    const { renderer, canvas } = setup({ maxDpr: 1.5 });
    renderer.resize(100, 100, 3);
    expect(canvas.width).toBe(150);
  });

  it('notifies views of layout changes, including views added later', () => {
    const { renderer } = setup();
    const early = spyView();
    renderer.addView(early);
    expect(early.onLayout).not.toHaveBeenCalled();
    renderer.resize(300, 600, 2);
    expect(early.onLayout).toHaveBeenCalledWith({ width: 300, height: 600, dpr: 2 });
    const late = spyView();
    renderer.addView(late);
    expect(late.onLayout).toHaveBeenCalledWith({ width: 300, height: 600, dpr: 2 });
  });

  it('throws without a 2D context', () => {
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => new Renderer(canvas)).toThrow('Canvas 2D context unavailable');
  });
});

describe('Renderer frame loop', () => {
  it('draws once per redraw request and then goes idle', () => {
    const { renderer, scheduler } = setup();
    const view = spyView();
    renderer.addView(view);
    renderer.requestRedraw();
    renderer.requestRedraw();
    expect(scheduler.pending).toBe(1);
    scheduler.tick();
    expect(view.draw).toHaveBeenCalledTimes(1);
    expect(renderer.stats.draws).toBe(1);
    expect(scheduler.pending).toBe(0);

    scheduler.tick();
    scheduler.tick();
    expect(renderer.stats.draws).toBe(1);
  });

  it('keeps drawing while a view animates, then stops', () => {
    const { renderer, scheduler } = setup();
    const view = spyView(3);
    renderer.addView(view);
    for (let i = 0; i < 10; i++) scheduler.tick();
    expect(renderer.stats.draws).toBe(3);
    expect(scheduler.pending).toBe(0);
  });

  it('passes clamped deltas, starting at 0 after idle', () => {
    const { renderer, scheduler } = setup();
    const view = spyView(4);
    renderer.addView(view);
    scheduler.tick(16);
    scheduler.tick(16);
    scheduler.tick(500);
    expect(view.frames.map((f) => f.dt)).toEqual([0, 0.016, 0.05]);
    expect(view.update).toHaveBeenCalledWith(0.05);

    // Let it go idle, then wake it: dt restarts at 0.
    scheduler.tick(16);
    scheduler.tick(16);
    renderer.requestRedraw();
    scheduler.tick(5000);
    expect(view.frames.at(-1)!.dt).toBe(0);
  });

  it('scales deltas by the time scale (slow motion), after clamping', () => {
    const { renderer, scheduler } = setup({ timeScale: 0.25 });
    const view = spyView(4);
    renderer.addView(view);
    scheduler.tick(16);
    scheduler.tick(16);
    scheduler.tick(500);
    expect(view.frames.map((f) => f.dt)).toEqual([0, 0.004, 0.0125]);
    renderer.timeScale = 2;
    scheduler.tick(10);
    expect(view.frames.at(-1)!.dt).toBeCloseTo(0.02);
  });

  it('continues if a redraw is requested during drawing', () => {
    const { renderer, scheduler } = setup();
    let once = true;
    renderer.addView({
      draw: () => {
        if (once) {
          once = false;
          renderer.requestRedraw();
        }
      },
    });
    scheduler.tick();
    scheduler.tick();
    expect(renderer.stats.draws).toBe(2);
  });

  it('pauses and resumes', () => {
    const { renderer, scheduler } = setup();
    const view = spyView(100);
    renderer.addView(view);
    scheduler.tick();
    renderer.pause();
    expect(renderer.isPaused).toBe(true);
    expect(scheduler.pending).toBe(0);
    renderer.requestRedraw();
    scheduler.tick();
    expect(renderer.stats.draws).toBe(1);

    renderer.resume();
    renderer.resume(); // idempotent
    scheduler.tick();
    expect(renderer.stats.draws).toBe(2);
    expect(view.frames.at(-1)!.dt).toBe(0);
  });

  it('stops drawing removed views', () => {
    const { renderer, scheduler } = setup();
    const view = spyView();
    renderer.addView(view);
    scheduler.tick();
    renderer.removeView(view);
    renderer.removeView(view); // no-op
    scheduler.tick();
    expect(view.draw).toHaveBeenCalledTimes(1);
    expect(renderer.stats.draws).toBe(2);
  });

  it('records frame timing stats', () => {
    const { renderer, scheduler } = setup();
    renderer.addView(spyView(3));
    scheduler.tick(20);
    expect(renderer.stats.lastIntervalMs).toBe(0);
    scheduler.tick(20);
    expect(renderer.stats.lastIntervalMs).toBe(20);
    expect(renderer.stats.lastFrameMs).toBe(0);
  });
});

describe('attachViewport', () => {
  function fakeEnv() {
    let resize: ((w: number, h: number) => void) | null = null;
    let dprListener: (() => void) | null = null;
    const env = {
      dpr: 2,
      disconnected: false,
      dprUnsubscribed: 0,
      observeResize: (_el: Element, cb: (w: number, h: number) => void) => {
        resize = cb;
        return () => {
          env.disconnected = true;
        };
      },
      devicePixelRatio: () => env.dpr,
      onDprChange: (_dpr: number, cb: () => void) => {
        dprListener = cb;
        return () => {
          env.dprUnsubscribed++;
        };
      },
      fireResize: (w: number, h: number) => resize!(w, h),
      fireDpr: () => dprListener!(),
    };
    return env;
  }

  it('resizes on element resize and on DPR changes, and detaches cleanly', () => {
    const { renderer, canvas } = setup();
    const env = fakeEnv();
    const detach = attachViewport(renderer, {} as Element, env satisfies ViewportEnv);

    env.fireResize(400, 800);
    expect(canvas.width).toBe(800);
    expect(renderer.viewport).toEqual({ width: 400, height: 800, dpr: 2 });

    env.dpr = 3;
    env.fireDpr();
    expect(canvas.width).toBe(1200);
    expect(renderer.viewport.dpr).toBe(3);

    detach();
    expect(env.disconnected).toBe(true);
    expect(env.dprUnsubscribed).toBeGreaterThan(0);
  });
});

describe('DebugOverlay', () => {
  it('smooths FPS and ignores idle samples', () => {
    const meter = new FpsMeter();
    expect(meter.fps).toBe(0);
    meter.sample(0);
    expect(meter.fps).toBe(0);
    meter.sample(16);
    expect(meter.fps).toBeCloseTo(62.5);
    for (let i = 0; i < 100; i++) meter.sample(33.3);
    expect(meter.fps).toBeCloseTo(30, 0);
  });

  it('shows stats and draws without requesting frames', () => {
    const { renderer, scheduler, ctx } = setup();
    const overlay = new DebugOverlay(renderer.stats);
    renderer.resize(360, 640, 2);
    renderer.addView(overlay);
    scheduler.tick();
    expect(scheduler.pending).toBe(0);
    expect(ctx.fillText).toHaveBeenCalledWith('fps  idle', 10, 8);
    expect(ctx.fillText).toHaveBeenCalledWith('draws 1', 10, 36);
    expect(ctx.fillText).toHaveBeenCalledWith('view 360×640 @2x', 10, 50);
    const lines = overlay.lines({ dt: 0, time: 0, viewport: renderer.viewport });
    expect(lines[1]).toMatch(/^work \d+\.\d\d ms$/);
  });
});
