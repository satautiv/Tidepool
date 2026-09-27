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

function manualTimers() {
  const timers: { at: number; fn: () => void }[] = [];
  let now = 0;
  return {
    setTimer: (fn: () => void, ms: number) => void timers.push({ at: now + ms, fn }),
    advance(ms: number) {
      now += ms;
      for (const t of timers.filter((t) => t.at <= now)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
  };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('TabGuard', () => {
  it('claims at once when no other tab answers', async () => {
    const timers = manualTimers();
    const guard = new TabGuard(bus()(), vi.fn(), { setTimer: timers.setTimer, answerMs: 50 });
    const claimed = vi.fn();
    void guard.claim().then(claimed);
    await settle();
    expect(claimed).not.toHaveBeenCalled();
    timers.advance(50);
    await settle();
    expect(claimed).toHaveBeenCalledOnce();
    expect(guard.active).toBe(true);
  });

  it('waits for an older tab to write out its save, which then goes dormant', async () => {
    const open = bus();
    const timers = manualTimers();
    let release!: () => void;
    const written = new Promise<void>((resolve) => (release = resolve));
    const onTakenOver = vi.fn(() => written);
    const older = new TabGuard(open(), onTakenOver, { id: 'old' });
    const newer = new TabGuard(open(), vi.fn(), { id: 'new', setTimer: timers.setTimer });

    const claimed = vi.fn();
    void newer.claim().then(claimed);
    await settle();
    expect(onTakenOver).toHaveBeenCalledOnce();
    expect(older.active).toBe(false);
    timers.advance(50); // the older tab answered, so the answer window doesn't end the wait
    await settle();
    expect(claimed).not.toHaveBeenCalled();

    release();
    await settle();
    expect(claimed).toHaveBeenCalledOnce();
    expect(newer.active).toBe(true);
  });

  it('gives up waiting on a tab that never releases', async () => {
    const open = bus();
    const timers = manualTimers();
    new TabGuard(open(), () => new Promise<void>(() => {}), { id: 'stuck' });
    const newer = new TabGuard(open(), vi.fn(), {
      id: 'new',
      setTimer: timers.setTimer,
      answerMs: 50,
      releaseMs: 1000,
    });
    const claimed = vi.fn();
    void newer.claim().then(claimed);
    timers.advance(50);
    await settle();
    expect(claimed).not.toHaveBeenCalled();
    timers.advance(1000);
    await settle();
    expect(claimed).toHaveBeenCalledOnce();
  });

  it('is taken over once, and a dormant tab no longer answers', async () => {
    const open = bus();
    const onTakenOver = vi.fn();
    const first = new TabGuard(open(), onTakenOver, { id: 'a' });
    const second = new TabGuard(open(), vi.fn(), { id: 'b', setTimer: () => {} });
    void second.claim();
    void second.claim();
    await settle();
    expect(onTakenOver).toHaveBeenCalledOnce();
    expect(first.active).toBe(false);
  });

  it('ignores its own and unrelated messages', () => {
    const listeners: ((e: MessageEvent) => void)[] = [];
    const channel: TabChannel = {
      postMessage() {},
      addEventListener: (_type, l) => void listeners.push(l),
      close() {},
    };
    const taken = vi.fn();
    const guard = new TabGuard(channel, taken, { id: 'me' });
    const messages = [
      { type: 'claim', id: 'me' },
      { type: 'released', id: 'x', to: 'me' }, // no claim in progress
      { type: 'hello', id: 'x' },
      null,
      'claim',
    ];
    for (const data of messages) listeners.forEach((l) => l({ data } as MessageEvent));
    expect(taken).not.toHaveBeenCalled();
    expect(guard.active).toBe(true);
  });

  it('stays active and claims at once without a channel', async () => {
    const guard = new TabGuard(null, vi.fn());
    await guard.claim();
    expect(guard.active).toBe(true);
  });

  it('uses BroadcastChannel where it exists', () => {
    const channel = tabChannel('tidepool-test');
    expect(channel).toBeInstanceOf(BroadcastChannel);
    channel!.close();
  });
});
