// Takes the pictures for the "How it works" guide: each of the three steps, in English
// and Spanish, from the UI test server (npx vite --config tools/ui-test/vite.config.js,
// port 5198). Writes public/guide/<lang>-<step>.jpg at 960 × 600.
//
// Needs playwright-core and its Chromium; point PLAYWRIGHT at the module and CHROME at the
// browser if they aren't installed here:
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs CHROME=/path/to/chrome node tools/guide/make-shots.mjs
// Resizing and compressing use macOS's sips.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright-core");
const out = fileURLToPath(new URL("../../public/guide/", import.meta.url));
fs.mkdirSync(out, { recursive: true });
const BASE = "http://localhost:5198/";
const PICKS = [["c:chef", 2], ["c:empath", 1], ["c:fortune_teller", 1], ["c:poisoner", 1], ["c:imp", 1], ["r:imp:0", 1], ["r:poisoner:0", 1]];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const lang of ["en", "es"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE); await page.waitForTimeout(4000);
  await page.evaluate(([lang, picks]) => {
    for (const k of ["midnight-mint-style", "midnight-mint-overrides", "midnight-mint-paper-backs", "midnight-mint-guide-seen"]) localStorage.removeItem(k);
    localStorage.setItem("midnight-mint-guide-seen", "1");
    localStorage.setItem("midnight-mint-lang", lang);
    localStorage.setItem("midnight-mint-token-lang", lang === "es" ? "es" : "en");
    localStorage.setItem("midnight-mint-picks", JSON.stringify(picks));
    localStorage.setItem("midnight-mint-print-way", JSON.stringify("3d"));
    localStorage.setItem("midnight-mint-printer", JSON.stringify("a1"));
    localStorage.setItem("midnight-mint-view", JSON.stringify({ edition: "tb", team: "all" }));   // step 1 on Trouble Brewing
  }, [lang, PICKS]);
  await page.reload(); await page.waitForTimeout(8000);
  const shot = async (step) => {
    const png = `${out}${lang}-${step}.png`, jpg = `${out}${lang}-${step}.jpg`;
    await page.mouse.move(1270, 790);   // no hover effects in the picture
    await page.waitForTimeout(600);
    await page.screenshot({ path: png });
    execFileSync("sips", ["-Z", "960", "-s", "format", "jpeg", "-s", "formatOptions", "72", png, "--out", jpg], { stdio: "ignore" });
    fs.rmSync(png);
    console.log("wrote", jpg, fs.statSync(jpg).size, "bytes");
  };
  await shot(1);
  await page.evaluate(() => { window.__mm.goStep(2); window.__mm.designToken("c:imp"); });
  await page.click('.scope [data-tab="set"]'); await page.waitForTimeout(2500);
  await shot(2);
  await page.evaluate(() => window.__mm.goStep(3)); await page.waitForTimeout(1200);
  await shot(3);
  await page.close();
}
await browser.close();
