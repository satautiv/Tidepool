/**
 * Settings (docs/PLAN.md §10): sound and music (toggle + volume), haptics, palette, reduced
 * motion, low power, reset progress (asked twice), and a footer with the version, privacy and
 * credits. Every change goes straight to the model, which applies and persists it.
 */
import { h } from '../dom';
import type { Screen } from '../Router';
import { STRINGS } from '../strings';

export interface SettingsValues {
  sfx: number;
  music: number;
  sfxMuted: boolean;
  musicMuted: boolean;
  haptics: boolean;
  palette: string;
  /** Per-colour glyphs on the blocks. */
  patterns: boolean;
  /** The effective value: the setting, or the system preference while it is on "auto". */
  reducedMotion: boolean;
  lowPower: boolean;
}

export interface SettingsModel {
  get(): SettingsValues;
  set(change: Partial<SettingsValues>): void;
  resetProgress(): void;
  hapticsSupported: boolean;
  palettes: readonly { id: string; label: string }[];
  /** Palettes that always show glyphs (the patterns switch is then on and locked). */
  paletteHasGlyphs?: (id: string) => boolean;
  version: string;
  build: string;
  privacyUrl: string;
  credits: string;
}

export class SettingsScreen implements Screen {
  readonly el: HTMLElement;
  private readonly refreshers: Array<(v: SettingsValues) => void> = [];
  private readonly reset: HTMLElement;

  constructor(
    private readonly model: SettingsModel,
    actions: { onBack: () => void },
  ) {
    const rows = h('div', { class: 'settings__rows' });
    rows.append(this.audioRow('sfx', STRINGS.sound), this.audioRow('music', STRINGS.music));
    if (model.hapticsSupported) rows.append(this.toggleRow('haptics', STRINGS.haptics));
    if (model.palettes.length > 1) rows.append(this.paletteRow());
    rows.append(this.patternsRow());
    rows.append(
      this.toggleRow('reducedMotion', STRINGS.reducedMotion),
      this.toggleRow('lowPower', STRINGS.lowPower),
    );
    this.reset = this.resetRow();

    this.el = h(
      'div',
      { class: 'settings', attrs: { role: 'dialog', 'aria-label': STRINGS.settings } },
      h(
        'div',
        { class: 'settings__card dialog__card', dataset: { interactive: '' } },
        h(
          'div',
          { class: 'settings__header' },
          h('button', {
            class: 'icon-button settings__back',
            attrs: { type: 'button', 'aria-label': STRINGS.back },
            text: '‹',
            on: { click: actions.onBack },
          }),
          h('h2', { class: 'dialog__title', text: STRINGS.settings }),
        ),
        rows,
        this.reset,
        this.footer(),
      ),
    );
  }

  /** Re-reads every value (after a reset, or when shown). */
  refresh(): void {
    const values = this.model.get();
    for (const r of this.refreshers) r(values);
  }

  mount(root: HTMLElement): void {
    this.refresh();
    this.showReset(0);
    root.append(this.el);
  }

  unmount(): void {
    this.el.remove();
  }

  private toggle(label: string, get: (v: SettingsValues) => boolean, set: (on: boolean) => void) {
    const input = h('input', {
      class: 'switch',
      attrs: { type: 'checkbox', role: 'switch', 'aria-label': label },
    });
    input.addEventListener('change', () => set(input.checked));
    this.refreshers.push((v) => (input.checked = get(v)));
    return input;
  }

  private toggleRow(key: 'haptics' | 'reducedMotion' | 'lowPower', label: string) {
    const input = this.toggle(
      label,
      (v) => v[key],
      (on) => this.model.set({ [key]: on }),
    );
    input.dataset.setting = key;
    return h('label', { class: 'settings__row' }, h('span', { text: label }), input);
  }

