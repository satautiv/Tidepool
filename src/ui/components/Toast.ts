/** A short, non-blocking message at the bottom of the screen (e.g. "Battery saver is on"). */
import { h } from '../dom';

export const TOAST_MS = 4000;

export class Toast {
  readonly el: HTMLElement;
  private token = 0;

  constructor(
    private readonly setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) =>
      setTimeout(fn, ms),
  ) {
    this.el = h('div', {
      class: 'toast',
      attrs: { role: 'status', 'aria-live': 'polite', hidden: '' },
    });
  }

  show(text: string, ms = TOAST_MS): void {
    const token = ++this.token;
    this.el.replaceChildren(text);
    this.el.classList.remove('toast--action');
    this.el.hidden = false;
    this.setTimer(() => {
      if (token === this.token) this.el.hidden = true;
    }, ms);
  }

  /** A message with a button that stays until tapped (e.g. "New version — tap to update"). */
  showAction(text: string, action: string, onTap: () => void): void {
    ++this.token;
    const button = h('button', {
      class: 'button button--primary toast__action',
      attrs: { type: 'button' },
      text: action,
      on: {
        click: () => {
          this.el.hidden = true;
          onTap();
        },
      },
    });
    this.el.replaceChildren(h('span', { text }), button);
    this.el.classList.add('toast--action');
    this.el.hidden = false;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }
}
