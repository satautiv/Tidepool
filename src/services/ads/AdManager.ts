/**
 * Ad policy and orchestration (docs/PLAN.md §13.2, D18, D19). The only way the game reaches
 * an ad provider. Every call is safe: a provider that throws, rejects or never resolves is
 * contained by timeouts, so ads can never block or break the game (README §8.2).
 */
import type { AdsSave } from '../storage/SaveStore';
import type { AdService, BreakPlacement, RewardedPlacement } from './AdService';

/** The part of `SaveStore` the manager needs. */
export interface AdsStore {
  readonly current: { readonly ads: AdsSave };
  update(mutate: (save: { ads: AdsSave }) => void): void;
}

export interface AdPolicy {
  /** Minimum gameplay time since the last interstitial or session start (D19). */
  interstitialGameplayMs: number;
  /** No interstitial within this long after a rewarded ad (D19). */
  afterRewardedMs: number;
  /** Hidden at least this long starts a new session (D18). */
  sessionGapMs: number;
  freeBoosterPerDay: number;
  initTimeoutMs: number;
  interstitialTimeoutMs: number;
  /** Rewarded ads are long; this only catches a provider that never answers. */
  rewardedTimeoutMs: number;
}

export const DEFAULT_AD_POLICY: AdPolicy = {
  interstitialGameplayMs: 180_000,
  afterRewardedMs: 60_000,
  sessionGapMs: 30 * 60_000,
  freeBoosterPerDay: 3,
  initTimeoutMs: 8_000,
  interstitialTimeoutMs: 8_000,
  rewardedTimeoutMs: 90_000,
};

export type BreakResult = 'shown' | 'skipped' | 'failed';
export type RewardedResult = 'earned' | 'skipped' | 'failed' | 'unavailable';

export interface AdManagerOptions {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  policy?: Partial<AdPolicy>;
  /** Pauses audio and the game loop while an ad is on screen (injected by App). */
  onAdStart?: () => void;
  onAdEnd?: () => void;
  /** Every ad outcome, for analytics (T1.24). */
  onResult?: (
    kind: 'rewarded' | 'interstitial',
    placement: string,
    result: BreakResult | RewardedResult,
  ) => void;
  onError?: (message: string) => void;
}

const TIMEOUT = Symbol('timeout');

