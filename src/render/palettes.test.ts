import { describe, expect, it } from 'vitest';
import { hexToRgb } from './color';
import { COLORBLIND, PALETTES, TIDEPOOL, validatePalette } from './palettes';
import { drawGlassBlock, GLYPHS, SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

/** Colour-vision-deficiency simulation (Machado, Oliveira & Fernandes 2009, severity 1). */
const CVD: Record<string, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** sRGB hex → CIELAB (D65), optionally through a CVD matrix in linear RGB. */
function lab(hex: string, matrix?: number[][]): [number, number, number] {
  let rgb = hexToRgb(hex).map(toLinear);
  if (matrix) {
    rgb = matrix.map((row) =>
      Math.min(1, Math.max(0, row[0]! * rgb[0]! + row[1]! * rgb[1]! + row[2]! * rgb[2]!)),
    );
  }
  const [r, g, b] = rgb as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** The smallest CIE76 ΔE between any two colours of the palette. */
function minDeltaE(colors: readonly string[], matrix?: number[][]): number {
  const labs = colors.map((c) => lab(c, matrix));
  let min = Infinity;
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      min = Math.min(min, Math.hypot(...labs[i]!.map((v, k) => v - labs[j]![k]!)));
    }
  }
  return min;
}

describe('colour-blind palette', () => {
  it('is registered and valid', () => {
    expect(PALETTES.colorblind).toBe(COLORBLIND);
    expect(() => validatePalette(COLORBLIND)).not.toThrow();
    expect(COLORBLIND.glyphs).toBe(true);
  });

  it.each(Object.keys(CVD))('keeps all 6 colours clearly apart under %s', (kind) => {
    // ΔE ≥ 20 reads as clearly different colours at a glance.
    expect(minDeltaE(COLORBLIND.glass, CVD[kind])).toBeGreaterThanOrEqual(20);
  });

  it('is at least as distinguishable as the default palette under every simulation', () => {
    for (const matrix of Object.values(CVD)) {
      expect(minDeltaE(COLORBLIND.glass, matrix)).toBeGreaterThan(
        minDeltaE(TIDEPOOL.glass, matrix),
      );
    }
  });
});

describe('glyphs', () => {
  it('gives each colour its own glyph', () => {
    expect(new Set(GLYPHS).size).toBe(6);
  });

  it('draws a glyph only when asked', () => {
    const plain = fakeContext();
    drawGlassBlock(plain, 40, '#56B4E9');
    const marked = fakeContext();
    drawGlassBlock(marked, 40, '#56B4E9', 'cross');
    expect(marked.calls.length).toBeGreaterThan(plain.calls.length);
    expect(marked.count('lineTo')).toBe(plain.count('lineTo') + 2);
  });

  it('bakes glyphs into the sprites for glyph palettes and the patterns setting', () => {
    const { factory } = fakeCanvasFactory();
    const sprites = new SpriteSet(TIDEPOOL, factory);
    sprites.build(40, 1);
    const builds = sprites.builds;
    expect(sprites.glyphsOn).toBe(false);
    sprites.setPatterns(true);
    sprites.build(40, 1);
    expect(sprites.glyphsOn).toBe(true);
    expect(sprites.builds).toBe(builds + 1);
    sprites.setPatterns(false);
    sprites.setPalette(COLORBLIND);
    expect(sprites.glyphsOn).toBe(true);
  });
});
