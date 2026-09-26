import { describe, expect, it, vi } from 'vitest';
import type { TraySlot } from '../core/generator';
import { getShape, STANDARD_SHAPES } from '../core/shapes';
import { GameScene } from './GameScene';
import { computeLayout, rectContains } from './layout';
import { TIDEPOOL } from './palettes';
import type { FrameInfo } from './Renderer';
import { SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';
import { pieceRectInSlot, TRAY_FEEL, TrayView } from './TrayView';

const viewport = { width: 390, height: 844, dpr: 2 };
const frame: FrameInfo = { dt: 0, time: 0, viewport };
const slot = (shape: string, color = 2): TraySlot => ({ shape, color });

function setup() {
  const { factory } = fakeCanvasFactory();
  const scene = new GameScene(new SpriteSet(TIDEPOOL, factory));
  const invalidate = vi.fn();
  const tray = new TrayView(invalidate);
  scene.add(tray);
  scene.onLayout(viewport);
  return { scene, tray, invalidate, layout: scene.layout! };
}

const blits = (ctx: ReturnType<typeof fakeContext>) =>
  ctx.calls.filter((c) => c[0] === 'drawImage') as Array<
    [string, unknown, number, number, number, number]
  >;

describe('TrayView drawing', () => {
  it('draws one blit per piece cell and skips used slots', () => {
    const { scene, tray } = setup();
    tray.setTray([slot('sq3'), null, slot('i2h')]);
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    expect(blits(ctx)).toHaveLength(9 + 2);
  });

  it('centres pieces in their slot at the tray scale', () => {
    const { scene, tray, layout } = setup();
    tray.setTray([null, slot('dot'), null]);
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    const [, , x, y, w] = blits(ctx)[0]!;
    const s = layout.traySlots[1]!;
    const cell = layout.cellSize * layout.trayScale;
    expect(w).toBeCloseTo(cell);
    expect(x + w / 2).toBeCloseTo(s.x + s.width / 2);
    expect(y + w / 2).toBeCloseTo(s.y + s.height / 2);
  });

  it('dims the slot being dragged', () => {
    const { scene, tray, invalidate } = setup();
    tray.setTray([slot('dot'), slot('dot'), slot('dot')]);
    invalidate.mockClear();
    tray.setDragging(1);
    tray.setDragging(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    const alphas: number[] = [];
    const ctx = fakeContext();
    const original = ctx.drawImage.bind(ctx);
    ctx.drawImage = ((...args: Parameters<typeof original>) => {
      alphas.push(ctx.globalAlpha);
      return original(...args);
    }) as typeof ctx.drawImage;
    scene.draw(ctx, frame);
    expect(alphas).toEqual([1, TRAY_FEEL.draggingAlpha, 1]);
  });
});

describe('TrayView deal-in', () => {
  it('animates a new tray, staggered, then stops', () => {
    const { tray } = setup();
    tray.setTray([slot('dot'), slot('dot'), slot('dot')], true);
    expect(tray.isAnimating()).toBe(true);
    expect(tray.dealProgress(0)).toBe(0);

    tray.update(0.1);
    const [a, b, c] = [0, 1, 2].map((i) => tray.dealProgress(i));
    expect(a).toBeGreaterThan(b!);
    expect(b).toBeGreaterThan(c!);

    tray.update(1);
    expect(tray.isAnimating()).toBe(false);
    expect([0, 1, 2].map((i) => tray.dealProgress(i))).toEqual([1, 1, 1]);
  });

  it('slides pieces up from below while fading in', () => {
    const { scene, tray, layout } = setup();
    tray.setTray([slot('dot'), null, null], true);
    tray.update(TRAY_FEEL.dealDuration / 2);
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    const rest = pieceRectInSlot(getShape('dot'), layout.traySlots[0]!, layout);
    const [, , , y] = blits(ctx)[0]!;
    expect(y).toBeGreaterThan(rest.y);
  });

  it('draws nothing for a slot that has not started yet', () => {
    const { scene, tray } = setup();
    tray.setTray([slot('dot'), slot('dot'), slot('dot')], true);
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    expect(blits(ctx)).toHaveLength(0);
  });

  it('does not animate trays restored without animation', () => {
    const { tray } = setup();
    tray.setTray([slot('dot'), null, null]);
    expect(tray.isAnimating()).toBe(false);
    tray.update(0.1);
    expect(tray.dealProgress(0)).toBe(1);
  });
});

describe('TrayView hit testing', () => {
  it('hits whole slot rects that hold a piece', () => {
    const { tray, layout } = setup();
    tray.setTray([slot('dot'), null, slot('i3h')]);
    const [s0, s1, s2] = layout.traySlots;
    expect(tray.slotAt(s0!.x + 1, s0!.y + 1)).toBe(0);
    expect(tray.slotAt(s1!.x + s1!.width / 2, s1!.y + s1!.height / 2)).toBeNull();
    expect(tray.slotAt(s2!.x + s2!.width - 1, s2!.y + s2!.height - 1)).toBe(2);
    expect(tray.slotAt(layout.board.x + 5, layout.board.y + 5)).toBeNull();
  });

  it('reports piece rects for drag starts', () => {
    const { tray, layout } = setup();
    tray.setTray([slot('sq2'), null, null]);
    const r = tray.pieceRect(0)!;
    expect(r.width).toBeCloseTo(2 * layout.cellSize * layout.trayScale);
    expect(tray.pieceRect(1)).toBeNull();
  });

  it('returns nothing before layout', () => {
    const tray = new TrayView();
    tray.setTray([slot('dot'), null, null]);
    expect(tray.slotAt(0, 0)).toBeNull();
    expect(tray.pieceRect(0)).toBeNull();
  });
});

describe('every shape fits its slot', () => {
  it.each([
    [360, 640],
    [800, 450],
    [1366, 768],
  ])('at %i×%i', (width, height) => {
    const layout = computeLayout({ width, height, dpr: 3 });
    for (const s of layout.traySlots) {
      for (const shape of STANDARD_SHAPES) {
        const r = pieceRectInSlot(shape, s, layout);
        expect(rectContains(s, r.x, r.y)).toBe(true);
        expect(r.x + r.width).toBeLessThanOrEqual(s.x + s.width + 1e-9);
        expect(r.y + r.height).toBeLessThanOrEqual(s.y + s.height + 1e-9);
      }
    }
  });
});
