import './ui/styles/base.css';
import { DebugOverlay } from './render/DebugOverlay';
import { Renderer } from './render/Renderer';
import { attachViewport } from './render/viewport';

// Bootstrap. The App shell (T1.18) takes over composing views and screens.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const renderer = new Renderer(canvas);
attachViewport(renderer, canvas);

if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug')) {
  renderer.addView(new DebugOverlay(renderer.stats));
}
