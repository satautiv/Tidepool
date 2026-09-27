import { describe, expect, it, vi } from 'vitest';
import { getShape } from '../core/shapes';
import type { DragState } from '../input/DragController';
import { DragView } from './DragView';
import { FEEL } from './feel';
import { GameScene } from './GameScene';
import { TIDEPOOL } from './palettes';
import { SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

const viewport = { width: 390, height: 844, dpr: 2 };

function dragState(over: Partial<DragState> = {}): DragState {
  return {
    slot: 0,
    shape: getShape('sq2'),
    color: 1,
    pointerId: 1,
    kind: 'mouse',
    x: 100,
    y: 100,
    from: { x: 20, y: 600, width: 40, height: 40 },
    target: null,
    ...over,
  };
}

function setup() {
  let current: DragState | null = null;
  const { factory } = fakeCanvasFactory();
  const scene = new GameScene(new SpriteSet(TIDEPOOL, factory));
  const view = new DragView(() => current);
  scene.add(view);
  scene.onLayout(viewport);
  return { scene, view, set: (d: DragState | null) => (current = d), layout: scene.layout! };
}

describe('DragView', () => {
  it('draws nothing without a drag', () => {
    const { scene } = setup();
    const ctx = fakeContext();
    scene.draw(ctx, { dt: 0, time: 0, viewport });
    expect(ctx.count('drawImage')).toBe(0);
  });

  it('lifts from the tray rect to full size, then follows the pointer', () => {
    const { scene, view, set, layout } = setup();
    const d = dragState();
    set(d);
    scene.update(0);
    expect(view.isAnimating()).toBe(true);
    const start = view.pieceBox(d, layout.cellSize);
    expect(start).toMatchObject({ x: 20, y: 600, width: 40 });

    scene.update(FEEL.pickUp.liftDuration);
    expect(view.isAnimating()).toBe(false);
    const end = view.pieceBox(d, layout.cellSize);
    expect(end).toMatchObject({ x: 100, y: 100, width: 2 * layout.cellSize });

    const ctx = fakeContext();
    scene.draw(ctx, { dt: 0, time: 0, viewport });
    expect(ctx.count('drawImage')).toBe(4);
  });

  it('restarts the lift for a new drag', () => {
    const { scene, view, set } = setup();
    set(dragState());
    scene.update(1);
    expect(view.isAnimating()).toBe(false);
    set(dragState({ pointerId: 2 }));
    scene.update(0);
    expect(view.isAnimating()).toBe(true);
    set(null);
    scene.update(0);
    expect(view.isAnimating()).toBe(false);
  });
});

describe('DragView return to tray', () => {
  it('floats a cancelled piece back to its slot, then calls done', () => {
    const { scene, view } = setup();
    const done = vi.fn();
    const d = dragState();
    scene.update(1); // settle any lift
    view.returnToTray(d, { x: 30, y: 650, width: 40, height: 40 }, done);
    expect(view.isAnimating()).toBe(true);

    let ctx = fakeContext();
    scene.draw(ctx, { dt: 0, time: 0, viewport });
    expect(ctx.count('drawImage')).toBe(4);

    scene.update(FEEL.invalidDrop.returnDuration);
    expect(done).toHaveBeenCalledTimes(1);
    expect(view.isAnimating()).toBe(false);
    ctx = fakeContext();
    scene.draw(ctx, { dt: 0, time: 0, viewport });
    expect(ctx.count('drawImage')).toBe(0);
  });

  it('finishes immediately without a target rect', () => {
    const { view } = setup();
    const done = vi.fn();
    view.returnToTray(dragState(), null, done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(view.isAnimating()).toBe(false);
  });
});
