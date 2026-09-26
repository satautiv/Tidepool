/**
 * Simulator CLI.
 *   npm run sim -- --games 5000 --seed 1 --bot greedy [--max-moves 5000] [--json out.json]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BOTS } from './bots';
import { formatReport, simulate } from './simulate';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '1' },
    bot: { type: 'string', default: 'greedy' },
    'max-moves': { type: 'string', default: '5000' },
    json: { type: 'string' },
  },
});

const bot = BOTS[values.bot];
if (!bot) {
  console.error(`Unknown bot "${values.bot}". Available: ${Object.keys(BOTS).join(', ')}`);
  process.exit(1);
}

const started = performance.now();
const report = simulate({
  games: Number(values.games),
  seed: values.seed,
  bot,
  maxMoves: Number(values['max-moves']),
});
const seconds = (performance.now() - started) / 1000;

console.log(formatReport(report));
console.log(`\nFinished in ${seconds.toFixed(1)} s`);
if (values.json) {
  writeFileSync(values.json, JSON.stringify(report, null, 2));
  console.log(`JSON written to ${values.json}`);
}
process.exit(report.unfairDeals === 0 ? 0 : 2);
