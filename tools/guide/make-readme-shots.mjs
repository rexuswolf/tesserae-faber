// Takes the README's pictures that show the app (docs/screenshots/): the design step, the queue,
// the back designs and the phone views, from the UI test server
// (npx vite --config tools/ui-test/vite.config.js, port 5198), in English.
//
// Needs playwright-core and its Chromium; point PLAYWRIGHT at the module and CHROME at the
// browser if they aren't installed here:
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs CHROME=/path/to/chrome node tools/guide/make-readme-shots.mjs
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright-core");
const out = fileURLToPath(new URL("../../docs/screenshots/", import.meta.url));
const BASE = "http://localhost:5198/";
const PICKS = [["c:chef", 2], ["c:empath", 1], ["c:fortune_teller", 1], ["c:poisoner", 1], ["r:poisoner:0", 1], ["c:imp", 1], ["r:imp:0", 1]];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

/** A page on the app in English, on Trouble Brewing, with the picks above and the default design. */
async function app(viewport, scale) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  await page.goto(BASE); await page.waitForTimeout(3000);
  await page.evaluate((picks) => {
    for (const k of ["midnight-mint-style", "midnight-mint-overrides"]) localStorage.removeItem(k);
    localStorage.setItem("midnight-mint-lang", "en");
    localStorage.setItem("midnight-mint-token-lang", "en");
    localStorage.setItem("midnight-mint-guide-seen", "1");
    localStorage.setItem("midnight-mint-picks", JSON.stringify(picks));
    localStorage.setItem("midnight-mint-view", JSON.stringify({ edition: "tb", team: "all" }));
  }, PICKS);
  await page.reload(); await page.waitForTimeout(6000);
  return page;
}
const save = async (page, name, el) => { await page.mouse.move(2, 2); await page.waitForTimeout(400); await (el ? (await page.$(el)).screenshot({ path: out + name }) : page.screenshot({ path: out + name })); console.log("wrote", name); };

// desktop: the design step, then the queue drawer
{
  const page = await app({ width: 1440, height: 900 }, 1);
  await page.evaluate(() => { window.__mm.goStep(2); window.__mm.designToken("c:imp"); });
  await page.click('.scope [data-tab="set"]'); await page.waitForTimeout(2500);
  await save(page, "app.png");
  await page.close();
}
{
  const page = await app({ width: 1300, height: 900 }, 2);
  await page.click("#queueToggle"); await page.waitForTimeout(800);
  await save(page, "queue-list.png", "#queueDrawer");
  await page.close();
}
// the back designs, on an ivory coin in bronze
{
  const page = await browser.newPage({ viewport: { width: 2000, height: 300 } });
  await page.goto(BASE + "tools/ui-test/blank.html").catch(() => {});
  await page.setContent(`<body style="margin:0;background:#1b0b18;display:flex;gap:12px;padding:16px;width:max-content" id="b"></body>`);
  await page.addScriptTag({ type: "module", content: `
    import { loadLibrary, tokenSvg, DEFAULT_SPEC, BACK_STYLES, FILAMENTS } from "${BASE}src/engine/token-engine.ts";
    import { firestoreRoles } from "${BASE}tools/ui-test/mock-roles.js";
    const lib = await loadLibrary(await firestoreRoles.list(), { assetBase: "${BASE}" });
    const role = lib.roles.find((r) => r.en === "Washerwoman");
    const spec = { ...DEFAULT_SPEC, lang: "en", frame: "none", colours: { ...DEFAULT_SPEC.colours, base: FILAMENTS.white, back: FILAMENTS.bronze } };
    document.body.innerHTML = BACK_STYLES.filter((b) => !["custom", "seal"].includes(b.id)).map((b) => tokenSvg(lib, role, { ...spec, back: b.id }, { side: "back" }).replace("<svg ", '<svg width="220" height="220" ')).join("");
    document.body.dataset.done = "1";` });
  await page.waitForSelector("body[data-done]", { timeout: 30000 });
  await page.setViewportSize({ width: 2000, height: 252 });   // the coins and their margin
  await save(page, "back-designs.png", "body");
  await page.close();
}
// phone: the sheet, and its menu
{
  const page = await app({ width: 390, height: 844 }, 2.5);
  await save(page, "mobile.png");
  await page.click("#drawerOpen"); await page.waitForTimeout(800);
  await save(page, "mobile-menu.png");
  await page.close();
}
await browser.close();
