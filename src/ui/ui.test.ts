// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { FxLayer } from './components/FxLayer';
import { Hint } from './components/Hint';
import { Toast } from './components/Toast';
import { SettingsScreen, type SettingsModel, type SettingsValues } from './screens/SettingsScreen';
import { GameOverPanel } from './components/GameOverPanel';
import { Hud } from './components/Hud';
import { PauseDialog } from './components/PauseDialog';
import { formatScore, h, placeAt } from './dom';
import { Router, ROUTER, type Screen } from './Router';

describe('h()', () => {
  it('builds elements with classes, text, attributes, data, styles, listeners and children', () => {
    const click = vi.fn();
    const el = h(
      'button',
      {
        class: 'a b',
        attrs: { type: 'button' },
        dataset: { id: '7' },
        style: { color: 'red' },
        on: { click },
      },
      'Play',
      h('span', { text: '!' }),
      null,
      false,
      3,
    );
    expect(el.className).toBe('a b');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.dataset.id).toBe('7');
    expect(el.style.color).toBe('red');
    expect(el.textContent).toBe('Play!3');
    el.click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('positions elements over rects', () => {
    const el = h('div');
    placeAt(el, { x: 1, y: 2, width: 30, height: 40 });
    expect([el.style.left, el.style.top, el.style.width, el.style.height]).toEqual([
      '1px',
      '2px',
      '30px',
      '40px',
    ]);
  });

  it('formats scores with thin-space thousands separators', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(12345.9)).toBe('12 345');
    expect(formatScore(1234567)).toBe('1 234 567');
  });
});

describe('Hud', () => {
  it('shows score, best and streak, and forwards pause', () => {
    const pause = vi.fn();
    const timers: Array<() => void> = [];
    const hud = new Hud(pause, { setTimer: (fn) => timers.push(fn) });
    hud.setScore(1234);
    hud.setBest(5000);
    expect(hud.el.querySelector('.hud__score')!.textContent).toBe('1 234');
    expect(hud.el.querySelector('.hud__best-value')!.textContent).toBe('5 000');

    const streak = hud.el.querySelector<HTMLElement>('.hud__streak')!;
    expect(streak.hasAttribute('hidden')).toBe(true);
    hud.setStreak(1.5);
    expect(streak.hasAttribute('hidden')).toBe(false);
    expect(streak.textContent).toBe('×1.5');
    hud.setStreak(1);
    expect(streak.classList.contains('hud__streak--leaving')).toBe(true);
    timers.forEach((fn) => fn());
    expect(streak.hasAttribute('hidden')).toBe(true);

    hud.el.querySelector<HTMLButtonElement>('.hud__pause')!.click();
    expect(pause).toHaveBeenCalledTimes(1);
    hud.setRect({ x: 12, y: 12, width: 300, height: 60 });
    expect(hud.el.style.width).toBe('300px');
  });
});

