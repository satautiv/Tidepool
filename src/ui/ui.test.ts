// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { GameOverPanel } from './components/GameOverPanel';
import { Hud } from './components/Hud';
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
    const hud = new Hud(pause);
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
    expect(streak.hasAttribute('hidden')).toBe(true);

    hud.el.querySelector<HTMLButtonElement>('.hud__pause')!.click();
    expect(pause).toHaveBeenCalledTimes(1);
    hud.setRect({ x: 12, y: 12, width: 300, height: 60 });
    expect(hud.el.style.width).toBe('300px');
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
