import { describe, expect, it, vi } from 'vitest';
import {
  CORRUPT_KEY,
  defaultSave,
  migrate,
  SAVE_KEY,
  SAVE_VERSION,
  SaveStore,
  withDefaults,
} from './SaveStore';
import { createWebStorage, LocalStorageBackend, MemoryBackend } from './StorageBackend';

/** Manual timers so debounce behaviour is deterministic. */
function manualTimers() {
  const timers = new Map<number, () => void>();
  let next = 1;
  return {
    setTimer: (fn: () => void) => {
      timers.set(next, fn);
      return next++;
    },
    clearTimer: (h: unknown) => timers.delete(h as number),
    fire: () => {
      const due = [...timers.values()];
      timers.clear();
      due.forEach((fn) => fn());
    },
    get pending() {
      return timers.size;
    },
  };
}

async function freshStore(backend = new MemoryBackend(), extra = {}) {
  const timers = manualTimers();
  const onError = vi.fn();
  const store = new SaveStore(backend, { now: () => 1000, onError, ...timers, ...extra });
  await store.load();
  return { store, backend, timers, onError };
}

describe('defaults and migration', () => {
  it('creates and persists a default save on first launch', async () => {
    const { store, backend } = await freshStore();
    expect(store.current).toEqual(defaultSave(1000));
    expect(JSON.parse((await backend.get(SAVE_KEY))!)).toEqual(defaultSave(1000));
  });

  it('fills missing and wrongly-typed fields, dropping unknown keys', () => {
    const def = { a: 1, b: { c: 'x', d: true }, e: null as string | null };
    expect(withDefaults({ a: 'nope', b: { d: false, extra: 1 }, zzz: 3 }, def)).toEqual({
      a: 1,
      b: { c: 'x', d: false },
      e: null,
    });
    expect(withDefaults({ e: 'kept' }, def).e).toBe('kept');
    expect(withDefaults(null, def)).toEqual(def);
  });

  it('migrates the v0 shape to the current version', () => {
    const save = migrate({ best: 4321 }, 5);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.stats.bestScore).toBe(4321);
    expect(save.installedAt).toBe(5);
    expect(migrate({ best: 'x' }, 5).stats.bestScore).toBe(0);
  });

  it('keeps current-version data and fills new fields', () => {
    const save = migrate({ version: 1, stats: { bestScore: 99 }, installedAt: 42 }, 5);
    expect(save.stats).toEqual({ ...defaultSave(0).stats, bestScore: 99 });
    expect(save.installedAt).toBe(42);
    expect(save.settings).toEqual(defaultSave(0).settings);
  });

  it('rejects unknown, future and non-object saves', () => {
    expect(() => migrate({ version: 99 }, 0)).toThrow('newer than supported');
    expect(() => migrate({ version: -3 }, 0)).toThrow('No migration');
    expect(() => migrate([1, 2], 0)).toThrow('not an object');
  });
});

describe('SaveStore', () => {
  it('round-trips data through the backend', async () => {
    const backend = new MemoryBackend();
    const { store } = await freshStore(backend);
    store.update((s) => {
      s.stats.bestScore = 777;
      s.endlessRun = '{"x":1}';
    });
    await store.flush();
    const { store: again } = await freshStore(backend);
    expect(again.current.stats.bestScore).toBe(777);
    expect(again.current.endlessRun).toBe('{"x":1}');
  });

  it('debounces writes and flushes on demand', async () => {
    const backend = new MemoryBackend();
    const { store, timers } = await freshStore(backend);
    const set = vi.spyOn(backend, 'set');
    store.update((s) => (s.stats.gamesPlayed = 1));
    store.update((s) => (s.stats.gamesPlayed = 2));
    expect(store.isDirty).toBe(true);
    expect(timers.pending).toBe(1);
    expect(set).not.toHaveBeenCalled();

    timers.fire();
    await store.flush();
    expect(set).toHaveBeenCalledTimes(1);
    expect(JSON.parse((await backend.get(SAVE_KEY))!).stats.gamesPlayed).toBe(2);

    store.update((s) => (s.stats.gamesPlayed = 3));
    await store.flush();
    expect(store.isDirty).toBe(false);
    expect(set).toHaveBeenCalledTimes(2);
    await store.flush(); // nothing pending
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('backs up corrupt data, starts fresh and reports it', async () => {
    const backend = new MemoryBackend();
    await backend.set(SAVE_KEY, '{not json');
    const { store, onError } = await freshStore(backend);
    expect(store.current).toEqual(defaultSave(1000));
    expect(await backend.get(CORRUPT_KEY)).toBe('{not json');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Corrupt save reset'));
  });

  it('reports write failures without throwing', async () => {
    const backend = new MemoryBackend();
    const { store, onError } = await freshStore(backend);
    vi.spyOn(backend, 'set').mockRejectedValue(new Error('quota'));
    store.update((s) => (s.stats.gamesPlayed = 1));
    await expect(store.flush()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith('Save failed: quota');
  });

  it('throws if used before load', () => {
    const store = new SaveStore(new MemoryBackend());
    expect(() => store.current).toThrow('not loaded');
  });

  it('uses real timers by default', async () => {
    vi.useFakeTimers();
    try {
      const backend = new MemoryBackend();
      const store = new SaveStore(backend, { now: () => 1 });
      await store.load();
      store.update((s) => (s.stats.gamesPlayed = 9));
      await vi.advanceTimersByTimeAsync(600);
      expect(JSON.parse((await backend.get(SAVE_KEY))!).stats.gamesPlayed).toBe(9);
      store.update((s) => (s.stats.gamesPlayed = 10));
      await store.flush();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('storage backends', () => {
  function fakeStorage(): Storage {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
  }

  it('uses localStorage when it works', async () => {
    const storage = fakeStorage();
    const backend = createWebStorage(() => storage);
    expect(backend).toBeInstanceOf(LocalStorageBackend);
    await backend.set('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    expect(await backend.get('k')).toBe('v');
    await backend.remove('k');
    expect(await backend.get('k')).toBeNull();
    expect(storage.length).toBe(0); // the probe key was cleaned up
  });

  it('falls back to memory when localStorage throws', async () => {
    const throwing = fakeStorage();
    throwing.setItem = () => {
      throw new Error('SecurityError');
    };
    expect(createWebStorage(() => throwing).kind).toBe('memory');
    expect(
      createWebStorage(() => {
        throw new Error('denied');
      }).kind,
    ).toBe('memory');
  });

  it('memory backend stores and removes values', async () => {
    const m = new MemoryBackend();
    await m.set('a', '1');
    expect(await m.get('a')).toBe('1');
    await m.remove('a');
    expect(await m.get('a')).toBeNull();
  });
});
