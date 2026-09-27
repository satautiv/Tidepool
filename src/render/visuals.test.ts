import { describe, expect, it, vi } from 'vitest';
import { boardFromAscii, emptyBoard } from '../core/board';
import { COLOR_COUNT } from '../core/config';
import { BoardView } from './BoardView';
import { darken, hexToRgb, lighten, luminance, mix, rgba, rgbToHex } from './color';
import { GameScene } from './GameScene';
import { computeLayout } from './layout';
import { PALETTES, TIDEPOOL, validatePalette, type Palette } from './palettes';
import type { FrameInfo } from './Renderer';
import { CELL_STYLE, PARTICLE_SPRITE_SIZE, SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

const frame: FrameInfo = { dt: 0, time: 0, viewport: { width: 390, height: 844, dpr: 2 } };

describe('color helpers', () => {
  it('converts and mixes colours', () => {
    expect(hexToRgb('#7FD8BE')).toEqual([127, 216, 190]);
    expect(rgbToHex([127, 216, 190])).toBe('#7fd8be');
    expect(rgbToHex([300, -5, 12.6])).toBe('#ff000d');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(lighten('#000000', 1)).toBe('#ffffff');
    expect(darken('#ffffff', 1)).toBe('#000000');
    expect(rgba('#ff8a80', 0.5)).toBe('rgba(255, 138, 128, 0.5)');
    expect(() => hexToRgb('red')).toThrow('Invalid hex colour');
  });

  it('computes relative luminance', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
  });
});

describe('palettes', () => {
  it('defines six distinguishable glass colours', () => {
    validatePalette(TIDEPOOL);
    expect(PALETTES.tidepool).toBe(TIDEPOOL);
    // Distinct in lightness or hue: no two colours closer than a minimum RGB distance.
    const rgb = TIDEPOOL.glass.map(hexToRgb);
    for (let i = 0; i < rgb.length; i++) {
      for (let j = i + 1; j < rgb.length; j++) {
        const d = Math.hypot(...rgb[i]!.map((v, k) => v - rgb[j]![k]!));
        expect(d).toBeGreaterThan(60);
      }
    }
  });

  it('rejects palettes with the wrong number of colours', () => {
    const bad: Palette = { ...TIDEPOOL, id: 'bad', glass: TIDEPOOL.glass.slice(0, 5) };
    expect(() => validatePalette(bad)).toThrow(`needs ${COLOR_COUNT} glass colours`);
  });
});

describe('SpriteSet', () => {
  it('pre-renders one block per colour plus ghost, highlight and board base', () => {
    const { factory, created } = fakeCanvasFactory();
    const sprites = new SpriteSet(TIDEPOOL, factory);
    expect(sprites.ready).toBe(false);
    expect(() => sprites.boardBase).toThrow('Sprites not built yet');

    sprites.build(40, 2);
    expect(sprites.ready).toBe(true);
    // Blocks, ghost, highlight, base, 2 wave bands, then 4 particle types × (white + colours).
    expect(created).toHaveLength(COLOR_COUNT + 5 + 4 * (COLOR_COUNT + 1));
    expect(sprites.waveBand(false).width).toBe(160);
    expect(sprites.waveBand(true).height).toBe(160);
    expect(sprites.particle(0, -1).width).toBe(PARTICLE_SPRITE_SIZE * 2);
    expect(sprites.particle(1, 2)).toBe(created[COLOR_COUNT + 5 + (COLOR_COUNT + 1) + 3]);
    expect(sprites.particle(3, 99)).toBe(sprites.particle(3, -1)); // unknown colour → white
    expect(() => sprites.particle(9, 0)).toThrow('No particle sprite');
    expect(sprites.block(0).width).toBe(80);
    expect(sprites.ghostOutline.width).toBe(80);
    expect(sprites.clearHighlight.width).toBe(80);
    expect(sprites.boardBase.width).toBe(Math.round(40 * (8 + 2 * CELL_STYLE.shadowMargin) * 2));
    expect(() => sprites.block(6)).toThrow('No sprite for colour 6');

    // Glass blocks use gradients; they're created at build time only.
    expect(created[0]!.ctx.count('createLinearGradient')).toBeGreaterThan(0);
    expect(created[0]!.ctx.calls[0]).toEqual(['setTransform', 2, 0, 0, 2, 0, 0]);
  });

  it('rebuilds only when palette, cell size or DPR change', () => {
    const { factory } = fakeCanvasFactory();
    const sprites = new SpriteSet(TIDEPOOL, factory);
    sprites.build(40, 2);
    sprites.build(40, 2);
    expect(sprites.builds).toBe(1);
    sprites.build(42, 2);
    sprites.build(42, 3);
    expect(sprites.builds).toBe(3);
    sprites.setPalette(TIDEPOOL);
    sprites.build(42, 3);
    expect(sprites.builds).toBe(3);
    sprites.setPalette({ ...TIDEPOOL, id: 'other' });
    sprites.build(42, 3);
    expect(sprites.builds).toBe(4);
    sprites.build(0, 3);
    expect(sprites.builds).toBe(4);
  });

  it('throws when a canvas has no 2D context', () => {
    const sprites = new SpriteSet(TIDEPOOL, () => ({ getContext: () => null }) as never);
    expect(() => sprites.build(40, 1)).toThrow('no 2D context');
  });
});

