/** Minimal DOM helpers for UI screens: no framework, just a typed element builder. */

type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
}

/** Creates an element: `h('button', { class: 'primary', on: { click } }, 'Play')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  Object.assign(el.dataset, props.dataset ?? {});
  Object.assign(el.style, props.style ?? {});
  for (const [type, fn] of Object.entries(props.on ?? {})) {
    if (fn) el.addEventListener(type, fn);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Positions an absolutely positioned element over a rect in CSS pixels. */
export function placeAt(
  el: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
): void {
  Object.assign(el.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

/** Formats a score with thin-space thousands separators: 12 345. */
export function formatScore(n: number): string {
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
