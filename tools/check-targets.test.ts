import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { targetConfig, TARGETS } from '../src/config/targets';
import { checkTarget } from './check-targets-lib';

function build(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'target-'));
  mkdirSync(join(dir, 'assets'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('checkTarget', () => {
  it('passes a web build without provider code', () => {
    expect(checkTarget('web', build({ 'index.html': '<html>', 'assets/a.js': 'x' }))).toEqual([]);
  });

  it('fails a web build that bundles a portal provider', () => {
    const dir = build({ 'assets/a.js': 'const m="tidepool-ads-poki"' });
    expect(checkTarget('web', dir)).toEqual(['web: contains poki code (tidepool-ads-poki)']);
  });

  it('requires a portal build to contain its own provider, and only that', () => {
    expect(checkTarget('crazygames', build({ 'index.html': '' }))).toEqual([
      'crazygames: missing its crazygames code',
    ]);
    const ok = build({
      'index.html': '<script src="https://sdk.crazygames.com/x.js">',
      'assets/b.js': 'tidepool-ads-crazygames',
    });
    expect(checkTarget('crazygames', ok)).toEqual([]);
  });

  it('reports a missing build', () => {
    expect(checkTarget('itch', '/nope/nothing')[0]).toMatch(/does not exist/);
  });
});

describe('targets table', () => {
  it('has a config for every target, falling back to web', () => {
    expect(Object.keys(TARGETS)).toEqual(['web', 'itch', 'crazygames', 'poki', 'android']);
    expect(targetConfig('poki').ads).toBe('poki');
    expect(targetConfig(undefined).id).toBe('web');
    expect(targetConfig('bogus').id).toBe('web');
    // Portals forbid external links and use no service worker; only web installs as a PWA.
    expect(TARGETS.crazygames.externalLinks).toBe(false);
    expect(
      Object.values(TARGETS)
        .filter((t) => t.pwa)
        .map((t) => t.id),
    ).toEqual(['web']);
  });
});
