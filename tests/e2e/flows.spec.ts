import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// The app's main flows, end to end, failing on any page error along the way.
async function open(page: Page, path: string) {
  const errors: string[] = [];
  // a view transition cut short by navigating on is the browser's notice, not the app's error
  page.on("pageerror", (e) => { if (!/^Transition was (aborted|skipped)/.test(e.message)) errors.push(e.message); });
  await page.addInitScript(() => { try { localStorage.setItem("tesserae-styles-tidied-2", "1"); localStorage.setItem("tesserae-peek-hint-row", "1"); } catch { /* blocked */ } });
  await page.goto(path);
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  return errors;
}
/** Picks the sheet's first `n` tokens. */
async function pick(page: Page, n: number, which = "#rows [data-pick]") {
  const picked = page.locator(`${which}[aria-pressed="true"]`);
  await expect(page.locator(which).nth(n - 1)).toBeAttached();
  for (let i = 0; i < n; i++) {
    // the sheet may draw itself again meanwhile: click until the pick shows
    await expect(async () => {
      await page.locator(`${which}[aria-pressed="false"]`).first().evaluate((b) => (b as HTMLElement).click());
      await expect(picked).toHaveCount(i + 1, { timeout: 1000 });
    }).toPass();
  }
}
const next = (page: Page) => page.locator("#flowNext").evaluate((b) => (b as HTMLElement).click());

test("Clocktower: pick characters, see them designed, print them on paper", async ({ page }) => {
  const errors = await open(page, "/botc");
  await pick(page, 3, '#rows [data-pick^="c:"]');
  await next(page);
  await expect(page.locator("#app")).toHaveAttribute("data-step", "2");
  await next(page);
  // the way chosen and the button ready before asking for the file
  await expect(async () => {
    await page.locator('#printPage [data-way="paper"]').click();
    await expect(page.locator('#printPage [data-way="paper"]')).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
  }).toPass();
  await expect(page.locator("#flowNext")).toBeEnabled();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await next(page);
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  expect(errors).toEqual([]);
});

test("printing in 3D: the Bambu project", async ({ page }) => {
  const errors = await open(page, "/botc");
  await pick(page, 2, '#rows [data-pick^="c:"]');
  await next(page); await next(page);
  // the way chosen and the button ready before asking for the file
  await expect(async () => {
    await page.locator('#printPage [data-way="3d"]').click();
    await expect(page.locator('#printPage [data-way="3d"]')).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
  }).toPass();
  await expect(page.locator("#flowNext")).toBeEnabled();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await next(page);
  expect((await download).suggestedFilename()).toMatch(/\.3mf$/);
  expect(errors).toEqual([]);
});

test("designing a token: another frame changes its preview", async ({ page }) => {
  const errors = await open(page, "/botc");
  await pick(page, 1, '#rows [data-pick^="c:"]');
  const key = await page.locator('#rows [data-pick^="c:"]').first().getAttribute("data-pick");
  await page.evaluate((k) => { const mm = (window as unknown as { __mm: { goStep(n: number): void; designToken(k: string): void } }).__mm; mm.goStep(2); mm.designToken(k!); }, key);
  const frames = page.locator('[data-choice="frame"] [data-v]');
  await expect(async () => {
    await page.locator('#faceTabs [data-face="frame"]').evaluate((b) => (b as HTMLElement).click());
    await expect(frames.first()).toBeAttached({ timeout: 1000 });
  }).toPass();
  const before = await page.locator("#workshop svg[aria-label$='token']").first().innerHTML();
  const other = page.locator('[data-choice="frame"] [data-v][aria-pressed="false"]').first();
  await other.evaluate((b) => (b as HTMLElement).click());
  await expect.poll(() => page.locator("#workshop svg[aria-label$='token']").first().innerHTML()).not.toBe(before);
  expect(errors).toEqual([]);
});

test("the Taller: start a design of your own from one of the app's, and duplicate it", async ({ page }) => {
  const errors = await open(page, "/taller");
  await page.locator('[data-tw-shape="coin"]').click();
  await page.locator("[data-tw-pick]").first().evaluate((b) => (b as HTMLElement).click());
  await page.locator("[data-tw-go]").first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-taller-act="delete"]')).toBeVisible();
  await page.locator('[data-taller-act="copy"]').click();
  await page.locator('[data-taller-act="mine"]').click();
  // the design and its copy (each listed in more than one place)
  await expect.poll(() => page.locator("[data-taller-open]").evaluateAll((l) => new Set(l.map((b) => b.getAttribute("data-ref"))).size)).toBe(2);
  expect(errors).toEqual([]);
});

test("a collection of your own: make one and export it", async ({ page }) => {
  const errors = await open(page, "/");
  await page.locator("[data-own-new]").first().evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/\/c\//);
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  const download = page.waitForEvent("download");
  await page.locator('[data-coll="export"]').first().evaluate((b) => (b as HTMLElement).click());
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const data = JSON.parse(await (await import("node:fs/promises")).readFile((await file.path())!, "utf8"));
  expect(data.format).toBe("midnight-mint/collection");
  expect(errors).toEqual([]);
});

test("switching the interface to Spanish", async ({ page }) => {
  const errors = await open(page, "/botc");
  await page.locator('[data-lang="es"]').first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  expect(errors).toEqual([]);
});

test("a change redraws everything that shows it", async ({ page }) => {
  const errors = await open(page, "/botc");
  // picking: the queue's count follows
  const count = () => page.locator("#queueToggle").innerText();
  const before = await count();
  await pick(page, 2, '#rows [data-pick^="c:"]');
  await expect.poll(count).not.toBe(before);
  // the interface in Spanish: the sheet's names follow (tokens print in the interface's language by default)
  const names = () => page.locator('#rows [data-pick^="c:"]').first().getAttribute("aria-label");
  const english = await names();
  await page.locator('[data-lang="es"]').first().evaluate((b) => (b as HTMLElement).click());
  await expect.poll(names).not.toBe(english);
  expect(errors).toEqual([]);
});

test("a collection of bases: the tray in the sheet and the Bambu project", async ({ page }) => {
  const errors = await open(page, "/");
  const id = await page.evaluate(async () => {
    const C = await import("/src/collection.ts");
    const c = C.starterCollection();
    c.types = [{ id: "peanas", name: "Peanas", title: "Peanas", shape: "base", icon: "metal-disc" }];
    c.tokens = ["2", "ORCO 3"].map((n, i) => ({ id: `p${i}`, type: "peanas", group: "g1", name: n, icon: null, linked: [] }));
    c.sections[0].catalogs[0].tokens = c.tokens.map((t) => t.id);
    return C.addCollection(c);
  });
  await page.goto(`/c/${id}`);
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await pick(page, 2);
  await next(page); await next(page);
  await expect(async () => {
    await page.locator('#printPage [data-way="3d"]').click();
    await expect(page.locator('#printPage [data-way="3d"]')).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
  }).toPass();
  await expect(page.locator("#flowNext")).toBeEnabled();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await next(page);
  expect((await download).suggestedFilename()).toMatch(/\.3mf$/);
  expect(errors).toEqual([]);
});
