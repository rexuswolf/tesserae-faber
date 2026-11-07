// Saves the generic creator's front-page art (tools/make-crear-art/, drawn by the app's engine)
// into public/: crear-hero.svg, collections/botc-preview.svg, collections/drawsteel-preview.svg and
// collections/srd5e-preview.svg. Needs the UI test server on port 5198, or the one in PORT
// (npx vite --config tools/ui-test/vite.config.js --port 5198) and Playwright:
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs CHROME=/path/to/chrome node tools/make-crear-art.mjs
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright-core");
const root = path.resolve(import.meta.dirname, "..");
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
await page.goto(`http://localhost:${process.env.PORT ?? 5198}/tools/make-crear-art/`);
await page.waitForSelector("body[data-done]", { timeout: 60000 });
const art = await page.evaluate(() => window.__art);
// two decimals are plenty at these sizes (a token's coordinates are in mm), and lighter
// (always with its point: in compact path data "10.5" after "10" would read as one number)
const slim = (svg) => svg.replace(/-?\d+\.\d{3,}/g, (n) => (+n).toFixed(2).replace(/(\.\d)0$/, "$1"));
const hero = slim(art.hero), strip = slim(art.strip), ds = slim(art.dsStrip), srd = slim(art.srdStrip);
fs.writeFileSync(path.join(root, "public/collections/drawsteel-preview.svg"), ds + "\n");
fs.writeFileSync(path.join(root, "public/collections/srd5e-preview.svg"), srd + "\n");
fs.writeFileSync(path.join(root, "public/crear-hero.svg"), hero + "\n");
fs.writeFileSync(path.join(root, "public/collections/botc-preview.svg"), strip + "\n");
console.log(`wrote public/crear-hero.svg (${(hero.length / 1024).toFixed(0)} KB), public/collections/botc-preview.svg (${(strip.length / 1024).toFixed(0)} KB)`);
await browser.close();
