import { describe, expect, it, vi } from 'vitest';
import { NoHaptics, VIBRATE_MS, WebHaptics } from './haptics';

describe('WebHaptics', () => {
  it('vibrates for each level when enabled', () => {
    const vibrate = vi.fn(() => true);
    const haptics = new WebHaptics(() => true, { vibrate });
    haptics.impact('light');
    haptics.impact('medium');
    haptics.impact('heavy');
    expect(vibrate.mock.calls).toEqual([[10], [20], [35]]);
    expect(VIBRATE_MS.heavy).toBeGreaterThan(VIBRATE_MS.light);
  });

  it('respects the settings toggle, read at each call', () => {
    const vibrate = vi.fn(() => true);
    let on = false;
    const haptics = new WebHaptics(() => on, { vibrate });
    haptics.impact('heavy');
    expect(vibrate).not.toHaveBeenCalled();
    on = true;
    haptics.impact('heavy');
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it('does nothing without vibrate (iOS Safari) and survives a throwing one', () => {
    expect(() => new WebHaptics(() => true, {}).impact('light')).not.toThrow();
    expect(() => new WebHaptics(() => true, undefined).impact('light')).not.toThrow();
    const throwing = new WebHaptics(() => true, {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    expect(() => throwing.impact('medium')).not.toThrow();
    expect(() => new NoHaptics().impact('heavy')).not.toThrow();
  });
});
