/**
 * Every game-feel number in one place (docs/PLAN.md §11), grouped by moment. Durations and
 * delays are in seconds, distances in CSS px unless noted. Views read these at use time, so
 * the dev tweak panel (`?feel=1`) changes them live. Values for moments that aren't built yet
 * are the §11 starting points, ready for their tasks (T2.03–T2.07).
 */

export const FEEL = {
  pickUp: {
    /** Tray scale → board scale. */
    liftDuration: 0.09,
    /** Opacity of the tray slot whose piece is being dragged. */
    trayDimAlpha: 0.3,
  },
  ghost: {
    /** Opacity of the faded piece under the ghost outline. */
    fillAlpha: 0.35,
    fadeInDuration: 0.06,
    /** Would-clear highlight: pulse period and opacity range. */
    pulsePeriod: 1.2,
    pulseMin: 0.55,
    pulseMax: 1,
  },
  drop: {
    /** Placed cells pop in from this scale with a slight overshoot. */
    placeFrom: 0.86,
    placeDuration: 0.16,
    /** §11 target: snap 70 ms, then squash 1.0 → 1.08 → 1.0 over 140 ms (T2.07). */
    snapDuration: 0.07,
    squashScale: 1.08,
    squashDuration: 0.14,
  },
  invalidDrop: {
    /** An invalid drop floats back to its tray slot. */
    returnDuration: 0.2,
  },
  lineClear: {
    duration: 0.26,
    /** Delay per cell of distance from the placed piece, so clears ripple outward. */
    stagger: 0.022,
    /** How far dissolving cells lift, and the scale they shrink to. */
    lift: 6,
    scaleTo: 0.8,
    waveDuration: 0.28,
    bubblesMin: 6,
    bubblesMax: 10,
  },
  callout: {
    popFrom: 0.6,
    popPeak: 1.12,
    popDuration: 0.22,
    hold: 0.6,
    fadeOut: 0.3,
  },
  shake: {
    /** Amplitude for 3 lines, and for 4 or more. */
    amplitude3: 3,
    amplitude4: 5,
    duration: 0.18,
  },
  score: {
    floatRise: 30,
    floatDuration: 0.7,
    countUpDuration: 0.4,
  },
  deal: {
    /** Per piece. */
    duration: 0.22,
    /** Between consecutive pieces. */
    stagger: 0.06,
    /** How far a piece slides up, as a share of the slot height. */
    rise: 0.35,
  },
  gameOver: {
    /** Blocks fade towards the sand to this opacity. */
    fadeTo: 0.25,
    fadeDuration: 0.5,
    panelSlideDuration: 0.25,
  },
  button: {
    pressScale: 0.96,
  },
  /**
   * Per particle type: gravity (px/s², negative rises), drag (per second), life (s), size
   * (CSS px, start → end), alpha (start → end), spin (rad/s, ± random).
   */
  particles: {
    bubble: {
      gravity: -90,
      drag: 1.2,
      life: 0.9,
      sizeFrom: 5,
      sizeTo: 9,
      alphaFrom: 0.9,
      alphaTo: 0,
      spin: 0,
    },
    sparkle: {
      gravity: 40,
      drag: 3,
      life: 0.55,
      sizeFrom: 10,
      sizeTo: 2,
      alphaFrom: 1,
      alphaTo: 0,
      spin: 6,
    },
    droplet: {
      gravity: 420,
      drag: 0.6,
      life: 0.7,
      sizeFrom: 6,
      sizeTo: 4,
      alphaFrom: 0.85,
      alphaTo: 0,
      spin: 0,
    },
    dot: {
      gravity: 0,
      drag: 2,
      life: 0.5,
      sizeFrom: 6,
      sizeTo: 0,
      alphaFrom: 0.8,
      alphaTo: 0,
      spin: 0,
    },
  },
  reducedMotion: {
    /** Replaces staggered cell animations. */
    fadeDuration: 0.15,
    /** Share of the normal particle count. */
    particleScale: 0.25,
  },
};

export type Feel = typeof FEEL;

/** A deep copy of the shipped values, for resetting the tweak panel. */
export const FEEL_DEFAULTS: Feel = structuredClone(FEEL);

export interface FeelTweak {
  /** `group.key` inside FEEL. */
  path: string;
  min: number;
  max: number;
  step: number;
}

/** The values worth tuning by hand during playtests (the dev panel's sliders). */
export const FEEL_TWEAKS: readonly FeelTweak[] = [
  { path: 'pickUp.liftDuration', min: 0, max: 0.4, step: 0.01 },
  { path: 'pickUp.trayDimAlpha', min: 0, max: 1, step: 0.05 },
  { path: 'ghost.fillAlpha', min: 0, max: 1, step: 0.05 },
  { path: 'ghost.pulsePeriod', min: 0.2, max: 3, step: 0.1 },
  { path: 'drop.placeFrom', min: 0.5, max: 1.2, step: 0.01 },
  { path: 'drop.placeDuration', min: 0, max: 0.5, step: 0.01 },
  { path: 'invalidDrop.returnDuration', min: 0, max: 0.6, step: 0.01 },
  { path: 'lineClear.duration', min: 0.05, max: 1, step: 0.01 },
  { path: 'lineClear.stagger', min: 0, max: 0.1, step: 0.002 },
  { path: 'lineClear.lift', min: 0, max: 30, step: 1 },
  { path: 'lineClear.scaleTo', min: 0.2, max: 1.2, step: 0.05 },
  { path: 'deal.duration', min: 0.05, max: 0.8, step: 0.01 },
  { path: 'deal.stagger', min: 0, max: 0.3, step: 0.01 },
  { path: 'deal.rise', min: 0, max: 1, step: 0.05 },
  { path: 'gameOver.fadeTo', min: 0, max: 1, step: 0.05 },
  { path: 'gameOver.fadeDuration', min: 0.1, max: 2, step: 0.05 },
];

type Tree = { [key: string]: number | Tree };

/** The object holding the last path segment, and that segment. */
function locate(path: string, feel: Feel): [Tree, string] | null {
  const keys = path.split('.');
  const last = keys.pop()!;
  let node: number | Tree | undefined = feel as unknown as Tree;
  for (const key of keys) {
    node = typeof node === 'object' ? node[key] : undefined;
  }
  return typeof node === 'object' ? [node, last] : null;
}

export function getFeel(path: string, feel: Feel = FEEL): number {
  const found = locate(path, feel);
  const value = found?.[0][found[1]];
  if (typeof value !== 'number') throw new Error(`Unknown feel value ${path}`);
  return value;
}

export function setFeel(path: string, value: number, feel: Feel = FEEL): void {
  getFeel(path, feel); // validates the path
  const [node, key] = locate(path, feel)!;
  node[key] = value;
}

/** Restores every value to the shipped defaults, in place (objects keep their identity). */
export function resetFeel(feel: Feel = FEEL): void {
  const copy = (into: Tree, from: Tree) => {
    for (const [key, value] of Object.entries(from)) {
      if (typeof value === 'number') into[key] = value;
      else copy(into[key] as Tree, value);
    }
  };
  copy(feel as unknown as Tree, FEEL_DEFAULTS as unknown as Tree);
}
