import { describe, expect, it, vi } from 'vitest';
import { defaultSave, type Save } from '../storage/SaveStore';
import { AdManager, dayKey, type AdManagerOptions, type AdsStore } from './AdManager';
import type { AdService } from './AdService';
import { NoAdsService } from './NoAdsService';

const SEC = 1000;
const MIN = 60 * SEC;
/** Noon local time, so adding hours stays on the same day. */
const START = new Date(2026, 8, 27, 12, 0, 0).getTime();

/** A fake clock with manual timers. */
function fakeClock(start = START) {
  let t = start;
  const timers = new Set<{ at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const timer = { at: t + ms, fn };
      timers.add(timer);
      return timer;
    },
    clearTimer: (h: unknown) => void timers.delete(h as { at: number; fn: () => void }),
    advance(ms: number) {
      t += ms;
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
        if (timer.at > t) continue;
        timers.delete(timer);
        timer.fn();
      }
    },
  };
}

function memoryStore(save: Save = defaultSave(0)): AdsStore & { save: Save } {
  return {
    save,
    get current() {
      return save;
    },
    update: (mutate) => mutate(save),
  };
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function setup(
  opts: { service?: AdService; store?: ReturnType<typeof memoryStore> } & AdManagerOptions = {},
) {
  const clock = fakeClock();
  const service = opts.service ?? new NoAdsService({ wait: async () => {} });
  const store = opts.store ?? memoryStore();
  const onAdStart = vi.fn();
  const onAdEnd = vi.fn();
  const onError = vi.fn();
  const onResult = vi.fn();
  const ads = new AdManager(service, store, {
    ...clock,
    onAdStart,
    onAdEnd,
    onError,
    onResult,
    ...opts,
  });
  await ads.init();
  return { ads, clock, service, store, onAdStart, onAdEnd, onError, onResult };
}

/** Plays `ms` of gameplay and stops, as at a game over. */
function play(ads: AdManager, clock: ReturnType<typeof fakeClock>, ms: number) {
  ads.runStarted();
  clock.advance(ms);
  ads.gameplayStop();
}

/** A store that has already seen one session, so session 2 starts on init. */
function returningPlayer() {
  const save = defaultSave(0);
  save.ads.sessionCount = 1;
  return memoryStore(save);
}

describe('sessions (D18)', () => {
  it('counts a session per launch', async () => {
    const store = memoryStore();
    await setup({ store });
    expect(store.save.ads.sessionCount).toBe(1);
    expect(store.save.ads.lastSessionStart).toBe(START);
    await setup({ store });
    expect(store.save.ads.sessionCount).toBe(2);
  });

  it('reports session starts and ends, once each', async () => {
    const onSessionStart = vi.fn();
    const onSessionEnd = vi.fn();
    const { ads, clock } = await setup({ onSessionStart, onSessionEnd });
    expect(onSessionStart).toHaveBeenLastCalledWith(1);
    clock.advance(5 * MIN);
    ads.onHidden();
    clock.advance(40 * MIN);
    ads.onVisible();
    expect(onSessionEnd).toHaveBeenLastCalledWith(5 * MIN); // ended when the player left
    expect(onSessionStart).toHaveBeenLastCalledWith(2);
    clock.advance(2 * MIN);
    ads.endSession();
    ads.endSession();
    expect(onSessionEnd).toHaveBeenCalledTimes(2);
    expect(onSessionEnd).toHaveBeenLastCalledWith(2 * MIN);
  });

  it('starts a new session after 30 minutes hidden, not after a short break', async () => {
    const { ads, clock } = await setup();
    ads.onHidden();
    clock.advance(29 * MIN);
    ads.onVisible();
    expect(ads.sessionCount).toBe(1);
    ads.onHidden();
    clock.advance(30 * MIN);
    ads.onVisible();
    expect(ads.sessionCount).toBe(2);
  });
});

describe('interstitial policy (D19)', () => {
  it('never shows an interstitial in the first session', async () => {
    const { ads, clock } = await setup();
    play(ads, clock, 10 * MIN);
    expect(ads.canShowInterstitial()).toBe(false);
    expect(await ads.requestBreak('runEnd')).toBe('skipped');
  });

  it('needs 180 s of gameplay time since the session started', async () => {
    const { ads, clock } = await setup({ store: returningPlayer() });
    play(ads, clock, 179 * SEC);
    expect(ads.canShowInterstitial()).toBe(false);
    play(ads, clock, 1 * SEC);
    expect(ads.canShowInterstitial()).toBe(true);
  });

  it('counts only gameplay time, not time on menus or hidden', async () => {
    const { ads, clock } = await setup({ store: returningPlayer() });
    clock.advance(10 * MIN); // on the menu
    ads.runStarted();
    clock.advance(60 * SEC);
    ads.onHidden();
    clock.advance(10 * MIN); // tab in the background
    ads.onVisible();
    clock.advance(60 * SEC);
    ads.gameplayStop();
    expect(ads.gameplayMs).toBe(120 * SEC);
    expect(ads.canShowInterstitial()).toBe(false);
  });

  it('only shows at break points, not while a run is in play', async () => {
    const { ads, clock } = await setup({ store: returningPlayer() });
    ads.runStarted();
    clock.advance(5 * MIN);
    expect(ads.canShowInterstitial()).toBe(false);
    ads.gameplayStop();
    expect(ads.canShowInterstitial()).toBe(true);
  });

  it('resets the gameplay timer after an interstitial', async () => {
    const { ads, clock, onAdStart, onAdEnd } = await setup({ store: returningPlayer() });
    play(ads, clock, 3 * MIN);
    expect(await ads.requestBreak('runEnd')).toBe('shown');
    expect(onAdStart).toHaveBeenCalledOnce();
    expect(onAdEnd).toHaveBeenCalledOnce();
    expect(ads.gameplayMs).toBe(0);
    expect(ads.canShowInterstitial()).toBe(false);
    play(ads, clock, 3 * MIN);
    expect(ads.canShowInterstitial()).toBe(true);
  });

  it('resets the gameplay timer when a new session starts', async () => {
    const { ads, clock } = await setup({ store: returningPlayer() });
    play(ads, clock, 3 * MIN);
    ads.onHidden();
    clock.advance(31 * MIN);
    ads.onVisible();
    expect(ads.sessionCount).toBe(3);
    expect(ads.gameplayMs).toBe(0);
  });

  it('waits 60 s after a rewarded ad', async () => {
    const { ads, clock } = await setup({ store: returningPlayer() });
    play(ads, clock, 3 * MIN);
    expect(await ads.rewarded('secondChance')).toBe(true);
    expect(ads.canShowInterstitial()).toBe(false);
    clock.advance(59 * SEC);
    expect(ads.canShowInterstitial()).toBe(false);
    clock.advance(1 * SEC);
    expect(ads.canShowInterstitial()).toBe(true);
  });

  it('persists the gameplay time and rewarded timestamp', async () => {
    const { ads, clock, store } = await setup({ store: returningPlayer() });
    play(ads, clock, 90 * SEC);
    expect(store.save.ads.gameplayMsSinceInterstitial).toBe(90 * SEC);
    await ads.rewarded('dailyBonus');
    expect(store.save.ads.lastRewardedAt).toBe(START + 90 * SEC);
  });
});

describe('rewarded limits', () => {
  it('allows one second chance per run', async () => {
    const { ads } = await setup();
    ads.runStarted();
    expect(ads.isRewardedAvailable('secondChance')).toBe(true);
    expect(await ads.rewarded('secondChance')).toBe(true);
    expect(ads.isRewardedAvailable('secondChance')).toBe(false);
    expect(await ads.rewarded('secondChance')).toBe(false);
    ads.runStarted();
    expect(ads.isRewardedAvailable('secondChance')).toBe(true);
  });

  it('allows one double reward per result', async () => {
    const { ads } = await setup();
    ads.runStarted();
    expect(await ads.rewarded('doubleReward')).toBe(true);
    expect(ads.isRewardedAvailable('doubleReward')).toBe(false);
    ads.runStarted();
    expect(ads.isRewardedAvailable('doubleReward')).toBe(true);
  });

  it('allows 3 free boosters and 1 daily bonus per day, reset the next day', async () => {
    const { ads, clock, store } = await setup();
    for (let i = 0; i < 3; i++) expect(await ads.rewarded('freeBooster')).toBe(true);
    expect(ads.isRewardedAvailable('freeBooster')).toBe(false);
    expect(await ads.rewarded('dailyBonus')).toBe(true);
    expect(ads.isRewardedAvailable('dailyBonus')).toBe(false);
    expect(store.save.ads.daily).toEqual({
      date: dayKey(START),
      freeBoosterAds: 3,
      dailyBonusClaimed: true,
    });

    clock.advance(11 * 60 * MIN); // 23:00, same day
    expect(ads.isRewardedAvailable('freeBooster')).toBe(false);
    clock.advance(2 * 60 * MIN); // 01:00 the next day
    expect(ads.isRewardedAvailable('freeBooster')).toBe(true);
    expect(ads.isRewardedAvailable('dailyBonus')).toBe(true);
    expect(store.save.ads.daily.freeBoosterAds).toBe(0);
  });

  it('keeps daily limits across launches', async () => {
    const store = memoryStore();
    const first = await setup({ store });
    await first.ads.rewarded('dailyBonus');
    const second = await setup({ store });
    expect(second.ads.isRewardedAvailable('dailyBonus')).toBe(false);
  });

  it('does not use up a limit when the ad is skipped', async () => {
    const service = new NoAdsService({ wait: async () => {} });
    service.showRewarded = async () => false;
    const { ads, onResult } = await setup({ service });
    expect(await ads.rewarded('dailyBonus')).toBe(false);
    expect(onResult).toHaveBeenLastCalledWith('rewarded', 'dailyBonus', 'skipped');
    expect(ads.isRewardedAvailable('dailyBonus')).toBe(true);
  });

  it('is unavailable when no ad is loaded', async () => {
    const service = new NoAdsService({ rewardedReady: false });
    const { ads, onResult } = await setup({ service });
    expect(ads.isRewardedAvailable('secondChance')).toBe(false);
    expect(await ads.rewarded('secondChance')).toBe(false);
    expect(onResult).toHaveBeenLastCalledWith('rewarded', 'secondChance', 'unavailable');
  });

  it('pauses the game and stops gameplay around the ad, then resumes it', async () => {
    const service = new NoAdsService({ wait: async () => {} });
    const calls: string[] = [];
    service.gameplayStart = () => calls.push('start');
    service.gameplayStop = () => calls.push('stop');
    const { ads, onAdStart, onAdEnd } = await setup({ service });
    ads.runStarted();
    onAdStart.mockImplementation(() => calls.push('pause'));
    onAdEnd.mockImplementation(() => calls.push('resume'));
    await ads.rewarded('secondChance');
    expect(calls).toEqual(['start', 'stop', 'pause', 'resume', 'start']);
  });
});

/** A provider whose every call can be made to misbehave. */
function brokenService(mode: 'throw' | 'reject' | 'hang'): AdService {
  const fail = <T>(): Promise<T> => {
    if (mode === 'throw') throw new Error('boom');
    if (mode === 'reject') return Promise.reject(new Error('boom'));
    return new Promise<T>(() => {});
  };
  return {
    init: async () => {},
    isRewardedReady: () => true,
    showRewarded: () => fail<boolean>(),
    showInterstitial: () => fail<void>(),
    gameplayStart: () => {
      if (mode === 'throw') throw new Error('boom');
    },
    gameplayStop: () => {
      if (mode === 'throw') throw new Error('boom');
    },
  };
}

describe('misbehaving providers never block the game', () => {
  it.each(['throw', 'reject'] as const)('contains a provider that %ss', async (mode) => {
    const { ads, clock, onAdEnd, onError } = await setup({
      service: brokenService(mode),
      store: returningPlayer(),
    });
    play(ads, clock, 3 * MIN);
    expect(await ads.requestBreak('runEnd')).toBe('failed');
    ads.runStarted();
    expect(await ads.rewarded('secondChance')).toBe(false);
    expect(onAdEnd).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalled();
    expect(ads.isShowingAd).toBe(false);
    expect(ads.isRewardedAvailable('secondChance')).toBe(true); // failure didn't use it up
  });

  it('gives up on an interstitial that never resolves after 8 s', async () => {
    const { ads, clock, onAdEnd } = await setup({
      service: brokenService('hang'),
      store: returningPlayer(),
    });
    play(ads, clock, 3 * MIN);
    let result: string | undefined;
    void ads.requestBreak('runEnd').then((r) => (result = r));
    await flush();
    clock.advance(7_999);
    await flush();
    expect(result).toBeUndefined();
    clock.advance(1);
    await flush();
    expect(result).toBe('failed');
    expect(onAdEnd).toHaveBeenCalledOnce();
    expect(ads.canShowInterstitial()).toBe(false); // timer reset: no retry at every break
  });

  it('gives up on a rewarded ad that never resolves', async () => {
    const { ads, clock } = await setup({ service: brokenService('hang') });
    let earned: boolean | undefined;
    void ads.rewarded('secondChance').then((r) => (earned = r));
    await flush();
    expect(ads.isShowingAd).toBe(true);
    clock.advance(ads.policy.rewardedTimeoutMs);
    await flush();
    expect(earned).toBe(false);
    expect(ads.isShowingAd).toBe(false);
  });

  it('disables ads when init fails or hangs', async () => {
    for (const init of [
      () => Promise.reject(new Error('no sdk')),
      () => new Promise<void>(() => {}),
    ]) {
      const service = { ...brokenService('reject'), init };
      const clock = fakeClock();
      const ads = new AdManager(service, returningPlayer(), clock);
      const done = ads.init();
      await flush();
      clock.advance(8_000);
      await done;
      expect(ads.isRewardedAvailable('secondChance')).toBe(false);
      play(ads, clock, 3 * MIN);
      expect(await ads.requestBreak('runEnd')).toBe('skipped');
    }
  });

  it('survives throwing pause hooks and analytics callbacks', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const { ads } = await setup({ onAdStart: boom, onAdEnd: boom, onResult: boom });
    expect(await ads.rewarded('dailyBonus')).toBe(true);
  });
});

describe('NoAdsService', () => {
  it('shows placeholders in dev and stays silent without an overlay', async () => {
    const labels: string[] = [];
    const closed = vi.fn();
    const dev = new NoAdsService({
      wait: async () => {},
      overlay: (label) => (labels.push(label), closed),
    });
    expect(await dev.showRewarded('secondChance')).toBe(true);
    await dev.showInterstitial('runEnd');
    expect(labels).toEqual(['[Rewarded ad placeholder]', '[Interstitial placeholder]']);
    expect(closed).toHaveBeenCalledTimes(2);

    const wait = vi.fn(async () => {});
    const prod = new NoAdsService({ wait });
    await prod.showInterstitial('runEnd');
    expect(wait).not.toHaveBeenCalled();
  });

  it('has a dev toggle for rewarded readiness', () => {
    const service = new NoAdsService();
    expect(service.isRewardedReady()).toBe(true);
    service.rewardedReady = false;
    expect(service.isRewardedReady()).toBe(false);
  });
});
