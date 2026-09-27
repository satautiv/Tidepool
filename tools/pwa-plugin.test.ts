import { describe, expect, it, vi } from 'vitest';
import { pwaPlugin, PUBLIC_PRECACHE, serviceWorkerSource } from './pwa-plugin';

function runGenerate(enabled: boolean, files: string[]) {
  const plugin = pwaPlugin(enabled, '1.0.0');
  const emitFile = vi.fn();
  const bundle = Object.fromEntries(files.map((f) => [f, {}]));
  (plugin.generateBundle as unknown as (this: unknown, o: unknown, b: unknown) => void).call(
    { emitFile },
    {},
    bundle,
  );
  return emitFile;
}

describe('pwa plugin', () => {
  it('emits a service worker that precaches the bundle and the public files', () => {
    const emit = runGenerate(true, ['assets/index-abc.js', 'assets/index-def.css', 'x.js.map']);
    expect(emit).toHaveBeenCalledOnce();
    const file = emit.mock.calls[0]![0] as { fileName: string; source: string };
    expect(file.fileName).toBe('sw.js');
    expect(file.source).toContain('"assets/index-abc.js"');
    expect(file.source).not.toContain('x.js.map');
    for (const f of PUBLIC_PRECACHE) expect(file.source).toContain(JSON.stringify(f));
  });

  it('names the cache after the build, so a new build replaces the old cache', () => {
    const a = runGenerate(true, ['assets/index-1.js']).mock.calls[0]![0].source as string;
    const b = runGenerate(true, ['assets/index-2.js']).mock.calls[0]![0].source as string;
    const cache = (s: string) => /const CACHE = "([^"]+)"/.exec(s)![1];
    expect(cache(a)).not.toBe(cache(b));
    expect(cache(a)).toMatch(/^tidepool-1\.0\.0-/);
  });

  it('does nothing for non-PWA targets', () => {
    expect(runGenerate(false, ['a.js'])).not.toHaveBeenCalled();
    const html = (pwaPlugin(false, '1').transformIndexHtml as unknown as () => unknown[])();
    expect(html).toEqual([]);
    const pwaHtml = (
      pwaPlugin(true, '1').transformIndexHtml as unknown as () => { attrs: object }[]
    )();
    expect(pwaHtml.map((t) => t.attrs)).toContainEqual({
      rel: 'manifest',
      href: 'manifest.webmanifest',
    });
  });

  it('writes a worker that only handles same-origin GETs and waits for skipWaiting', () => {
    const src = serviceWorkerSource('c', ['./']);
    expect(src).toContain("request.method !== 'GET'");
    expect(src).toContain("event.data === 'skipWaiting'");
    // Servers send Vary: Origin; module script requests carry Origin, the precache didn't.
    expect(src).toContain('ignoreVary: true');
    expect(src).not.toMatch(/self\.skipWaiting\(\);\s*\}\);\s*self\.addEventListener\('activate'/);
  });
});
