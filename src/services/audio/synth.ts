/**
 * Procedural sound effects and ambience (docs/PLAN.md §12, README §11). Every sound is
 * generated in code into sample arrays, so the game downloads no audio at all; the engine turns
 * them into AudioBuffers after the first interaction. Pure functions of (sample rate, seed):
 * the same sound every time, testable without a browser.
 */

export type Samples = Float32Array;

/** Small seeded PRNG for noise (so sounds are identical on every launch). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

/** Frequency of a note `semitones` away from A4 (440 Hz). */
export function noteHz(semitones: number): number {
  return 440 * 2 ** (semitones / 12);
}

/** A 5 ms fade at both ends, so no sound starts or stops with a click. */
function declick(out: Samples, rate: number, ms = 5): Samples {
  const n = Math.min(Math.floor((rate * ms) / 1000), Math.floor(out.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i]! *= g;
    out[out.length - 1 - i]! *= g;
  }
  return out;
}

/** Scales so the loudest sample is `peak` (SFX are normalised to the same level). */
export function normalize(out: Samples, peak: number): Samples {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max === 0) return out;
  const k = peak / max;
  for (let i = 0; i < out.length; i++) out[i]! *= k;
  return out;
}

/**
 * A bell/glass partial set: decaying sines at inharmonic ratios. Each partial is a recursive
 * oscillator (a rotating phasor) with a per-sample decay factor, so the inner loop is a few
 * multiplies instead of `sin`/`exp` calls.
 */
function bell(
  out: Samples,
  rate: number,
  start: number,
  hz: number,
  opts: { decay: number; gain: number; partials: readonly [ratio: number, amp: number][] },
): void {
  const from = Math.floor(start * rate);
  const attack = rate / 400; // 2.5 ms
  const end = Math.min(out.length, from + Math.ceil(opts.decay * rate * Math.log(1e4)));
  for (const [ratio, amp] of opts.partials) {
    const w = (TAU * hz * ratio) / rate;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    // Overall decay plus a faster decay for higher partials.
    const fall = Math.exp(-1 / (opts.decay * rate) - ratio / (opts.decay * 3 * rate));
    let re = 1;
    let im = 0;
    let level = amp * opts.gain;
    for (let i = from; i < end; i++) {
      const k = i - from;
      out[i]! += im * level * (k < attack ? k / attack : 1);
      const nre = re * cos - im * sin;
      im = re * sin + im * cos;
      re = nre;
      level *= fall;
    }
  }
}

/** Glass partials: a bright, slightly inharmonic "clink". */
const GLASS: readonly [number, number][] = [
  [1, 1],
  [2.76, 0.45],
  [5.4, 0.2],
  [8.93, 0.08],
];

/** Chime partials: rounder, longer. */
const CHIME: readonly [number, number][] = [
  [1, 1],
  [2, 0.3],
  [3.01, 0.12],
  [4.2, 0.05],
];

/** One-pole low-pass, in place. A varying `hz` is re-evaluated every 32 samples. */
function lowpass(out: Samples, rate: number, hz: number | ((i: number) => number)): void {
  const coef = (f: number) => 1 - Math.exp((-TAU * f) / rate);
  let a = typeof hz === 'number' ? coef(hz) : 0;
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    if (typeof hz !== 'number' && i % 32 === 0) a = coef(hz(i));
    y += a * (out[i]! - y);
    out[i] = y;
  }
}

