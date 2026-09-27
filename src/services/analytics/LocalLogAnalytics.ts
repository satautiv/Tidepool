/**
 * Playtest analytics (T2.18): every event is kept in localStorage on the tester's device, so
 * the session can be exported as JSON afterwards. Nothing leaves the device.
 */
import type { Analytics, AnalyticsEvents, EventName, UserProps } from './Analytics';

export const PLAYTEST_LOG_KEY = 'tidepool.playtestLog';
export const PLAYTEST_LOG_VERSION = 1;

export interface LogEntry {
  /** Wall clock, ms since epoch. */
  t: number;
  name: string;
  props: Record<string, unknown>;
}

export interface PlaytestLog {
  version: typeof PLAYTEST_LOG_VERSION;
  exportedAt: number;
  entries: LogEntry[];
}

export type LogStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface LocalLogOptions {
  /** Where the log persists. Null (or a storage that throws) keeps it in memory only. */
  storage: LogStorage | null;
  now?: () => number;
  /** Oldest entries are dropped beyond this, so the log can't fill the storage quota. */
  maxEntries?: number;
}

export class LocalLogAnalytics implements Analytics {
  private entries: LogEntry[];
  private readonly now: () => number;
  private readonly maxEntries: number;
  /** The stored log matches memory (the last write worked), so it is safe to re-read. */
  private synced = true;

  constructor(private readonly opts: LocalLogOptions) {
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? 5000;
    this.entries = this.read() ?? [];
  }

  track<K extends EventName>(name: K, props: AnalyticsEvents[K]): void {
    this.note(name, { ...props });
  }

  setUserProps(props: UserProps): void {
    this.note('user', { ...props });
  }

  /**
   * Records an entry outside the analytics events (page open, device info). The stored log is
   * re-read first, so entries written by another tab in between are kept, not overwritten.
   */
  note(name: string, props: Record<string, unknown>): void {
    if (this.synced) this.entries = this.read() ?? this.entries;
    this.entries.push({ t: this.now(), name, props });
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    this.write();
  }

  /** Entries are written as they come, so there is nothing to send. */
  async flush(): Promise<void> {}

  get size(): number {
    return this.entries.length;
  }

  export(): PlaytestLog {
    return { version: PLAYTEST_LOG_VERSION, exportedAt: this.now(), entries: [...this.entries] };
  }

  clear(): void {
    this.entries = [];
    try {
      this.opts.storage?.removeItem(PLAYTEST_LOG_KEY);
    } catch {
      // memory only
    }
  }

  /** The stored log; null when there is no readable storage. A corrupt log reads as empty. */
  private read(): LogEntry[] | null {
    let raw: string | null;
    try {
      if (!this.opts.storage) return null;
      raw = this.opts.storage.getItem(PLAYTEST_LOG_KEY);
    } catch {
      return null;
    }
    try {
      const data: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? (data as LogEntry[]) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      this.opts.storage?.setItem(PLAYTEST_LOG_KEY, JSON.stringify(this.entries));
      this.synced = true;
    } catch {
      // Quota or blocked storage: the log still works in memory for this page.
      this.synced = false;
    }
  }
}
