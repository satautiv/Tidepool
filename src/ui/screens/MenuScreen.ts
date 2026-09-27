/**
 * Main menu (docs/PLAN.md §10): the title over the living tidepool (the canvas keeps drawing
 * underneath), a large Play / Continue button with the best score, Voyage (coming in M4) and
 * Settings.
 */
import { formatScore, h } from '../dom';
import type { Screen } from '../Router';
import { STRINGS } from '../strings';

export interface MenuActions {
  onPlay: () => void;
  onSettings: () => void;
}

export interface MenuInfo {
  /** A run is saved and can be continued. */
  canContinue: boolean;
  best: number;
}

export class MenuScreen implements Screen {
  readonly el: HTMLElement;
  private readonly play: HTMLButtonElement;
  private readonly best: HTMLElement;

  constructor(actions: MenuActions) {
    this.play = h('button', {
      class: 'button button--primary menu__play',
      attrs: { type: 'button' },
      text: STRINGS.play,
      on: { click: actions.onPlay },
    });
    this.best = h('div', { class: 'menu__best' });
    this.el = h(
      'div',
      { class: 'menu', dataset: { interactive: '' } },
      h(
        'h1',
        { class: 'menu__title', attrs: { 'aria-label': STRINGS.title } },
        // One span per letter, so the title can ripple like water.
        ...[...STRINGS.title].map((ch, i) =>
          h('span', { text: ch, style: { animationDelay: `${i * 90}ms` } }),
        ),
      ),
      h(
        'div',
        { class: 'menu__actions' },
        this.play,
        this.best,
        h('button', {
          class: 'button menu__voyage',
          attrs: { type: 'button', disabled: '' },
          text: `${STRINGS.voyage} · ${STRINGS.comingSoon}`,
        }),
        h('button', {
          class: 'button menu__settings',
          attrs: { type: 'button' },
          text: STRINGS.settings,
          on: { click: actions.onSettings },
        }),
      ),
    );
  }

  update(info: MenuInfo): void {
    this.play.textContent = info.canContinue ? STRINGS.continue : STRINGS.play;
    this.best.textContent = info.best > 0 ? `${STRINGS.best} ${formatScore(info.best)}` : '';
    this.best.hidden = info.best <= 0;
  }

  mount(root: HTMLElement): void {
    root.append(this.el);
    this.play.focus({ focusVisible: false } as FocusOptions);
  }

  unmount(): void {
    this.el.remove();
  }
}
