import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TARGETS, type TargetId } from '../src/config/targets';

/** Strings that only appear in one ad provider's code or SDK tag. */
export const PROVIDER_MARKERS: Record<'crazygames' | 'poki' | 'admob', string[]> = {
  crazygames: ['tidepool-ads-crazygames', 'sdk.crazygames.com'],
  poki: ['tidepool-ads-poki', 'poki-sdk'],
  admob: ['tidepool-ads-admob'],
};

function allText(dir: string): string {
  let text = '';
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|mjs|html)$/.test(name)) text += readFileSync(path, 'utf8');
    }
  };
  walk(dir);
  return text;
}

/**
 * Checks one target's build: it must contain its own provider (if any) and nothing from the
 * others. Returns the problems found.
 */
export function checkTarget(id: TargetId, dir: string): string[] {
  if (!existsSync(dir)) return [`${id}: ${dir} does not exist (build it first)`];
  const text = allText(dir);
  const own = TARGETS[id].ads;
  const problems: string[] = [];
  for (const [provider, markers] of Object.entries(PROVIDER_MARKERS)) {
    const found = markers.filter((m) => text.includes(m));
    if (provider === own && found.length === 0)
      problems.push(`${id}: missing its ${provider} code`);
    if (provider !== own && found.length > 0) {
      problems.push(`${id}: contains ${provider} code (${found.join(', ')})`);
    }
  }
  return problems;
}
