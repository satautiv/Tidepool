/**
 * Seedable, deterministic RNG (docs/PLAN.md §6.4).
 *
 * sfc32 with 4 × uint32 of state, seeded through the cyrb128 string hash.
 * The API is functional: every call takes a state and returns the value plus
 * the next state, so the state can live inside immutable, JSON-serializable
 * game state. Use `RngCursor` for ergonomic use inside a single function.
 */

export type RngState = readonly [number, number, number, number];

/** Outputs discarded after seeding, to mix the initial state. */
const WARMUP = 15;

/** cyrb128: fast 128-bit string hash, used only to turn a seed into initial state. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Creates the initial state for a seed. Numbers are seeded by their string form, so `1` and `'1'` are equal. */
export function createRng(seed: string | number): RngState {
  let state: RngState = cyrb128(String(seed));
  for (let i = 0; i < WARMUP; i++) state = nextUint32(state)[1];
  return state;
}

/** One sfc32 step: a uniform integer in [0, 2^32). */
export function nextUint32(s: RngState): [number, RngState] {
  let [a, b, c, d] = s;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

/** A uniform float in [0, 1). */
export function nextFloat(s: RngState): [number, RngState] {
  const [u, next] = nextUint32(s);
  return [u / 4294967296, next];
}

/** A uniform integer in [0, n). `n` must be a positive integer. */
export function nextInt(s: RngState, n: number): [number, RngState] {
  if (!Number.isInteger(n) || n <= 0 || n > 4294967296) {
    throw new RangeError(`nextInt: n must be an integer in [1, 2^32], got ${n}`);
  }
  const [f, next] = nextFloat(s);
  return [Math.floor(f * n), next];
}

/**
 * Picks one item with probability proportional to its weight.
 * Weights must be finite and ≥ 0, with a positive total. Zero-weight items are never picked.
 */
export function pickWeighted<T>(
  s: RngState,
  items: readonly T[],
  weights: readonly number[],
): [T, RngState] {
  if (items.length !== weights.length) {
    throw new RangeError('pickWeighted: items and weights differ in length');
  }
  let total = 0;
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) throw new RangeError(`pickWeighted: invalid weight ${w}`);
    total += w;
  }
  if (total <= 0) throw new RangeError('pickWeighted: total weight must be positive');

  const [f, next] = nextFloat(s);
  let r = f * total;
  let lastPositive = -1;
  for (let i = 0; i < items.length; i++) {
    const w = weights[i]!;
    if (w === 0) continue;
    lastPositive = i;
    if (r < w) return [items[i]!, next];
    r -= w;
  }
  // Floating-point rounding can leave r marginally ≥ the last weight.
  return [items[lastPositive]!, next];
}

/** Returns a shuffled copy (Fisher–Yates). */
export function shuffle<T>(s: RngState, arr: readonly T[]): [T[], RngState] {
  const out = arr.slice();
  let state = s;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, state] = nextInt(state, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return [out, state];
}

/**
 * Mutable wrapper for convenient use inside one function call.
 * Never store a cursor in game state: read `.state` back out when done.
 */
export class RngCursor {
  constructor(public state: RngState) {}

  float(): number {
    let v: number;
    [v, this.state] = nextFloat(this.state);
    return v;
  }

  int(n: number): number {
    let v: number;
    [v, this.state] = nextInt(this.state, n);
    return v;
  }

  pick<T>(items: readonly T[], weights: readonly number[]): T {
    let v: T;
    [v, this.state] = pickWeighted(this.state, items, weights);
    return v;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    let v: T[];
    [v, this.state] = shuffle(this.state, arr);
    return v;
  }
}
