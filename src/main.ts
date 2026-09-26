import './ui/styles/base.css';
import { boardFromAscii } from './core/board';
import { BoardView } from './render/BoardView';
import { DebugOverlay } from './render/DebugOverlay';
import { GameScene } from './render/GameScene';
import { TIDEPOOL } from './render/palettes';
import { Renderer } from './render/Renderer';
import { SpriteSet } from './render/sprites';
import { attachViewport } from './render/viewport';

// Bootstrap. The App shell (T1.18) takes over composing views and screens.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const params = new URLSearchParams(location.search);
const root = document.documentElement.style;
root.setProperty('--color-sand', TIDEPOOL.background[0]);
root.setProperty('--color-water', TIDEPOOL.background[1]);

const renderer = new Renderer(canvas);
const scene = new GameScene(new SpriteSet(TIDEPOOL));
const boardView = new BoardView(() => renderer.requestRedraw());
scene.add(boardView);
renderer.addView(scene);
attachViewport(renderer, canvas);

if (import.meta.env.DEV && params.has('demo')) {
  // Every glass colour, for visual review.
  boardView.setBoard(
    boardFromAscii([
      '........',
      '.012345.',
      '.543210.',
      '........',
      '..00....',
      '..0..33.',
      '.1112.3.',
      '.22222..',
    ]),
  );
}
if (import.meta.env.DEV && params.has('debug')) {
  renderer.addView(new DebugOverlay(renderer.stats));
}
