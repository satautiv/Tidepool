/**
 * Fails if a production build contains dev-only code (docs/PLAN.md §17): the E2E test hook
 * `window.__tidepool` and its module must never ship.
 *   npm run build && npm run check:dist
 */
import { findDevCode } from './check-dist-lib';

const offenders = findDevCode('dist');
if (offenders.length) {
  console.error(`Dev-only code found in dist/:\n${offenders.join('\n')}`);
  process.exit(1);
}
console.log('dist/ is free of dev hooks');
