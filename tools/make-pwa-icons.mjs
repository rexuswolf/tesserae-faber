// Draws the installed app's icons (public/pwa/) from the Tesserae Faber mark, public/tesserae-faber-icon.svg:
// plain ones (the hexagon on nothing), a maskable one and Apple's (on the app's dark ground, with room around).
//   CHROME=/path/to/chrome node tools/make-pwa-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.env.ROOT ?? path.resolve(import.meta.dirname, "..");   // run from where playwright is installed: ROOT=<repo>
const svg = fs.readFileSync(path.join(root, "public/tesserae-faber-icon.svg"), "utf8");
const GROUND = "#1c1a18";   // the Faber theme's background
const icons = [
  { file: "icon-192.png", size: 192, pad: 0.04, ground: null },
  { file: "icon-512.png", size: 512, pad: 0.04, ground: null },
  { file: "maskable-512.png", size: 512, pad: 0.2, ground: GROUND },   // the safe zone: the middle 80%
  { file: "apple-touch-icon.png", size: 180, pad: 0.14, ground: GROUND },
];
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
for (const { file, size, pad, ground } of icons) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - 2 * pad));
  await page.setContent(`<html><body style="margin:0;background:${ground ?? "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: path.join(root, "public/pwa", file), omitBackground: !ground });
  console.log(`wrote public/pwa/${file}`);
}
await browser.close();
