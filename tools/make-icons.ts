/**
 * Renders the app icons (PWA manifest, Apple touch icon) into public/icons with headless
 * Chromium: four sea-glass blocks on water. Run once after changing the design:
 *   npx tsx tools/make-icons.ts
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

const draw = `(size, maskable) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#CDEBF2');
  bg.addColorStop(1, '#26808C');
  const r = maskable ? 0 : size * 0.22;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  // Maskable icons keep their content inside the central 80% safe zone.
  const area = size * (maskable ? 0.52 : 0.62);
  const cell = area / 2;
  const x0 = (size - area) / 2;
  const colors = ['#7FD8BE', '#4FC3E8', '#FF8A80', '#F2C66D'];
  colors.forEach((color, i) => {
    const x = x0 + (i % 2) * cell + cell * 0.06;
    const y = x0 + Math.floor(i / 2) * cell + cell * 0.06;
    const s = cell * 0.88;
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.25, color);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, s * 0.22);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.32, y + s * 0.26, s * 0.24, s * 0.11, -0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  return c.toDataURL('image/png');
}`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  const url = (await page.evaluate(`(${draw})(${icon.size}, ${icon.maskable})`)) as string;
  writeFileSync(`public/icons/${icon.file}`, Buffer.from(url.split(',')[1]!, 'base64'));
  console.log(`public/icons/${icon.file}`);
}
await browser.close();
