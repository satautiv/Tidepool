import { describe, expect, it, vi } from 'vitest';
import { TabGuard, tabChannel, type TabChannel } from './tabs';

/** Channels on one in-memory bus, delivering synchronously to every other channel. */
function bus() {
  const channels: { deliver: (data: unknown) => void }[] = [];
  return (): TabChannel => {
    const listeners: ((e: MessageEvent) => void)[] = [];
    const self = {
      deliver: (data: unknown) => listeners.forEach((l) => l({ data } as MessageEvent)),
    };
    channels.push(self);
    return {
      postMessage: (data) => channels.filter((c) => c !== self).forEach((c) => c.deliver(data)),
      addEventListener: (_type, l) => void listeners.push(l),
      close: () => {},
    };
  };
}

describe('TabGuard', () => {
  it('makes an older tab dormant when a new tab claims the game', () => {
    const open = bus();
    const first = vi.fn();
    const second = vi.fn();
    const a = new TabGuard(open(), first, 'a');
    a.claim();
    expect(a.active).toBe(true);

    const b = new TabGuard(open(), second, 'b');
    b.claim();
    expect(first).toHaveBeenCalledOnce();
    expect(a.active).toBe(false);
    expect(b.active).toBe(true);
    expect(second).not.toHaveBeenCalled();

    b.claim(); // already dormant: no second call
    expect(first).toHaveBeenCalledOnce();
  });

  it('ignores its own and unrelated messages', () => {
    const listeners: ((e: MessageEvent) => void)[] = [];
    const channel: TabChannel = {
      postMessage() {},
      addEventListener: (_type, l) => void listeners.push(l),
      close() {},
    };
    const taken = vi.fn();
    const guard = new TabGuard(channel, taken, 'me');
    for (const data of [{ type: 'claim', id: 'me' }, { type: 'hello' }, null, 'claim']) {
      listeners.forEach((l) => l({ data } as MessageEvent));
    }
    expect(taken).not.toHaveBeenCalled();
    expect(guard.active).toBe(true);
  });

  it('stays active without a channel', () => {
    const guard = new TabGuard(null, vi.fn());
    guard.claim();
    expect(guard.active).toBe(true);
  });

  it('uses BroadcastChannel where it exists', () => {
    const channel = tabChannel('tidepool-test');
    expect(channel).toBeInstanceOf(BroadcastChannel);
    channel!.close();
  });
});
