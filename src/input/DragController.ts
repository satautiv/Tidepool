/**
 * Drag & drop from the tray to the board (README §3.2, §12, docs/PLAN.md §8).
 *
 * Pure pointer logic: it receives pointer positions in canvas CSS pixels and asks a `DragHost`
 * (supplied by app/) about the tray and board. The DOM binding is in `bindPointerEvents`.
 */
import type { Shape } from '../core/shapes';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BoardGeometry {
  readonly board: Box;
  readonly cellSize: number;
}

/** What the controller needs to know about the screen and the game. */
export interface DragHost {
  slotAt(x: number, y: number): number | null;
  /** Where the slot's piece is currently drawn in the tray. */
  pieceRect(slot: number): Box | null;
  /** The slot's piece, or null if the slot is empty. */
  pieceOf(slot: number): { shape: Shape; color: number } | null;
  geometry(): BoardGeometry | null;
  canPlace(slot: number, row: number, col: number): boolean;
}

export type PointerKind = 'mouse' | 'touch' | 'pen';

export interface PointerInfo {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly kind: PointerKind;
}

export interface Cell {
  readonly row: number;
  readonly col: number;
}

/** Live drag state, read by the renderer to draw the lifted piece. */
export interface DragState {
  readonly slot: number;
  readonly shape: Shape;
  readonly color: number;
  readonly pointerId: number;
  readonly kind: PointerKind;
  /** Top-left of the piece at full board scale, in CSS px. */
  readonly x: number;
  readonly y: number;
  /** Where the piece started (its tray rect), for the lift animation. */
  readonly from: Box;
  /** The board cell under the piece's top-left, if the piece fits there. */
  readonly target: Cell | null;
}

export interface PlaceIntent {
  readonly slot: number;
  readonly row: number;
  readonly col: number;
}

export interface DragCallbacks {
  onStart?(state: DragState): void;
  onMove?(state: DragState): void;
  /** A valid drop. The app decides what happens; the drag has ended either way. */
  onPlace?(intent: PlaceIntent, state: DragState): void;
  /** The drag ended without a placement (invalid drop, cancel): the piece returns to the tray. */
  onCancel?(state: DragState): void;
}

export const DRAG = {
  /** On touch, the piece's bottom edge floats this many cells above the finger. */
  touchLiftCells: 1.2,
  /** Drops farther than this many cells outside the board never target a cell. */
  outsideTolerance: 0.5,
  /**
   * Magnet assist (PLAN §8): when the nearest cell doesn't fit, snap to a fitting neighbour
   * within this distance (in cells) of the piece's actual position. 0 disables it.
   */
  magnetRadius: 0.75,
};

export class DragController {
  private drag: DragState | null = null;
  /** Grab point inside the piece, as a fraction of its size (mouse/pen). */
  private grab = { fx: 0.5, fy: 0.5 };
  private locked = false;

  constructor(
    private readonly host: DragHost,
    private readonly callbacks: DragCallbacks = {},
  ) {}

  get state(): DragState | null {
    return this.drag;
  }

  /** While locked (deal-in, modal, game over), new drags are ignored and an active one is cancelled. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) this.cancel();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  pointerDown(p: PointerInfo): boolean {
    if (this.locked || this.drag) return false;
    const slot = this.host.slotAt(p.x, p.y);
    if (slot === null) return false;
    const piece = this.host.pieceOf(slot);
    const from = this.host.pieceRect(slot);
    const geo = this.host.geometry();
    if (!piece || !from || !geo) return false;

    // Grab relative to the drawn piece, clamped so grabbing the empty part of a slot still works.
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    this.grab = {
      fx: clamp01((p.x - from.x) / from.width),
      fy: clamp01((p.y - from.y) / from.height),
    };
    this.drag = this.positioned(
      { slot, ...piece, pointerId: p.id, kind: p.kind, x: 0, y: 0, from, target: null },
      p,
      geo,
    );
    this.callbacks.onStart?.(this.drag);
    return true;
  }

  pointerMove(p: PointerInfo): void {
    const geo = this.host.geometry();
    if (!this.drag || p.id !== this.drag.pointerId || !geo) return;
    this.drag = this.positioned(this.drag, p, geo);
    this.callbacks.onMove?.(this.drag);
  }

  pointerUp(p: PointerInfo): void {
    if (!this.drag || p.id !== this.drag.pointerId) return;
    this.pointerMove(p);
    const drag = this.drag;
    this.drag = null;
    if (drag.target) {
      this.callbacks.onPlace?.({ slot: drag.slot, ...drag.target }, drag);
    } else {
      this.callbacks.onCancel?.(drag);
    }
  }

  /** Ends any drag without placing (pointercancel, blur, modal). */
  cancel(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.callbacks.onCancel?.(drag);
  }