/** Local calendar day `YYYY-MM-DD` for the daily limits. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class AdManager {
  readonly policy: AdPolicy;
  onAdStart: () => void;
  onAdEnd: () => void;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onResult: NonNullable<AdManagerOptions['onResult']>;
  private readonly onError: (message: string) => void;

  private ready = false;
  private busy = false;
  /** Gameplay is active (a run or level in play, not paused). */
  private playing = false;
  private playingSince = 0;
  private hiddenAt: number | null = null;
  private resumeOnVisible = false;
  private secondChanceUsed = false;
  private doubleRewardUsed = false;

  constructor(
    private readonly service: AdService,
    private readonly store: AdsStore,
    opts: AdManagerOptions = {},
  ) {
    this.policy = { ...DEFAULT_AD_POLICY, ...opts.policy };
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.onAdStart = opts.onAdStart ?? (() => {});
    this.onAdEnd = opts.onAdEnd ?? (() => {});
    this.onResult = opts.onResult ?? (() => {});
    this.onError = opts.onError ?? (() => {});
  }

  /** Starts a session (app launch) and initialises the provider. Never rejects. */
  async init(): Promise<void> {
    this.startSession();
    try {
      const result = await this.withTimeout(() => this.service.init(), this.policy.initTimeoutMs);
      this.ready = result !== TIMEOUT;
      if (!this.ready) this.onError('Ad provider init timed out');
    } catch (e) {
      this.onError(`Ad provider init failed: ${(e as Error).message}`);
    }
  }

  get sessionCount(): number {
    return this.store.current.ads.sessionCount;
  }

  get isShowingAd(): boolean {
    return this.busy;
  }

  /** Gameplay time counted towards the next interstitial, including the current stretch. */
  get gameplayMs(): number {
    const stored = this.store.current.ads.gameplayMsSinceInterstitial;
    return this.playing ? stored + Math.max(0, this.now() - this.playingSince) : stored;
  }

  // ---- Sessions and gameplay time -------------------------------------------------------

  /** Page hidden: stops gameplay time and remembers when, for the session gap (D18). */
  onHidden(): void {
    if (this.hiddenAt !== null) return;
    this.hiddenAt = this.now();
    this.resumeOnVisible = this.playing;
    if (this.playing) this.gameplayStop();
  }

  /** Page visible again: a long absence starts a new session. */
  onVisible(): void {
    if (this.hiddenAt === null) return;
    const away = this.now() - this.hiddenAt;
    this.hiddenAt = null;
    if (away >= this.policy.sessionGapMs) this.startSession();
    if (this.resumeOnVisible) this.gameplayStart();
    this.resumeOnVisible = false;
  }

  /** A new run or level attempt: resets the per-run limits and starts gameplay. */
  runStarted(): void {
    this.secondChanceUsed = false;
    this.doubleRewardUsed = false;
    this.gameplayStart();
  }

  /** Gameplay (re)starts: run start, resume from pause, continue after second chance. */
  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.playingSince = this.now();
    this.safely(() => this.service.gameplayStart(), 'gameplayStart');
  }

  /** Gameplay stops: pause, game over, level end, ad show. */
  gameplayStop(): void {
    if (!this.playing) return;
    const played = this.gameplayMs;
    this.playing = false;
    this.store.update((s) => (s.ads.gameplayMsSinceInterstitial = played));
    this.safely(() => this.service.gameplayStop(), 'gameplayStop');
  }

  // ---- Interstitials --------------------------------------------------------------------

  /** D18 + D19: only at a break point, never in session 1, after enough play and rewards. */
  canShowInterstitial(): boolean {
    const ads = this.store.current.ads;
    return (
      this.ready &&
      !this.busy &&
      !this.playing &&
      ads.sessionCount > 1 &&
      this.gameplayMs >= this.policy.interstitialGameplayMs &&
      this.now() - ads.lastRewardedAt >= this.policy.afterRewardedMs
    );
  }

  /** Called at every break point. Shows an interstitial if the policy allows. Never rejects. */
  async requestBreak(placement: BreakPlacement): Promise<BreakResult> {
    if (!this.canShowInterstitial()) return this.report('interstitial', placement, 'skipped');
    const result = await this.showing(async (): Promise<BreakResult> => {
      try {
        const done = await this.withTimeout(
          () => this.service.showInterstitial(placement),
          this.policy.interstitialTimeoutMs,
        );
        return done === TIMEOUT ? 'failed' : 'shown';
      } catch (e) {
        this.onError(`Interstitial failed: ${(e as Error).message}`);
        return 'failed';
      }
    });
    // A failed ad still resets the timer, so a broken provider isn't retried at every break.
    this.store.update((s) => (s.ads.gameplayMsSinceInterstitial = 0));
    return this.report('interstitial', placement, result);
  }

  // ---- Rewarded -------------------------------------------------------------------------

  /** Whether to offer a reward button at all. The UI hides the button when false. */
  isRewardedAvailable(placement: RewardedPlacement): boolean {
    if (!this.ready || this.busy || !this.withinLimit(placement)) return false;
    try {
      return this.service.isRewardedReady();
    } catch {
      return false;
    }
  }

  /** Plays a rewarded ad the player asked for. True only when the reward was earned. */
  async rewarded(placement: RewardedPlacement): Promise<boolean> {
    if (!this.isRewardedAvailable(placement)) {
      this.report('rewarded', placement, 'unavailable');
      return false;
    }
    const result = await this.showing(async (): Promise<RewardedResult> => {
      try {
        const earned = await this.withTimeout(
          () => this.service.showRewarded(placement),
          this.policy.rewardedTimeoutMs,
        );
        if (earned === TIMEOUT) return 'failed';
        return earned ? 'earned' : 'skipped';
      } catch (e) {
        this.onError(`Rewarded ad failed: ${(e as Error).message}`);
        return 'failed';
      }
    });
    this.store.update((s) => (s.ads.lastRewardedAt = this.now()));
    if (result === 'earned') this.consume(placement);
    this.report('rewarded', placement, result);
    return result === 'earned';
  }

  private withinLimit(placement: RewardedPlacement): boolean {
    const daily = this.daily();
    switch (placement) {
      case 'secondChance':
        return !this.secondChanceUsed;
      case 'doubleReward':
        return !this.doubleRewardUsed;
      case 'freeBooster':
        return daily.freeBoosterAds < this.policy.freeBoosterPerDay;
      case 'dailyBonus':
        return !daily.dailyBonusClaimed;
    }
  }

  private consume(placement: RewardedPlacement): void {
    if (placement === 'secondChance') this.secondChanceUsed = true;
    if (placement === 'doubleReward') this.doubleRewardUsed = true;
    if (placement !== 'freeBooster' && placement !== 'dailyBonus') return;
    this.daily();
    this.store.update((s) => {
      if (placement === 'freeBooster') s.ads.daily.freeBoosterAds++;
      else s.ads.daily.dailyBonusClaimed = true;
    });
  }

  /** Today's counters, reset when the local day has changed. */
  private daily(): AdsSave['daily'] {
    const today = dayKey(this.now());
    if (this.store.current.ads.daily.date !== today) {
      this.store.update(
        (s) => (s.ads.daily = { date: today, freeBoosterAds: 0, dailyBonusClaimed: false }),
      );
    }
    return this.store.current.ads.daily;
  }

  // ---- Plumbing -------------------------------------------------------------------------

  private startSession(): void {
    const now = this.now();
    this.store.update((s) => {
      s.ads.sessionCount++;
      s.ads.lastSessionStart = now;
      s.ads.gameplayMsSinceInterstitial = 0;
    });
    if (this.playing) this.playingSince = now;
  }

  /** Runs an ad with the game paused and gameplay signalled as stopped around it. */
  private async showing<T>(play: () => Promise<T>): Promise<T> {
    this.busy = true;
    const wasPlaying = this.playing;
    this.gameplayStop();
    this.safely(this.onAdStart, 'onAdStart');
    try {
      return await play();
    } finally {
      this.busy = false;
      this.safely(this.onAdEnd, 'onAdEnd');
      if (wasPlaying) this.gameplayStart();
    }
  }

  /** Resolves with the call's value, or TIMEOUT. Synchronous throws become rejections. */
  private withTimeout<T>(call: () => Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
    return new Promise((resolve, reject) => {
      const timer = this.setTimer(() => resolve(TIMEOUT), ms);
      const settle = () => this.clearTimer(timer);
      let promise: Promise<T>;
      try {
        promise = Promise.resolve(call());
      } catch (e) {
        settle();
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      promise.then(
        (value) => {
          settle();
          resolve(value);
        },
        (e: unknown) => {
          settle();
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });
  }

  private safely(fn: () => void, where: string): void {
    try {
      fn();
    } catch (e) {
      this.onError(`Ads ${where} failed: ${(e as Error).message}`);
    }
  }

  private report<R extends BreakResult | RewardedResult>(
    kind: 'rewarded' | 'interstitial',
    placement: string,
    result: R,
  ): R {
    this.safely(() => this.onResult(kind, placement, result), 'onResult');
    return result;
  }
}
