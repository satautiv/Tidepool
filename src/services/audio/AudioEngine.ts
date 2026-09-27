/**
 * A small Web Audio engine (docs/PLAN.md §12). One AudioContext, created on the first user
 * gesture (browser autoplay rules), with `master → music` and `master → sfx` buses. Sounds load
 * lazily after that gesture, and the game never waits for them: playing a sound that isn't
 * ready yet is simply skipped. Any Web Audio failure is caught; audio is never allowed to break
 * the game.
 */

export type Bus = 'music' | 'sfx';

/** A sound is a URL to fetch and decode, or a generator of mono samples at a sample rate. */
export type SoundSource =
  | { url: string }
  /** `rate` overrides the sample rate (long, dark sounds can use less). */
  | { synth: (sampleRate: number) => Float32Array | Promise<Float32Array>; rate?: number };

export interface PlayOptions {
  /** Pitch shift in semitones. */
  pitchSemitones?: number;
  /** Extra pitch factor, e.g. ±0.03 for ±3% random detune. */
  detune?: number;
  /** 0–1, multiplied with the bus volume. */
  volume?: number;
  /** Start this many seconds from now (arpeggios). */
  delay?: number;
}

/** Persisted audio settings (SaveStore `settings`). */
export interface AudioSettings {
  sfx: number;
  music: number;
  sfxMuted: boolean;
  musicMuted: boolean;
}

export interface AudioEngineOptions {
  /** Makes the context; null when Web Audio is unavailable. Called on the first gesture. */
  createContext?: () => AudioContext | null;
  settings: () => AudioSettings;
  /** Persists a settings change. */
  saveSettings?: (change: Partial<AudioSettings>) => void;
  fetch?: (url: string) => Promise<ArrayBuffer>;
  onError?: (message: string) => void;
  /** Voice limits: per sound and in total (the oldest voice is stopped). */
  maxVoicesPerSound?: number;
  maxVoices?: number;
  /** Sample rate for generated sounds; defaults to the context's. */
  synthRate?: number;
  /** Waits for a fresh task before generating a sound. Default: setTimeout 0. */
  yieldTask?: () => Promise<void>;
}

interface Voice {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Playback rate for a pitch shift in semitones plus a fractional detune. */
export function playbackRate(semitones = 0, detune = 0): number {
  return 2 ** (semitones / 12) * (1 + detune);
}

/** Linear gain for a change in decibels. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function defaultAudioContext(): AudioContext | null {
  const w = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private readonly ducks = new Map<Bus, number>();
  private readonly manifest = new Map<string, SoundSource>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<void>>();
  private voices: Voice[] = [];
  private readonly loops = new Map<string, Loop>();
  /** Loops asked for before their sound was ready: started once it loads. */
  private readonly pendingLoops = new Map<string, number>();
  private readonly unlockCallbacks: Array<() => void> = [];
  private suspended = false;
  private readonly opts: Required<Omit<AudioEngineOptions, 'synthRate'>> &
    Pick<AudioEngineOptions, 'synthRate'>;

  constructor(opts: AudioEngineOptions) {
    this.opts = {
      createContext: defaultAudioContext,
      saveSettings: () => {},
      fetch: async (url) => (await fetch(url)).arrayBuffer(),
      onError: () => {},
      maxVoicesPerSound: 3,
      maxVoices: 16,
      yieldTask: () => new Promise((resolve) => setTimeout(resolve, 0)),
      ...opts,
    };
  }

  /** True once the context exists (after the first gesture). */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Unlocks audio on pointerdown/keydown on `target`. It stays attached: every gesture also
   * re-resumes a context the browser suspended (iOS does this after interruptions).
   */
  attachUnlock(target: EventTarget): void {
    const gesture = () => this.unlock();
    target.addEventListener('pointerdown', gesture, true);
    target.addEventListener('keydown', gesture, true);
  }

  /** Runs `fn` once audio is unlocked (right away if it already is). */
  onUnlock(fn: () => void): void {
    if (this.ctx) fn();
    else this.unlockCallbacks.push(fn);
  }

  /** Creates (or resumes) the context inside a user gesture, then loads the sounds. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = this.opts.createContext();
      } catch (e) {
        this.opts.onError(`AudioContext failed: ${(e as Error).message}`);
      }
      if (!this.ctx) return;
      this.buildGraph(this.ctx);
      for (const id of this.manifest.keys()) void this.load(id);
      const callbacks = this.unlockCallbacks.splice(0);
      for (const fn of callbacks) this.safely(fn);
    }
    if (!this.suspended) this.resumeContext();
  }

  /** Adds sounds. They load after unlock (or now, if already unlocked). */
  register(manifest: Record<string, SoundSource>): void {
    for (const [id, source] of Object.entries(manifest)) {
      this.manifest.set(id, source);
      if (this.ctx) void this.load(id);
    }
  }

  isLoaded(id: string): boolean {
    return this.buffers.has(id);
  }

  /** Resolves when every registered sound has loaded (or failed). */
  async ready(): Promise<void> {
    await Promise.all([...this.loading.values()]);
  }