describe('Hud feedback', () => {
  /** A manual frame clock: `advance(ms)` moves time and runs one frame. */
  function manualClock() {
    let now = 0;
    let pending: (() => void)[] = [];
    return {
      now: () => now,
      frame: (cb: () => void) => void pending.push(cb),
      advance(ms: number) {
        now += ms;
        const due = pending;
        pending = [];
        due.forEach((cb) => cb());
      },
      get idle() {
        return pending.length === 0;
      },
    };
  }

  it('counts the score up and always lands on the exact value, even when retargeted', () => {
    const clock = manualClock();
    const hud = new Hud(() => {}, { clock, score: { countUpDuration: 0.4 } });
    const shown = () => hud.el.querySelector('.hud__score')!.textContent;
    hud.setScore(100);
    clock.advance(0);
    expect(hud.displayedScore).toBe(0);
    clock.advance(200);
    const mid = hud.displayedScore;
    expect(mid).toBeGreaterThan(50); // ease-out: more than half way at half time
    expect(mid).toBeLessThan(100);
    hud.setScore(257); // new points mid-count
    clock.advance(100);
    expect(hud.displayedScore).toBeGreaterThan(mid);
    clock.advance(400);
    expect(hud.displayedScore).toBe(257);
    expect(shown()).toBe('257');
    expect(clock.idle).toBe(true);

    hud.setScore(0); // a new run jumps straight down
    expect(shown()).toBe('0');
    hud.setScore(40, false);
    expect(shown()).toBe('40');
  });

  it('raises Best with the counting score instead of jumping ahead of it', () => {
    const clock = manualClock();
    const hud = new Hud(() => {}, { clock, score: { countUpDuration: 0.4 } });
    const best = () => Number(hud.el.querySelector('.hud__best-value')!.textContent);
    hud.setScore(90, false);
    hud.setBest(100); // a previous best
    expect(best()).toBe(100);

    hud.setScore(300);
    hud.setBest(300, true);
    expect(best()).toBe(100); // not ahead of the score
    for (let i = 0; i < 8; i++) {
      clock.advance(50);
      expect(best()).toBe(Math.max(100, hud.displayedScore));
    }
    expect(best()).toBe(300);

    hud.setScore(0, false); // new run: Best stays
    hud.setBest(300);
    expect(best()).toBe(300);
    hud.setBest(0); // reset progress
    expect(best()).toBe(0);
  });

  it('bumps, warms, dims and removes the streak chip', () => {
    const timers: Array<() => void> = [];
    const hud = new Hud(() => {}, { setTimer: (fn) => timers.push(fn) });
    const chip = hud.el.querySelector<HTMLElement>('.hud__streak')!;
    hud.setStreak(1.5, false);
    expect(chip.classList.contains('hud__streak--bump')).toBe(true);
    expect(chip.dataset.level).toBe('1');
    hud.setStreak(1.5, true);
    expect(chip.classList.contains('hud__streak--at-risk')).toBe(true);
    hud.setStreak(3, false);
    expect(chip.dataset.level).toBe('4');
    expect(chip.classList.contains('hud__streak--at-risk')).toBe(false);

    hud.setStreak(1);
    hud.setStreak(2); // back before the leave animation finished
    timers.forEach((fn) => fn());
    expect(chip.hidden).toBe(false);
    expect(chip.classList.contains('hud__streak--leaving')).toBe(false);
  });

  it('glows the best score when beaten', () => {
    const hud = new Hud(() => {});
    const best = hud.el.querySelector('.hud__best')!;
    hud.setBest(10);
    expect(best.classList.contains('hud__best--glow')).toBe(false);
    hud.setBest(20, true);
    expect(best.classList.contains('hud__best--glow')).toBe(true);
  });
});

describe('FxLayer', () => {
  const callout = { popFrom: 0.6, popPeak: 1.12, popDuration: 0.22, hold: 0.6, fadeOut: 0.3 };
  const float = { floatRise: 30, floatDuration: 0.7 };

  it('shows callouts in order with tiers, then removes them', () => {
    const timers: Array<[() => void, number]> = [];
    const fx = new FxLayer(callout, float, (fn, ms) => timers.push([fn, ms]));
    fx.showCallouts(['tidalWave', 'crystalClear']);
    const els = [...fx.el.querySelectorAll<HTMLElement>('.callout')];
    expect(els.map((e) => e.textContent)).toEqual(['Tidal Wave!', 'Crystal Clear!']);
    expect(els.map((e) => e.dataset.tier)).toEqual(['3', '3']);
    expect(els[0]!.style.getPropertyValue('--pop-peak')).toBe('1.12');
    expect(els[1]!.style.getPropertyValue('--delay')).toBe(`${0.22 + 0.6}s`);
    expect(timers[0]![1]).toBeCloseTo((0.22 + 0.6 + 0.3) * 1000 + 50);
    timers.forEach(([fn]) => fn());
    expect(fx.el.children).toHaveLength(0);
  });

  it('maps every callout key to its D6 text and tier', () => {
    const fx = new FxLayer(callout, float, () => {});
    fx.showCallouts(['nice', 'splash']);
    const els = [...fx.el.querySelectorAll<HTMLElement>('.callout')];
    expect(els.map((e) => [e.textContent, e.dataset.tier])).toEqual([
      ['Nice!', '1'],
      ['Splash!', '2'],
    ]);
  });

  it('floats points from a position and clears on demand', () => {
    const fx = new FxLayer(callout, float, () => {});
    fx.showPoints(1240, 50, 60);
    const el = fx.el.querySelector<HTMLElement>('.float-points')!;
    expect(el.textContent).toBe('+1\u2009240');
    expect(el.style.left).toBe('50px');
    expect(el.style.getPropertyValue('--rise')).toBe('-30px');
    fx.clear();
    expect(fx.el.children).toHaveLength(0);
  });
});

