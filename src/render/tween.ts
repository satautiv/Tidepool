/**
 * Minimal tween engine (docs/PLAN.md §7.4). Tweens numeric properties of plain objects and is
 * advanced by the owning view's `update(dt)`, so it runs on the renderer's clock.
 */

export type Easing = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  quadOut: (t: number) => 1 - (1 - t) * (1 - t),
  cubicOut: (t: number) => 1 - (1 - t) ** 3,
  /** Overshoots slightly past 1, then settles. */
  backOut: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
} satisfies Record<string, Easing>;

export interface TweenOptions {
  /** Seconds. */
  duration: number;
  delay?: number;
  ease?: Easing;
  onComplete?: () => void;
}

export interface TweenHandle {
  cancel(): void;
  readonly done: boolean;
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
  done: boolean;
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
    const tween: Tween = {
      target: target as unknown as Record<string, number>,
      from: {},
      to: props as Record<string, number>,
      elapsed: 0,
      delay: opts.delay ?? 0,
      duration: Math.max(0, opts.duration),
      ease: opts.ease ?? Ease.quadOut,
      onComplete: opts.onComplete,
      done: false,
      started: false,
    };
    this.tweens.push(tween);
    return {
      cancel: () => {
        tween.done = true;
        this.tweens = this.tweens.filter((t) => t !== tween);
      },
      get done() {
        return tween.done;
      },
    };
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
      t.done = true;
      t.onComplete?.();
    }
  }

  cancelAll(): void {
    for (const t of this.tweens) t.done = true;
    this.tweens = [];
  }
}
