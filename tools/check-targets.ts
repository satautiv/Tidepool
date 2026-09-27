/**
 * After `npm run build:all` (or any subset): every target's dist/ must contain only its own ad
 * provider (docs/PLAN.md §20). Missing target builds are skipped with a note.
 *   npm run check:targets
 */
import { existsSync } from 'node:fs';
import { TARGETS, type TargetId } from '../src/config/targets';
import { checkTarget } from './check-targets-lib';

let problems: string[] = [];
let checked = 0;
for (const id of Object.keys(TARGETS) as TargetId[]) {
  const dir = `dist/${id}`;
  if (!existsSync(dir)) {
    console.log(`skip ${id} (not built)`);
    continue;
  }
  checked++;
  problems = problems.concat(checkTarget(id, dir));
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`${checked} target build(s) contain only their own ad provider`);