  /** Plays a one-shot on the sfx bus. Skipped if muted, locked or not loaded yet. */
  play(id: string, opts: PlayOptions = {}): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(id);
    const bus = this.buses.get('sfx');
    if (!ctx || !buffer || !bus || this.suspended) return;
    try {
      this.makeRoom(id);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate(opts.pitchSemitones, opts.detune);
      const gain = ctx.createGain();
      gain.gain.value = opts.volume ?? 1;
      source.connect(gain);
      gain.connect(bus);
      const voice: Voice = { id, source, gain };
      this.voices.push(voice);
      source.onended = () => {
        this.voices = this.voices.filter((v) => v !== voice);
      };
      source.start(ctx.currentTime + (opts.delay ?? 0));
    } catch (e) {
      this.opts.onError(`play ${id} failed: ${(e as Error).message}`);
    }
  }

  /** Voices currently playing (for tests and the debug overlay). */
  get voiceCount(): number {
    return this.voices.length;
  }

  /** Starts a looping sound on the music bus, fading in. Waits for the sound if needed. */
  playLoop(id: string, fadeMs = 0): void {
    if (this.loops.has(id)) return;
    const ctx = this.ctx;
    const buffer = this.buffers.get(id);
    const bus = this.buses.get('music');
    if (!ctx || !buffer || !bus) {
      this.pendingLoops.set(id, fadeMs);
      return;
    }
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      this.ramp(gain.gain, 0, 1, fadeMs);
      source.connect(gain);
      gain.connect(bus);
      source.start();
      this.loops.set(id, { source, gain });
    } catch (e) {
      this.opts.onError(`loop ${id} failed: ${(e as Error).message}`);
    }
  }

  /** Fades a loop out and stops it. */
  stopLoop(id: string, fadeMs = 0): void {
    this.pendingLoops.delete(id);
    const loop = this.loops.get(id);
    if (!loop || !this.ctx) return;
    this.loops.delete(id);
    try {
      this.ramp(loop.gain.gain, loop.gain.gain.value, 0, fadeMs);
      loop.source.stop(this.ctx.currentTime + fadeMs / 1000);
    } catch (e) {
      this.opts.onError(`stopLoop ${id} failed: ${(e as Error).message}`);
    }
  }

  isLooping(id: string): boolean {
    return this.loops.has(id);
  }

  /** Lowers a bus by `db` (negative) over `ms`; `duck(bus, 0)` restores it. */
  duck(bus: Bus, db: number, ms = 300): void {
    this.ducks.set(bus, db);
    this.applyBus(bus, ms);
  }

  setVolume(bus: Bus, volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    this.opts.saveSettings(bus === 'sfx' ? { sfx: v } : { music: v });
    this.applyBus(bus, 50);
  }

  setMuted(bus: Bus, muted: boolean): void {
    this.opts.saveSettings(bus === 'sfx' ? { sfxMuted: muted } : { musicMuted: muted });
    this.applyBus(bus, 50);
  }

  /** Re-applies both buses from the settings (after they changed elsewhere, e.g. a reset). */
  refresh(): void {
    this.applyBus('sfx', 50);
    this.applyBus('music', 50);
  }

  /** The gain a bus should have now: volume × mute × duck. */
  busLevel(bus: Bus): number {
    const s = this.opts.settings();
    const [volume, muted] = bus === 'sfx' ? [s.sfx, s.sfxMuted] : [s.music, s.musicMuted];
    return muted ? 0 : volume * dbToGain(this.ducks.get(bus) ?? 0);
  }

  /** Page hidden or an ad showing: silence everything. */
  suspend(): void {
    this.suspended = true;
    try {
      void this.ctx?.suspend().catch(() => {});
    } catch {
      // Some browsers throw synchronously on a closed context.
    }
  }

  resume(): void {
    this.suspended = false;
    this.resumeContext();
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  private buildGraph(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const bus of ['music', 'sfx'] as const) {
      const gain = ctx.createGain();
      gain.connect(this.master);
      this.buses.set(bus, gain);
      gain.gain.value = this.busLevel(bus);
    }
  }

  private applyBus(bus: Bus, ms: number): void {
    const gain = this.buses.get(bus);
    if (gain) this.ramp(gain.gain, gain.gain.value, this.busLevel(bus), ms);
  }

  private ramp(param: AudioParam, from: number, to: number, ms: number): void {
    const now = this.ctx?.currentTime ?? 0;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(from, now);
      if (ms > 0) param.linearRampToValueAtTime(to, now + ms / 1000);
      else param.setValueAtTime(to, now);
    } catch {
      param.value = to;
    }
  }

  /** Voice limiting: stop the oldest voice of this sound, then the oldest overall. */
  private makeRoom(id: string): void {
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= this.opts.maxVoicesPerSound) this.stopVoice(same[0]!);
    if (this.voices.length >= this.opts.maxVoices) this.stopVoice(this.voices[0]!);
  }

  private stopVoice(voice: Voice): void {
    this.voices = this.voices.filter((v) => v !== voice);
    try {
      voice.source.onended = null;
      voice.source.stop();
    } catch {
      // Already stopped.
    }
  }

  private load(id: string): Promise<void> {
    const existing = this.loading.get(id);
    if (existing) return existing;
    const promise = this.decode(id).then(
      (buffer) => {
        if (!buffer) return;
        this.buffers.set(id, buffer);
        const fade = this.pendingLoops.get(id);
        if (fade !== undefined) {
          this.pendingLoops.delete(id);
          this.playLoop(id, fade);
        }
      },
      (e: unknown) => this.opts.onError(`load ${id} failed: ${(e as Error).message}`),
    );
    this.loading.set(id, promise);
    return promise;
  }

  private async decode(id: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    const source = this.manifest.get(id);
    if (!ctx || !source) return null;
    if ('url' in source) {
      const data = await this.opts.fetch(source.url);
      return ctx.decodeAudioData(data);
    }
    // Generated sounds: each in its own task, so generating them never makes one long task.
    await this.opts.yieldTask();
    const rate = source.rate ?? this.opts.synthRate ?? ctx.sampleRate;
    const samples = await source.synth(rate);
    const buffer = ctx.createBuffer(1, samples.length, rate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  private resumeContext(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    try {
      void ctx.resume().catch(() => {});
    } catch {
      // Ignore: it will be retried on the next gesture.
    }
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.opts.onError((e as Error).message);
    }
  }
}