function noise(length: number, seed: number): Samples {
  const random = prng(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = random() * 2 - 1;
  return out;
}

const seconds = (rate: number, s: number) => new Float32Array(Math.ceil(rate * s));

/** Lifting a piece: a quiet, short tick. */
export function lift(rate: number): Samples {
  const out = seconds(rate, 0.08);
  bell(out, rate, 0, 1200, {
    decay: 0.02,
    gain: 0.6,
    partials: [
      [1, 1],
      [2.1, 0.3],
    ],
  });
  const hiss = noise(out.length, 1);
  lowpass(hiss, rate, 3000);
  for (let i = 0; i < out.length; i++) out[i]! += hiss[i]! * 0.15 * Math.exp(-i / (rate * 0.01));
  return declick(normalize(out, 0.5), rate);
}

/** Placing a piece: glass clink (pitched per colour by the engine). */
export function clink(rate: number): Samples {
  const out = seconds(rate, 0.35);
  bell(out, rate, 0, noteHz(15), { decay: 0.07, gain: 1, partials: GLASS }); // C6
  return declick(normalize(out, 0.8), rate);
}

/** Invalid drop: a soft, low "bloop" sliding down. */
export function bloop(rate: number): Samples {
  const out = seconds(rate, 0.2);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const hz = 380 * Math.exp(-t * 4.5);
    phase += (TAU * hz) / rate;
    out[i] = Math.sin(phase) * Math.sin((Math.PI * t) / 0.2);
  }
  return declick(normalize(out, 0.45), rate);
}

/** Line clear: a wave "whoosh", filtered noise that swells and opens up. */
export function whoosh(rate: number): Samples {
  const dur = 0.5;
  const out = noise(Math.ceil(rate * dur), 2);
  lowpass(out, rate, (i) => 300 + 3200 * Math.sin((Math.PI * i) / out.length) ** 2);
  for (let i = 0; i < out.length; i++) {
    const t = i / out.length;
    out[i]! *= Math.sin(Math.PI * t ** 0.7) ** 2; // quick swell, long tail
  }
  return declick(normalize(out, 0.7), rate);
}

/** The three chime notes (C, E, G), for arpeggios on multi-line clears. */
export const CHIME_NOTES = [15, 19, 22] as const; // C6, E6, G6

export function chime(rate: number, note: number): Samples {
  const out = seconds(rate, 1.2);
  bell(out, rate, 0, noteHz(note), { decay: 0.35, gain: 1, partials: CHIME });
  return declick(normalize(out, 0.55), rate);
}

/** Clean board: a sparkling rising arpeggio. */
export function flourish(rate: number): Samples {
  const out = seconds(rate, 1.6);
  [15, 19, 22, 27, 31, 34].forEach((note, k) =>
    bell(out, rate, k * 0.07, noteHz(note), { decay: 0.3, gain: 1 - k * 0.08, partials: CHIME }),
  );
  return declick(normalize(out, 0.65), rate);
}

/** A new tray: a soft three-tap shuffle. */
export function shuffle(rate: number): Samples {
  const out = seconds(rate, 0.25);
  const hiss = noise(out.length, 3);
  lowpass(hiss, rate, 2200);
  for (const at of [0, 0.06, 0.12]) {
    const from = Math.floor(at * rate);
    for (let i = from; i < out.length; i++) {
      const t = (i - from) / rate;
      out[i]! += hiss[i]! * Math.exp(-t / 0.018) * Math.min(1, t * 1000);
    }
  }
  return declick(normalize(out, 0.35), rate);
}

/** Game over: a gentle descending chime. */
export function gameOver(rate: number): Samples {
  const out = seconds(rate, 2);
  [22, 19, 15, 10].forEach((note, k) =>
    bell(out, rate, k * 0.22, noteHz(note - 12), {
      decay: 0.45,
      gain: 1 - k * 0.1,
      partials: CHIME,
    }),
  );
  return declick(normalize(out, 0.55), rate);
}

/** Button press: a tiny tick. */
export function uiTick(rate: number): Samples {
  const out = seconds(rate, 0.04);
  bell(out, rate, 0, 1800, { decay: 0.008, gain: 1, partials: [[1, 1]] });
  return declick(normalize(out, 0.35), rate);
}

/**
 * The ambient bed (T2.10): water lapping plus a very soft pad, `loopSeconds` long and seamless.
 * Every modulation has a whole number of cycles per loop, and the noise is cross-faded across
 * the loop point, so there is no click or jump when it wraps.
 */