describe('Router', () => {
  const screen = (name: string): Screen & { mounted: boolean } => {
    const el = h('div', { text: name });
    const s = {
      mounted: false,
      mount(root: HTMLElement) {
        root.append(el);
        s.mounted = true;
      },
      unmount() {
        el.remove();
        s.mounted = false;
      },
    };
    return s;
  };

  it('mounts the new screen and unmounts the old one after the fade', async () => {
    const root = h('div');
    const waits: number[] = [];
    const router = new Router(root, async (ms) => {
      waits.push(ms);
    });
    const a = screen('A');
    const b = screen('B');
    await router.show(a);
    expect(router.screen).toBe(a);
    expect(root.textContent).toBe('A');
    expect(root.querySelector('.screen--entering')).toBeNull();

    await router.show(b);
    expect(a.mounted).toBe(false);
    expect(b.mounted).toBe(true);
    expect(root.textContent).toBe('B');
    expect(root.children).toHaveLength(1);
    expect(waits).toContain(ROUTER.fadeMs);
  });

  it('keeps a screen that becomes current again before its fade-out ends', async () => {
    const root = h('div');
    const router = new Router(root, async () => {});
    const a = screen('A');
    const b = screen('B');
    await router.show(a);
    const toB = router.show(b);
    const backToA = router.show(a);
    await Promise.all([toB, backToA]);
    expect(router.screen).toBe(a);
    expect(a.mounted).toBe(true);
    expect(root.textContent).toBe('A');
  });

  it('defaults to real timers', async () => {
    const router = new Router(h('div'));
    await router.show(screen('A'));
    expect(router.screen).not.toBeNull();
  });
});

describe('GameOverPanel', () => {
  it('shows score, best and the new-best ribbon, and wires its buttons', () => {
    const onPlayAgain = vi.fn();
    const onMenu = vi.fn();
    const panel = new GameOverPanel({ onPlayAgain, onMenu });
    expect(panel.visible).toBe(false);
    panel.show({ score: 4200, best: 4200, newBest: true });
    expect(panel.visible).toBe(true);
    expect(panel.el.querySelector('.gameover__score')!.textContent).toBe('4\u2009200');
    expect(panel.el.querySelector<HTMLElement>('.gameover__ribbon')!.hidden).toBe(false);
    panel.show({ score: 10, best: 4200, newBest: false });
    expect(panel.el.querySelector<HTMLElement>('.gameover__ribbon')!.hidden).toBe(true);
    panel.el.querySelector<HTMLButtonElement>('.gameover__again')!.click();
    panel.el.querySelector<HTMLButtonElement>('.gameover__menu')!.click();
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
    panel.hide();
    expect(panel.visible).toBe(false);
  });
});

