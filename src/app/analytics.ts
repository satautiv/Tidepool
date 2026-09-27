/**
 * Turns app, ad and page events into analytics events (docs/PLAN.md §13.3). All game
 * instrumentation lives here, so `core/` never knows analytics exists.
 */
import { fullness } from '../core/board';
import type { Analytics, AnalyticsEvents } from '../services/analytics/Analytics';
import type { AdManagerOptions } from '../services/ads/AdManager';
import type { App } from './App';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A crash loop must not flood the backend. */
const MAX_ERRORS_PER_SESSION = 20;

export interface GameAnalyticsOptions {
  platform: string;
  /** First launch, ms since epoch (read from the save once it is loaded). */
  installedAt: () => number;
  now?: () => number;
}

export class GameAnalytics {
  private runs = 0;
  private errors = 0;
  private readonly now: () => number;

  constructor(
    private readonly analytics: Analytics,
    private readonly opts: GameAnalyticsOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  /** Callbacks for `AdManager`: sessions and ad results. */
  get adHooks(): Required<
    Pick<AdManagerOptions, 'onSessionStart' | 'onSessionEnd' | 'onResult' | 'onError'>
  > {
    return {
      onSessionStart: (index) => this.sessionStarted(index),
      onSessionEnd: (durationMs) => this.sessionEnded(durationMs),
      onResult: (kind, placement, result) => {
        if (kind === 'rewarded') {
          this.analytics.track('ad_rewarded', {
            placement,
            result: result as AnalyticsEvents['ad_rewarded']['result'],
          });
        } else {
          this.analytics.track('ad_interstitial', {
            placement,
            result: result as AnalyticsEvents['ad_interstitial']['result'],
          });
        }
      },
      onError: (message) => this.error(message, 'ads'),
    };
  }

  sessionStarted(sessionIndex: number): void {
    this.runs = 0;
    this.errors = 0;
    this.analytics.track('session_start', {
      sessionIndex,
      daysSinceInstall: Math.max(0, Math.floor((this.now() - this.opts.installedAt()) / DAY_MS)),
      platform: this.opts.platform,
    });
  }

  sessionEnded(durationMs: number): void {
    this.analytics.track('session_end', { durationMs, runs: this.runs });
    void this.analytics.flush();
  }

  error(message: string, where: string): void {
    if (++this.errors > MAX_ERRORS_PER_SESSION) return;
    this.analytics.track('error', { message: message.slice(0, 300), where });
  }

  /** Run events from the app bus. */
  attach(app: App): void {
    app.bus.on('runStart', ({ seed, resumed }) => {
      if (resumed || seed === null) return;
      this.runs++;
      this.analytics.track('run_start', { mode: 'endless', seed });
    });
    app.bus.on('perfFallback', ({ feature, frameMs }) => {
      this.analytics.track('perf_fallback', { feature, frameMs: Math.round(frameMs * 10) / 10 });
    });
    app.bus.on('runEnd', ({ state, durationMs }) => {
      this.analytics.track('run_end', {
        mode: 'endless',
        score: state.score,
        placed: state.stats.placed,
        linesCleared: state.stats.linesCleared,
        fullnessAtEnd: Math.round(fullness(state.board) * 1000) / 1000,
        durationMs: Math.round(durationMs),
        secondChanceUsed: state.secondChanceUsed,
      });
    });
  }

  /** Uncaught errors and unhandled promise rejections. */
  catchGlobalErrors(target: EventTarget): void {
    target.addEventListener('error', (e) => {
      const ev = e as ErrorEvent;
      this.error(ev.message || String(ev.error), 'window');
    });
    target.addEventListener('unhandledrejection', (e) => {
      const reason = (e as PromiseRejectionEvent).reason as unknown;
      this.error(reason instanceof Error ? reason.message : String(reason), 'promise');
    });
  }
}
