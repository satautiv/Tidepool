import { describe, expect, it, vi } from 'vitest';
import { Lifecycle } from './lifecycle';

function env() {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const window = new EventTarget();
  const visibility = (state: DocumentVisibilityState) => {
    document.visibilityState = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  return { window, document, visibility };
}

describe('Lifecycle', () => {
  it('reports hide and show once each, whichever events arrive', () => {
    const e = env();
    const life = new Lifecycle(e);
    const hide = vi.fn();
    const show = vi.fn();
    life.onHide(hide);
    life.onShow(show);

    e.visibility('hidden');
    e.window.dispatchEvent(new Event('pagehide'));
    expect(hide).toHaveBeenCalledOnce();
    expect(life.hidden).toBe(true);

    e.visibility('visible');
    e.window.dispatchEvent(new Event('pageshow'));
    expect(show).toHaveBeenCalledOnce();
    expect(life.hidden).toBe(false);
  });

  it('treats pagehide alone as hidden and pageshow as coming back', () => {
    const e = env();
    const life = new Lifecycle(e);
    const hide = vi.fn();
    const show = vi.fn();
    life.onHide(hide);
    life.onShow(show);
    e.window.dispatchEvent(new Event('pagehide'));
    e.window.dispatchEvent(new Event('pageshow'));
    expect(hide).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledOnce();
  });

  it('starts hidden when the page loads in the background, and can unsubscribe', () => {
    const e = env();
    e.document.visibilityState = 'hidden';
    const life = new Lifecycle(e);
    expect(life.hidden).toBe(true);
    const show = vi.fn();
    const off = life.onShow(show);
    off();
    e.visibility('visible');
    expect(show).not.toHaveBeenCalled();
  });
});
