import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDevCode } from './check-dist-lib';

describe('findDevCode', () => {
  it('finds dev markers in built JS and HTML, recursively', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<script src="assets/a.js"></script>');
    writeFileSync(join(dir, 'assets', 'a.js'), 'const k = `__tidepool_probe__`;');
    expect(findDevCode(dir)).toEqual([]);
    writeFileSync(join(dir, 'assets', 'b.js'), 'Object.assign(window,{__tidepool:h})');
    writeFileSync(join(dir, 'assets', 'c.css'), '.__tidepool{}'); // not code
    expect(findDevCode(dir)).toEqual([`${join(dir, 'assets', 'b.js')}: __tidepool(?!_)`]);
  });
});
