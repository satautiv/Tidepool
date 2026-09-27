/**
 * The ad provider for this build target (docs/PLAN.md §20). The branches test
 * `import.meta.env.VITE_TARGET`, a constant Vite replaces at build time, so every other
 * provider's `import()` is dead code and never ends up in the bundle
 * (checked by tools/check-targets.ts).
 */
import type { AdService } from './AdService';
import { NoAdsService, type NoAdsOptions } from './NoAdsService';

export async function createAdService(noAds: NoAdsOptions = {}): Promise<AdService> {
  const target = import.meta.env.VITE_TARGET;
  if (target === 'crazygames') {
    const { CrazyGamesAdService } = await import('./CrazyGamesAdService');
    return new CrazyGamesAdService();
  }
  if (target === 'poki') {
    const { PokiAdService } = await import('./PokiAdService');
    return new PokiAdService();
  }
  if (target === 'android') {
    const { AdMobAdService } = await import('./AdMobAdService');
    return new AdMobAdService();
  }
  return new NoAdsService(noAds);
}
