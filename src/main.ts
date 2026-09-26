import './ui/styles/base.css';
import { App } from './app/App';
import { TIDEPOOL } from './render/palettes';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (!canvas || !uiRoot) throw new Error('Missing #game canvas or #ui root');

const params = new URLSearchParams(location.search);
const root = document.documentElement.style;
root.setProperty('--color-sand', TIDEPOOL.background[0]);
root.setProperty('--color-water', TIDEPOOL.background[1]);

const seed = params.get('seed');
const app = new App({
  canvas,
  uiRoot,
  palette: TIDEPOOL,
  debug: import.meta.env.DEV && params.has('debug'),
  ...(import.meta.env.DEV && seed ? { seed: () => seed } : {}),
});
app.start();
