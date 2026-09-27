import { describe, expect, it, vi } from 'vitest';
import { ConsoleAnalytics, NoopAnalytics } from './Analytics';

describe('ConsoleAnalytics', () => {
  it('logs each event as a collapsed group with its props', () => {
    const out = { groupCollapsed: vi.fn(), groupEnd: vi.fn(), log: vi.fn() };
    const analytics = new ConsoleAnalytics(out);
    analytics.track('run_start', { mode: 'endless', seed: 'abc' });
    expect(out.groupCollapsed.mock.calls[0]![0]).toContain('run_start');
    expect(out.log).toHaveBeenCalledWith({ mode: 'endless', seed: 'abc' });
    expect(out.groupEnd).toHaveBeenCalledOnce();
  });

  it('merges user props', () => {
    const out = { groupCollapsed: vi.fn(), groupEnd: vi.fn(), log: vi.fn() };
    const analytics = new ConsoleAnalytics(out);
    analytics.setUserProps({ a: 1 });
    analytics.setUserProps({ b: true });
    expect(out.log).toHaveBeenLastCalledWith('[analytics] user', { a: 1, b: true });
  });
});

describe('NoopAnalytics', () => {
  it('accepts everything and does nothing', async () => {
    const analytics = new NoopAnalytics();
    analytics.track('error', { message: 'x', where: 'y' });
    analytics.setUserProps({ a: 1 });
    await expect(analytics.flush()).resolves.toBeUndefined();
  });
});
