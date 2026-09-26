/** Rendering tunables (docs/PLAN.md §7.1). */
export const RENDER = {
  /** Upper bound for devicePixelRatio. Low-power mode (T2.15) lowers it. */
  maxDpr: 3,
  /** Frame delta clamp in seconds, so a stalled tab doesn't jump animations. */
  maxDt: 0.05,
} as const;
