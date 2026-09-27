/**
 * Tween engine (docs/PLAN.md §7.4). Tweens numeric properties of plain objects and is advanced
 * by the owning view's `update(dt)`, so it runs on the renderer's clock (and its time scale).
 * `sequence`, `parallel` and `wait` chain tweens without timers or promises.
 */

export type Easing = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  quadIn: (t: number) => t * t,
  quadOut: (t: number) => 1 - (1 - t) * (1 - t),
  cubicOut: (t: number) => 1 - (1 - t) ** 3,
  /** Overshoots slightly past 1, then settles. */
  backOut: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  /** Springs past 1 a few times, settling by the end. */
  elasticOut: (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const period = (2 * Math.PI) / 3;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * period) + 1;
  },
  sineInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
} satisfies Record<string, Easing>;

export interface TweenOptions {
  /** Seconds. */
  duration: number;
  delay?: number;
  ease?: Easing;
  onComplete?: () => void;
}

export interface TweenHandle {
  /** Stops it where it is. `whenDone` callbacks don't run. */
  cancel(): void;
  /** True once finished or cancelled. */
  readonly done: boolean;
  /** Runs `fn` when it finishes normally (right away if it already has). */
  whenDone(fn: () => void): void;
}

/** Starts one step of a `sequence` or `parallel` and returns its handle. */
export type TweenStep = () => TweenHandle;

/** A handle that completes by hand: the building block for groups. */
class ManualHandle implements TweenHandle {
  done = false;
  private finished = false;
  private listeners: Array<() => void> = [];
  private readonly onCancel: () => void;

  constructor(onCancel: () => void = () => {}) {
    this.onCancel = onCancel;
  }

  cancel(): void {
    if (this.done) return;
    this.done = true;
    this.listeners = [];
    this.onCancel();
  }

  whenDone(fn: () => void): void {
    if (this.finished) fn();
    else if (!this.done) this.listeners.push(fn);
  }

  finish(): void {
    if (this.done) return;
    this.done = this.finished = true;
    const listeners = this.listeners;
    this.listeners = [];
    for (const fn of listeners) fn();
  }
}

type Numeric<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];

interface Tween {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  elapsed: number;
  delay: number;
  duration: number;
  ease: Easing;
  onComplete?: () => void;
  handle: ManualHandle;
  started: boolean;
}

export class Tweener {
  private tweens: Tween[] = [];

  get active(): number {
    return this.tweens.length;
  }

  /** Animates `props` of `target` from their values when the tween starts (after any delay). */
  to<T extends object>(
    target: T,
    props: Partial<Pick<T, Numeric<T>>>,
    opts: TweenOptions,
  ): TweenHandle {
    const handle = new ManualHandle(() => {
      this.tweens = this.tweens.filter((t) => t !== tween);
    });
    const tween: Tween = {
      target: target as unknown as Record<string, number>,
      from: {},
      to: props as Record<string, number>,
      elapsed: 0,
      delay: opts.delay ?? 0,
      duration: Math.max(0, opts.duration),
      ease: opts.ease ?? Ease.quadOut,
      onComplete: opts.onComplete,
      handle,
      started: false,
    };
    this.tweens.push(tween);
    return handle;
  }

  /** Does nothing for `seconds`: a pause inside a `sequence` (e.g. a callout's hold). */
  wait(seconds: number): TweenHandle {
    return this.to({ t: 0 }, { t: 1 }, { duration: seconds, ease: Ease.linear });
  }

  /** Runs the steps one after another. Cancelling stops the current step and the rest. */
  sequence(...steps: TweenStep[]): TweenHandle {
    let current: TweenHandle | null = null;
    const group = new ManualHandle(() => current?.cancel());
    const next = (i: number) => {
      if (group.done) return;
      const step = steps[i];
      if (!step) return group.finish();
      current = step();
      current.whenDone(() => next(i + 1));
    };
    next(0);
    return group;
  }

  /** Runs the steps together; done when all are. Cancelling stops them all. */
  parallel(...steps: TweenStep[]): TweenHandle {
    const handles: TweenHandle[] = [];
    const group = new ManualHandle(() => handles.forEach((h) => h.cancel()));
    let remaining = steps.length;
    if (remaining === 0) group.finish();
    for (const step of steps) {
      const handle = step();
      handles.push(handle);
      handle.whenDone(() => {
        if (--remaining === 0) group.finish();
      });
    }
    return group;
  }

  update(dt: number): void {
    if (this.tweens.length === 0) return;
    const finished: Tween[] = [];
    for (const t of this.tweens) {
      t.elapsed += dt;
      const running = t.elapsed - t.delay;
      if (running < 0) continue;
      if (!t.started) {
        t.started = true;
        for (const key of Object.keys(t.to)) t.from[key] = t.target[key]!;
      }
      const p = t.duration === 0 ? 1 : Math.min(1, running / t.duration);
      const e = t.ease(p);
      for (const key of Object.keys(t.to)) {
        t.target[key] = t.from[key]! + (t.to[key]! - t.from[key]!) * e;
      }
      if (p >= 1) finished.push(t);
    }
    if (finished.length === 0) return;
    this.tweens = this.tweens.filter((t) => !finished.includes(t));
    for (const t of finished) {
      t.onComplete?.();
      t.handle.finish();
    }
  }

  cancelAll(): void {
    const tweens = this.tweens;
    this.tweens = [];
    for (const t of tweens) t.handle.cancel();
  }
}
