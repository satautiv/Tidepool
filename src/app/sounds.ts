/**
 * Game sounds (README §11, docs/PLAN.md §11 audio column): which sound each moment plays, and
 * how. The sounds themselves are generated in `services/audio/synth.ts`.
 */
import { SYNTH_SOUNDS } from '../services/audio/synth';
import type { AudioEngine, SoundSource } from '../services/audio/AudioEngine';
import type { App } from './App';

export const SOUND = {
  /** Clink pitch per glass colour (semitones): a pentatonic set, so any mix sounds sweet. */
  clinkSteps: [0, 2, 4, 7, 9, 12],
  /** ± random detune on each clink. */
  clinkDetune: 0.03,
  /** The clear whoosh rises a semitone per streak level, up to this. */
  whooshMaxSemitones: 8,
  /** Chime arpeggio: notes for 2 / 3 / 4+ lines, and the gap between them (s). */
  arpeggioGap: 0.08,
  volumes: {
    lift: 0.35,
    clink: 0.8,
    bloop: 0.4,
    whoosh: 0.7,
    chime: 0.6,
    flourish: 0.8,
    shuffle: 0.35,
    streak: 0.3,
    gameOver: 0.7,
    uiTick: 0.5,
  },
};

/** The SFX to register (the ambient loop is registered by the music, T2.10). */
export function sfxManifest(): Record<string, SoundSource> {
  const out: Record<string, SoundSource> = {};
  for (const [id, synth] of Object.entries(SYNTH_SOUNDS)) {
    if (id !== 'ambient') out[id] = { synth };
  }
  return out;
}

/** Arpeggio notes (chime ids and octave shifts) for a clear of `lines` lines. */
export function arpeggio(lines: number): { id: string; pitch: number }[] {
  const notes = [
    { id: 'chime0', pitch: 0 },
    { id: 'chime1', pitch: 0 },
    { id: 'chime2', pitch: 0 },
    { id: 'chime0', pitch: 12 },
  ];
  return lines >= 2 ? notes.slice(0, Math.min(4, lines)) : [];
}

export function attachSounds(
  app: App,
  audio: AudioEngine,
  uiRoot: EventTarget,
  random: () => number = Math.random,
): void {
  audio.register(sfxManifest());
  const v = SOUND.volumes;

  app.bus.on('pickUp', () => audio.play('lift', { volume: v.lift }));
  app.bus.on('dropCancelled', () => audio.play('bloop', { volume: v.bloop }));
  app.bus.on('runStart', ({ resumed }) => {
    if (!resumed) audio.play('shuffle', { volume: v.shuffle });
  });

  app.bus.on('game', ({ events, state }) => {
    for (const e of events) {
      switch (e.type) {
        case 'placed':
          audio.play('clink', {
            pitchSemitones: SOUND.clinkSteps[e.color % SOUND.clinkSteps.length],
            detune: (random() * 2 - 1) * SOUND.clinkDetune,
            volume: v.clink,
          });
          break;
        case 'cleared': {
          audio.play('whoosh', {
            pitchSemitones: Math.min(state.streak, SOUND.whooshMaxSemitones),
            volume: v.whoosh,
          });
          arpeggio(e.rows.length + e.cols.length).forEach((note, k) =>
            audio.play(note.id, {
              pitchSemitones: note.pitch,
              delay: (k + 1) * SOUND.arpeggioGap,
              volume: v.chime,
            }),
          );
          break;
        }
        case 'cleanBoard':
          audio.play('flourish', { delay: SOUND.arpeggioGap, volume: v.flourish });
          break;
        case 'streak':
          // A subtle rising tone when the streak grows.
          if (e.streak > 0) {
            audio.play('chime0', {
              pitchSemitones: 12 + Math.min(e.streak, SOUND.whooshMaxSemitones),
              volume: v.streak,
            });
          }
          break;
        case 'dealt':
          audio.play('shuffle', { volume: v.shuffle });
          break;
        case 'gameOver':
          audio.play('gameOver', { volume: v.gameOver });
          break;
      }
    }
  });

  // A tick for every button in the UI.
  uiRoot.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (target?.closest?.('button')) audio.play('uiTick', { volume: v.uiTick });
  });
}
