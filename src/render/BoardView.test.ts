import { describe, expect, it, vi } from 'vitest';
import { boardFromAscii, emptyBoard } from '../core/board';
import { newEndless, placePiece, type EndlessState } from '../core/game';
import { BoardView } from './BoardView';
import { FEEL } from './feel';
import { GameScene } from './GameScene';
import { TIDEPOOL } from './palettes';
import { SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

const viewport = { width: 390, height: 844, dpr: 2 };
const frame = { dt: 0, time: 0, viewport };

function setup() {
  const { factory } = fakeCanvasFactory();
  const sprites = new SpriteSet(TIDEPOOL, factory);
  const scene = new GameScene(sprites);
  const invalidate = vi.fn();
  const view = new BoardView(invalidate);
  scene.add(view);
  scene.onLayout(viewport);
  return { scene, view, invalidate, sprites };
}

function move(rows: string[], tray: EndlessState['tray'], slot: number, r: number, c: number) {
  const state: EndlessState = { ...newEndless('fx').state, board: boardFromAscii(rows), tray };
  const step = placePiece(state, slot, r, c);
  if ('error' in step) throw new Error(step.error);
  return { before: state.board, step };
}

const EMPTY = new Array<string>(8).fill('........');

describe('BoardView animations', () => {
  /** [x, y, size] of each block drawn after the board base. */
  function blocks(scene: GameScene) {
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    return ctx.calls
      .filter((c) => c[0] === 'drawImage')
      .slice(1)
      .map((c) => [c[2], c[3], c[4]] as number[]);
  }

  it('snaps a dropped piece in from where it was released, then squashes each cell', () => {
    const { scene, view } = setup();
    const { board, cellSize: c } = scene.layout!;
    const { before, step } = move(EMPTY, [{ shape: 'sq2', color: 1 }, null, null], 0, 2, 2);
    const home = { x: board.x + 2 * c, y: board.y + 2 * c };
    view.applyMove(before, step.events, step.state.board, { x: home.x + 30, y: home.y - 12 });
    expect(view.isAnimating()).toBe(true);
    expect(view.busy).toBe(false);
    expect(blocks(scene)[0]).toEqual([home.x + 30, home.y - 12, c]);

    scene.update(FEEL.drop.snapDuration);
    expect(blocks(scene)[0]![0]).toBeCloseTo(home.x);
    scene.update(FEEL.drop.squashDuration / 2);
    expect(blocks(scene)[0]![2]).toBeCloseTo(c * FEEL.drop.squashScale);
    scene.update(1);
    expect(view.isAnimating()).toBe(false);
    expect(blocks(scene).map((b) => b[2])).toEqual([c, c, c, c]);
    expect(blocks(scene)[0]!.slice(0, 2)).toEqual([home.x, home.y]);
  });

  it('squashes in place when there is no drop origin', () => {
    const { scene, view } = setup();
    const { board, cellSize: c } = scene.layout!;
    const { before, step } = move(EMPTY, [{ shape: 'dot', color: 1 }, null, null], 0, 0, 0);
    view.applyMove(before, step.events, step.state.board);
    expect(blocks(scene)[0]).toEqual([board.x, board.y, c]);
    scene.update(FEEL.drop.squashDuration / 2);
    expect(blocks(scene)[0]![2]).toBeCloseTo(c * FEEL.drop.squashScale);
  });

  it('keeps cleared cells visible while they dissolve, rippling outward', () => {
    const { scene, view } = setup();
    const rows = ['.#######', '#.......', ...EMPTY.slice(2)];
    const { before, step } = move(rows, [{ shape: 'dot', color: 4 }, null, null], 0, 0, 0);
    expect(step.state.board.cells.slice(0, 8).every((cell) => cell.color === null)).toBe(true);
    view.applyMove(before, step.events, step.state.board);
    expect(view.busy).toBe(true);

    // 1 remaining block + 8 dissolving cells, all drawn.
    let ctx = fakeContext();
    scene.draw(ctx, frame);
    expect(ctx.count('drawImage')).toBe(1 + 1 + 8);

    // Shortly after, the cell nearest the placed dot has faded more than the far end.
    scene.update(0.1);
    const alphas: number[] = [];
    ctx = fakeContext();
    const orig = ctx.drawImage.bind(ctx);
    ctx.drawImage = ((...a: Parameters<typeof orig>) => {
      alphas.push(ctx.globalAlpha);
      return orig(...a);
    }) as typeof ctx.drawImage;
    scene.draw(ctx, frame);
    const dissolving = alphas.slice(2);
    expect(dissolving[0]).toBeLessThan(dissolving[7]!);

    scene.update(2);
    expect(view.busy).toBe(false);
    ctx = fakeContext();
    scene.draw(ctx, frame);
    expect(ctx.count('drawImage')).toBe(2);
  });

  it('dissolves each cell in its own colour, using the piece colour for the placed cell', () => {
    const { scene, view, sprites } = setup();
    const rows = ['.#######', ...EMPTY.slice(1)];
    const { before, step } = move(rows, [{ shape: 'dot', color: 5 }, null, null], 0, 0, 0);
    view.applyMove(before, step.events, step.state.board);
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    const images = ctx.calls.filter((c) => c[0] === 'drawImage').map((c) => c[1]);
    // Base, then the 8 dissolving cells of row 0 in index order.
    expect(images[1]).toBe(sprites.block(5));
    expect(images.slice(2)).toEqual(new Array(7).fill(sprites.block(0)));
  });

  it('setBoard drops running effects', () => {
    const { view, invalidate } = setup();
    const rows = ['.#######', ...EMPTY.slice(1)];
    const { before, step } = move(rows, [{ shape: 'dot', color: 1 }, null, null], 0, 0, 0);
    view.applyMove(before, step.events, step.state.board);
    view.setBoard(emptyBoard());
    expect(view.busy).toBe(false);
    expect(view.isAnimating()).toBe(false);
    invalidate.mockClear();
    const b = emptyBoard();
    view.setBoard(b);
    view.setBoard(b);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('just redraws for moves without a placement', () => {
    const { view, invalidate } = setup();
    invalidate.mockClear();
    view.applyMove(emptyBoard(), [], emptyBoard());
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(view.isAnimating()).toBe(false);
  });

  it('whenIdle resolves after dissolving cells finish', async () => {
    const { scene, view } = setup();
    await view.whenIdle(); // not busy: immediate
    const rows = ['.#######', ...EMPTY.slice(1)];
    const { before, step } = move(rows, [{ shape: 'dot', color: 1 }, null, null], 0, 0, 0);
    view.applyMove(before, step.events, step.state.board);
    let idle = false;
    void view.whenIdle().then(() => (idle = true));
    await Promise.resolve();
    expect(idle).toBe(false);
    scene.update(2);
    await Promise.resolve();
    expect(idle).toBe(true);
  });

  function alphas(scene: GameScene) {
    const ctx = fakeContext();
    const out: number[] = [];
    const orig = ctx.drawImage.bind(ctx);
    ctx.drawImage = ((...a: Parameters<typeof orig>) => {
      out.push(ctx.globalAlpha);
      return orig(...a);
    }) as typeof ctx.drawImage;
    scene.draw(ctx, frame);
    return { blocks: out.slice(1), ctx };
  }

  it('fades blocks to sand one by one for game over, desaturating the board', () => {
    const { scene, view } = setup();
    view.setBoard(boardFromAscii(['####....', ...EMPTY.slice(1)]));
    const done = vi.fn();
    view.fadeOut(done);
    scene.update(FEEL.gameOver.cellFadeDuration);
    const mid = alphas(scene).blocks;
    expect(mid.some((a) => a < 0.5)).toBe(true); // the first cells are faded…
    expect(mid.some((a) => a > 0.9)).toBe(true); // …while the last haven't started
    expect(done).not.toHaveBeenCalled();

    scene.update(FEEL.gameOver.fadeDuration);
    expect(done).toHaveBeenCalledTimes(1);
    const end = alphas(scene);
    for (const a of end.blocks) expect(a).toBeCloseTo(FEEL.gameOver.fadeTo);
    expect(end.ctx.globalCompositeOperation).toBe('saturation');
    expect(end.ctx.count('fill')).toBe(1);
    expect(end.ctx.count('arcTo')).toBe(4); // clipped to the rounded panel

    view.fadeIn(); // second chance
    scene.update(1);
    expect(alphas(scene).blocks).toEqual([1, 1, 1, 1]);
    expect(alphas(scene).ctx.count('fill')).toBe(0);

    view.fadeOut();
    scene.update(1);
    view.setBoard(boardFromAscii(['#.......', ...EMPTY.slice(1)]));
    expect(alphas(scene).blocks).toEqual([1]);
  });

  it('fades an empty board at once', () => {
    const { scene, view } = setup();
    const done = vi.fn();
    view.fadeOut(done);
    scene.update(FEEL.gameOver.fadeDuration);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
