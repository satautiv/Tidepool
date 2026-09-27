/**
 * Composite view for the play screen: computes the layout once per viewport change, keeps the
 * sprites up to date, and forwards frames to its child views in order.
 */
import { computeLayout, type Insets, type Layout } from './layout';
import type { FrameInfo, View, Viewport } from './Renderer';
import type { SpriteSet } from './sprites';

export interface SceneContext {
  readonly layout: Layout;
  readonly sprites: SpriteSet;
}

export interface SceneView {
  onLayout?(scene: SceneContext): void;
  update?(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, scene: SceneContext, frame: FrameInfo): void;
  isAnimating?(): boolean;
}

/** Something with a current draw offset (the screen shake). */
export interface Offset {
  readonly x: number;
  readonly y: number;
}

export class GameScene implements View {
  private readonly children: SceneView[] = [];
  /** Children drawn with the shake offset. */
  private readonly shaken = new Set<SceneView>();
  private offset: Offset = { x: 0, y: 0 };
  private context: SceneContext | null = null;

  constructor(
    private readonly sprites: SpriteSet,
    private readonly safeArea: () => Insets = () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  ) {}

  get layout(): Layout | null {
    return this.context?.layout ?? null;
  }

  /** Adds a child. `shake: true` draws it moved by the scene's shake offset. */
  add(view: SceneView, opts: { shake?: boolean } = {}): void {
    this.children.push(view);
    if (opts.shake) this.shaken.add(view);
    if (this.context) view.onLayout?.(this.context);
  }

  /** The offset applied to shaken children (usually a `Shake`). */
  setShake(offset: Offset): void {
    this.offset = offset;
  }

  onLayout(viewport: Viewport): void {
    const layout = computeLayout({ ...viewport, safeArea: this.safeArea() });
    this.sprites.build(layout.cellSize, layout.dpr);
    this.context = { layout, sprites: this.sprites };
    for (const child of this.children) child.onLayout?.(this.context);
  }

  update(dt: number): void {
    for (const child of this.children) child.update?.(dt);
  }

  draw(ctx: CanvasRenderingContext2D, frame: FrameInfo): void {
    if (!this.context || !this.sprites.ready) return;
    const { x, y } = this.offset;
    for (const child of this.children) {
      if ((x !== 0 || y !== 0) && this.shaken.has(child)) {
        ctx.save();
        ctx.translate(x, y);
        child.draw(ctx, this.context, frame);
        ctx.restore();
      } else {
        child.draw(ctx, this.context, frame);
      }
    }
  }

  isAnimating(): boolean {
    return this.children.some((c) => c.isAnimating?.() ?? false);
  }
}
