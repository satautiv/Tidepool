import { describe, expect, it } from 'vitest';
import { buildCausticLayers, CausticsView, drawCausticLayer, drawSandTile } from './background';
import { FEEL } from './feel';
import { GameScene } from './GameScene';
import { TIDEPOOL } from './palettes';
import { sandColors, SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

/** A context with working ImageData, for the pixel generators. */
function pixelContext() {
  const ctx = fakeContext();
  let put: Uint8ClampedArray | null = null;
  Object.assign(ctx, {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img: { data: Uint8ClampedArray }) => void (put = img.data),
  });
  return { ctx, pixels: () => put! };
}

const alphas = (data: Uint8ClampedArray) => data.filter((_, i) => i % 4 === 3);

describe('sand tile', () => {
  it('is deterministic, translucent and varied, with a few pebbles', () => {
    const a = pixelContext();
    const b = pixelContext();
    drawSandTile(a.ctx, 32, sandColors(TIDEPOOL));
    drawSandTile(b.ctx, 32, sandColors(TIDEPOOL));
    expect(a.pixels()).toEqual(b.pixels());
    const alpha = alphas(a.pixels());
    expect(Math.max(...alpha)).toBeLessThan(128); // a subtle overlay, never opaque
    expect(new Set(alpha).size).toBeGreaterThan(10);
    expect(a.ctx.count('ellipse')).toBe(FEEL.sand.pebbles);
  });

  it('skips pixel work on contexts without ImageData', () => {
    const ctx = fakeContext();
    drawSandTile(ctx, 16, sandColors(TIDEPOOL));
    expect(ctx.count('putImageData')).toBe(0);
  });
});

describe('caustics', () => {
  it('draws a network of bright lines with dark gaps, different per layer', () => {
    const a = pixelContext();
    const b = pixelContext();
    drawCausticLayer(a.ctx, 64, 64, 0);
    drawCausticLayer(b.ctx, 64, 64, 1);
    const alpha = alphas(a.pixels());
    expect(Math.max(...alpha)).toBeGreaterThan(200);
    expect(alpha.filter((v) => v < 20).length).toBeGreaterThan(alpha.length / 3);
    expect(a.pixels()).not.toEqual(b.pixels());
  });

  it('builds half-resolution layers with room to drift', () => {
    const { factory, created } = fakeCanvasFactory();
    const layers = buildCausticLayers(factory, 320);
    expect(layers).toHaveLength(FEEL.caustics.layers);
    const expected = Math.round((320 + 2 * FEEL.caustics.drift) * FEEL.caustics.resolution);
    expect(created[0]!.width).toBe(expected);
  });

  function scene(enabled: () => boolean, clock: () => number) {
    const { factory } = fakeCanvasFactory();
    const s = new GameScene(new SpriteSet(TIDEPOOL, factory));
    const view = new CausticsView(enabled, factory, clock);
    s.add(view);
    s.onLayout({ width: 390, height: 844, dpr: 2 });
    return { s, view };
  }
  const frame = { dt: 0, time: 0, viewport: { width: 390, height: 844, dpr: 2 } };

  it('blends drifting layers over the board only, and draws nothing when off', () => {
    let on = true;
    let t = 0;
    const { s } = scene(
      () => on,
      () => t,
    );
    const ctx = fakeContext();
    s.draw(ctx, frame);
    expect(ctx.count('clip')).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('screen');
    const draws = ctx.calls.filter((c) => c[0] === 'drawImage');
    expect(draws).toHaveLength(FEEL.caustics.layers);

    t = 2;
    const later = fakeContext();
    s.draw(later, frame);
    const moved = later.calls.filter((c) => c[0] === 'drawImage');
    expect(moved[0]![2]).not.toBe(draws[0]![2]); // drifted

    on = false;
    const off = fakeContext();
    s.draw(off, frame);
    expect(off.calls).toEqual([]);
  });

  it('never asks the frame loop to keep animating (a ticker redraws it)', () => {
    const { view } = scene(
      () => true,
      () => 0,
    );
    expect('isAnimating' in view).toBe(false);
  });
});
