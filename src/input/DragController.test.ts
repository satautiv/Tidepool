import { describe, expect, it, vi } from 'vitest';
import { boardFromAscii, canPlace, emptyBoard, type Board } from '../core/board';
import { getShape, type Shape } from '../core/shapes';
import {
  bindPointerEvents,
  DRAG,
  DragController,
  type DragHost,
  type PointerInfo,
  type PointerSurface,
} from './DragController';

// Board: 8 × 40 px cells at (100, 100). Tray slot i: (100 + 110 i, 460, 100, 100).
const CELL = 40;
const BOARD = { x: 100, y: 100, width: 320, height: 320 };
const slotRect = (i: number) => ({ x: 100 + 110 * i, y: 460, width: 100, height: 100 });

function makeHost(tray: Array<string | null>, board: Board = emptyBoard()) {
  const host: DragHost & { geometryReady: boolean } = {
    geometryReady: true,
    slotAt: (x, y) => {
      for (let i = 0; i < tray.length; i++) {
        const r = slotRect(i);
        if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
          return tray[i] ? i : null;
        }
      }
      return null;
    },
    pieceRect: (slot) => {
      const id = tray[slot];
      if (!id) return null;
      const s = getShape(id);
      const r = slotRect(slot);
      const c = CELL * 0.5;
      return {
        x: r.x + (r.width - s.width * c) / 2,
        y: r.y + (r.height - s.height * c) / 2,
        width: s.width * c,
        height: s.height * c,
      };
    },
    pieceOf: (slot) => (tray[slot] ? { shape: getShape(tray[slot]!), color: 3 } : null),
    geometry: () => (host.geometryReady ? { board: BOARD, cellSize: CELL } : null),
    canPlace: (slot, row, col) => !!tray[slot] && canPlace(board, getShape(tray[slot]!), row, col),
  };
  return host;
}

const mouse = (x: number, y: number, id = 1): PointerInfo => ({ id, x, y, kind: 'mouse' });
const touch = (x: number, y: number, id = 1): PointerInfo => ({ id, x, y, kind: 'touch' });
/** Pointer position that puts a mouse-grabbed piece's top-left on (row, col), given the grab. */
const centreOf = (shape: Shape, row: number, col: number) => ({
  x: BOARD.x + (col + shape.width / 2) * CELL,
  y: BOARD.y + (row + shape.height / 2) * CELL,
});

function setup(tray: Array<string | null> = ['sq2', 'dot', 'i3h'], board?: Board) {
  const host = makeHost(tray, board);
  const cb = { onStart: vi.fn(), onMove: vi.fn(), onPlace: vi.fn(), onCancel: vi.fn() };
  const ctrl = new DragController(host, cb);
  return { host, cb, ctrl };
}

/** Starts a mouse drag grabbing the centre of the slot's piece. */
function grabCentre(ctrl: DragController, host: DragHost, slot: number, id = 1) {
  const r = host.pieceRect(slot)!;
  return ctrl.pointerDown(mouse(r.x + r.width / 2, r.y + r.height / 2, id));
}

describe('starting a drag', () => {
  it('starts on a tray piece and reports the lifted state', () => {
    const { ctrl, host, cb } = setup();
    expect(grabCentre(ctrl, host, 0)).toBe(true);
    expect(cb.onStart).toHaveBeenCalledTimes(1);
    const s = ctrl.state!;
    expect(s.slot).toBe(0);
    expect(s.shape.id).toBe('sq2');
    expect(s.color).toBe(3);
    expect(s.from).toEqual(host.pieceRect(0));
  });

  it('accepts the whole slot as a hit area, not just the piece', () => {
    const { ctrl } = setup();
    expect(ctrl.pointerDown(mouse(slotRect(1).x + 2, slotRect(1).y + 2))).toBe(true);
    expect(ctrl.state?.slot).toBe(1);
  });

  it('ignores empty slots, the board, missing geometry and a second pointer', () => {
    const { ctrl, host } = setup(['sq2', null, 'dot']);
    expect(ctrl.pointerDown(mouse(slotRect(1).x + 50, slotRect(1).y + 50))).toBe(false);
    expect(ctrl.pointerDown(mouse(BOARD.x + 10, BOARD.y + 10))).toBe(false);
    host.geometryReady = false;
    expect(grabCentre(ctrl, host, 0)).toBe(false);
    host.geometryReady = true;
    expect(grabCentre(ctrl, host, 0, 1)).toBe(true);
    expect(grabCentre(ctrl, host, 2, 2)).toBe(false);
    expect(ctrl.state?.slot).toBe(0);
  });

  it('ignores drags while locked, and locking cancels an active drag', () => {
    const { ctrl, host, cb } = setup();
    grabCentre(ctrl, host, 0);
    ctrl.setLocked(true);
    expect(ctrl.isLocked).toBe(true);
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(ctrl.state).toBeNull();
    expect(grabCentre(ctrl, host, 0)).toBe(false);
    ctrl.setLocked(false);
    expect(grabCentre(ctrl, host, 0)).toBe(true);
  });
});

