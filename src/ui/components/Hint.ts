/**
 * First-time hint (T2.16): a ghost hand that loops, dragging from one point to another. No
 * text. Positions are CSS px in the UI layer (the same space as the canvas).
 */
import { h } from '../dom';

export interface Point {
  x: number;
  y: number;
}

const HAND_SVG = `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
  <path d="M18 26V10a3 3 0 0 1 6 0v11l1-1a3 3 0 0 1 6 0v2a3 3 0 0 1 6 0v2a3 3 0 0 1 6 0v8c0 7-5 12-12 12h-4c-4 0-7-2-9-5l-6-9a3 3 0 0 1 5-3z"
    fill="#fff" stroke="#1f3b40" stroke-width="2.2" stroke-linejoin="round"/>
</svg>`;

export class Hint {
  readonly el: HTMLElement;

  constructor() {
    this.el = h('div', { class: 'hint', attrs: { 'aria-hidden': 'true', hidden: '' } });
    this.el.innerHTML = HAND_SVG;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Loops the drag gesture from `from` to `to`. The fingertip is at the given points. */
  show(from: Point, to: Point): void {
    const s = this.el.style;
    s.setProperty('--from-x', `${from.x}px`);
    s.setProperty('--from-y', `${from.y}px`);
    s.setProperty('--to-x', `${to.x}px`);
    s.setProperty('--to-y', `${to.y}px`);
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
