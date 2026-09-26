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
