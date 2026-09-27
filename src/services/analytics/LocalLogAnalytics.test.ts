import { describe, expect, it } from 'vitest';
import { LocalLogAnalytics, PLAYTEST_LOG_KEY, type LogStorage } from './LocalLogAnalytics';

function memoryStorage(): LogStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('LocalLogAnalytics', () => {
  it('records events, user props and notes with a timestamp', () => {
    let t = 100;
    const log = new LocalLogAnalytics({ storage: memoryStorage(), now: () => t });
    log.track('run_start', { mode: 'endless', seed: 'abc' });
    t = 250;
    log.setUserProps({ variant: 'magnetOff' });
    log.note('page_open', { width: 390 });
    expect(log.export()).toEqual({
      version: 1,
      exportedAt: 250,
      entries: [
        { t: 100, name: 'run_start', props: { mode: 'endless', seed: 'abc' } },
        { t: 250, name: 'user', props: { variant: 'magnetOff' } },
        { t: 250, name: 'page_open', props: { width: 390 } },
      ],
    });
  });

  it('persists every entry and continues the log after a reload', () => {
    const storage = memoryStorage();
    new LocalLogAnalytics({ storage }).track('error', { message: 'x', where: 'y' });
    expect(storage.data.has(PLAYTEST_LOG_KEY)).toBe(true);

    const reloaded = new LocalLogAnalytics({ storage });
    reloaded.track('tutorial_step', { step: 'hint' });
    expect(reloaded.export().entries.map((e) => e.name)).toEqual(['error', 'tutorial_step']);
  });

  it('drops the oldest entries beyond the cap', () => {
    const log = new LocalLogAnalytics({ storage: memoryStorage(), maxEntries: 2 });
    for (const step of ['a', 'b', 'c']) log.track('tutorial_step', { step });
    expect(log.export().entries.map((e) => e.props.step)).toEqual(['b', 'c']);
  });

  it('clears the log and its storage', () => {
    const storage = memoryStorage();
    const log = new LocalLogAnalytics({ storage });
    log.track('tutorial_step', { step: 'a' });
    log.clear();
    expect(log.size).toBe(0);
    expect(storage.data.has(PLAYTEST_LOG_KEY)).toBe(false);
  });

  it('keeps working in memory when storage is missing, broken or corrupt', async () => {
    const broken: LogStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    for (const storage of [null, broken]) {
      const log = new LocalLogAnalytics({ storage });
      log.track('tutorial_step', { step: 'a' });
      expect(log.size).toBe(1);
      log.clear();
      await expect(log.flush()).resolves.toBeUndefined();
    }

    const corrupt = memoryStorage();
    corrupt.setItem(PLAYTEST_LOG_KEY, '{nope');
    expect(new LocalLogAnalytics({ storage: corrupt }).size).toBe(0);
    corrupt.setItem(PLAYTEST_LOG_KEY, '{"not":"a list"}');
    expect(new LocalLogAnalytics({ storage: corrupt }).size).toBe(0);
  });
});