describe('moving and dropping', () => {
  it('keeps the mouse grab point and snaps to the nearest cell', () => {
    const { ctrl, host, cb } = setup();
    grabCentre(ctrl, host, 0);
    const p = centreOf(getShape('sq2'), 3, 4);
    ctrl.pointerMove(mouse(p.x + 12, p.y - 9)); // off by less than half a cell
    expect(cb.onMove).toHaveBeenCalled();
    expect(ctrl.state!.x).toBe(BOARD.x + 4 * CELL + 12);
    expect(ctrl.state!.target).toEqual({ row: 3, col: 4 });

    ctrl.pointerUp(mouse(p.x + 12, p.y - 9));
    expect(cb.onPlace).toHaveBeenCalledWith({ slot: 0, row: 3, col: 4 }, expect.anything());
    expect(ctrl.state).toBeNull();
  });

  it('floats the piece above the finger on touch', () => {
    const { ctrl, cb } = setup();
    ctrl.pointerDown(touch(slotRect(0).x + 50, slotRect(0).y + 50));
    ctrl.pointerMove(touch(260, 300));
    const s = ctrl.state!;
    const h = 2 * CELL;
    expect(s.x).toBe(260 - CELL); // centred horizontally (sq2 is 2 cells wide)
    expect(s.y + h).toBe(300 - DRAG.touchLiftCells * CELL); // bottom edge above the finger
    expect(s.y + h).toBeLessThan(300);
    ctrl.pointerUp(touch(260, 300));
    expect(cb.onPlace).toHaveBeenCalledTimes(1);
  });

  it('has no target over filled cells, and cancels on an invalid drop', () => {
    const board = boardFromAscii([
      '........',
      '........',
      '........',
      '....#...',
      '........',
      '........',
      '........',
      '........',
    ]);
    const { ctrl, host, cb } = setup(['sq2', 'dot', 'i3h'], board);
    grabCentre(ctrl, host, 0);
    const p = centreOf(getShape('sq2'), 3, 4);
    ctrl.pointerMove(mouse(p.x, p.y));
    expect(ctrl.state!.target).toBeNull();
    ctrl.pointerUp(mouse(p.x, p.y));
    expect(cb.onPlace).not.toHaveBeenCalled();
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(cb.onCancel).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('does not count a drop off the board or an aborted drag as an invalid drop', () => {
    const { ctrl, host, cb } = setup();
    grabCentre(ctrl, host, 0);
    const r = host.pieceRect(0)!;
    ctrl.pointerUp(mouse(r.x + r.width / 2, r.y + r.height / 2)); // back on the tray
    expect(cb.onCancel).toHaveBeenLastCalledWith(expect.anything(), false);

    grabCentre(ctrl, host, 0);
    const p = centreOf(getShape('sq2'), 3, 4);
    ctrl.pointerMove(mouse(p.x, p.y));
    ctrl.cancel(); // blur, pointercancel, lock
    expect(cb.onCancel).toHaveBeenLastCalledWith(expect.anything(), false);
  });

  it('has no target when the piece is mostly off the board', () => {
    const { ctrl, host } = setup();
    grabCentre(ctrl, host, 1);
    // Dot centred just left of the board by more than the tolerance.
    ctrl.pointerMove(mouse(BOARD.x - CELL * (0.5 + DRAG.outsideTolerance) - 1, BOARD.y + 20));
    expect(ctrl.state!.target).toBeNull();
    // Slightly outside, within the tolerance: snaps to column 0.
    ctrl.pointerMove(mouse(BOARD.x + CELL * 0.5 - CELL * 0.4, BOARD.y + 20));
    expect(ctrl.state!.target).toEqual({ row: 0, col: 0 });
  });

  it('rejects pieces that would stick out past the far edges', () => {
    const { ctrl, host } = setup();
    grabCentre(ctrl, host, 2); // i3h
    const p = centreOf(getShape('i3h'), 0, 6); // needs columns 6..8
    ctrl.pointerMove(mouse(p.x, p.y));
    expect(ctrl.state!.target).toBeNull();
  });

  it('ignores events from other pointers', () => {
    const { ctrl, host, cb } = setup();
    grabCentre(ctrl, host, 0, 1);
    const before = ctrl.state;
    ctrl.pointerMove(mouse(0, 0, 2));
    ctrl.pointerUp(mouse(0, 0, 2));
    expect(ctrl.state).toBe(before);
    expect(cb.onPlace).not.toHaveBeenCalled();
    ctrl.pointerMove(mouse(0, 0, 1));
    host.geometryReady = false;
    ctrl.pointerMove(mouse(5, 5, 1)); // no geometry: position unchanged
    expect(ctrl.state!.x).not.toBe(5);
  });

  it('cancel() is a no-op without a drag', () => {
    const { ctrl, cb } = setup();
    ctrl.cancel();
    expect(cb.onCancel).not.toHaveBeenCalled();
    ctrl.pointerUp(mouse(0, 0));
    ctrl.pointerMove(mouse(0, 0));
    expect(cb.onPlace).not.toHaveBeenCalled();
  });
});

describe('bindPointerEvents', () => {
  class Surface extends EventTarget implements PointerSurface {
    captured: number[] = [];
    getBoundingClientRect() {
      return { left: 10, top: 20 };
    }
    setPointerCapture(id: number) {
      this.captured.push(id);
    }
  }

  const pointer = (type: string, props: Record<string, unknown>) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { pointerId: 7, pointerType: 'mouse', button: 0, ...props });
    return e;
  };

  it('translates DOM pointer events into controller calls', () => {
    const { ctrl, host, cb } = setup();
    const surface = new Surface();
    const win = new EventTarget();
    const unbind = bindPointerEvents(surface, ctrl, win);
    const r = host.pieceRect(0)!;

    const down = pointer('pointerdown', { clientX: r.x + 10 + 20, clientY: r.y + 20 + 20 });
    surface.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(surface.captured).toEqual([7]);
    expect(ctrl.state?.slot).toBe(0);

    const p = centreOf(getShape('sq2'), 2, 2);
    surface.dispatchEvent(pointer('pointermove', { clientX: p.x + 10, clientY: p.y + 20 }));
    surface.dispatchEvent(pointer('pointerup', { clientX: p.x + 10, clientY: p.y + 20 }));
    expect(cb.onPlace).toHaveBeenCalledWith({ slot: 0, row: 2, col: 2 }, expect.anything());

    // Touch & pen kinds, right-click ignored, blur and pointercancel cancel.
    surface.dispatchEvent(
      pointer('pointerdown', { clientX: r.x + 30, clientY: r.y + 40, button: 2 }),
    );
    expect(ctrl.state).toBeNull();
    surface.dispatchEvent(
      pointer('pointerdown', { clientX: r.x + 30, clientY: r.y + 40, pointerType: 'pen' }),
    );
    expect(ctrl.state?.kind).toBe('pen');
    win.dispatchEvent(new Event('blur'));
    expect(ctrl.state).toBeNull();
    surface.dispatchEvent(
      pointer('pointerdown', { clientX: r.x + 30, clientY: r.y + 40, pointerType: 'touch' }),
    );
    expect(ctrl.state?.kind).toBe('touch');
    surface.dispatchEvent(pointer('pointercancel', {}));
    expect(ctrl.state).toBeNull();
    expect(cb.onCancel).toHaveBeenCalledTimes(2);

    const menu = new Event('contextmenu', { cancelable: true });
    surface.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);

    // A missed pointerdown isn't prevented (so page UI still works).
    const miss = pointer('pointerdown', { clientX: 0, clientY: 0 });
    surface.dispatchEvent(miss);
    expect(miss.defaultPrevented).toBe(false);

    unbind();
    surface.dispatchEvent(pointer('pointerdown', { clientX: r.x + 30, clientY: r.y + 40 }));
    expect(ctrl.state).toBeNull();
  });
});

