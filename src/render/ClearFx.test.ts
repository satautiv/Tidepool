import { describe, expect, it } from 'vitest';
import { boardFromAscii } from '../core/board';
import { newEndless, placePiece, type EndlessState } from '../core/game';
import { ClearFx } from './ClearFx';
import { FEEL } from './feel';
import { GameScene } from './GameScene';
import { TIDEPOOL } from './palettes';
import { ParticleSystem } from './particles';
import { SpriteSet } from './sprites';
import { fakeCanvasFactory, fakeContext } from './testing';

const viewport = { width: 390, height: 844, dpr: 2 };
const frame = { dt: 0, time: 0, viewport };
const EMPTY = new Array<string>(8).fill('........');

function setup() {
  const sprites = new SpriteSet(TIDEPOOL, fakeCanvasFactory().factory);
  const scene = new GameScene(sprites);
  const particles = new ParticleSystem(2048, () => 0.5);
  const fx = new ClearFx(particles, () => 0.5);
  scene.add(fx);
  scene.onLayout(viewport);
  return { scene, fx, particles };
}

/** Places `shape` at (r, c) on `rows` and returns the board before and the events. */
function move(rows: string[], shape: string, r: number, c: number) {
  const state: EndlessState = {
    ...newEndless('fx').state,
    board: boardFromAscii(rows),
    tray: [{ shape: shape as never, color: 2 }, null, null],
  };
  const step = placePiece(state, 0, r, c);
  if ('error' in step) throw new Error(step.error);
  return { before: state.board, events: step.events };
}

/** How many particles each clear size makes. */
function particlesFor(rows: string[], shape: string, r: number, c: number) {
  const { fx, particles } = setup();
  const { before, events } = move(rows, shape, r, c);
  fx.play(before, events);
  return particles.count;
}

const ONE_ROW = ['#######.', ...EMPTY.slice(1)];
const FOUR_ROWS = ['#######.', '#######.', '#######.', '#######.', ...EMPTY.slice(4)];
const CROSS = [
  '###.####',
  '...#....',
  '...#....',
  '...#....',
  '...#....',
  '...#....',
  '...#....',
  '...#....',
];

describe('ClearFx', () => {
  it('does nothing for a move without a clear', () => {
    const { fx, particles } = setup();
    const { before, events } = move(EMPTY, 'dot', 0, 0);
    fx.play(before, events);
    expect(fx.isAnimating()).toBe(false);
    expect(particles.count).toBe(0);
  });

  it('sweeps a wave along each cleared line, then stops', () => {
    const { scene, fx } = setup();
    const { before, events } = move(FOUR_ROWS, 'i4v', 0, 7);
    fx.play(before, events);
    expect(fx.isAnimating()).toBe(true);
    scene.update(FEEL.lineClear.waveDuration / 2);
    const ctx = fakeContext();
    scene.draw(ctx, frame);
    expect(ctx.count('clip')).toBe(1); // stays on the board
    expect(ctx.count('drawImage')).toBe(4 * 4); // 4 waves × 4 wobble slices
    scene.update(FEEL.lineClear.waveDuration);
    expect(fx.isAnimating()).toBe(false);
    const idle = fakeContext();
    scene.draw(idle, frame);
    expect(idle.calls).toEqual([]);
  });

  it('bursts bubbles and sparkles per line, scaling with the size of the clear', () => {
    const fx = FEEL.lineClear;
    const one = particlesFor(ONE_ROW, 'dot', 0, 7);
    expect(one).toBe(fx.bubblesMin + fx.sparklesPerLine);
    const four = particlesFor(FOUR_ROWS, 'i4v', 0, 7);
    const perLine = fx.bubblesMax + fx.sparklesPerLine + 3 * fx.sparklesPerExtraLine;
    expect(four).toBe(4 * perLine + 4 * fx.splashDropletsPerLine);
    expect(four / 4).toBeGreaterThan(one);
  });

  it('adds an extra burst where a row and a column cross', () => {
    const fx = FEEL.lineClear;
    const count = particlesFor(CROSS, 'dot', 0, 3);
    const perLine = fx.bubblesMin + (fx.bubblesMax - fx.bubblesMin) / 3;
    const sparkles = fx.sparklesPerLine + fx.sparklesPerExtraLine;
    expect(count).toBe(
      Math.floor(2 * perLine) + 2 * sparkles + fx.crossSparkles + fx.crossDroplets,
    );
  });

  it('reset drops running waves', () => {
    const { fx } = setup();
    const { before, events } = move(ONE_ROW, 'dot', 0, 7);
    fx.play(before, events);
    fx.reset();
    expect(fx.isAnimating()).toBe(false);
  });

  it('waits for a layout', () => {
    const particles = new ParticleSystem(64);
    const fx = new ClearFx(particles);
    const { before, events } = move(ONE_ROW, 'dot', 0, 7);
    fx.play(before, events);
    expect(fx.isAnimating()).toBe(false);
  });
});
