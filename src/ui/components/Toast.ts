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
    this.el.textContent = text;
    this.el.hidden = false;
    this.setTimer(() => {
      if (token === this.token) this.el.hidden = true;
    }, ms);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }
}