describe('magnet assist', () => {
  // Column 4 of row 3 is filled, so a dot aimed at (3,4) must snap to a free neighbour.
  const board = boardFromAscii([
    '........',
    '........',
    '........',
    '....#...',
    '........',
    '........',
    '........',
    '........',
  ]);

  it('snaps a near miss to the closest fitting neighbour', () => {
    const { ctrl, host } = setup(['sq2', 'dot', 'i3h'], board);
    grabCentre(ctrl, host, 1);
    // Aim at (3,4), leaning right (+0.4 cell): the nearest fitting cell is (3,5).
    const p = centreOf(getShape('dot'), 3, 4);
    ctrl.pointerMove(mouse(p.x + 0.4 * CELL, p.y));
    expect(ctrl.state!.target).toEqual({ row: 3, col: 5 });
    // Leaning up instead: (2,4).
    ctrl.pointerMove(mouse(p.x, p.y - 0.4 * CELL));
    expect(ctrl.state!.target).toEqual({ row: 2, col: 4 });
  });

  it('does not reach farther than the magnet radius', () => {
    const blocked = boardFromAscii([
      '........',
      '........',
      '...###..',
      '...###..',
      '...###..',
      '........',
      '........',
      '........',
    ]);
    const { ctrl, host } = setup(['sq2', 'dot', 'i3h'], blocked);
    grabCentre(ctrl, host, 1);
    const p = centreOf(getShape('dot'), 3, 4); // centre of the 3×3 block: neighbours all filled
    ctrl.pointerMove(mouse(p.x, p.y));
    expect(ctrl.state!.target).toBeNull();
  });

  it('can be disabled', () => {
    const saved = DRAG.magnetRadius;
    DRAG.magnetRadius = 0;
    try {
      const { ctrl, host } = setup(['sq2', 'dot', 'i3h'], board);
      grabCentre(ctrl, host, 1);
      const p = centreOf(getShape('dot'), 3, 4);
      ctrl.pointerMove(mouse(p.x + 0.4 * CELL, p.y));
      expect(ctrl.state!.target).toBeNull();
    } finally {
      DRAG.magnetRadius = saved;
    }
  });
});
