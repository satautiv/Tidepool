/** All user-facing text (docs/PLAN.md §10), ready for localisation (T6.09). */
export const STRINGS = {
  score: 'Score',
  best: 'Best',
  pause: 'Pause',
  streak: (multiplier: number) => `×${multiplier}`,
} as const;
