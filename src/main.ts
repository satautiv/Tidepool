import './ui/styles/base.css';
import { canPlace } from './core/board';
import { newEndless, placePiece, type EndlessState } from './core/game';
import { getShape } from './core/shapes';
import { bindPointerEvents, DragController, type DragHost } from './input/DragController';
import { BoardView } from './render/BoardView';
import { DebugOverlay } from './render/DebugOverlay';
import { DragView } from './render/DragView';
import { GameScene } from './render/GameScene';
import { TIDEPOOL } from './render/palettes';
import { Renderer } from './render/Renderer';
import { SpriteSet } from './render/sprites';
import { TrayView } from './render/TrayView';
import { attachViewport } from './render/viewport';

// Temporary composition root; the App shell (T1.18) replaces this.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const params = new URLSearchParams(location.search);
const root = document.documentElement.style;
root.setProperty('--color-sand', TIDEPOOL.background[0]);
root.setProperty('--color-water', TIDEPOOL.background[1]);

const renderer = new Renderer(canvas);
const redraw = () => renderer.requestRedraw();
const scene = new GameScene(new SpriteSet(TIDEPOOL));
const boardView = new BoardView(redraw);
const trayView = new TrayView(redraw);

let state: EndlessState = newEndless(params.get('seed') ?? String(Date.now())).state;

const host: DragHost = {
  slotAt: (x, y) => trayView.slotAt(x, y),
  pieceRect: (slot) => trayView.pieceRect(slot),
  pieceOf: (slot) => {
    const piece = state.tray[slot];
    return piece ? { shape: getShape(piece.shape), color: piece.color } : null;
  },
  geometry: () => scene.layout && { board: scene.layout.board, cellSize: scene.layout.cellSize },
  canPlace: (slot, row, col) => {
    const piece = state.tray[slot];
    return !!piece && canPlace(state.board, getShape(piece.shape), row, col);
  },
};

const drag = new DragController(host, {
  onStart: (d) => trayView.setDragging(d.slot),
  onMove: redraw,
  onPlace: ({ slot, row, col }) => {
    trayView.setDragging(null);
    const step = placePiece(state, slot, row, col);
    if ('error' in step) return;
    state = step.state;
    boardView.setBoard(state.board);
    const dealt = step.events.some((e) => e.type === 'dealt');
    trayView.setTray(state.tray, dealt);
    if (state.over) drag.setLocked(true);
  },
  onCancel: () => trayView.setDragging(null),
});

scene.add(boardView);
scene.add(trayView);
scene.add(new DragView(() => drag.state));
renderer.addView(scene);
attachViewport(renderer, canvas);
bindPointerEvents(canvas, drag, window);
trayView.setTray(state.tray, true);

if (import.meta.env.DEV && params.has('debug')) {
  renderer.addView(new DebugOverlay(renderer.stats));
}
