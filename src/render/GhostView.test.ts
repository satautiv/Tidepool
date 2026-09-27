import { describe, expect, it } from 'vitest';
import { boardFromAscii, emptyBoard, type Board } from '../core/board';
import { getShape } from '../core/shapes';
import type { DragState } from '../input/DragController';
import { FEEL } from './feel';
import { GameScene } from './GameScene';
import { GhostView } from './GhostView';
import { TIDEPOOL } from './palettes';
import { SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

const viewport = { width: 390, height: 844, dpr: 2 };
const frame = { dt: 0, time: 0, viewport };

function drag(target: DragState['target'], shape = 'i2h'): DragState {
  return {
    slot: 0,
    shape: getShape(shape),
    color: 2,
    pointerId: 1,
    kind: 'mouse',
    x: 0,
    y: 0,
    from: { x: 0, y: 0, width: 10, height: 10 },
    target,
  };
}

function setup(board: Board) {
  let d: DragState | null = null;
  let b = board;
  const { factory } = fakeCanvasFactory();
  const sprites = new SpriteSet(TIDEPOOL, factory);
  const scene = new GameScene(sprites);
  const view = new GhostView(
    () => d,
    () => b,
  );
  scene.add(view);
  scene.onLayout(viewport);
  return {
    scene,
    view,
    sprites,
    setDrag: (x: DragState | null) => (d = x),
    setBoard: (x: Board) => (b = x),
  };
}

const ALMOST_ROW = boardFromAscii([
  '######..',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
]);

describe('GhostView', () => {
  it('draws nothing without a target', () => {
    const { scene, setDrag } = setup(emptyBoard());
    setDrag(drag(null));
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    expect(ctx.count('drawImage')).toBe(0);
  });

  it('shows the ghost at the target with outlines', () => {
    const { scene, setDrag, sprites, view } = setup(emptyBoard());
    setDrag(drag({ row: 4, col: 2 }));
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    const images = ctx.calls.filter((c) => c[0] === 'drawImage').map((c) => c[1]);
    expect(images.filter((i) => i === sprites.block(2))).toHaveLength(2);
    expect(images.filter((i) => i === sprites.ghostOutline)).toHaveLength(2);
    expect(images).not.toContain(sprites.clearHighlight);
    expect(view.isAnimating()).toBe(false);
    expect(view.current()!.ghostCells).toEqual([34, 35]);
  });

  it('highlights every cell of the lines the drop would clear, and pulses', () => {
    const { scene, setDrag, sprites, view } = setup(ALMOST_ROW);
    setDrag(drag({ row: 0, col: 6 }));
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    const highlights = ctx.calls.filter(
      (c) => c[0] === 'drawImage' && c[1] === sprites.clearHighlight,
    );
    expect(highlights).toHaveLength(8);
    expect(view.isAnimating()).toBe(true);

    expect(view.pulseAlpha()).toBeCloseTo(FEEL.ghost.pulseMin);
    view.update(FEEL.ghost.pulsePeriod / 2);
    expect(view.pulseAlpha()).toBeCloseTo(FEEL.ghost.pulseMax);
  });

  it('caches the preview until the target or board changes', () => {
    const { view, setDrag, setBoard } = setup(emptyBoard());
    setDrag(drag({ row: 1, col: 1 }));
    const a = view.current();
    expect(view.current()).toBe(a);
    setDrag(drag({ row: 1, col: 2 }));
    const b = view.current();
    expect(b).not.toBe(a);
    setBoard(ALMOST_ROW);
    expect(view.current()).not.toBe(b);
    setDrag(null);
    expect(view.current()).toBeNull();
  });
});
