import './ui/styles/base.css';
import { GameAnalytics } from './app/analytics';
import { App } from './app/App';
import { BootLoader } from './app/boot';
import { registerServiceWorker } from './app/pwa';
import { applyPlaytestVariant, downloadLog, playtestFlags } from './app/playtest';
import { STRINGS } from './ui/strings';
import { attachMusic, attachSounds } from './app/sounds';
import { drawSandTile } from './render/background';
import { FEEL } from './render/feel';
import { TIDEPOOL } from './render/palettes';
import { domCanvasFactory, sandColors } from './render/sprites';
import { ConsoleAnalytics, NoopAnalytics } from './services/analytics/Analytics';
import { LocalLogAnalytics } from './services/analytics/LocalLogAnalytics';
import { AdManager } from './services/ads/AdManager';
import { AudioEngine } from './services/audio/AudioEngine';
import { WebHaptics } from './services/platform/haptics';
import { TabGuard, tabChannel } from './services/platform/tabs';
import { domAdOverlay } from './services/ads/NoAdsService';
import { createAdService } from './services/ads';
import { NoHaptics } from './services/platform/haptics';
import { targetConfig } from './config/targets';
import { SaveStore } from './services/storage/SaveStore';
import { createWebStorage } from './services/storage/StorageBackend';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');

const boot = new BootLoader(document.querySelector<HTMLElement>('#boot'));
boot.progress(0.3); // the script is running

const params = new URLSearchParams(location.search);
const target = targetConfig(import.meta.env.VITE_TARGET);
const root = document.documentElement.style;
root.setProperty('--color-sand', TIDEPOOL.background[0]);
root.setProperty('--color-water', TIDEPOOL.background[1]);

// Sand grain around the board: generated once into a CSS background, so it costs no frames.
const tile = domCanvasFactory(FEEL.sand.tileSize, FEEL.sand.tileSize);
const tileCtx = tile.getContext('2d');
if (tileCtx) {
  drawSandTile(tileCtx, FEEL.sand.tileSize, sandColors(TIDEPOOL));
  root.setProperty('--sand-grain', `url(${tile.toDataURL()})`);
}

const seed = params.get('seed');

// Playtest mode (`?playtest=1`, T2.18): events go to a local log exported from Settings.
let localStorage: Storage | null = null;
try {
  localStorage = window.localStorage;
} catch {
  // sandboxed iframe or blocked storage
}
const playtest = playtestFlags(params, localStorage);
applyPlaytestVariant(playtest);
const playtestLog = playtest.enabled ? new LocalLogAnalytics({ storage: localStorage }) : null;
if (playtestLog && playtest.clearLog) {
  playtestLog.clear();
  params.delete('clearlog'); // a reload must not clear it again
  history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
}
playtestLog?.note('page_open', {
  version: __APP_VERSION__,
  build: __BUILD_SHA__,
  target: target.id,
  magnet: playtest.magnet,
  l4: playtest.l4,
  userAgent: navigator.userAgent,
  viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
  coarsePointer: matchMedia('(pointer: coarse)').matches,
});

// The analytics backend is decided in T3.14; until then dev logs to the console.
const analytics = new GameAnalytics(
  playtestLog ?? (import.meta.env.DEV ? new ConsoleAnalytics() : new NoopAnalytics()),
  { platform: target.id, installedAt: () => save.current.installedAt },
);
analytics.catchGlobalErrors(window);

// One playing tab at a time: claiming before the save loads makes older tabs stop writing, so
// they can't overwrite this tab's progress. Another tab opened later makes this one dormant.
let takenOver = (): Promise<void> => Promise.resolve();
const tabs = new TabGuard(tabChannel(), () => takenOver());
await tabs.claim(); // older tabs have written out their save

// Capacitor Preferences for Android arrives in T5.02; every target uses web storage until then.
const save = new SaveStore(createWebStorage(), {
  onError: (message) => analytics.error(message, 'save'),
});
await save.load();
boot.progress(0.5);

// The ad provider for this build target (only its code is bundled). With no ads, dev shows
// placeholders; `?rewarded=0` simulates no fill.
const adService = await createAdService({
  overlay: import.meta.env.DEV ? domAdOverlay(uiRoot) : null,
  rewardedReady: !(import.meta.env.DEV && params.get('rewarded') === '0'),
});
boot.report(adService);
boot.progress(0.7);
// Audio unlocks on the first tap or key press; nothing is created before that.
const audio = new AudioEngine({
  settings: () => save.current.settings,
  saveSettings: (change) => save.update((s) => Object.assign(s.settings, change)),
  onError: (message) => analytics.error(message, 'audio'),
});
audio.attachUnlock(window);

const ads = new AdManager(adService, save, analytics.adHooks);
void ads.init();
window.addEventListener('pagehide', () => ads.endSession());

const app = new App({
  save,
  ads,
  audio,
  // Capacitor Haptics for Android arrives in T5.02.
  haptics:
    target.haptics === 'web'
      ? new WebHaptics(() => save.current.settings.haptics)
      : new NoHaptics(),
  hapticsSupported: target.haptics === 'web' && typeof navigator.vibrate === 'function',
  externalLinks: target.externalLinks,
  canvas,
  uiRoot,
  palette: TIDEPOOL,
  ...(playtest.enabled ? { includeL4: playtest.l4 } : {}),
  ...(playtestLog ? { exportLog: () => downloadLog(playtestLog.export()) } : {}),
  debug: import.meta.env.DEV && params.has('debug'),
  // Dev: `?slowmo=0.25` plays every animation at quarter speed.
  ...(import.meta.env.DEV && params.has('slowmo')
    ? { renderer: { timeScale: Number(params.get('slowmo')) || 1 } }
    : {}),
  ...(import.meta.env.DEV && seed ? { seed: () => seed } : {}),
});
analytics.attach(app);
takenOver = () => app.takenOver();
attachSounds(app, audio, uiRoot);
attachMusic(app, audio);
app.start();
if (!tabs.active) void app.takenOver(); // a newer tab opened while this one was booting
boot.progress(0.9);
// Offline play for PWA builds (the standalone web target).
if (target.pwa && import.meta.env.PROD) {
  void registerServiceWorker(app.toast, { update: STRINGS.updateReady, action: STRINGS.updateNow });
}

// Hide the loader once the first frame is on screen.
requestAnimationFrame(() => requestAnimationFrame(() => boot.finish()));

// Dev-only handle for debugging and E2E tests. The import is dropped from production builds.
if (import.meta.env.DEV) {
  const { createTestHook } = await import('./app/devHook');
  Object.assign(window, { __tidepool: Object.assign(createTestHook(app, canvas), { audio }) });
  if (params.has('feel')) {
    const { createFeelPanel } = await import('./app/FeelPanel');
    document.body.append(createFeelPanel());
  }
}
