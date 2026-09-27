import { describe, expect, it } from 'vitest';
import { GameScene } from './GameScene';
import { TIDEPOOL } from './palettes';
import { Shake } from './shake';
import { SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

describe('Shake', () => {
  it('offsets by a decaying amount, then settles at zero', () => {
    const shake = new Shake(
      () => true,
      () => 0,
    ); // angle 0: all offset on x
    shake.start(4, 0.2);
    expect(shake.isAnimating()).toBe(true);
    shake.update(0.05);
    expect(shake.x).toBeCloseTo(3);
    shake.update(0.1);
    expect(shake.x).toBeCloseTo(1);
    expect(shake.y).toBeCloseTo(0);
    shake.update(0.1);
    expect(shake.isAnimating()).toBe(false);
    expect([shake.x, shake.y]).toEqual([0, 0]);
  });

  it('lets a stronger shake replace a weaker one, not the other way round', () => {
    const shake = new Shake(
      () => true,
      () => 0,
    );
    shake.start(3, 0.2);
    shake.update(0.01);
    shake.start(1, 1);
    shake.update(0.01);
    expect(shake.x).toBeGreaterThan(2);
    shake.start(5, 0.2);
    shake.update(0.01);
    expect(shake.x).toBeGreaterThan(4);
  });

  it('does nothing when disabled (reduced motion)', () => {
    let enabled = false;
    const shake = new Shake(() => enabled);
    shake.start(5, 0.2);
    expect(shake.isAnimating()).toBe(false);
    enabled = true;
    shake.start(0, 0.2);
    expect(shake.isAnimating()).toBe(false);
  });
});

describe('GameScene shake', () => {
  it('translates only the children added with shake', () => {
    const scene = new GameScene(new SpriteSet(TIDEPOOL, fakeCanvasFactory().factory));
    const drawn: string[] = [];
    scene.add({ draw: () => void drawn.push('board') }, { shake: true });
    scene.add({ draw: () => void drawn.push('drag') });
    scene.onLayout({ width: 390, height: 844, dpr: 2 });
    scene.setShake({ x: 2, y: -1 });
    const ctx = fakeContext();
    scene.draw(ctx, { dt: 0, time: 0, viewport: { width: 390, height: 844, dpr: 2 } });
    expect(drawn).toEqual(['board', 'drag']);
    expect(ctx.calls.map((c) => c[0])).toEqual(['save', 'translate', 'restore']);
    expect(ctx.calls[1]).toEqual(['translate', 2, -1]);

    scene.setShake({ x: 0, y: 0 });
    const still = fakeContext();
    scene.draw(still, { dt: 0, time: 0, viewport: { width: 390, height: 844, dpr: 2 } });
    expect(still.calls).toEqual([]);
  });
});
