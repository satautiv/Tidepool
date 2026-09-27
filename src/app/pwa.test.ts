import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './pwa';

class FakeWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();
  install() {
    this.state = 'installed';
    this.dispatchEvent(new Event('statechange'));
  }
}

function env(opts: { controller?: boolean; waiting?: FakeWorker; fail?: boolean } = {}) {
  const reg = Object.assign(new EventTarget(), {
    installing: null as FakeWorker | null,
    waiting: opts.waiting ?? null,
  });
  const sw = Object.assign(new EventTarget(), {
    controller: opts.controller ? {} : null,
    register: vi.fn(async () => {
      if (opts.fail) throw new Error('blocked');
      return reg;
    }),
  });
  const reload = vi.fn();
  const prompt = { showAction: vi.fn() };
  return { reg, sw, reload, prompt };
}
const TEXT = { update: 'New version ready.', action: 'Update' };

describe('registerServiceWorker', () => {
  it('registers quietly on the first install', async () => {
    const e = env();
    await registerServiceWorker(e.prompt, TEXT, {
      serviceWorker: e.sw as never,
      reload: e.reload,
    });
    expect(e.sw.register).toHaveBeenCalledWith('sw.js');
    const worker = new FakeWorker();
    e.reg.installing = worker;
    e.reg.dispatchEvent(new Event('updatefound'));
    worker.install();
    expect(e.prompt.showAction).not.toHaveBeenCalled(); // no controller yet: first install
  });

  it('offers an update, and only a tap activates it and reloads once', async () => {
    const e = env({ controller: true });
    await registerServiceWorker(e.prompt, TEXT, { serviceWorker: e.sw as never, reload: e.reload });
    const worker = new FakeWorker();
    e.reg.installing = worker;
    e.reg.dispatchEvent(new Event('updatefound'));
    worker.install();
    expect(e.prompt.showAction).toHaveBeenCalledWith(
      TEXT.update,
      TEXT.action,
      expect.any(Function),
    );
    expect(e.reload).not.toHaveBeenCalled();
    e.prompt.showAction.mock.calls[0]![2]();
    expect(worker.postMessage).toHaveBeenCalledWith('skipWaiting');
    e.sw.dispatchEvent(new Event('controllerchange'));
    e.sw.dispatchEvent(new Event('controllerchange'));
    expect(e.reload).toHaveBeenCalledOnce();
  });

  it('offers an update that was already waiting', async () => {
    const e = env({ controller: true, waiting: new FakeWorker() });
    await registerServiceWorker(e.prompt, TEXT, { serviceWorker: e.sw as never, reload: e.reload });
    expect(e.prompt.showAction).toHaveBeenCalledOnce();
  });

  it('never breaks the game when unsupported or blocked', async () => {
    const e = env({ fail: true });
    const none = await registerServiceWorker(e.prompt, TEXT, { reload: e.reload });
    expect(none).toBeNull();
    const blocked = await registerServiceWorker(e.prompt, TEXT, {
      serviceWorker: e.sw as never,
      reload: e.reload,
    });
    expect(blocked).toBeNull();
  });
});
