import './ui/styles/base.css';
import { GameAnalytics } from './app/analytics';
import { App } from './app/App';
import { TIDEPOOL } from './render/palettes';
import { ConsoleAnalytics, NoopAnalytics } from './services/analytics/Analytics';
import { AdManager } from './services/ads/AdManager';
import { domAdOverlay, NoAdsService } from './services/ads/NoAdsService';
import { SaveStore } from './services/storage/SaveStore';
import { createWebStorage } from './services/storage/StorageBackend';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');

const params = new URLSearchParams(location.search);
const root = document.documentElement.style;
root.setProperty('--color-sand', TIDEPOOL.background[0]);
root.setProperty('--color-water', TIDEPOOL.background[1]);

const seed = params.get('seed');
// The analytics backend is decided in T3.14; until then dev logs to the console.
const analytics = new GameAnalytics(
  import.meta.env.DEV ? new ConsoleAnalytics() : new NoopAnalytics(),
  { platform: 'web', installedAt: () => save.current.installedAt },
);
analytics.catchGlobalErrors(window);

const save = new SaveStore(createWebStorage(), {
  onError: (message) => analytics.error(message, 'save'),
});
await save.load();

// Provider per build target arrives in T3.03; dev shows placeholders, `?rewarded=0` = no fill.
const adService = new NoAdsService({
  overlay: import.meta.env.DEV ? domAdOverlay(uiRoot) : null,
  rewardedReady: !(import.meta.env.DEV && params.get('rewarded') === '0'),
});
const ads = new AdManager(adService, save, analytics.adHooks);
void ads.init();
window.addEventListener('pagehide', () => ads.endSession());

const app = new App({
  save,
  ads,
  canvas,
  uiRoot,
  palette: TIDEPOOL,
  debug: import.meta.env.DEV && params.has('debug'),
  // Dev: `?slowmo=0.25` plays every animation at quarter speed.
  ...(import.meta.env.DEV && params.has('slowmo')
    ? { renderer: { timeScale: Number(params.get('slowmo')) || 1 } }
    : {}),
  ...(import.meta.env.DEV && seed ? { seed: () => seed } : {}),
});
analytics.attach(app);
app.start();

// Dev-only handle for debugging and E2E tests. The import is dropped from production builds.
if (import.meta.env.DEV) {
  const { createTestHook } = await import('./app/devHook');
  Object.assign(window, { __tidepool: createTestHook(app, canvas) });
  if (params.has('feel')) {
    const { createFeelPanel } = await import('./app/FeelPanel');
    document.body.append(createFeelPanel());
  }
}
