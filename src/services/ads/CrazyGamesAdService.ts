/**
 * CrazyGames ads (T3.05). Placeholder until the SDK integration task: init() rejects, so the
 * AdManager keeps ads off and the game runs normally. The string below marks this module in
 * bundle checks (tools/check-targets.ts).
 */
import type { AdService } from './AdService';

export const PROVIDER_MARKER = 'tidepool-ads-crazygames';

export class CrazyGamesAdService implements AdService {
  readonly marker = PROVIDER_MARKER;

  async init(): Promise<void> {
    throw new Error('CrazyGames ads are not integrated yet (T3.05)');
  }

  isRewardedReady(): boolean {
    return false;
  }

  async showRewarded(_placement: string): Promise<boolean> {
    return false;
  }

  async showInterstitial(_placement: string): Promise<void> {}

  gameplayStart(): void {}

  gameplayStop(): void {}
}
