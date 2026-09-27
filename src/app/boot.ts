/**
 * The boot loader (T3.04): index.html paints a title and progress bar before any script runs;
 * this moves the bar through the boot steps, forwards progress to portal SDKs that ask for it,
 * and fades the loader out once the game has drawn its first frame.
 */

/** Optional loading signals some portal SDK wrappers implement (duck-typed, not in AdService). */
export interface LoadingSignals {
  loadingProgress?(fraction: number): void;
  loadingFinished?(): void;
}

export class BootLoader {
  private readonly fill: HTMLElement | null;
  private portals: LoadingSignals[] = [];
  private finished = false;

  constructor(private readonly el: HTMLElement | null) {
    this.fill = el?.querySelector<HTMLElement>('.fill') ?? null;
  }

  /** Adds something that wants loading signals (e.g. the ad service on portals). */
  report(to: unknown): void {
    const signals = to as LoadingSignals;
    if (
      typeof signals?.loadingProgress === 'function' ||
      typeof signals?.loadingFinished === 'function'
    ) {
      this.portals.push(signals);
    }
  }

  progress(fraction: number): void {
    const f = Math.min(1, Math.max(0, fraction));
    if (this.fill) this.fill.style.width = `${Math.round(f * 100)}%`;
    this.el?.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    for (const p of this.portals) safely(() => p.loadingProgress?.(f));
  }

  /** The game is up: tell the portals, fade the loader and remove it. */
  finish(removeAfterMs = 300): void {
    if (this.finished) return;
    this.finished = true;
    this.progress(1);
    for (const p of this.portals) safely(() => p.loadingFinished?.());
    this.el?.classList.add('done');
    setTimeout(() => this.el?.remove(), removeAfterMs);
  }
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Portal SDK hiccups never block booting.
  }
}
