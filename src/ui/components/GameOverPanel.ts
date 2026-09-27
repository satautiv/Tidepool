/**
 * Game Over panel (README §12, docs/PLAN.md §10): score, best, "New best!", Play again and
 * Menu, plus the opt-in rewarded second-chance button (README §8.1, D11).
 */
import { formatScore, h } from '../dom';
import { STRINGS } from '../strings';

export interface GameOverInfo {
  score: number;
  best: number;
  newBest: boolean;
  /** Offer the rewarded second chance (only when an ad is available). */
  secondChance?: boolean;
}

export interface GameOverActions {
  onPlayAgain: () => void;
  onMenu: () => void;
  onSecondChance?: () => void;
}

export class GameOverPanel {
  readonly el: HTMLElement;
  /** Holds optional extra actions, e.g. the second-chance button. */
  readonly extraSlot: HTMLElement;
  private readonly score: HTMLElement;
  private readonly best: HTMLElement;
  private readonly ribbon: HTMLElement;
  private readonly secondChance: HTMLButtonElement;

  constructor(actions: GameOverActions) {
    this.score = h('div', { class: 'gameover__score' });
    this.best = h('div', { class: 'gameover__best' });
    this.ribbon = h('div', { class: 'gameover__ribbon', text: STRINGS.newBest });
    this.secondChance = h('button', {
      class: 'button button--reward gameover__second-chance',
      attrs: { type: 'button', hidden: '' },
      text: STRINGS.secondChance,
      on: { click: () => actions.onSecondChance?.() },
    });
    this.extraSlot = h('div', { class: 'gameover__extra' }, this.secondChance);
    this.el = h(
      'div',
      { class: 'gameover', attrs: { role: 'dialog', 'aria-modal': 'true', hidden: '' } },
      h(
        'div',
        { class: 'gameover__card', dataset: { interactive: '' } },
        h('h2', { class: 'gameover__title', text: STRINGS.gameOver }),
        this.ribbon,
        h('span', { class: 'hud__label', text: STRINGS.score }),
        this.score,
        this.best,
        this.extraSlot,
        h('button', {
          class: 'button button--primary gameover__again',
          attrs: { type: 'button' },
          text: STRINGS.playAgain,
          on: { click: actions.onPlayAgain },
        }),
        h('button', {
          class: 'button gameover__menu',
          attrs: { type: 'button' },
          text: STRINGS.menu,
          on: { click: actions.onMenu },
        }),
      ),
    );
  }

  get visible(): boolean {
    return !this.el.hasAttribute('hidden');
  }

  show(info: GameOverInfo): void {
    this.score.textContent = formatScore(info.score);
    this.best.textContent = `${STRINGS.best} ${formatScore(info.best)}`;
    this.ribbon.hidden = !info.newBest;
    this.secondChance.hidden = !info.secondChance;
    this.secondChance.disabled = false;
    this.el.removeAttribute('hidden');
    // Focus for keyboard users without showing a ring after a touch/mouse game.
    this.el
      .querySelector<HTMLButtonElement>('.gameover__again')
      ?.focus({ focusVisible: false } as FocusOptions);
  }

  /** While a rewarded ad plays, or after one fails: no double taps, no second try. */
  setSecondChance(state: 'busy' | 'hidden'): void {
    this.secondChance.disabled = state === 'busy';
    this.secondChance.hidden = state === 'hidden';
  }

  hide(): void {
    this.el.setAttribute('hidden', '');
  }
}
