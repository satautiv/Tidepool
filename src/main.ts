import './ui/styles/base.css';
import { App } from './app/App';
import { TIDEPOOL } from './render/palettes';
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
const save = new SaveStore(createWebStorage());
await save.load();

// Provider per build target arrives in T3.03; dev shows placeholders, `?rewarded=0` = no fill.
const adService = new NoAdsService({
  overlay: import.meta.env.DEV ? domAdOverlay(uiRoot) : null,
  rewardedReady: !(import.meta.env.DEV && params.get('rewarded') === '0'),
});
const ads = new AdManager(adService, save);
void ads.init();

const app = new App({
  save,
  ads,
  canvas,
  uiRoot,
  palette: TIDEPOOL,
  debug: import.meta.env.DEV && params.has('debug'),
  ...(import.meta.env.DEV && seed ? { seed: () => seed } : {}),
});
app.start();

// Dev-only handle for debugging and browser tests (formalised in T1.26). Stripped from builds.
if (import.meta.env.DEV) Object.assign(window, { __tidepool: app });
