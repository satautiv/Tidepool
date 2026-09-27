/**
 * Score feedback over the board (README §12, docs/PLAN.md §11, D6): callouts ("Nice!" …
 * "Tidal Wave!", "Crystal Clear!") and floating "+N" points. Plain DOM with CSS animations;
 * the timings come from the feel config through CSS variables, and each element removes
 * itself when its animation is over.
 */
import type { CalloutKey } from '../../core/scoring';
import { formatScore, h, placeAt } from '../dom';
import { STRINGS } from '../strings';

/** Seconds, and scales (FEEL.callout). */
export interface CalloutTiming {
  popFrom: number;
  popPeak: number;
  popDuration: number;
  hold: number;
  fadeOut: number;
}

/** Seconds and CSS px (FEEL.score). */
export interface FloatTiming {
  floatRise: number;
  floatDuration: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Timer = (fn: () => void, ms: number) => unknown;

/** Display tier per callout: bigger clears get bigger, warmer text (D6). */
export const CALLOUT_TIER: Record<CalloutKey, number> = {
  nice: 1,
  splash: 2,
  tidalWave: 3,
  crystalClear: 3,
};

export class FxLayer {
  readonly el: HTMLElement;

  constructor(
    private readonly callout: CalloutTiming,
    private readonly float: FloatTiming,
    private readonly setTimer: Timer = (fn, ms) => setTimeout(fn, ms),
  ) {
    this.el = h('div', { class: 'fx', attrs: { 'aria-hidden': 'true' } });
  }

  /** The board rect (CSS px): callouts centre on it. */
  setRect(rect: Rect): void {
    placeAt(this.el, rect);
  }

  /** Shows the callouts for one placement, one after another. */
  showCallouts(keys: readonly CalloutKey[]): void {
    const t = this.callout;
    // The next callout starts as the previous one begins to fade.
    const step = t.popDuration + t.hold;
    keys.forEach((key, i) => {
      const el = h('div', {
        class: `callout callout--${key}`,
        text: STRINGS.callouts[key],
        dataset: { tier: String(CALLOUT_TIER[key]) },
      });
      this.animate(el, i * step, t.popDuration + t.hold + t.fadeOut, {
        '--pop-from': String(t.popFrom),
        '--pop-peak': String(t.popPeak),
        '--pop': `${t.popDuration}s`,
        '--hold-end': `${t.popDuration + t.hold}s`,
        '--fade': `${t.fadeOut}s`,
      });
    });
  }

  /** "+N" rising from (x, y), relative to the board rect. */
  showPoints(points: number, x: number, y: number): void {
    const el = h('div', { class: 'float-points', text: `+${formatScore(points)}` });
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.animate(el, 0, this.float.floatDuration, {
      '--rise': `${-this.float.floatRise}px`,
      '--float': `${this.float.floatDuration}s`,
    });
  }

  /** Drops everything on screen (new run). */
  clear(): void {
    this.el.replaceChildren();
  }

  private animate(el: HTMLElement, delay: number, duration: number, vars: Record<string, string>) {
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
    el.style.setProperty('--delay', `${delay}s`);
    this.el.append(el);
    this.setTimer(() => el.remove(), (delay + duration) * 1000 + 50);
  }
}
