/**
 * Analytics behind one small interface (docs/PLAN.md §13.3). The backend is still open
 * (T3.14), so the game ships with `NoopAnalytics` and logs to the console in dev.
 */

export type GameMode = 'endless' | 'voyage' | 'daily';

/** Every event and its props (PLAN §13.3). A typo in a name or prop is a compile error. */
export interface AnalyticsEvents {
  session_start: { sessionIndex: number; daysSinceInstall: number; platform: string };
  session_end: { durationMs: number; runs: number };
  run_start: { mode: GameMode; seed: string };
  run_end: {
    mode: GameMode;
    score: number;
    placed: number;
    linesCleared: number;
    /** Share of the 64 cells filled when the run ended, 0–1. */
    fullnessAtEnd: number;
    durationMs: number;
    secondChanceUsed: boolean;
  };
  level_start: { levelId: string; attempt: number };
  level_end: {
    levelId: string;
    attempt: number;
    result: 'win' | 'lose' | 'quit';
    movesLeft: number;
    stars: number;
    boostersUsed: number;
  };
  ad_rewarded: { placement: string; result: 'earned' | 'skipped' | 'failed' | 'unavailable' };
  ad_interstitial: { placement: string; result: 'shown' | 'skipped' | 'failed' };
  booster_used: { booster: string; mode: GameMode };
  shells: { flow: 'source' | 'sink'; reason: string; amount: number };
  tutorial_step: { step: string };
  error: { message: string; where: string };
}

export type EventName = keyof AnalyticsEvents;
export type UserProps = Record<string, string | number | boolean>;

export interface Analytics {
  track<K extends EventName>(name: K, props: AnalyticsEvents[K]): void;
  setUserProps(props: UserProps): void;
  /** Sends anything buffered (page hidden or closing). */
  flush(): Promise<void>;
}

export class NoopAnalytics implements Analytics {
  track<K extends EventName>(_name: K, _props: AnalyticsEvents[K]): void {}
  setUserProps(_props: UserProps): void {}
  async flush(): Promise<void> {}
}

type LogConsole = Pick<Console, 'groupCollapsed' | 'groupEnd' | 'log'>;

/** Dev analytics: every event as a collapsed console group with its props. */
export class ConsoleAnalytics implements Analytics {
  private user: UserProps = {};

  constructor(private readonly out: LogConsole = console) {}

  track<K extends EventName>(name: K, props: AnalyticsEvents[K]): void {
    this.out.groupCollapsed(`%c[analytics] ${name}`, 'color:#2a9d8f;font-weight:bold');
    this.out.log(props);
    this.out.groupEnd();
  }

  setUserProps(props: UserProps): void {
    this.user = { ...this.user, ...props };
    this.out.log('[analytics] user', this.user);
  }

  async flush(): Promise<void> {}
}
