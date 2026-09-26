/**
 * In-game HUD for Endless (docs/PLAN.md §10): score, best score, streak chip and pause button.
 * Positioned over `layout.hud`; it only displays values it is given.
 */
import { formatScore, h, placeAt } from '../dom';
import { STRINGS } from '../strings';

export interface HudRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Hud {
  readonly el: HTMLElement;
  private readonly score: HTMLElement;
  private readonly best: HTMLElement;
  private readonly streak: HTMLElement;

  constructor(onPause: () => void) {
    this.score = h('div', { class: 'hud__score', attrs: { 'aria-live': 'polite' } }, '0');
    this.best = h('div', { class: 'hud__best-value' }, '0');
    this.streak = h('div', { class: 'hud__streak', attrs: { hidden: '' } });
    this.el = h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hud__best' },
        h('span', { class: 'hud__label', text: STRINGS.best }),
        this.best,
      ),
      h(
        'div',
        { class: 'hud__center' },
        h('span', { class: 'hud__label', text: STRINGS.score }),
        this.score,
        this.streak,
      ),
      h('button', {
        class: 'hud__pause icon-button',
        attrs: { type: 'button', 'aria-label': STRINGS.pause },
        text: 'Ⅱ',
        on: { click: onPause },
      }),
    );
  }

  setRect(rect: HudRect): void {
    placeAt(this.el, rect);
  }

  setScore(score: number): void {
    this.score.textContent = formatScore(score);
  }

  setBest(best: number): void {
    this.best.textContent = formatScore(best);
  }

  /** Shows the streak multiplier; hidden at ×1. */
  setStreak(multiplier: number): void {
    if (multiplier <= 1) {
      this.streak.setAttribute('hidden', '');
      return;
    }
    this.streak.removeAttribute('hidden');
    this.streak.textContent = STRINGS.streak(multiplier);
  }
}
