import { describe, expect, it } from 'vitest';
import { ambient, ambientAsync, noteHz, SYNTH_SOUNDS } from './synth';

const RATE = 22050;

describe('synth', () => {
  it('tunes notes from A4', () => {
    expect(noteHz(0)).toBe(440);
    expect(noteHz(12)).toBeCloseTo(880);
  });

  it.each(Object.keys(SYNTH_SOUNDS).filter((id) => id !== 'ambient'))(
    '%s is audible, never clips, and starts and ends silent',
    (id) => {
      const s = SYNTH_SOUNDS[id]!(RATE);
      const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeGreaterThan(0.2);
      expect(peak).toBeLessThanOrEqual(0.81);
      expect(Math.abs(s[0]!)).toBeLessThan(0.01);
      expect(Math.abs(s[s.length - 1]!)).toBeLessThan(0.01);
      expect(s.length / RATE).toBeLessThan(2.1);
    },
  );

  it('is the same every time', () => {
    expect(SYNTH_SOUNDS.whoosh!(RATE)).toEqual(SYNTH_SOUNDS.whoosh!(RATE));
  });

  it('makes a seamless ambient loop (no jump at the loop point)', () => {
    const s = ambient(8000, 6);
    expect(s.length).toBe(48000);
    let maxStep = 0;
    for (let i = 1; i < s.length; i++) maxStep = Math.max(maxStep, Math.abs(s[i]! - s[i - 1]!));
    const wrap = Math.abs(s[0]! - s[s.length - 1]!);
    expect(wrap).toBeLessThanOrEqual(maxStep * 1.5); // wrapping is no bigger a step than usual
  });
});

describe('ambientAsync', () => {
  it('produces the same loop in slices, pausing between them', async () => {
    let pauses = 0;
    const sliced = await ambientAsync(8000, 20, async () => void pauses++);
    expect(sliced).toEqual(ambient(8000, 20));
    expect(pauses).toBeGreaterThan(3);
  });
});
