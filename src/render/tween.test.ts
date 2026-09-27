import { describe, expect, it, vi } from 'vitest';
import { Ease, Tweener } from './tween';

describe('easings', () => {
  it.each(Object.entries(Ease))('%s starts at 0 and ends at 1', (_name, ease) => {
    expect(ease(0)).toBeCloseTo(0);
    expect(ease(1)).toBeCloseTo(1);
  });

  it('backOut overshoots, quad/cubic out decelerate', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => Ease.backOut(i / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(Ease.quadOut(0.5)).toBeGreaterThan(0.5);
    expect(Ease.cubicOut(0.5)).toBeGreaterThan(Ease.quadOut(0.5));
    expect(Ease.linear(0.3)).toBe(0.3);
  });
});

describe('Tweener', () => {
  it('interpolates to the end value and completes once', () => {
    const t = new Tweener();
    const obj = { x: 0, y: 10 };
    const done = vi.fn();
    const h = t.to(obj, { x: 100 }, { duration: 1, ease: Ease.linear, onComplete: done });
    expect(t.active).toBe(1);
    t.update(0.25);
    expect(obj.x).toBeCloseTo(25);
    expect(obj.y).toBe(10);
    t.update(1);
    expect(obj.x).toBe(100);
    expect(done).toHaveBeenCalledTimes(1);
    expect(h.done).toBe(true);
    expect(t.active).toBe(0);
    t.update(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('waits for the delay and reads the start value when it starts', () => {
    const t = new Tweener();
    const obj = { x: 0 };
    t.to(obj, { x: 10 }, { duration: 1, delay: 0.5, ease: Ease.linear });
    t.update(0.4);
    expect(obj.x).toBe(0);
    obj.x = 5; // changed before the tween starts: it animates from 5
    t.update(0.6);
    expect(obj.x).toBeCloseTo(7.5); // halfway through: 1.0 s elapsed − 0.5 s delay
  });

  it('finishes zero-duration tweens immediately', () => {
    const t = new Tweener();
    const obj = { x: 0 };
    t.to(obj, { x: 3 }, { duration: 0 });
    t.update(0);
    expect(obj.x).toBe(3);
  });

  it('cancels individual and all tweens', () => {
    const t = new Tweener();
    const a = { x: 0 };
    const b = { x: 0 };
    const done = vi.fn();
    const h = t.to(a, { x: 1 }, { duration: 1, onComplete: done });
    t.to(b, { x: 1 }, { duration: 1, onComplete: done });
    h.cancel();
    expect(h.done).toBe(true);
    expect(t.active).toBe(1);
    t.cancelAll();
    t.update(2);
    expect(a.x).toBe(0);
    expect(b.x).toBe(0);
    expect(done).not.toHaveBeenCalled();
  });

  it('handles tweens created from completion callbacks', () => {
    const t = new Tweener();
    const obj = { x: 0 };
    t.to(
      obj,
      { x: 1 },
      { duration: 0.1, onComplete: () => t.to(obj, { x: 2 }, { duration: 0.1 }) },
    );
    t.update(0.1);
    expect(t.active).toBe(1);
    t.update(0.1);
    expect(obj.x).toBe(2);
  });
});

describe('Tween v2 easings', () => {
  it.each(['elasticOut', 'sineInOut'] as const)('%s runs from 0 to 1', (name) => {
    expect(Ease[name](0)).toBeCloseTo(0);
    expect(Ease[name](1)).toBeCloseTo(1);
  });

  it('elasticOut overshoots, sineInOut is symmetric', () => {
    const samples = Array.from({ length: 50 }, (_, i) => Ease.elasticOut(i / 50));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(Ease.sineInOut(0.5)).toBeCloseTo(0.5);
    expect(Ease.sineInOut(0.25)).toBeCloseTo(1 - Ease.sineInOut(0.75));
  });
});

describe('sequence, parallel and wait', () => {
  it('runs a sequence step by step, including a wait', () => {
    const t = new Tweener();
    const obj = { scale: 0.6 };
    const done = vi.fn();
    t.sequence(
      () => t.to(obj, { scale: 1.12 }, { duration: 0.1, ease: Ease.linear }),
      () => t.to(obj, { scale: 1 }, { duration: 0.1, ease: Ease.linear }),
      () => t.wait(0.5),
    ).whenDone(done);
    t.update(0.05);
    expect(obj.scale).toBeCloseTo(0.86);
    t.update(0.05);
    expect(obj.scale).toBeCloseTo(1.12);
    t.update(0.05); // the second step starts from where the first ended
    expect(obj.scale).toBeCloseTo(1.06);
    t.update(0.05);
    expect(obj.scale).toBeCloseTo(1);
    t.update(0.4);
    expect(done).not.toHaveBeenCalled();
    t.update(0.1);
    expect(done).toHaveBeenCalledOnce();
    expect(t.active).toBe(0);
  });

  it('finishes a parallel group when its longest step does', () => {
    const t = new Tweener();
    const a = { x: 0 };
    const b = { y: 0 };
    const group = t.parallel(
      () => t.to(a, { x: 1 }, { duration: 0.1 }),
      () => t.to(b, { y: 1 }, { duration: 0.3 }),
    );
    t.update(0.1);
    expect(a.x).toBe(1);
    expect(group.done).toBe(false);
    t.update(0.2);
    expect(b.y).toBe(1);
    expect(group.done).toBe(true);
  });

  it('nests groups, and empty groups finish at once', () => {
    const t = new Tweener();
    const obj = { x: 0, y: 0 };
    const done = vi.fn();
    t.sequence(
      () =>
        t.parallel(
          () => t.to(obj, { x: 1 }, { duration: 0.1 }),
          () => t.to(obj, { y: 1 }, { duration: 0.1 }),
        ),
      () => t.to(obj, { x: 2 }, { duration: 0.1 }),
    ).whenDone(done);
    t.update(0.1);
    t.update(0.1);
    expect(obj).toEqual({ x: 2, y: 1 });
    expect(done).toHaveBeenCalledOnce();
    expect(t.sequence().done).toBe(true);
    expect(t.parallel().done).toBe(true);
  });

  it('cancels a sequence: the current step stops and later ones never start', () => {
    const t = new Tweener();
    const obj = { x: 0 };
    const done = vi.fn();
    const seq = t.sequence(
      () => t.to(obj, { x: 1 }, { duration: 0.2, ease: Ease.linear }),
      () => t.to(obj, { x: 5 }, { duration: 0.1 }),
    );
    seq.whenDone(done);
    t.update(0.1);
    seq.cancel();
    t.update(1);
    expect(obj.x).toBeCloseTo(0.5);
    expect(t.active).toBe(0);
    expect(seq.done).toBe(true);
    expect(done).not.toHaveBeenCalled();
  });

  it('calls whenDone right away for finished tweens, never for cancelled ones', () => {
    const t = new Tweener();
    const h = t.to({ x: 0 }, { x: 1 }, { duration: 0.1 });
    t.update(0.1);
    const late = vi.fn();
    h.whenDone(late);
    expect(late).toHaveBeenCalledOnce();

    const c = t.to({ x: 0 }, { x: 1 }, { duration: 0.1 });
    const never = vi.fn();
    c.whenDone(never);
    t.cancelAll();
    c.whenDone(never);
    t.update(1);
    expect(never).not.toHaveBeenCalled();
  });
});
