import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEL, FEEL_DEFAULTS, FEEL_TWEAKS, getFeel, resetFeel, setFeel } from './feel';

describe('feel config', () => {
  it('reads, writes and resets values by path', () => {
    const feel = structuredClone(FEEL_DEFAULTS);
    expect(getFeel('drop.placeDuration', feel)).toBe(FEEL_DEFAULTS.drop.placeDuration);
    setFeel('drop.placeDuration', 0.3, feel);
    expect(feel.drop.placeDuration).toBe(0.3);
    resetFeel(feel);
    expect(feel).toEqual(FEEL_DEFAULTS);
    setFeel('particles.bubble.life', 3, feel);
    expect(getFeel('particles.bubble.life', feel)).toBe(3);
    const bubble = feel.particles.bubble;
    resetFeel(feel);
    expect(feel.particles.bubble).toBe(bubble); // reset in place, never aliasing the defaults
    expect(bubble.life).toBe(FEEL_DEFAULTS.particles.bubble.life);
    expect(() => getFeel('particles', feel)).toThrow(/Unknown feel value/);
    expect(() => getFeel('drop.nope', feel)).toThrow(/Unknown feel value/);
    expect(() => setFeel('nope.x', 1, feel)).toThrow(/Unknown feel value/);
  });

  it('ships the defaults, and every tweak slider covers its default', () => {
    expect(FEEL).toEqual(FEEL_DEFAULTS);
    for (const { path, min, max, step } of FEEL_TWEAKS) {
      const value = getFeel(path);
      expect(value, path).toBeGreaterThanOrEqual(min);
      expect(value, path).toBeLessThanOrEqual(max);
      expect(step, path).toBeGreaterThan(0);
    }
  });

  it('has the §11 starting values for moments', () => {
    expect(FEEL.pickUp.liftDuration).toBe(0.09);
    expect(FEEL.invalidDrop.returnDuration).toBe(0.2);
    expect(FEEL.lineClear.stagger).toBe(0.022);
    expect(FEEL.deal).toMatchObject({ duration: 0.22, stagger: 0.06 });
    expect(FEEL.callout).toMatchObject({ popFrom: 0.6, popPeak: 1.12, popDuration: 0.22 });
    expect(FEEL.shake).toMatchObject({ amplitude3: 3, amplitude4: 5, duration: 0.18 });
  });

  // PLAN §11: animation numbers live in feel.ts, not in view code.
  it.each(['BoardView', 'GhostView', 'DragView', 'TrayView'])(
    '%s has no magic animation numbers',
    (view) => {
      const code = readFileSync(join(__dirname, `${view}.ts`), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code.match(/(?<![\w.])\d*\.\d+/g), 'decimal literals').toBeNull();
      expect(code.match(/(duration|delay|stagger)\s*:\s*\d/gi), 'literal timings').toBeNull();
    },
  );
});
