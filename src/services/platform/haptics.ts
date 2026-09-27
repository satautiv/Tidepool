/**
 * Haptic feedback (docs/PLAN.md §13.4). On the web it uses `navigator.vibrate` where it exists
 * (Android Chrome; iOS Safari has none, so it quietly does nothing). Android swaps in Capacitor
 * Haptics in T5.02. Settings → Haptics turns it off.
 */

export type ImpactLevel = 'light' | 'medium' | 'heavy';

export interface Haptics {
  impact(level: ImpactLevel): void;
}

/** Pulse lengths (ms): short enough to feel like a tap, not a buzz. */
export const VIBRATE_MS: Record<ImpactLevel, number> = { light: 10, medium: 20, heavy: 35 };

type Vibrator = { vibrate?: (pattern: number | number[]) => boolean };

export class WebHaptics implements Haptics {
  constructor(
    /** Reads the Settings toggle at each call. */
    private readonly enabled: () => boolean,
    private readonly nav: Vibrator | undefined = typeof navigator === 'undefined'
      ? undefined
      : navigator,
  ) {}

  impact(level: ImpactLevel): void {
    if (!this.enabled() || typeof this.nav?.vibrate !== 'function') return;
    try {
      this.nav.vibrate(VIBRATE_MS[level]);
    } catch {
      // Some browsers throw without a user gesture or in iframes; haptics are optional.
    }
  }
}

export class NoHaptics implements Haptics {
  impact(_level: ImpactLevel): void {}
}
