/**
 * Screenshots a page in headless Chromium, for visual review of rendering work.
 *   npm run screenshot -- <url> <out.png> [width=390] [height=844] [dpr=2]
 * Prints any page errors; exits non-zero if there were some.
 */
import { chromium } from '@playwright/test';

const [url, out, w = '390', h = '844', dpr = '2'] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: npm run screenshot -- <url> <out.png> [width] [height] [dpr]');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: Number(dpr),
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(url);
await page.waitForTimeout(600);
await page.screenshot({ path: out });
await browser.close();

if (errors.length) console.error(`Page errors:\n${errors.join('\n')}`);
else console.log(`Saved ${out}`);
process.exit(errors.length ? 1 : 0);
