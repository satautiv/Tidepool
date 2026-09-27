/**
 * Draws the three tray pieces in their slots (docs/PLAN.md §7.1, §11). Pieces are centred at
 * `layout.trayScale`, a slot being dragged is dimmed, and a new tray slides up and fades in.
 */
import { TRAY_SIZE } from '../core/config';
import type { TraySlot } from '../core/generator';
import { getShape, type Shape } from '../core/shapes';
import { FEEL } from './feel';
import type { SceneContext, SceneView } from './GameScene';
import { rectContains, type Layout, type Rect } from './layout';
import { Ease } from './tween';

/** Where a shape sits when centred in a slot at the tray scale (CSS px). */
export function pieceRectInSlot(shape: Shape, slot: Rect, layout: Layout): Rect {
  const cell = layout.cellSize * layout.trayScale;
  const width = shape.width * cell;
  const height = shape.height * cell;
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  };
}

export class TrayView implements SceneView {
  private tray: readonly (TraySlot | null)[] = new Array<null>(TRAY_SIZE).fill(null);
  private dragging: number | null = null;
  /** Seconds since the current deal-in started, or null when not animating. */
  private dealClock: number | null = null;
  private layout: Layout | null = null;
  /** Hidden behind the main menu (only the board shows through). */
  hidden = false;

  constructor(private readonly invalidate: () => void = () => {}) {}

  onLayout({ layout }: SceneContext): void {
    this.layout = layout;
  }

  /** Shows a tray. `animate` plays the deal-in (for a freshly dealt tray). */
  setTray(tray: readonly (TraySlot | null)[], animate = false): void {
    this.tray = tray;
    this.dealClock = animate ? 0 : null;
    this.invalidate();
  }

  /** Marks the slot whose piece is being dragged (drawn dimmed), or null. */
  setDragging(slot: number | null): void {
    if (slot === this.dragging) return;
    this.dragging = slot;
    this.invalidate();
  }

  /** The slot under a point, if it holds a piece. The whole slot rect is the hit area. */
  slotAt(x: number, y: number): number | null {
    if (!this.layout) return null;
    const i = this.layout.traySlots.findIndex((r) => rectContains(r, x, y));
    return i >= 0 && this.tray[i] ? i : null;
  }

  /** The on-screen rect of a slot's piece, for starting a drag from where it is drawn. */
  pieceRect(slot: number): Rect | null {
    const piece = this.tray[slot];
    const rect = this.layout?.traySlots[slot];
    if (!piece || !rect || !this.layout) return null;
    return pieceRectInSlot(getShape(piece.shape), rect, this.layout);
  }

  update(dt: number): void {
    if (this.dealClock === null) return;
    this.dealClock += dt;
    const total = FEEL.deal.duration + FEEL.deal.stagger * (TRAY_SIZE - 1);
    if (this.dealClock >= total) this.dealClock = null;
  }

  isAnimating(): boolean {
    return this.dealClock !== null;
  }

  /**
   * True while a fresh tray is dealing in and its pieces can't be picked up yet: until the
   * deal-in ends, but never longer than `FEEL.deal.maxInputLock`.
   */
  get dealing(): boolean {
    if (this.dealClock === null) return false;
    const total = FEEL.deal.duration + FEEL.deal.stagger * (TRAY_SIZE - 1);
    return this.dealClock < Math.min(total, FEEL.deal.maxInputLock);
  }

  /** Deal-in progress for a slot, 0..1 (1 when not animating). */
  dealProgress(slot: number): number {
    if (this.dealClock === null) return 1;
    const t = (this.dealClock - slot * FEEL.deal.stagger) / FEEL.deal.duration;
    return Ease.cubicOut(Math.min(1, Math.max(0, t)));
  }

  draw(ctx: CanvasRenderingContext2D, { layout, sprites }: SceneContext): void {
    if (this.hidden) return;
    const cell = layout.cellSize * layout.trayScale;
    this.tray.forEach((piece, i) => {
      if (!piece) return;
      const shape = getShape(piece.shape);
      const rect = pieceRectInSlot(shape, layout.traySlots[i]!, layout);
      const p = this.dealProgress(i);
      const alpha = (i === this.dragging ? FEEL.pickUp.trayDimAlpha : 1) * p;
      if (alpha <= 0) return;
      const rise = (1 - p) * layout.traySlots[i]!.height * FEEL.deal.rise;

      ctx.save();
      ctx.globalAlpha = alpha;
      const sprite = sprites.block(piece.color);
      for (const [r, c] of shape.cells) {
        ctx.drawImage(sprite, rect.x + c * cell, rect.y + r * cell + rise, cell, cell);
      }
      ctx.restore();
    });
  }
}