function sceneWithBoard() {
  const { factory } = fakeCanvasFactory();
  const sprites = new SpriteSet(TIDEPOOL, factory);
  const invalidate = vi.fn();
  const board = new BoardView(invalidate);
  const scene = new GameScene(sprites);
  scene.add(board);
  scene.onLayout(frame.viewport);
  return { scene, board, sprites, invalidate };
}

describe('BoardView', () => {
  it('draws the base plus one blit per filled cell, with no gradients per frame', () => {
    const { scene, board } = sceneWithBoard();
    board.setBoard(
      boardFromAscii([
        '012345..',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '.......5',
      ]),
    );
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    expect(ctx.count('drawImage')).toBe(1 + 7);
    expect(ctx.count('createLinearGradient')).toBe(0);
    expect(ctx.count('createRadialGradient')).toBe(0);
  });

  it('positions cells on the layout grid', () => {
    const { scene, board } = sceneWithBoard();
    board.setBoard(boardFromAscii(['........', '..3.....', ...new Array(6).fill('........')]));
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    const layout = computeLayout({ ...frame.viewport });
    const c = layout.cellSize;
    const [, , x, y, w, h] = ctx.calls.filter((call) => call[0] === 'drawImage')[1]!;
    expect([x, y, w, h]).toEqual([layout.board.x + 2 * c, layout.board.y + c, c, c]);
  });

  it('asks for a redraw only when the board changes', () => {
    const { board, invalidate } = sceneWithBoard();
    const b = emptyBoard();
    board.setBoard(b);
    board.setBoard(b);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});

describe('GameScene', () => {
  it('skips drawing until it has a layout, and lays out views added later', () => {
    const { factory } = fakeCanvasFactory();
    const scene = new GameScene(new SpriteSet(TIDEPOOL, factory));
    const view = { draw: vi.fn(), onLayout: vi.fn(), update: vi.fn(), isAnimating: () => true };
    scene.add(view);
    scene.draw(fakeContext(), frame);
    expect(view.draw).not.toHaveBeenCalled();
    expect(scene.layout).toBeNull();

    scene.onLayout(frame.viewport);
    expect(view.onLayout).toHaveBeenCalledTimes(1);
    expect(scene.layout?.orientation).toBe('portrait');
    scene.update(0.016);
    expect(view.update).toHaveBeenCalledWith(0.016);
    expect(scene.isAnimating()).toBe(true);
    scene.draw(fakeContext(), frame);
    expect(view.draw).toHaveBeenCalledTimes(1);

    const late = { draw: vi.fn(), onLayout: vi.fn() };
    scene.add(late);
    expect(late.onLayout).toHaveBeenCalledTimes(1);
  });

  it('passes the safe area into the layout', () => {
    const { factory } = fakeCanvasFactory();
    const scene = new GameScene(new SpriteSet(TIDEPOOL, factory), () => ({
      top: 50,
      right: 0,
      bottom: 30,
      left: 0,
    }));
    scene.onLayout(frame.viewport);
    expect(scene.layout!.hud.y).toBe(50 + 12);
  });
});
