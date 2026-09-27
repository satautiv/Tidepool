/**
 * Pooled particles for bubbles, sparkles, droplets and soft dots (docs/PLAN.md §7.4).
 *
 * Struct-of-arrays in typed arrays of a fixed capacity, packed so live particles are always
 * `[0, count)`: a dead particle is replaced by the last live one. Emitting, updating and drawing
 * allocate nothing, so steady state makes no garbage. When the pool is full, new particles are
 * dropped (the effect just gets a little thinner).
 */
import { FEEL } from './feel';
import type { SceneContext, SceneView } from './GameScene';
import type { FrameInfo } from './Renderer';
import { WHITE, type ParticleType, type SpriteSet } from './sprites';

export const DEFAULT_PARTICLE_CAPACITY = 512;

const TYPE_INDEX: Record<ParticleType, number> = { bubble: 0, sparkle: 1, droplet: 2, dot: 3 };
const SPARKLE = TYPE_INDEX.sparkle;
/** Types drawn rotated. The rest are round, so rotation is skipped for them. */
const ROTATES = [false, true, true, false];

export interface EmitOptions {
  /** Palette colour index, or WHITE. Default WHITE. */
  color?: number;
  /** Centre direction in radians (0 = right, −π/2 = up). Default up. */
  angle?: number;
  /** Scales the type's life, for variety between effects. Default 1. */
  lifeScale?: number;
}

export class ParticleSystem {
  readonly capacity: number;
  /** Live particles are `[0, count)`. */
  count = 0;
  /**
   * Global multiplier on emitted counts: reduced motion and low power turn it down
   * (FEEL.reducedMotion.particleScale). 0 disables particles.
   */
  density = 1;

  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly alpha1: Float32Array;
  private readonly rotation: Float32Array;
  private readonly spin: Float32Array;
  private readonly type: Uint8Array;
  private readonly color: Int8Array;
  /** Fractional counts carried between emits, so density 0.25 still emits on average. */
  private carry = 0;

