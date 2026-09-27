/** All user-facing text (docs/PLAN.md §10), ready for localisation (T6.09). */
export const STRINGS = {
  score: 'Score',
  best: 'Best',
  pause: 'Pause',
  gameOver: 'Out of room',
  newBest: 'New best!',
  playAgain: 'Play again',
  menu: 'Menu',
  secondChance: 'Watch an ad to keep going',
  paused: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  restartConfirm: 'Start over? This run will end.',
  cancel: 'Cancel',
  settings: 'Settings',
  streak: (multiplier: number) => `×${multiplier}`,
  callouts: {
    nice: 'Nice!',
    splash: 'Splash!',
    tidalWave: 'Tidal Wave!',
    crystalClear: 'Crystal Clear!',
  },
} as const;
