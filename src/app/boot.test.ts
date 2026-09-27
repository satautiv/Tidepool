// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { BootLoader } from './boot';

function loaderEl() {
  const el = document.createElement('div');
  el.innerHTML = '<div class="bar"><div class="fill"></div></div>';
  document.body.append(el);
  return el;
}

describe('BootLoader', () => {
  it('moves the bar and tells portal SDKs, then fades out once', () => {
    vi.useFakeTimers();
    const el = loaderEl();
    const boot = new BootLoader(el);
    const portal = { loadingProgress: vi.fn(), loadingFinished: vi.fn() };
    boot.report(portal);
    boot.report({}); // not a portal: ignored
    boot.progress(0.5);
    expect(el.querySelector<HTMLElement>('.fill')!.style.width).toBe('50%');
    expect(el.getAttribute('aria-valuenow')).toBe('50');
    expect(portal.loadingProgress).toHaveBeenLastCalledWith(0.5);
    boot.finish();
    boot.finish();
    expect(portal.loadingFinished).toHaveBeenCalledOnce();
    expect(el.classList.contains('done')).toBe(true);
    vi.runAllTimers();
    expect(el.isConnected).toBe(false);
    vi.useRealTimers();
  });

  it('works without a loader element and survives throwing SDKs', () => {
    const boot = new BootLoader(null);
    boot.report({
      loadingProgress: () => {
        throw new Error('sdk');
      },
    });
    expect(() => boot.progress(2)).not.toThrow();
    expect(() => boot.finish()).not.toThrow();
  });
});
