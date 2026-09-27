/**
 * In-game HUD for Endless (docs/PLAN.md §10, §11): score (counting up), best score (glowing
 * when beaten), streak chip and pause button. Positioned over `layout.hud`; it only displays
 * values it is given.
 */
import { formatScore, h, placeAt } from '../dom';
import { STRINGS } from '../strings';

export interface HudRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Frame clock for the count-up, injectable for tests. */
export interface HudClock {
  now(): number;
  frame(cb: () => void): void;
}

export interface HudOptions {
  /** Seconds (FEEL.score). Read at use, so live tweaks apply. */
  score?: { countUpDuration: number };
  clock?: HudClock;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

/** How long the streak chip takes to shrink away (matches the CSS animation). */
export const STREAK_LEAVE_MS = 250;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Restarts a one-shot CSS animation class. */
function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow, so the animation starts again
  el.classList.add(cls);
}

export class Hud {
  readonly el: HTMLElement;
  private readonly score: HTMLElement;
  private readonly best: HTMLElement;
  private readonly bestBox: HTMLElement;
  private readonly streak: HTMLElement;
  private readonly timing: { countUpDuration: number };
  private readonly clock: HudClock;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  /** Count-up state: shown value, animating from → to since `start` (ms). */
  private shown = 0;
  private from = 0;
  private target = 0;
  private start = 0;
  private counting = false;
  /** Best score given, and the value on screen (it trails a counting score it was beaten by). */
  private bestTarget = 0;
  private bestShown = 0;
  private multiplier = 1;
  private leaveToken = 0;

  constructor(onPause: () => void, opts: HudOptions = {}) {
    this.timing = opts.score ?? { countUpDuration: 0 };
    this.clock = opts.clock ?? {
      now: () => performance.now(),
      frame: (cb) => requestAnimationFrame(cb),
    };
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.score = h('div', { class: 'hud__score', attrs: { 'aria-live': 'polite' } }, '0');
    this.best = h('div', { class: 'hud__best-value' }, '0');
    this.streak = h('div', { class: 'hud__streak', attrs: { hidden: '' } });
    this.el = h(
      'div',
      { class: 'hud' },
      (this.bestBox = h(
        'div',
        { class: 'hud__best' },
        h('span', { class: 'hud__label', text: STRINGS.best }),
        this.best,
      )),
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

  /** The value currently on screen (mid count-up, it trails the real score). */
  get displayedScore(): number {
    return this.shown;
  }

  /**
   * Shows `score`, counting up from what is on screen. New points arriving mid-count retarget
   * the count smoothly. `animate: false` jumps (new run, resume).
   */
  setScore(score: number, animate = true): void {
    const duration = this.timing.countUpDuration * 1000;
    if (!animate || duration <= 0 || score < this.shown) {
      this.counting = false;
      this.target = score;
      this.render(score);
      return;
    }
    if (score === this.target && this.counting) return;
    this.from = this.shown;
    this.target = score;
    this.start = this.clock.now();
    if (!this.counting) {
      this.counting = true;
      this.clock.frame(this.tick);
    }
  }

  /**
   * Best score. `beaten` plays the glow (first time a run passes its starting best). While the
   * score counts up past the old best, Best rises with it rather than jumping ahead.
   */
  setBest(best: number, beaten = false): void {
    this.bestTarget = best;
    if (!this.counting || best < this.bestShown) this.renderBest(best);
    else this.renderBest(Math.min(best, Math.max(this.bestShown, this.shown)));
    if (beaten) replay(this.bestBox, 'hud__best--glow');
  }

  /**
   * The streak chip: hidden at ×1, bounces when the multiplier rises, warms with the level,
   * dims while `atRisk` (this tray-set has no clear yet), and shrinks away on reset.
   */
  setStreak(multiplier: number, atRisk = false): void {
    const chip = this.streak;
    const previous = this.multiplier;
    this.multiplier = multiplier;
    chip.dataset.multiplier = String(multiplier);
    chip.classList.toggle('hud__streak--at-risk', atRisk && multiplier > 1);

    if (multiplier <= 1) {
      if (previous <= 1 || chip.hidden) return;
      const token = ++this.leaveToken;
      chip.classList.add('hud__streak--leaving');
      this.setTimer(() => {
        if (token !== this.leaveToken) return;
        chip.classList.remove('hud__streak--leaving');
        chip.hidden = true;
      }, STREAK_LEAVE_MS);
      return;
    }
    this.leaveToken++;
    chip.classList.remove('hud__streak--leaving');
    chip.hidden = false;
    chip.textContent = STRINGS.streak(multiplier);
    chip.dataset.level = String(Math.min(6, Math.round((multiplier - 1) * 2)));
    if (multiplier > previous) replay(chip, 'hud__streak--bump');
  }

  private readonly tick = (): void => {
    if (!this.counting) return;
    const duration = this.timing.countUpDuration * 1000;
    const t = duration > 0 ? Math.min(1, (this.clock.now() - this.start) / duration) : 1;
    if (t >= 1) {
      this.counting = false;
      this.render(this.target); // always lands on the exact score
      return;
    }
    this.render(this.from + (this.target - this.from) * easeOutCubic(t));
    this.clock.frame(this.tick);
  };

  private render(value: number): void {
    this.shown = Math.round(value);
    this.score.textContent = formatScore(this.shown);
    if (this.bestShown < this.bestTarget) {
      this.renderBest(Math.min(this.bestTarget, Math.max(this.bestShown, this.shown)));
    }
  }

  private renderBest(value: number): void {
    this.bestShown = value;
    this.best.textContent = formatScore(value);
  }
}
