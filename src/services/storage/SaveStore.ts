/**
 * The single persisted save document (docs/PLAN.md §13.1): versioned, migrated on load,
 * filled with defaults for missing fields, and written with a debounce.
 */
import type { StorageBackend } from './StorageBackend';

export const SAVE_KEY = 'tidepool.save';
export const CORRUPT_KEY = 'tidepool.save.corrupt';
export const SAVE_VERSION = 1;

export interface Settings {
  sfx: number;
  music: number;
  sfxMuted: boolean;
  musicMuted: boolean;
  haptics: boolean;
  palette: string;
  /** Per-colour glyphs on the default palette (always on in the colour-blind palette). */
  patterns: boolean;
  reducedMotion: boolean | null; // null = follow the system setting
  lowPower: boolean;
  /** The "battery saver switched on" toast has been shown (it shows once, ever). */
  autoLowPowerNotified: boolean;
}

export interface Stats {
  bestScore: number;
  gamesPlayed: number;
  linesCleared: number;
  tidalWaves: number;
  totalPlaytimeMs: number;
}

/** Ad policy counters (docs/PLAN.md D18, D19; T1.22). */
export interface AdsSave {
  sessionCount: number;
  /** ms since epoch. */
  lastSessionStart: number;
  gameplayMsSinceInterstitial: number;
  /** ms since epoch; 0 = never. */
  lastRewardedAt: number;
  /** Per-day limits. `date` is the local day `YYYY-MM-DD` the counters belong to. */
  daily: { date: string; freeBoosterAds: number; dailyBonusClaimed: boolean };
}

export interface SaveV1 {
  version: 1;
  /** First launch, ms since epoch (analytics `daysSinceInstall`). */
  installedAt: number;
  settings: Settings;
  stats: Stats;
  /** Serialized in-progress Endless run (core `serialize`), or null. */
  endlessRun: string | null;
  /** Best score when the saved run started, so a resumed run can still say "New best!". */
  endlessRunBestAtStart: number;
  /** Play time of the saved run so far, across reloads (analytics `run_end.durationMs`). */
  endlessRunMs: number;
  ads: AdsSave;
}

export type Save = SaveV1;

export function defaultSave(now: number): Save {
  return {
    version: SAVE_VERSION,
    installedAt: now,
    settings: {
      sfx: 1,
      music: 0.35,
      sfxMuted: false,
      musicMuted: false,
      haptics: true,
      palette: 'tidepool',
      patterns: false,
      reducedMotion: null,
      lowPower: false,
      autoLowPowerNotified: false,
    },
    stats: { bestScore: 0, gamesPlayed: 0, linesCleared: 0, tidalWaves: 0, totalPlaytimeMs: 0 },
    endlessRun: null,
    endlessRunBestAtStart: 0,
    endlessRunMs: 0,
    ads: {
      sessionCount: 0,
      lastSessionStart: 0,
      gameplayMsSinceInterstitial: 0,
      lastRewardedAt: 0,
      daily: { date: '', freeBoosterAds: 0, dailyBonusClaimed: false },
    },
  };
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Step migrations: MIGRATIONS[n] turns a version-n document into version n+1.
 * Version 0 is the pre-release shape `{ best: number }`, kept as the migration example.
 */
export const MIGRATIONS: Record<number, (doc: Json) => Json> = {
  0: (doc) => ({
    version: 1,
    stats: { bestScore: typeof doc.best === 'number' ? doc.best : 0 },
  }),
};

/** Fills missing or wrongly-typed fields from `defaults`, recursively. Unknown keys are dropped. */
export function withDefaults<T>(value: unknown, defaults: T): T {
  if (!isObject(defaults)) {
    if (defaults === null) return (value === undefined ? defaults : value) as T;
    return (typeof value === typeof defaults ? value : defaults) as T;
  }
  const src = isObject(value) ? value : {};
  const out: Json = {};
  for (const [key, def] of Object.entries(defaults)) out[key] = withDefaults(src[key], def);
  return out as T;
}

/** Migrates any known version to the latest shape. Throws for unknown versions. */
export function migrate(raw: unknown, now: number): Save {
  if (!isObject(raw)) throw new Error('Save is not an object');
  let doc: Json = raw;
  let version = typeof doc.version === 'number' ? doc.version : 0;
  if (version > SAVE_VERSION) throw new Error(`Save version ${version} is newer than supported`);
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    doc = step(doc);
    version++;
  }
  return { ...withDefaults(doc, defaultSave(now)), version: SAVE_VERSION };
}

export interface SaveStoreOptions {
  now?: () => number;
  debounceMs?: number;
  /** Reports problems such as corrupt data (wired to analytics `error` in T1.24). */
  onError?: (message: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class SaveStore {
  private data: Save | null = null;
  private timer: unknown = null;
  private pending: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly onError: (message: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(
    private readonly backend: StorageBackend,
    opts: SaveStoreOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.debounceMs = opts.debounceMs ?? 500;
    this.onError = opts.onError ?? (() => {});
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Loads (or creates) the save. Must be called before `data`/`update`. */
  async load(): Promise<Save> {
    const raw = await this.backend.get(SAVE_KEY);
    if (raw === null) {
      this.data = defaultSave(this.now());
      await this.write();
      return this.data;
    }
    try {
      this.data = migrate(JSON.parse(raw), this.now());
    } catch (e) {
      this.onError(`Corrupt save reset: ${(e as Error).message}`);
      await this.backend.set(CORRUPT_KEY, raw);
      this.data = defaultSave(this.now());
      await this.write();
    }
    return this.data;
  }

  /** The current save (read it; change it through `update`). */
  get current(): Readonly<Save> {
    return this.loaded();
  }

  /** Mutates the save and schedules a debounced write. */
  update(mutate: (save: Save) => void): void {
    mutate(this.loaded());
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.write();
    }, this.debounceMs);
  }

  /**
   * Reset progress (Settings): everything back to defaults except the install date and the ad
   * policy counters, so resetting can't be used to skip the first-session and frequency rules.
   */
  reset(): void {
    const keep = this.loaded();
    const fresh = defaultSave(this.now());
    fresh.installedAt = keep.installedAt;
    fresh.ads = keep.ads;
    this.data = fresh;
    this.update(() => {});
  }

  /** Writes any pending change now (tab hidden, page closing). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
      await this.write();
    }
    await this.pending;
  }

  get isDirty(): boolean {
    return this.timer !== null;
  }

  private loaded(): Save {
    if (!this.data) throw new Error('SaveStore not loaded');
    return this.data;
  }

  private write(): Promise<void> {
    const json = JSON.stringify(this.loaded());
    this.pending = this.pending
      .then(() => this.backend.set(SAVE_KEY, json))
      .catch((e: unknown) => this.onError(`Save failed: ${(e as Error).message}`));
    return this.pending;
  }
}
