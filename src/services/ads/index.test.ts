import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdManager } from './AdManager';
import { createAdService } from './index';
import { NoAdsService } from './NoAdsService';
import { defaultSave } from '../storage/SaveStore';

describe('createAdService', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses NoAds for web targets', async () => {
    expect(await createAdService()).toBeInstanceOf(NoAdsService);
  });

  it.each([
    ['crazygames', 'crazygames'],
    ['poki', 'poki'],
    ['android', 'admob'],
  ] as const)('loads the %s placeholder, which keeps ads safely off', async (target, provider) => {
    vi.stubEnv('VITE_TARGET', target);
    const service = await createAdService();
    expect((service as unknown as { marker: string }).marker).toBe(`tidepool-ads-${provider}`);
    const save = defaultSave(0);
    const ads = new AdManager(service, { current: save, update: (fn) => fn(save) });
    await ads.init();
    expect(ads.isRewardedAvailable('secondChance')).toBe(false);
    expect(await ads.requestBreak('runEnd')).toBe('skipped');
  });
});