export function ambient(rate: number, loopSeconds = 24): Samples {
  const steps = ambientSteps(rate, loopSeconds);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same loop, generated in slices with a pause between them (so the page stays smooth). */
export async function ambientAsync(
  rate: number,
  loopSeconds: number,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): Promise<Samples> {
  const steps = ambientSteps(rate, loopSeconds);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await pause();
  }
}

/** Samples processed between pauses when generating in slices. */
const SLICE = 1 << 17;

/** Generates the ambient loop, yielding every SLICE samples of work. */
function* ambientSteps(rate: number, loopSeconds: number): Generator<void, Samples> {
  const n = Math.round(rate * loopSeconds);
  const fade = Math.round(rate * 1.5);

  // Water: low-passed noise with slow, overlapping "laps". Filtered over n + fade samples, the
  // tail is cross-faded into the head. Two one-pole low-passes in series, run in slices.
  const raw = new Float32Array(n + fade);
  const random = prng(4);
  const a1 = 1 - Math.exp((-TAU * 520) / rate);
  const a2 = 1 - Math.exp((-TAU * 700) / rate);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < raw.length; i++) {
    y1 += a1 * (random() * 2 - 1 - y1);
    y2 += a2 * (y1 - y2);
    raw[i] = y2;
    if (i % SLICE === SLICE - 1) yield;
  }
  const out = new Float32Array(n);
  const cycle = (k: number, i: number, phase = 0) => Math.sin((TAU * k * i) / n + phase);
  // The laps change slowly: evaluate them every 64 samples.
  let lap = 0;
  for (let i = 0; i < n; i++) {
    if (i % 64 === 0) {
      lap = 0.55 + 0.25 * cycle(5, i) + 0.12 * cycle(9, i, 1.3) + 0.08 * cycle(14, i, 2.1);
    }
    let water = raw[i]!;
    if (i < fade) {
      const g = i / fade;
      water = raw[i]! * Math.sqrt(g) + raw[n + i]! * Math.sqrt(1 - g);
    }
    out[i] = water * lap * 1.6;
    if (i % SLICE === SLICE - 1) yield;
  }

  // Pad: a soft A-major-ish chord whose notes breathe at different whole-number rates. The
  // frequencies are nudged to whole cycles per loop too.
  const pad: [semitones: number, breaths: number][] = [
    [-24, 2],
    [-17, 3],
    [-12, 4],
    [-8, 5],
  ];
  for (const [semi, breaths] of pad) {
    const cycles = Math.round(noteHz(semi) * loopSeconds);
    // A recursive oscillator (exact whole cycles per loop), with the breathing every 64 samples.
    // It is renormalised now and then so rounding never drifts its level over a long loop.
    const w = (TAU * cycles) / n;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    let re = 1;
    let im = 0;
    let env = 0;
    for (let i = 0; i < n; i++) {
      if (i % 64 === 0) env = 0.5 + 0.5 * cycle(breaths, i, semi);
      if (i % 4096 === 0) {
        const m = Math.hypot(re, im);
        re /= m;
        im /= m;
      }
      out[i]! += 0.05 * env * im;
      const nre = re * cos - im * sin;
      im = re * sin + im * cos;
      re = nre;
      if (i % SLICE === SLICE - 1) yield;
    }
  }
  return normalize(out, 0.6);
}

/** Ambient loop length (T2.10: a 60–120 s loop, so the repeat isn't noticeable). */
export const AMBIENT_SECONDS = 60;

/** Every generated sound, by id. `chime0..2` are the arpeggio notes. */
export const SYNTH_SOUNDS: Record<string, (rate: number) => Samples> = {
  lift,
  clink,
  bloop,
  whoosh,
  chime0: (r) => chime(r, CHIME_NOTES[0]),
  chime1: (r) => chime(r, CHIME_NOTES[1]),
  chime2: (r) => chime(r, CHIME_NOTES[2]),
  flourish,
  shuffle,
  gameOver,
  uiTick,
  ambient: (r) => ambient(r, AMBIENT_SECONDS),
};