describe('PauseDialog', () => {
  it('wires Resume, Settings and Menu, and asks before restarting', () => {
    const actions = { onResume: vi.fn(), onRestart: vi.fn(), onSettings: vi.fn(), onMenu: vi.fn() };
    const dialog = new PauseDialog(actions);
    const click = (sel: string) => dialog.el.querySelector<HTMLButtonElement>(sel)!.click();
    const shown = (sel: string) => !dialog.el.querySelector<HTMLElement>(sel)!.closest('[hidden]');
    expect(dialog.visible).toBe(false);
    dialog.show();
    expect(dialog.visible).toBe(true);

    click('.pause__resume');
    click('.pause__settings');
    click('.pause__menu');
    expect(actions.onResume).toHaveBeenCalledOnce();
    expect(actions.onSettings).toHaveBeenCalledOnce();
    expect(actions.onMenu).toHaveBeenCalledOnce();

    click('.pause__restart');
    expect(actions.onRestart).not.toHaveBeenCalled();
    expect(shown('.pause__confirm')).toBe(true);
    expect(shown('.pause__resume')).toBe(false);
    click('.pause__cancel');
    expect(shown('.pause__resume')).toBe(true);
    click('.pause__restart');
    click('.pause__confirm');
    expect(actions.onRestart).toHaveBeenCalledOnce();

    dialog.show(); // reopening starts on the main actions
    expect(shown('.pause__resume')).toBe(true);
    dialog.hide();
    expect(dialog.visible).toBe(false);
  });
});

describe('SettingsScreen', () => {
  function model(overrides: Partial<SettingsModel> = {}) {
    const values: SettingsValues = {
      sfx: 1,
      music: 0.35,
      sfxMuted: false,
      musicMuted: false,
      haptics: true,
      palette: 'tidepool',
      patterns: false,
      reducedMotion: false,
      lowPower: false,
    };
    const m: SettingsModel & { values: SettingsValues } = {
      values,
      get: () => ({ ...values }),
      set: vi.fn((c) => Object.assign(values, c)),
      resetProgress: vi.fn(),
      hapticsSupported: true,
      palettes: [
        { id: 'tidepool', label: 'Tidepool' },
        { id: 'cb', label: 'Colour-blind' },
      ],
      paletteHasGlyphs: (id: string) => id === 'cb',
      version: '1.2.3',
      build: 'abc1234',
      privacyUrl: 'privacy.html',
      credits: 'Thanks',
      ...overrides,
    };
    return m;
  }
  const $ = <T extends HTMLElement>(s: SettingsScreen, sel: string) => s.el.querySelector<T>(sel)!;

  it('shows the current values and applies every change at once', () => {
    const m = model();
    const screen = new SettingsScreen(m, { onBack: () => {} });
    screen.mount(h('div'));
    const music = $<HTMLInputElement>(screen, '[data-setting="music"]');
    expect(music.value).toBe('35');
    music.value = '80';
    music.dispatchEvent(new Event('input'));
    expect(m.values.music).toBe(0.8);

    const sfxOn = $<HTMLInputElement>(screen, '[data-setting="sfxMuted"]');
    expect(sfxOn.checked).toBe(true);
    sfxOn.checked = false;
    sfxOn.dispatchEvent(new Event('change'));
    expect(m.values.sfxMuted).toBe(true);
    expect($<HTMLInputElement>(screen, '[data-setting="sfx"]').disabled).toBe(true);
    sfxOn.checked = true;
    sfxOn.dispatchEvent(new Event('change'));
    expect($<HTMLInputElement>(screen, '[data-setting="sfx"]').disabled).toBe(false);

    for (const key of ['haptics', 'reducedMotion', 'lowPower'] as const) {
      const box = $<HTMLInputElement>(screen, `[data-setting="${key}"]`);
      box.checked = !box.checked;
      box.dispatchEvent(new Event('change'));
    }
    expect(m.values).toMatchObject({ haptics: false, reducedMotion: true, lowPower: true });

    const palette = $<HTMLSelectElement>(screen, '[data-setting="palette"]');
    palette.value = 'cb';
    palette.dispatchEvent(new Event('change'));
    expect(m.values.palette).toBe('cb');

    // The colour-blind palette always has glyphs: the patterns switch is on and locked.
    const patterns = $<HTMLInputElement>(screen, '[data-setting="patterns"]');
    expect(patterns.checked).toBe(true);
    expect(patterns.disabled).toBe(true);
    palette.value = 'tidepool';
    palette.dispatchEvent(new Event('change'));
    expect(patterns.checked).toBe(false);
    patterns.checked = true;
    patterns.dispatchEvent(new Event('change'));
    expect(m.values.patterns).toBe(true);
  });

  it('hides haptics where unsupported and the palette choice with one palette', () => {
    const screen = new SettingsScreen(
      model({ hapticsSupported: false, palettes: [{ id: 'tidepool', label: 'Tidepool' }] }),
      { onBack: () => {} },
    );
    expect(screen.el.querySelector('[data-setting="haptics"]')).toBeNull();
    expect(screen.el.querySelector('[data-setting="palette"]')).toBeNull();
  });

  it('asks twice before resetting progress', () => {
    const m = model();
    const screen = new SettingsScreen(m, { onBack: () => {} });
    screen.mount(h('div'));
    const visible = (sel: string) => !$(screen, sel).closest('[hidden]');
    expect(visible('.settings__reset')).toBe(true);
    $(screen, '.settings__reset').click();
    expect(visible('.settings__reset-yes')).toBe(true);
    $(screen, '.settings__reset-no').click();
    expect(visible('.settings__reset')).toBe(true);
    $(screen, '.settings__reset').click();
    $(screen, '.settings__reset-yes').click();
    expect(m.resetProgress).not.toHaveBeenCalled();
    $(screen, '.settings__reset-final').click();
    expect(m.resetProgress).toHaveBeenCalledOnce();
    expect(visible('.settings__reset')).toBe(true);
  });

  it('has a footer with version, build, privacy and credits, and a back button', () => {
    const back = vi.fn();
    const screen = new SettingsScreen(model(), { onBack: back });
    expect(screen.el.querySelector('footer')!.textContent).toContain('v1.2.3 · abc1234');
    expect($<HTMLAnchorElement>(screen, 'footer a').getAttribute('href')).toBe('privacy.html');
    const credits = $(screen, '.settings__credits');
    expect(credits.hidden).toBe(true);
    $(screen, '.settings__credits-toggle').click();
    expect(credits.hidden).toBe(false);
    $(screen, '.settings__back').click();
    expect(back).toHaveBeenCalledOnce();
  });
});

