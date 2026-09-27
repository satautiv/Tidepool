/**
 * Pause dialog (docs/PLAN.md §10): Resume, Restart (asks first), Settings and Menu. Opened by
 * the HUD pause button, and when the player comes back to a backgrounded run.
 */
import { h } from '../dom';
import { STRINGS } from '../strings';

export interface PauseActions {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onMenu: () => void;
}

export class PauseDialog {
  readonly el: HTMLElement;
  private readonly main: HTMLElement;
  private readonly confirm: HTMLElement;

  constructor(actions: PauseActions) {
    const button = (cls: string, text: string, onClick: () => void) =>
      h('button', {
        class: `button ${cls}`,
        attrs: { type: 'button' },
        text,
        on: { click: onClick },
      });

    this.main = h(
      'div',
      { class: 'dialog__actions' },
      button('button--primary pause__resume', STRINGS.resume, actions.onResume),
      button('pause__restart', STRINGS.restart, () => this.setConfirming(true)),
      button('pause__settings', STRINGS.settings, actions.onSettings),
      button('pause__menu', STRINGS.menu, actions.onMenu),
    );
    this.confirm = h(
      'div',
      { class: 'dialog__actions', attrs: { hidden: '' } },
      h('p', { class: 'pause__question', text: STRINGS.restartConfirm }),
      button('button--primary pause__confirm', STRINGS.restart, actions.onRestart),
      button('pause__cancel', STRINGS.cancel, () => this.setConfirming(false)),
    );
    this.el = h(
      'div',
      { class: 'dialog pause', attrs: { role: 'dialog', 'aria-modal': 'true', hidden: '' } },
      h(
        'div',
        { class: 'dialog__card', dataset: { interactive: '' } },
        h('h2', { class: 'dialog__title', text: STRINGS.paused }),
        this.main,
        this.confirm,
      ),
    );
  }

  get visible(): boolean {
    return !this.el.hasAttribute('hidden');
  }

  show(): void {
    this.setConfirming(false);
    this.el.removeAttribute('hidden');
  }

  hide(): void {
    this.el.setAttribute('hidden', '');
  }

  private setConfirming(confirming: boolean): void {
    this.main.hidden = confirming;
    this.confirm.hidden = !confirming;
    const focus = confirming ? '.pause__cancel' : '.pause__resume';
    this.el.querySelector<HTMLButtonElement>(focus)?.focus({ focusVisible: false } as FocusOptions);
  }
}
