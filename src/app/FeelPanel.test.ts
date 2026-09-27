// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { FEEL_DEFAULTS, FEEL_TWEAKS } from '../render/feel';
import { createFeelPanel } from './FeelPanel';

describe('FeelPanel', () => {
  it('edits values live, copies them as JSON and resets', async () => {
    const feel = structuredClone(FEEL_DEFAULTS);
    const copy = vi.fn(async () => {});
    const panel = createFeelPanel({ feel, copy });
    const sliders = panel.querySelectorAll<HTMLInputElement>('input[type=range]');
    expect(sliders).toHaveLength(FEEL_TWEAKS.length);

    const slider = panel.querySelector<HTMLInputElement>('[data-path="lineClear.duration"]')!;
    slider.value = '0.5';
    slider.dispatchEvent(new Event('input'));
    expect(feel.lineClear.duration).toBe(0.5);
    expect(slider.parentElement!.querySelector('output')!.textContent).toBe('0.50');

    const [copyButton, resetButton] = panel.querySelectorAll('button');
    copyButton!.click();
    await Promise.resolve();
    expect(JSON.parse((copy.mock.calls[0] as unknown as [string])[0]).lineClear.duration).toBe(0.5);

    resetButton!.click();
    expect(feel).toEqual(FEEL_DEFAULTS);
    expect(slider.value).toBe(String(FEEL_DEFAULTS.lineClear.duration));
  });
});
