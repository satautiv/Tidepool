/**
 * Dev-only live tuning panel for game feel (`?feel=1`, docs/PLAN.md §11). Sliders edit FEEL in
 * place, so the next animation uses the new value; "Copy JSON" hands the result over for
 * pasting into render/feel.ts. main.ts imports this only in dev builds.
 */
import {
  FEEL,
  FEEL_DEFAULTS,
  FEEL_TWEAKS,
  getFeel,
  resetFeel,
  setFeel,
  type Feel,
} from '../render/feel';
import { h } from '../ui/dom';

export interface FeelPanelOptions {
  feel?: Feel;
  /** Where "Copy JSON" writes. Defaults to the clipboard. */
  copy?: (text: string) => Promise<void>;
}

const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step)));

export function createFeelPanel(opts: FeelPanelOptions = {}): HTMLElement {
  const feel = opts.feel ?? FEEL;
  const copy = opts.copy ?? ((text: string) => navigator.clipboard.writeText(text));
  const status = h('span', { class: 'feel-panel__status' });
  const syncers: Array<() => void> = [];

  const rows = FEEL_TWEAKS.map(({ path, min, max, step }) => {
    const readout = h('output', { class: 'feel-panel__value' });
    const input = h('input', {
      attrs: { type: 'range', min: String(min), max: String(max), step: String(step) },
      dataset: { path },
    });
    const sync = () => {
      const value = getFeel(path, feel);
      input.value = String(value);
      readout.textContent = value.toFixed(decimals(step));
      const changed = value !== getFeel(path, FEEL_DEFAULTS);
      readout.style.fontWeight = changed ? '700' : '400';
    };
    input.addEventListener('input', () => {
      setFeel(path, Number(input.value), feel);
      sync();
    });
    syncers.push(sync);
    sync();
    return h('label', { class: 'feel-panel__row' }, h('span', { text: path }), input, readout);
  });

  const button = (text: string, onClick: () => void) =>
    h('button', { attrs: { type: 'button' }, text, on: { click: onClick } });

  const panel = h(
    'div',
    { class: 'feel-panel', dataset: { interactive: '' } },
    h('strong', { text: 'Feel (dev)' }),
    ...rows,
    h(
      'div',
      { class: 'feel-panel__actions' },
      button('Copy JSON', () => {
        copy(JSON.stringify(feel, null, 2)).then(
          () => (status.textContent = 'Copied'),
          () => (status.textContent = 'Copy failed'),
        );
      }),
      button('Reset', () => {
        resetFeel(feel);
        syncers.forEach((s) => s());
        status.textContent = 'Reset';
      }),
      status,
    ),
  );
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    zIndex: '900',
    display: 'grid',
    gap: '4px',
    maxHeight: 'calc(100vh - 16px)',
    overflow: 'auto',
    padding: '10px',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.92)',
    font: '12px system-ui, sans-serif',
    color: '#223',
    pointerEvents: 'auto',
    userSelect: 'auto',
  } satisfies Partial<CSSStyleDeclaration>);
  for (const row of rows) {
    Object.assign(row.style, {
      display: 'grid',
      gridTemplateColumns: '14em 8em 3.5em',
      alignItems: 'center',
      gap: '6px',
    });
  }
  return panel;
}
