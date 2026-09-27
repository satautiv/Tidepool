/**
 * The one interface every ad provider implements (README §8.3). Game code never calls it
 * directly: everything goes through `AdManager`, which applies the ad rules (README §8.2).
 */

export interface AdService {
  init(): Promise<void>;
  isRewardedReady(): boolean;
  /** Resolves true when the reward was earned. */
  showRewarded(placement: string): Promise<boolean>;
  showInterstitial(placement: string): Promise<void>;
  /** Some web portals require these signals around active play. */
  gameplayStart(): void;
  gameplayStop(): void;
}

/** Rewarded placements (README §8.1). */
export type RewardedPlacement = 'secondChance' | 'freeBooster' | 'doubleReward' | 'dailyBonus';

/** Interstitial placements: break points between runs or levels only. */
export type BreakPlacement = 'runEnd' | 'levelEnd';
