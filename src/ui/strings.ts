/** All user-facing text (docs/PLAN.md §10), ready for localisation (T6.09). */
export const STRINGS = {
  score: 'Score',
  best: 'Best',
  pause: 'Pause',
  gameOver: 'Out of room',
  newBest: 'New best!',
  playAgain: 'Play again',
  menu: 'Menu',
  streak: (multiplier: number) => `×${multiplier}`,
} as const;