  private positioned(d: DragState, p: PointerInfo, geo: BoardGeometry): DragState {
    const c = geo.cellSize;
    const w = d.shape.width * c;
    const h = d.shape.height * c;
    let x: number;
    let y: number;
    if (p.kind === 'touch') {
      // Float above the finger so it never hides the piece.
      x = p.x - w / 2;
      y = p.y - DRAG.touchLiftCells * c - h;
    } else {
      x = p.x - this.grab.fx * w;
      y = p.y - this.grab.fy * h;
    }
    return { ...d, x, y, target: this.targetFor(d, x, y, geo) };
  }

  /** Rounds the piece's top-left to the nearest cell; valid only if the piece fits there. */
  private targetFor(d: DragState, x: number, y: number, geo: BoardGeometry): Cell | null {
    const { board, cellSize: c } = geo;
    const { shape, slot } = d;
    // `+ 0` turns Math.round's -0 (for slightly negative offsets) into 0.
    const col = Math.round((x - board.x) / c) + 0;
    const row = Math.round((y - board.y) / c) + 0;
    const tol = DRAG.outsideTolerance * c;
    const outside =
      x < board.x - tol ||
      y < board.y - tol ||
      x + shape.width * c > board.x + board.width + tol ||
      y + shape.height * c > board.y + board.height + tol;
    if (outside) return null;
    if (this.host.canPlace(slot, row, col)) return { row, col };
    if (DRAG.magnetRadius <= 0) return null;

    // Magnet assist: the fitting neighbour closest to where the piece really is.
    const fx = (x - board.x) / c;
    const fy = (y - board.y) / c;
    let best: Cell | null = null;
    let bestDist = DRAG.magnetRadius;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const k = col + dc;
        const dist = Math.hypot(k - fx, r - fy);
        if (dist <= bestDist && this.host.canPlace(slot, r, k)) {
          best = { row: r, col: k };
          bestDist = dist;
        }
      }
    }
    return best;
  }
}

/** Minimal event target shape, so tests can use Node's EventTarget. */
export interface PointerSurface extends EventTarget {
  getBoundingClientRect(): { left: number; top: number };
  setPointerCapture?(id: number): void;
}

/**
 * Connects DOM pointer events on `surface` to the controller. Returns an unbind function.
 * `blurTarget` (usually window) cancels drags when the page loses focus.
 */
export function bindPointerEvents(
  surface: PointerSurface,
  controller: DragController,
  blurTarget?: EventTarget,
): () => void {
  const info = (e: PointerEvent): PointerInfo => {
    const r = surface.getBoundingClientRect();
    const kind: PointerKind =
      e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, kind };
  };
  const down = (e: Event) => {
    const pe = e as PointerEvent;
    if (pe.button !== undefined && pe.button > 0) return;
    if (controller.pointerDown(info(pe))) {
      surface.setPointerCapture?.(pe.pointerId);
      e.preventDefault();
    }
  };
  const move = (e: Event) => controller.pointerMove(info(e as PointerEvent));
  const up = (e: Event) => controller.pointerUp(info(e as PointerEvent));
  const cancel = () => controller.cancel();
  const prevent = (e: Event) => e.preventDefault();

  const listeners: Array<[EventTarget, string, (e: Event) => void]> = [
    [surface, 'pointerdown', down],
    [surface, 'pointermove', move],
    [surface, 'pointerup', up],
    [surface, 'pointercancel', cancel],
    [surface, 'lostpointercapture', cancel],
    [surface, 'contextmenu', prevent],
    [surface, 'selectstart', prevent],
  ];
  if (blurTarget) listeners.push([blurTarget, 'blur', cancel]);
  for (const [t, type, fn] of listeners) t.addEventListener(type, fn);
  return () => {
    for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  };
}
