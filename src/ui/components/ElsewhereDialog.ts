/**
 * Shown when another tab took over the game (services/platform/tabs.ts). This tab no longer
 * saves; "Play here" reloads it, which loads the latest progress and takes the game back.
 */
import { h } from '../dom';
import { STRINGS } from '../strings';

export class ElsewhereDialog {
  readonly el: HTMLElement;

  constructor(onPlayHere: () => void) {
    this.el = h(
      'div',
      { class: 'dialog elsewhere', attrs: { role: 'dialog', 'aria-modal': 'true', hidden: '' } },
      h(
        'div',
        { class: 'dialog__card', dataset: { interactive: '' } },
        h('h2', { class: 'dialog__title', text: STRINGS.elsewhereTitle }),
        h('p', { class: 'elsewhere__text', text: STRINGS.elsewhereText }),
        h(
          'div',
          { class: 'dialog__actions' },
          h('button', {
            class: 'button button--primary elsewhere__play',
            attrs: { type: 'button' },
            text: STRINGS.playHere,
            on: { click: onPlayHere },
          }),
        ),
      ),
    );
  }

  get visible(): boolean {
    return !this.el.hasAttribute('hidden');
  }

  show(): void {
    this.el.removeAttribute('hidden');
  }
}
