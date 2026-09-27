import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Markers that only exist in dev-only code. Property names survive minification; the
 * lookahead keeps the storage probe key `__tidepool_probe__` from matching.
 */
export const DEV_MARKERS = [
  /__tidepool(?!_)/,
  /\bdropPoint\b/,
  /\bforceGameOver\b/,
  /Feel \(dev\)/,
];

/** Lists `file: marker` for every built JS/HTML file under `dir` that contains a marker. */
export function findDevCode(dir: string, markers = DEV_MARKERS): string[] {
  const found: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|mjs|html)$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        for (const m of markers) if (m.test(text)) found.push(`${path}: ${m.source}`);
      }
    }
  };
  walk(dir);
  return found;
}
