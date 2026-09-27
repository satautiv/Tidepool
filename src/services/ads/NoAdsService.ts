/**
 * Ad provider for development, tests and ad-free builds (README §8.3). Rewarded ads always
 * pay out after a short fake delay; in dev both ad kinds show a labelled placeholder overlay.
 */
import type { AdService } from './AdService';

/** Shows a placeholder over the game and returns a function that removes it. */
export type AdOverlay = (label: string) => () => void;

export interface NoAdsOptions {
  /** Dev toggle: whether a rewarded ad is "loaded". Default true. */
  rewardedReady?: boolean;
  /** Fake ad length. Default 1200 ms. */
  delayMs?: number;
  /** Placeholder overlay (dev). Null means silent: interstitials are no-ops (prod `web`). */
  overlay?: AdOverlay | null;
  wait?: (ms: number) => Promise<void>;
}

export class NoAdsService implements AdService {
  rewardedReady: boolean;
  private readonly delayMs: number;
  private readonly overlay: AdOverlay | null;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(opts: NoAdsOptions = {}) {
    this.rewardedReady = opts.rewardedReady ?? true;
    this.delayMs = opts.delayMs ?? 1200;
    this.overlay = opts.overlay ?? null;
    this.wait = opts.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async init(): Promise<void> {}

  isRewardedReady(): boolean {
    return this.rewardedReady;
  }

  async showRewarded(_placement: string): Promise<boolean> {
    await this.play('[Rewarded ad placeholder]');
    return true;
  }

  async showInterstitial(_placement: string): Promise<void> {
    if (this.overlay) await this.play('[Interstitial placeholder]');
  }

  gameplayStart(): void {}

  gameplayStop(): void {}

  private async play(label: string): Promise<void> {
    const close = this.overlay?.(label);
    try {
      await this.wait(this.delayMs);
    } finally {
      close?.();
    }
  }
}

/** A plain full-screen placeholder appended to `root` (dev builds only). */
export function domAdOverlay(root: HTMLElement): AdOverlay {
  return (label) => {
    const el = document.createElement('div');
    el.className = 'dev-ad-overlay';
    el.textContent = label;
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(10, 30, 40, 0.85)',
      color: '#fff',
      font: '600 20px system-ui, sans-serif',
      zIndex: '1000',
      pointerEvents: 'auto',
    });
    root.append(el);
    return () => el.remove();
  };
}
