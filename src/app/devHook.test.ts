// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getShape as getShapeOf } from '../core/shapes';
import { DragController } from '../input/DragController';
import { createTestHook, NEAR_GAME_OVER } from './devHook';
import { makeApp } from './testing';

function setup() {
  const made = makeApp('hook');
  return { ...made, hook: createTestHook(made.app, made.canvas) };
}

describe('dev test hook', () => {
  it('reports the state and starts seeded runs', () => {
    const { hook } = setup();
    expect(hook.getState()).toMatchObject({ score: 0, over: false, placed: 0 });
    expect(hook.getState().board).toEqual(Array(8).fill('........'));
    const before = hook.getState().tray;
    hook.setSeed('other');
    hook.setSeed('hook');
    expect(hook.getState().tray).toEqual(before);
  });

  it('sets a board and tray', () => {
    const { hook } = setup();
    hook.setBoard(NEAR_GAME_OVER, ['dot', null, 'sq2']);
    expect(hook.getState().tray).toEqual(['dot', null, 'sq2']);
    expect(hook.getState().board[0]).toBe('0.0.0.0.');
    expect(hook.getState().over).toBe(false);
  });

  it('forces a real game over', () => {
    const { hook } = setup();
    hook.forceGameOver();
    expect(hook.getState()).toMatchObject({ over: true, placed: 1, score: 1 });
  });

  it('gives drop points that land the piece where asked, for mouse and touch', () => {
    const { app, hook } = setup();
    const layout = app.scene.layout!;
    for (const kind of ['mouse', 'touch'] as const) {
      for (let slot = 0; slot < 3; slot++) {
        let placed: unknown = null;
        const drag = new DragController(
          {
            slotAt: () => slot,
            pieceRect: (s) => app.slotPieceRect(s),
            pieceOf: () => {
              const piece = app.state.tray[slot]!;
              return { shape: getShapeOf(piece.shape), color: piece.color };
            },
            geometry: () => ({ board: layout.board, cellSize: layout.cellSize }),
            canPlace: () => true,
          },
          { onPlace: (intent) => (placed = intent) },
        );
        const from = hook.slotCenter(slot)!;
        const to = hook.dropPoint(slot, 1, 2, kind)!;
        drag.pointerDown({ id: 1, kind, ...from });
        drag.pointerUp({ id: 1, kind, ...to });
        expect(placed).toEqual({ slot, row: 1, col: 2 });
      }
    }
    expect(hook.cellCenter(0, 0)).toEqual({
      x: layout.board.x + layout.cellSize / 2,
      y: layout.board.y + layout.cellSize / 2,
    });
  });
});
