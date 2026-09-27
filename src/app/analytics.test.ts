// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Analytics, AnalyticsEvents, EventName } from '../services/analytics/Analytics';
import { AdManager } from '../services/ads/AdManager';
import { NoAdsService } from '../services/ads/NoAdsService';
import { SaveStore } from '../services/storage/SaveStore';
import { MemoryBackend } from '../services/storage/StorageBackend';
import { GameAnalytics } from './analytics';
import { firstMove, makeApp, playMoves } from './testing';

const DAY = 24 * 60 * 60 * 1000;

class RecordingAnalytics implements Analytics {
  readonly events: { name: EventName; props: unknown }[] = [];
  flushes = 0;
  track<K extends EventName>(name: K, props: AnalyticsEvents[K]): void {
    this.events.push({ name, props });
  }
  setUserProps(): void {}
  async flush(): Promise<void> {
    this.flushes++;
  }
  named<K extends EventName>(name: K): AnalyticsEvents[K][] {
    return this.events.filter((e) => e.name === name).map((e) => e.props as AnalyticsEvents[K]);
  }
}

async function setup(backend = new MemoryBackend(), startAt = 10 * DAY) {
  let t = startAt;
  const now = () => t;
  const recorder = new RecordingAnalytics();
  const save = new SaveStore(backend, { now });
  await save.load();
  const analytics = new GameAnalytics(recorder, {
    platform: 'web',
    installedAt: () => save.current.installedAt,
    now,
  });
  const ads = new AdManager(new NoAdsService({ wait: async () => {} }), save, {
    now,
    ...analytics.adHooks,
  });
  await ads.init();
  const made = makeApp('analytics', save, ads, {
    extra: { now },
    beforeStart: (app) => analytics.attach(app),
  });
  return { ...made, recorder, analytics, ads, save, advance: (ms: number) => (t += ms) };
}

describe('GameAnalytics', () => {
  it('tracks a full run: session, run start, ads and run end with its props', async () => {
    const { app, recorder, ads, advance } = await setup();
    expect(recorder.named('session_start')).toEqual([
      { sessionIndex: 1, daysSinceInstall: 0, platform: 'web' },
    ]);
    expect(recorder.named('run_start')).toEqual([{ mode: 'endless', seed: 'analytics' }]);

    advance(42_000);
    playMoves(app);
    await ads.rewarded('secondChance');
    const ended = app.state;
    app.newRun('next');

    expect(recorder.named('ad_rewarded')).toEqual([
      { placement: 'secondChance', result: 'earned' },
    ]);
    const [runEnd] = recorder.named('run_end');
    expect(runEnd).toMatchObject({
      mode: 'endless',
      score: ended.score,
      placed: ended.stats.placed,
      linesCleared: ended.stats.linesCleared,
      durationMs: 42_000,
      secondChanceUsed: false,
    });
    expect(runEnd!.fullnessAtEnd).toBeGreaterThan(0);
    expect(runEnd!.fullnessAtEnd).toBeLessThanOrEqual(1);
    expect(recorder.named('run_start').at(-1)).toEqual({ mode: 'endless', seed: 'next' });
  });

  it('reports interstitial results', async () => {
    const { ads, recorder } = await setup();
    await ads.requestBreak('runEnd');
    expect(recorder.named('ad_interstitial')).toEqual([{ placement: 'runEnd', result: 'skipped' }]);
  });

  it('ends the session with its run count and flushes', async () => {
    const { app, ads, recorder, advance } = await setup();
    app.newRun('b');
    advance(5000);
    ads.endSession();
    expect(recorder.named('session_end')).toEqual([{ durationMs: 5000, runs: 2 }]);
    expect(recorder.flushes).toBe(1);
  });

  it('keeps run duration across a reload and closes out a run finished before it', async () => {
    const backend = new MemoryBackend();
    const first = await setup(backend);
    first.advance(3000);
    first.app.place(firstMove(first.app));
    first.advance(1000);
    playMoves(first.app);
    await first.save.flush();

    const second = await setup(backend, 20 * DAY);
    expect(second.recorder.named('session_start')[0]).toMatchObject({
      sessionIndex: 2,
      daysSinceInstall: 10,
    });
    expect(second.recorder.named('run_end')).toEqual([
      expect.objectContaining({ durationMs: 4000 }),
    ]);
  });

  it('does not send run_start for a resumed run', async () => {
    const backend = new MemoryBackend();
    const first = await setup(backend);
    first.app.place(firstMove(first.app));
    await first.save.flush();
    const second = await setup(backend);
    expect(second.recorder.named('run_start')).toEqual([]);
  });

  it('reports global errors and rejections, capped per session', async () => {
    const { analytics, recorder } = await setup();
    const target = new EventTarget();
    analytics.catchGlobalErrors(target);
    target.dispatchEvent(Object.assign(new Event('error'), { message: 'boom' }));
    target.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new Error('nope') }),
    );
    expect(recorder.named('error')).toEqual([
      { message: 'boom', where: 'window' },
      { message: 'nope', where: 'promise' },
    ]);
    for (let i = 0; i < 50; i++) analytics.error('spam', 'test');
    expect(recorder.named('error')).toHaveLength(20);
  });

  it('keeps analytics out of core/', () => {
    const dir = join(__dirname, '../core');
    for (const file of readdirSync(dir)) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/analytics/i);
    }
  });
});

describe('GameAnalytics playtest metrics', () => {
  it('tracks every placement and the first clear of the run', async () => {
    const { app, recorder, advance } = await setup();
    advance(7000);
    playMoves(app);
    const placements = recorder.named('placement');
    expect(placements).toHaveLength(app.state.stats.placed);
    expect(placements[0]).toMatchObject({ mode: 'endless', shape: expect.any(String) });
    const cleared = placements.filter((p) => p.lines > 0);
    expect(cleared.length).toBeGreaterThan(0);
    expect(placements.reduce((sum, p) => sum + p.points, 0)).toBe(app.state.score);
    for (const p of placements) expect(p.fullness).toBeGreaterThanOrEqual(0);

    const firstClearAt = placements.indexOf(cleared[0]!) + 1;
    expect(recorder.named('first_clear')).toEqual([
      { mode: 'endless', playMs: 7000, placed: firstClearAt },
    ]);
  });

  it('tracks invalid drops but not drops put back or cancelled', async () => {
    const { app, recorder } = await setup();
    app.bus.emit('dropCancelled', { slot: 0, invalid: false });
    app.bus.emit('dropCancelled', { slot: 1, invalid: true });
    expect(recorder.named('invalid_drop')).toEqual([{ mode: 'endless', fullness: 0 }]);
  });
});

describe('GameAnalytics perf fallback', () => {
  it('tracks perfFallback from the app', async () => {
    const { app, recorder } = await setup();
    app.bus.emit('perfFallback', { feature: 'caustics', frameMs: 23.456 });
    expect(recorder.named('perf_fallback')).toEqual([{ feature: 'caustics', frameMs: 23.5 }]);
  });
});