  constructor(
    capacity = DEFAULT_PARTICLE_CAPACITY,
    private readonly random: () => number = Math.random,
  ) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.y = f();
    this.vx = f();
    this.vy = f();
    this.gravity = f();
    this.drag = f();
    this.life = f();
    this.maxLife = f();
    this.size0 = f();
    this.size1 = f();
    this.alpha0 = f();
    this.alpha1 = f();
    this.rotation = f();
    this.spin = f();
    this.type = new Uint8Array(capacity);
    this.color = new Int8Array(capacity);
  }

  /**
   * Emits `count` particles from (x, y) in a cone `spread` radians wide around `opts.angle`,
   * with speeds between half and all of `speed` (px/s). Returns how many were emitted.
   */
  burst(
    type: ParticleType,
    x: number,
    y: number,
    count: number,
    spread: number,
    speed: number,
    opts: EmitOptions = {},
  ): number {
    const n = this.scaled(count);
    const angle = opts.angle ?? -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = angle + (this.random() - 0.5) * spread;
      const v = speed * (0.5 + 0.5 * this.random());
      if (!this.spawn(type, x, y, Math.cos(a) * v, Math.sin(a) * v, opts)) return i;
    }
    return n;
  }

  /**
   * Emits along the segment (x0, y0) → (x1, y1), `countPerUnit` particles per CSS px, drifting
   * in `opts.angle` at up to `speed`. Returns how many were emitted.
   */
  line(
    type: ParticleType,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    countPerUnit: number,
    speed = 0,
    opts: EmitOptions = {},
  ): number {
    const n = this.scaled(Math.hypot(x1 - x0, y1 - y0) * countPerUnit);
    const angle = opts.angle ?? -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = this.random();
      const v = speed * (0.5 + 0.5 * this.random());
      const vx = Math.cos(angle) * v;
      const vy = Math.sin(angle) * v;
      if (!this.spawn(type, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, vx, vy, opts)) return i;
    }
    return n;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    let i = 0;
    while (i < this.count) {
      const life = this.life[i]! + dt;
      if (life >= this.maxLife[i]!) {
        this.kill(i);
        continue; // the last particle moved into slot i
      }
      this.life[i] = life;
      const damp = Math.max(0, 1 - this.drag[i]! * dt);
      this.vy[i] = (this.vy[i]! + this.gravity[i]! * dt) * damp;
      this.vx[i] = this.vx[i]! * damp;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      this.y[i] = this.y[i]! + this.vy[i]! * dt;
      this.rotation[i] = this.rotation[i]! + this.spin[i]! * dt;
      i++;
    }
  }

  /**
   * Normal particles first, then sparkles with additive (`lighter`) blending. Positions are CSS
   * px; (ox, oy) offsets everything (screen shake). The transform is left at
   * `dpr` scale plus that offset, which is what the renderer's views draw with.
   */
  draw(ctx: CanvasRenderingContext2D, sprites: SpriteSet, dpr: number, ox = 0, oy = 0): void {
    if (this.count === 0) return;
    const prevAlpha = ctx.globalAlpha;
    const prevOp = ctx.globalCompositeOperation;
    this.drawPass(ctx, sprites, dpr, ox, oy, false);
    ctx.globalCompositeOperation = 'lighter';
    this.drawPass(ctx, sprites, dpr, ox, oy, true);
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  }

  clear(): void {
    this.count = 0;
    this.carry = 0;
  }

  private drawPass(
    ctx: CanvasRenderingContext2D,
    sprites: SpriteSet,
    dpr: number,
    ox: number,
    oy: number,
    additive: boolean,
  ): void {
    for (let i = 0; i < this.count; i++) {
      const type = this.type[i]!;
      if ((type === SPARKLE) !== additive) continue;
      const t = this.life[i]! / this.maxLife[i]!;
      const size = this.size0[i]! + (this.size1[i]! - this.size0[i]!) * t;
      const alpha = this.alpha0[i]! + (this.alpha1[i]! - this.alpha0[i]!) * t;
      if (size <= 0 || alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      const sprite = sprites.particle(type, this.color[i]!);
      const half = size / 2;
      if (ROTATES[type]) {
        const r = this.rotation[i]!;
        const cos = Math.cos(r) * dpr;
        const sin = Math.sin(r) * dpr;
        const tx = (this.x[i]! + ox) * dpr;
        const ty = (this.y[i]! + oy) * dpr;
        ctx.setTransform(cos, sin, -sin, cos, tx, ty);
        ctx.drawImage(sprite, -half, -half, size, size);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
        ctx.drawImage(sprite, this.x[i]! - half, this.y[i]! - half, size, size);
      }
    }
  }

  /** Applies `density`, carrying the fractional part to the next emit. */
  private scaled(count: number): number {
    const exact = Math.max(0, count) * this.density + this.carry;
    const n = Math.floor(exact);
    this.carry = exact - n;
    return n;
  }

  private spawn(
    typeName: ParticleType,
    x: number,
    y: number,
    vx: number,
    vy: number,
    opts: EmitOptions,
  ): boolean {
    if (this.count >= this.capacity) return false;
    const i = this.count++;
    const cfg = FEEL.particles[typeName];
    const jitter = 0.8 + 0.4 * this.random();
    this.type[i] = TYPE_INDEX[typeName];
    this.color[i] = opts.color ?? WHITE;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.gravity[i] = cfg.gravity;
    this.drag[i] = cfg.drag;
    this.life[i] = 0;
    this.maxLife[i] = Math.max(0.01, cfg.life * (opts.lifeScale ?? 1) * jitter);
    this.size0[i] = cfg.sizeFrom * jitter;
    this.size1[i] = cfg.sizeTo * jitter;
    this.alpha0[i] = cfg.alphaFrom;
    this.alpha1[i] = cfg.alphaTo;
    this.rotation[i] = this.random() * Math.PI * 2;
    this.spin[i] = cfg.spin * (this.random() * 2 - 1);
    return true;
  }

  /** Removes particle i by moving the last live particle into its slot. */
  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.gravity[i] = this.gravity[last]!;
    this.drag[i] = this.drag[last]!;
    this.life[i] = this.life[last]!;
    this.maxLife[i] = this.maxLife[last]!;
    this.size0[i] = this.size0[last]!;
    this.size1[i] = this.size1[last]!;
    this.alpha0[i] = this.alpha0[last]!;
    this.alpha1[i] = this.alpha1[last]!;
    this.rotation[i] = this.rotation[last]!;
    this.spin[i] = this.spin[last]!;
    this.type[i] = this.type[last]!;
    this.color[i] = this.color[last]!;
  }
}

/** The particle layer of the play scene. Effects emit into `system`. */
export class ParticleView implements SceneView {
  constructor(readonly system: ParticleSystem = new ParticleSystem()) {}

  update(dt: number): void {
    this.system.update(dt);
  }

  isAnimating(): boolean {
    return this.system.count > 0;
  }

  draw(ctx: CanvasRenderingContext2D, { sprites }: SceneContext, frame: FrameInfo): void {
    this.system.draw(ctx, sprites, frame.viewport.dpr);
  }
}
