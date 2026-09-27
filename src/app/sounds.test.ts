// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { boardFromAscii } from '../core/board';
import type { AudioEngine } from '../services/audio/AudioEngine';
import { arpeggio, attachMusic, attachSounds, MUSIC, sfxManifest, SOUND } from './sounds';
import { firstMove, makeApp } from './testing';

function setup() {
  const played: [string, Record<string, number | undefined>][] = [];
  const audio = {
    register: vi.fn(),
    play: (id: string, opts = {}) => void played.push([id, opts]),
  } as unknown as AudioEngine;
  const uiRoot = document.createElement('div');
  const made = makeApp('sounds', undefined, undefined, {
    beforeStart: (app) => attachSounds(app, audio, uiRoot, () => 0.5),
  });
  return { ...made, audio, played, ids: () => played.map((p) => p[0]), soundRoot: uiRoot };
}

describe('game sounds', () => {
  it('registers every SFX except the ambient loop', () => {
    const ids = Object.keys(sfxManifest());
    expect(ids).toContain('clink');
    expect(ids).not.toContain('ambient');
    const { audio } = setup();
    expect(audio.register).toHaveBeenCalledOnce();
  });

  it('shuffles on a new run and clinks per colour on a placement', () => {
    const { app, played, ids } = setup();
    expect(ids()).toEqual(['shuffle']);
    const move = firstMove(app);
    const color = app.state.tray[move.slot]!.color;
    app.place(move);
    const clink = played.find(([id]) => id === 'clink')!;
    expect(clink[1].pitchSemitones).toBe(SOUND.clinkSteps[color]);
    expect(clink[1].detune).toBe(0); // random 0.5 → no detune
  });

  it('whooshes by streak and plays a rising arpeggio for multi-line clears', () => {
    const { app, played } = setup();
    const fill = '#######.';
    app.loadState({
      ...app.state,
      streak: 11,
      board: boardFromAscii([
        fill,
        fill,
        fill,
        '........',
        '........',
        '........',
        '........',
        '#.......',
      ]),
      tray: [{ shape: 'i3v', color: 0 }, null, null],
    });
    played.length = 0;
    app.place({ slot: 0, row: 0, col: 7 });
    const whoosh = played.find(([id]) => id === 'whoosh')!;
    expect(whoosh[1].pitchSemitones).toBe(SOUND.whooshMaxSemitones);
    // The arpeggio notes are the delayed chimes (an undelayed one is the streak-up tone).
    const chimes = played.filter(([id, o]) => id.startsWith('chime') && o.delay !== undefined);
    expect(played.some(([id, o]) => id === 'chime0' && o.delay === undefined)).toBe(true);
    expect(chimes.map(([id]) => id)).toEqual(['chime0', 'chime1', 'chime2']);
    expect(chimes.map(([, o]) => o.delay)).toEqual([1, 2, 3].map((k) => k * SOUND.arpeggioGap));
  });

  it('plays the flourish for a clean board', () => {
    const { app, ids } = setup();
    app.loadState({
      ...app.state,
      board: boardFromAscii(['#######.', ...new Array<string>(7).fill('........')]),
      tray: [{ shape: 'dot', color: 0 }, null, null],
    });
    app.place({ slot: 0, row: 0, col: 7 });
    expect(ids()).toContain('flourish');
  });

  it('lifts, bloops, ends the game, and ticks on buttons', () => {
    const { app, ids, soundRoot } = setup();
    app.bus.emit('pickUp', { slot: 0 });
    app.bus.emit('dropCancelled', { slot: 0, invalid: true });
    for (let i = 0; i < 1000 && !app.state.over; i++) app.place(firstMove(app));
    const button = document.createElement('button');
    soundRoot.append(button);
    button.click();
    soundRoot.click(); // not a button: silent
    expect(ids()).toEqual(expect.arrayContaining(['lift', 'bloop', 'gameOver']));
    expect(ids().filter((id) => id === 'uiTick')).toHaveLength(1);
  });

  it('arpeggios have 0 notes for 1 line and at most 4', () => {
    expect(arpeggio(1)).toEqual([]);
    expect(arpeggio(2)).toHaveLength(2);
    expect(arpeggio(6)).toEqual([
      { id: 'chime0', pitch: 0 },
      { id: 'chime1', pitch: 0 },
      { id: 'chime2', pitch: 0 },
      { id: 'chime0', pitch: 12 },
    ]);
  });
});

describe('ambient music', () => {
  function withMusic() {
    const calls: unknown[][] = [];
    let unlock: (() => void) | null = null;
    const audio = {
      register: vi.fn(),
      onUnlock: (fn: () => void) => void (unlock = fn),
      playLoop: (...a: unknown[]) => void calls.push(['loop', ...a]),
      duck: (...a: unknown[]) => void calls.push(['duck', ...a]),
    } as unknown as AudioEngine;
    const made = makeApp('music', undefined, undefined, {
      beforeStart: (app) => attachMusic(app, audio),
    });
    return { ...made, audio, calls, unlock: () => unlock?.() };
  }

  it('registers the loop at a low sample rate and fades it in after unlock', () => {
    const { audio, calls, unlock } = withMusic();
    const manifest = (audio.register as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(manifest.ambient.rate).toBe(MUSIC.sampleRate);
    expect(calls.filter((c) => c[0] === 'loop')).toEqual([]);
    unlock();
    expect(calls).toContainEqual(['loop', 'ambient', MUSIC.fadeInMs]);
  });

  it('ducks on game over and comes back up for the next run', () => {
    const { app, calls } = withMusic();
    calls.length = 0;
    for (let i = 0; i < 1000 && !app.state.over; i++) app.place(firstMove(app));
    expect(calls).toContainEqual(['duck', 'music', MUSIC.gameOverDuckDb, MUSIC.duckMs]);
    app.newRun();
    expect(calls.at(-1)).toEqual(['duck', 'music', 0, MUSIC.duckMs]);
  });
});