describe('Toast', () => {
  it('shows a message and hides it after a while, restarting on a new one', () => {
    const timers: Array<() => void> = [];
    const toast = new Toast((fn) => void timers.push(fn));
    expect(toast.visible).toBe(false);
    toast.show('one');
    toast.show('two');
    expect(toast.el.textContent).toBe('two');
    timers[0]!(); // the first message's timer: stale
    expect(toast.visible).toBe(true);
    timers[1]!();
    expect(toast.visible).toBe(false);
  });
});

describe('Hint', () => {
  it('loops the hand between two points and hides', () => {
    const hint = new Hint();
    expect(hint.visible).toBe(false);
    hint.show({ x: 10, y: 20 }, { x: 30, y: 40 });
    expect(hint.visible).toBe(true);
    expect(hint.el.style.getPropertyValue('--to-y')).toBe('40px');
    expect(hint.el.querySelector('svg')).not.toBeNull();
    expect(hint.el.textContent!.trim()).toBe(''); // no text
    hint.hide();
    expect(hint.visible).toBe(false);
  });
});

describe('Toast action', () => {
  it('stays until its button is tapped', () => {
    const toast = new Toast(() => {});
    const tap = vi.fn();
    toast.showAction('New version ready.', 'Update', tap);
    expect(toast.visible).toBe(true);
    expect(toast.el.classList.contains('toast--action')).toBe(true);
    toast.el.querySelector<HTMLButtonElement>('.toast__action')!.click();
    expect(tap).toHaveBeenCalledOnce();
    expect(toast.visible).toBe(false);
    toast.show('plain');
    expect(toast.el.classList.contains('toast--action')).toBe(false);
  });
});
