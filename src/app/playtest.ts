/**
 * Playtest mode (T2.18, docs/playtests/round1-plan.md). `?playtest=1` turns it on for this
 * device and `?playtest=0` turns it off. While it is on:
 * - every analytics event goes to a local log, exported from Settings ("Export playtest log");
 * - `?magnet=0|1` and `?l4=0|1` pick the variant (magnet assist, 4-cell L/J shapes). Each choice
 *   is remembered, so reopening the game keeps the tester on the same variant. `?playtest=1`
 *   starts from the default variant, apart from switches in the same URL;
 * - `?clearlog=1` empties the log (for the next tester on a shared device).
 */
import { DRAG } from '../input/DragController';
import type { LogStorage, PlaytestLog } from '../services/analytics/LocalLogAnalytics';

export const PLAYTEST_FLAGS_KEY = 'tidepool.playtest';

export interface PlaytestFlags {
  enabled: boolean;
  /** Magnet assist (on by default, as in the release). */
  magnet: boolean;
  /** 4-cell L/J shapes (off by default, as in the release). */
  l4: boolean;
  /** The log should be emptied now (`?clearlog=1`). Never remembered. */
  clearLog: boolean;
}

const DEFAULTS = { enabled: false, magnet: true, l4: false };

/** Reads the flags from the URL, falling back to (and updating) the ones remembered. */
export function playtestFlags(params: URLSearchParams, storage: LogStorage | null): PlaytestFlags {
  let saved: Partial<typeof DEFAULTS> = {};
  try {
    const raw = storage?.getItem(PLAYTEST_FLAGS_KEY);
    const data: unknown = raw ? JSON.parse(raw) : {};
    if (data && typeof data === 'object') saved = data as Partial<typeof DEFAULTS>;
  } catch {
    // corrupt or blocked: defaults
  }
  const bool = (key: string, fallback: boolean): boolean => {
    const v = params.get(key);
    return v === '1' ? true : v === '0' ? false : fallback;
  };
  const enabled = bool('playtest', saved.enabled === true);
  // A new session link starts from the release defaults.
  if (params.get('playtest') === '1') saved = {};
  const flags = {
    enabled,
    magnet: enabled && bool('magnet', saved.magnet ?? DEFAULTS.magnet),
    l4: enabled && bool('l4', saved.l4 ?? DEFAULTS.l4),
  };
  try {
    if (enabled) storage?.setItem(PLAYTEST_FLAGS_KEY, JSON.stringify(flags));
    else storage?.removeItem(PLAYTEST_FLAGS_KEY);
  } catch {
    // this page only
  }
  // Outside playtest mode the release behaviour applies: magnet on, no L4.
  return {
    ...flags,
    magnet: enabled ? flags.magnet : DEFAULTS.magnet,
    clearLog: enabled && params.get('clearlog') === '1',
  };
}

/** Applies the variant switches that live outside the App's options. */
export function applyPlaytestVariant(flags: PlaytestFlags, drag: { magnetRadius: number } = DRAG) {
  if (!flags.magnet) drag.magnetRadius = 0;
}

/** `tidepool-playtest-2026-10-04-1532.json`, in local time. */
export function logFileName(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
  return `tidepool-playtest-${day}-${p(at.getHours())}${p(at.getMinutes())}.json`;
}

/** Saves the log as a JSON file through a temporary download link. */
export function downloadLog(log: PlaytestLog, doc: Document = document): void {
  const blob = new Blob([JSON.stringify(log, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = logFileName(new Date(log.exportedAt));
  doc.body.append(a);
  a.click();
  a.remove();
  // Some browsers read the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
