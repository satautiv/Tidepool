import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './events';

describe('EventBus', () => {
  it('delivers typed payloads to subscribers until they unsubscribe', () => {
    const bus = new EventBus<{ a: number; b: string }>();
    const a = vi.fn();
    const b = vi.fn();
    const off = bus.on('a', a);
    bus.on('b', b);
    bus.emit('a', 1);
    bus.emit('b', 'x');
    off();
    bus.emit('a', 2);
    expect(a.mock.calls).toEqual([[1]]);
    expect(b).toHaveBeenCalledWith('x');
  });

  it('tolerates handlers that unsubscribe during emit, and events without handlers', () => {
    const bus = new EventBus<{ a: number }>();
    const second = vi.fn();
    const off = bus.on('a', () => off());
    bus.on('a', second);
    bus.emit('a', 1);
    bus.emit('a', 2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(() => new EventBus<{ z: void }>().emit('z', undefined)).not.toThrow();
  });
});
