import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, dbToGain, playbackRate, type AudioSettings } from './AudioEngine';
import { FakeAudioContext } from './testing';

function setup(opts: { noAudio?: boolean } = {}) {
  const ctx = new FakeAudioContext();
  const settings: AudioSettings = { sfx: 1, music: 0.35, sfxMuted: false, musicMuted: false };
  const saved: Partial<AudioSettings>[] = [];
  const onError = vi.fn();
  const engine = new AudioEngine({
    createContext: () => (opts.noAudio ? null : (ctx as unknown as AudioContext)),
    settings: () => settings,
    saveSettings: (c) => {
      saved.push(c);
      Object.assign(settings, c);
    },
    fetch: async () => new ArrayBuffer(8),
    onError,
  });
  engine.register({
    a: { synth: (rate) => new Float32Array(rate / 10) },
    b: { synth: () => new Float32Array(10) },
    loop: { synth: () => new Float32Array(100) },
    file: { url: 'x.mp3' },
  });
  return { engine, ctx, settings, saved, onError };
}

async function unlocked() {
  const s = setup();
  s.engine.unlock();
  await s.engine.ready();
  return s;
}

/** Sources that were started as one-shots. */
const shots = (ctx: FakeAudioContext) => ctx.sources.filter((s) => !s.loop);

describe('pitch', () => {
  it('converts semitones and detune to a playback rate', () => {
    expect(playbackRate()).toBe(1);
    expect(playbackRate(12)).toBeCloseTo(2);
    expect(playbackRate(-12)).toBeCloseTo(0.5);
    expect(playbackRate(7)).toBeCloseTo(1.4983);
    expect(playbackRate(0, 0.03)).toBeCloseTo(1.03);
    expect(playbackRate(12, -0.03)).toBeCloseTo(1.94);
    expect(dbToGain(-6)).toBeCloseTo(0.501);
    expect(dbToGain(0)).toBe(1);
  });
});

describe('AudioEngine', () => {
  it('does nothing (and makes no context) before the first gesture', () => {
    const { engine, ctx } = setup();
    engine.play('a');
    engine.playLoop('loop');
    expect(engine.unlocked).toBe(false);
    expect(ctx.sources).toHaveLength(0);
  });

  it('unlocks on the first pointerdown/keydown, resumes, then loads everything', async () => {
    const { engine, ctx } = setup();
    const target = new EventTarget();
    const unlockedCb = vi.fn();
    engine.onUnlock(unlockedCb);
    engine.attachUnlock(target);
    target.dispatchEvent(new Event('keydown'));
    expect(engine.unlocked).toBe(true);
    expect(unlockedCb).toHaveBeenCalledOnce();
    expect(ctx.resumes).toBe(1);
    await engine.ready();
    expect(['a', 'b', 'loop', 'file'].every((id) => engine.isLoaded(id))).toBe(true);
    // Later gestures re-resume a context the browser suspended.
    ctx.state = 'suspended';
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resumes).toBe(2);
  });

  it('plays with pitch, detune, volume and delay on the sfx bus', async () => {
    const { engine, ctx } = await unlocked();
    ctx.currentTime = 5;
    engine.play('a', { pitchSemitones: 12, detune: 0.03, volume: 0.5, delay: 0.1 });
    const [src] = shots(ctx);
    expect(src!.playbackRate.value).toBeCloseTo(2.06);
    expect(src!.started).toBeCloseTo(5.1);
    const voiceGain = src!.connections[0] as { gain: { value: number } };
    expect(voiceGain.gain.value).toBe(0.5);
  });

  it('limits voices: 3 per sound, 16 in total, stopping the oldest', async () => {
    const { engine, ctx } = await unlocked();
    for (let i = 0; i < 5; i++) engine.play('a');
    expect(engine.voiceCount).toBe(3);
    expect(shots(ctx).filter((s) => s.stopped !== null)).toHaveLength(2);
    expect(shots(ctx)[0]!.stopped).not.toBeNull(); // the oldest went first

    const many = new AudioEngine({
      createContext: () => ctx as unknown as AudioContext,
      settings: () => ({ sfx: 1, music: 1, sfxMuted: false, musicMuted: false }),
      maxVoicesPerSound: 100,
    });
    many.register({ s: { synth: () => new Float32Array(4) } });
    many.unlock();
    await many.ready();
    for (let i = 0; i < 20; i++) many.play('s');
    expect(many.voiceCount).toBe(16);
  });

  it('frees a voice when it ends', async () => {
    const { engine, ctx } = await unlocked();
    engine.play('a');
    shots(ctx)[0]!.end();
    expect(engine.voiceCount).toBe(0);
  });

  it('skips sounds that are unknown, still loading or while suspended', async () => {
    const { engine, ctx } = await unlocked();
    engine.play('nope');
    engine.suspend();
    engine.play('a');
    expect(shots(ctx)).toHaveLength(0);
    expect(ctx.suspends).toBe(1);
    engine.resume();
    engine.play('a');
    expect(shots(ctx)).toHaveLength(1);
  });

  it('loops with a fade in, waits for a loop that is still loading, and fades out', async () => {
    const { engine, ctx } = setup();
    engine.unlock();
    engine.playLoop('loop', 2000); // not decoded yet
    expect(engine.isLooping('loop')).toBe(false);
    await engine.ready();
    expect(engine.isLooping('loop')).toBe(true);
    const loop = ctx.sources.find((s) => s.loop)!;
    const gain = loop.connections[0] as { gain: { events: unknown[] } };
    expect(gain.gain.events).toContainEqual(['ramp', 1, 2]);
    engine.playLoop('loop'); // no second copy
    expect(ctx.sources.filter((s) => s.loop)).toHaveLength(1);
    ctx.currentTime = 10;
    engine.stopLoop('loop', 500);
    expect(loop.stopped).toBe(10.5);
    expect(engine.isLooping('loop')).toBe(false);
  });

  it('sets bus levels from volume, mute and ducking, and persists changes', async () => {
    const { engine, saved } = await unlocked();
    expect(engine.busLevel('music')).toBeCloseTo(0.35);
    engine.duck('music', -6);
    expect(engine.busLevel('music')).toBeCloseTo(0.35 * dbToGain(-6));
    engine.duck('music', 0);
    engine.setVolume('music', 0.8);
    engine.setMuted('sfx', true);
    expect(engine.busLevel('music')).toBeCloseTo(0.8);
    expect(engine.busLevel('sfx')).toBe(0);
    engine.setVolume('sfx', 7);
    expect(saved).toEqual([{ music: 0.8 }, { sfxMuted: true }, { sfx: 1 }]);
  });

  it('survives browsers without Web Audio', () => {
    const { engine } = setup({ noAudio: true });
    engine.unlock();
    expect(engine.unlocked).toBe(false);
    expect(() => {
      engine.play('a');
      engine.playLoop('loop');
      engine.duck('music', -6);
      engine.suspend();
      engine.resume();
    }).not.toThrow();
  });

  it('reports load and playback failures without throwing', async () => {
    const { engine, ctx, onError } = setup();
    engine.register({
      bad: {
        synth: () => {
          throw new Error('nope');
        },
      },
    });
    engine.unlock();
    await engine.ready();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('load bad failed'));
    ctx.createBufferSource = () => {
      throw new Error('boom');
    };
    expect(() => engine.play('a')).not.toThrow();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('play a failed'));
  });
});
