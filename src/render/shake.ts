/**
 * Screen shake (docs/PLAN.md §11): a random offset that decays to nothing, applied to the
 * board and tray drawing only. It never moves layout, so input hit-testing is unaffected.
 */
import type { SceneView } from './GameScene';

export class Shake implements SceneView {
  /** Current offset in CSS px. */
  x = 0;
  y = 0;
  /** Reduced motion turns this off. */
  enabled: () => boolean;
  private amplitude = 0;
  private duration = 0;
  private time = 0;

  constructor(
    enabled: () => boolean = () => true,
    private readonly random: () => number = Math.random,
  ) {
    this.enabled = enabled;
  }

  /** Starts a shake; a stronger one replaces a weaker one in progress. */
  start(amplitude: number, duration: number): void {
    if (!this.enabled() || amplitude <= 0 || duration <= 0) return;
    if (this.active && this.currentAmplitude() > amplitude) return;
    this.amplitude = amplitude;
    this.duration = duration;
    this.time = 0;
  }

  get active(): boolean {
    return this.time < this.duration;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.time += dt;
    if (!this.active) {
      this.x = this.y = 0;
      return;
    }
    const a = this.currentAmplitude();
    const angle = this.random() * Math.PI * 2;
    this.x = Math.cos(angle) * a;
    this.y = Math.sin(angle) * a;
  }

  isAnimating(): boolean {
    return this.active;
  }

  draw(): void {}

  /** Linear decay over the duration. */
  private currentAmplitude(): number {
    return this.amplitude * Math.max(0, 1 - this.time / this.duration);
  }
}
