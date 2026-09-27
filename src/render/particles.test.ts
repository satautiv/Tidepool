import { describe, expect, it } from 'vitest';
import { FEEL } from './feel';
import { ParticleSystem, ParticleView } from './particles';
import { TIDEPOOL } from './palettes';
import { SpriteSet, WHITE } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

/** Deterministic random: cycles through a few values. */
function cycle(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function sprites() {
  const set = new SpriteSet(TIDEPOOL, fakeCanvasFactory().factory);
  set.build(40, 2);
  return set;
}

/** Reads a private typed array for assertions. */
const field = (sys: ParticleSystem, name: string) =>
  (sys as unknown as Record<string, Float32Array>)[name]!;

describe('ParticleSystem', () => {
  it('bursts in a cone around the given angle at up to the given speed', () => {
    const sys = new ParticleSystem(16, cycle(0.5));
    expect(sys.burst('bubble', 10, 20, 3, Math.PI, 100)).toBe(3);
    expect(sys.count).toBe(3);
    // random 0.5 → the centre of the cone (up) at 75% speed.
    expect(field(sys, 'x')[0]).toBe(10);
    expect(field(sys, 'vx')[0]).toBeCloseTo(0);
    expect(field(sys, 'vy')[0]).toBeCloseTo(-75);
  });

  it('emits along a line by length', () => {
    const sys = new ParticleSystem(64, cycle(0, 0.5, 1));
    expect(sys.line('dot', 0, 0, 100, 0, 0.1)).toBe(10);
    const xs = Array.from(field(sys, 'x').subarray(0, sys.count));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100);
  });

  it('never grows past its capacity', () => {
    const sys = new ParticleSystem(8);
    const x = field(sys, 'x');
    expect(sys.burst('sparkle', 0, 0, 20, 1, 1)).toBe(8);
    expect(sys.burst('sparkle', 0, 0, 5, 1, 1)).toBe(0);
    expect(sys.count).toBe(8);
    expect(field(sys, 'x')).toBe(x); // same buffers: no reallocation
  });

  it('scales counts by density, carrying fractions', () => {
    const sys = new ParticleSystem(64);
    sys.density = 0.25;
    const emitted = [0, 1, 2, 3, 4, 5, 6, 7].map(() => sys.burst('dot', 0, 0, 2, 1, 1));
    expect(emitted.reduce((a, b) => a + b)).toBe(4);
    sys.density = 0;
    expect(sys.burst('dot', 0, 0, 100, 1, 1)).toBe(0);
  });

  it('moves with gravity and drag, and expires particles by life', () => {
    const sys = new ParticleSystem(8, cycle(0.5));
    sys.burst('droplet', 0, 0, 1, 0, 0);
    sys.burst('bubble', 0, 0, 1, 0, 0);
    sys.update(0.1);
    expect(field(sys, 'vy')[0]).toBeGreaterThan(0); // droplets fall
    expect(field(sys, 'vy')[1]).toBeLessThan(0); // bubbles rise
    sys.update(FEEL.particles.droplet.life); // jitter 1.0 with random 0.5
    expect(sys.count).toBe(1);
    // The survivor (the bubble) was moved into slot 0.
    expect(field(sys, 'gravity')[0]).toBe(FEEL.particles.bubble.gravity);
    sys.update(10);
    expect(sys.count).toBe(0);
    sys.burst('dot', 0, 0, 3, 0, 0);
    sys.clear();
    expect(sys.count).toBe(0);
  });

  it('draws sparkles in an additive pass and restores the context', () => {
    const sys = new ParticleSystem(8, cycle(0.5));
    sys.burst('bubble', 5, 5, 2, 0, 0, { color: 2 });
    sys.burst('sparkle', 5, 5, 1, 0, 0, { color: WHITE });
    const ctx = fakeContext();
    const ops: string[] = [];
    let op = 'source-over';
    Object.defineProperty(ctx, 'globalCompositeOperation', {
      get: () => op,
      set: (v: string) => ops.push((op = v)),
    });
    sys.draw(ctx, sprites(), 2, 3, 4);
    expect(ctx.count('drawImage')).toBe(3);
    expect(ops).toEqual(['lighter', 'source-over']);
    // Ends at the base transform plus the offset (screen shake).
    expect(ctx.calls.at(-1)).toEqual(['setTransform', 2, 0, 0, 2, 6, 8]);
  });

  it('skips drawing when empty or invisible', () => {
    const sys = new ParticleSystem(8, cycle(0.5));
    const ctx = fakeContext();
    sys.draw(ctx, sprites(), 1);
    expect(ctx.calls).toEqual([]);
    sys.burst('dot', 0, 0, 1, 0, 0);
    sys.update(FEEL.particles.dot.life * 0.999); // size and alpha close to 0
    sys.draw(ctx, sprites(), 1);
    expect(ctx.count('drawImage')).toBeLessThanOrEqual(1);
  });

  it('handles a full pool of 512 for many frames', () => {
    const sys = new ParticleSystem();
    const set = sprites();
    const ctx = fakeContext();
    for (let frame = 0; frame < 120; frame++) {
      sys.burst('bubble', 100, 100, 40, Math.PI, 120, { color: frame % 6 });
      sys.burst('sparkle', 100, 100, 20, Math.PI * 2, 200);
      sys.update(1 / 60);
      ctx.reset();
      sys.draw(ctx, set, 2);
      expect(sys.count).toBeLessThanOrEqual(512);
    }
    expect(sys.count).toBeGreaterThan(450); // saturated
  });
});

describe('ParticleView', () => {
  it('animates while particles live', () => {
    const view = new ParticleView(new ParticleSystem(8));
    expect(view.isAnimating()).toBe(false);
    view.system.burst('dot', 0, 0, 1, 0, 0);
    expect(view.isAnimating()).toBe(true);
    const ctx = fakeContext();
    view.draw(
      ctx,
      { sprites: sprites(), layout: {} as never },
      { dt: 0, time: 0, viewport: { width: 1, height: 1, dpr: 1 } },
    );
    expect(ctx.count('drawImage')).toBe(1);
    view.update(10);
    expect(view.isAnimating()).toBe(false);
  });
});
