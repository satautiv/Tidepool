// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogStorage } from '../services/analytics/LocalLogAnalytics';
import {
  applyPlaytestVariant,
  downloadLog,
  logFileName,
  playtestFlags,
  PLAYTEST_FLAGS_KEY,
} from './playtest';

function memoryStorage(): LogStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const flags = (query: string, storage: LogStorage | null = memoryStorage()) =>
  playtestFlags(new URLSearchParams(query), storage);

describe('playtestFlags', () => {
  it('is off with release behaviour by default', () => {
    expect(flags('')).toEqual({ enabled: false, magnet: true, l4: false, clearLog: false });
  });

  it('ignores the variant switches outside playtest mode', () => {
    expect(flags('?magnet=0&l4=1&clearlog=1')).toEqual({
      enabled: false,
      magnet: true,
      l4: false,
      clearLog: false,
    });
  });

  it('reads the variant switches in playtest mode', () => {
    expect(flags('?playtest=1')).toMatchObject({ enabled: true, magnet: true, l4: false });
    expect(flags('?playtest=1&magnet=0&l4=1&clearlog=1')).toEqual({
      enabled: true,
      magnet: false,
      l4: true,
      clearLog: true,
    });
  });

  it('remembers playtest mode and the variant until changed', () => {
    const storage = memoryStorage();
    flags('?playtest=1&magnet=0', storage);
    expect(flags('', storage)).toMatchObject({ enabled: true, magnet: false, l4: false });
    expect(flags('?l4=1', storage)).toMatchObject({ enabled: true, magnet: false, l4: true });
    expect(flags('?magnet=1', storage)).toMatchObject({ magnet: true, l4: true });
    // clearlog is a one-off.
    flags('?clearlog=1', storage);
    expect(flags('', storage).clearLog).toBe(false);

    expect(flags('?playtest=0', storage).enabled).toBe(false);
    expect(storage.data.has(PLAYTEST_FLAGS_KEY)).toBe(false);
    expect(flags('', storage)).toMatchObject({ enabled: false, magnet: true, l4: false });
  });

  it('survives missing, corrupt and blocked storage', () => {
    expect(flags('?playtest=1', null).enabled).toBe(true);
    const corrupt = memoryStorage();
    corrupt.setItem(PLAYTEST_FLAGS_KEY, '{nope');
    expect(flags('', corrupt).enabled).toBe(false);
    const blocked: LogStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(flags('?playtest=1&l4=1', blocked)).toMatchObject({ enabled: true, l4: true });
    expect(flags('', blocked).enabled).toBe(false);
  });
});

describe('applyPlaytestVariant', () => {
  it('turns the magnet off only for the magnet-off variant', () => {
    const drag = { magnetRadius: 0.75 };
    applyPlaytestVariant({ enabled: true, magnet: true, l4: false, clearLog: false }, drag);
    expect(drag.magnetRadius).toBe(0.75);
    applyPlaytestVariant({ enabled: true, magnet: false, l4: false, clearLog: false }, drag);
    expect(drag.magnetRadius).toBe(0);
  });
});

describe('downloading the log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the file by local date and time', () => {
    expect(logFileName(new Date(2026, 9, 4, 9, 5))).toBe('tidepool-playtest-2026-10-04-0905.json');
  });

  it('clicks a temporary download link with the JSON', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:log');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    const exportedAt = new Date(2026, 9, 4, 15, 32).getTime();
    downloadLog({ version: 1, exportedAt, entries: [{ t: 1, name: 'x', props: {} }] });

    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.download).toBe('tidepool-playtest-2026-10-04-1532.json');
    expect(clicks[0]!.href).toBe('blob:log');
    expect(clicks[0]!.isConnected).toBe(false);
    const blob = created.mock.calls[0]![0] as Blob;
    expect(JSON.parse(await blob.text())).toMatchObject({ exportedAt, entries: [{ name: 'x' }] });
  });
});