  /** Shape patterns: forced on (and locked) for palettes that always use glyphs. */
  private patternsRow() {
    const locked = (v: SettingsValues) => this.model.paletteHasGlyphs?.(v.palette) ?? false;
    const input = this.toggle(
      STRINGS.patterns,
      (v) => v.patterns || locked(v),
      (on) => this.model.set({ patterns: on }),
    );
    input.dataset.setting = 'patterns';
    this.refreshers.push((v) => (input.disabled = locked(v)));
    return h('label', { class: 'settings__row' }, h('span', { text: STRINGS.patterns }), input);
  }

  /** Sound or music: an on/off switch and a volume slider. */
  private audioRow(bus: 'sfx' | 'music', label: string) {
    const muted = bus === 'sfx' ? 'sfxMuted' : 'musicMuted';
    const toggle = this.toggle(
      label,
      (v) => !v[muted],
      (on) => this.model.set({ [muted]: !on }),
    );
    toggle.dataset.setting = muted;
    const slider = h('input', {
      class: 'settings__slider',
      attrs: { type: 'range', min: '0', max: '100', step: '5', 'aria-label': `${label} volume` },
      dataset: { setting: bus },
    });
    slider.addEventListener('input', () => this.model.set({ [bus]: Number(slider.value) / 100 }));
    this.refreshers.push((v) => {
      slider.value = String(Math.round(v[bus] * 100));
      slider.disabled = v[muted];
    });
    return h(
      'div',
      { class: 'settings__row settings__row--audio' },
      h('span', { text: label }),
      slider,
      toggle,
    );
  }

  private paletteRow() {
    const select = h('select', {
      class: 'settings__select',
      attrs: { 'aria-label': STRINGS.palette },
      dataset: { setting: 'palette' },
    });
    for (const p of this.model.palettes) {
      select.append(h('option', { attrs: { value: p.id }, text: p.label }));
    }
    select.addEventListener('change', () => {
      this.model.set({ palette: select.value });
      this.refresh(); // the patterns switch depends on the palette
    });
    this.refreshers.push((v) => (select.value = v.palette));
    return h('label', { class: 'settings__row' }, h('span', { text: STRINGS.palette }), select);
  }

  /** Reset progress: a button, then two confirmations. */
  private resetRow() {
    const button = (cls: string, text: string, onClick: () => void) =>
      h('button', {
        class: `button ${cls}`,
        attrs: { type: 'button' },
        text,
        on: { click: onClick },
      });
    const steps = [
      h(
        'div',
        {},
        button('settings__reset', STRINGS.resetProgress, () => this.showReset(1)),
      ),
      h(
        'div',
        { class: 'settings__confirm' },
        h('p', { text: STRINGS.resetConfirm1 }),
        button('settings__reset-yes', STRINGS.resetYes, () => this.showReset(2)),
        button('settings__reset-no', STRINGS.cancel, () => this.showReset(0)),
      ),
      h(
        'div',
        { class: 'settings__confirm' },
        h('p', { text: STRINGS.resetConfirm2 }),
        button('button--danger settings__reset-final', STRINGS.resetFinal, () => {
          this.showReset(0);
          this.model.resetProgress();
          this.refresh();
        }),
        button('settings__reset-no', STRINGS.cancel, () => this.showReset(0)),
      ),
    ];
    return h('div', { class: 'settings__reset-area' }, ...steps);
  }

  private showReset(step: number): void {
    [...this.reset.children].forEach((el, i) => ((el as HTMLElement).hidden = i !== step));
  }

  private footer() {
    const credits = h('p', { class: 'settings__credits', text: this.model.credits });
    credits.hidden = true;
    return h(
      'footer',
      { class: 'settings__footer' },
      h('span', { text: `v${this.model.version} · ${this.model.build}` }),
      h('a', {
        attrs: { href: this.model.privacyUrl, target: '_blank', rel: 'noopener' },
        text: STRINGS.privacy,
      }),
      h('button', {
        class: 'settings__credits-toggle',
        attrs: { type: 'button' },
        text: STRINGS.credits,
        on: { click: () => (credits.hidden = !credits.hidden) },
      }),
      credits,
    );
  }
}
