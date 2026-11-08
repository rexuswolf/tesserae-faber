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
  const errors = await open(page, "/botc?admin");
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
  const errors = await open(page, "/botc?admin");
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
  const errors = await open(page, "/botc?admin");
  await pick(page, 1, '#rows [data-pick^="c:"]');
  const key = await page.locator('#rows [data-pick^="c:"]').first().getAttribute("data-pick");
  await page.evaluate((k) => { const mm = (window as unknown as { __mm: { goStep(n: number): void; designToken(k: string): void } }).__mm; mm.goStep(2); mm.designToken(k!); }, key);
  const frames = page.locator('[data-choice="frame"] [data-v]');
  await expect(async () => {
    await page.locator('#parts [data-face="frame"]').evaluate((b) => (b as HTMLElement).click());
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
  const errors = await open(page, "/botc?admin");
  await page.locator('[data-lang="es"]').first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  expect(errors).toEqual([]);
});

test("a change redraws everything that shows it", async ({ page }) => {
  const errors = await open(page, "/botc?admin");
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
    c.sections[0].catalogs = [{ id: "k1", name: "Peanas", tokens: c.tokens.map((t) => t.id) }];
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

test("cards with a back: the Senate's laws to the Bambu project and the paper, both sides", async ({ page }) => {
  const errors = await open(page, "/c/senado");
  await page.locator('[data-ed="t:leyes"]').first().evaluate((b) => (b as HTMLElement).click());
  await pick(page, 2);
  await next(page); await next(page);
  for (const [way, ext] of [["3d", /\.3mf$/], ["paper", /\.pdf$/]] as const) {
    await expect(async () => {
      await page.locator(`#printPage [data-way="${way}"]`).click();
      await expect(page.locator(`#printPage [data-way="${way}"]`)).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
    }).toPass();
    await expect(page.locator("#flowNext")).toBeEnabled();
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await next(page);
    const file = await download;
    expect(file.suggestedFilename()).toMatch(ext);
    if (way === "3d") {
      // each law has its icon beside its phrase, and its back under it: the Senate's name and a laurel
      // crown (backIcon), the laurels (backFrame); the laws are all one colour, so no plate of another (back)
      const zip = await (await import("jszip")).default.loadAsync(await (await import("node:fs/promises")).readFile((await file.path())!));
      const config = await zip.file("Metadata/model_settings.config")!.async("string");
      for (const part of ["icon", "backIcon", "backFrame"]) expect(config.match(new RegExp(`value="${part}"`, "g"))?.length, part).toBe(2);
      expect(config).not.toMatch(/value="back"/);
    }
  }
  expect(errors).toEqual([]);
});

test("the front page walks through the app: its chapters draw as they come near, and answer", async ({ page }) => {
  const errors = await open(page, "/");
  await page.locator("[data-tour-go]").first().click();
  await expect(page.locator("#tourCovers .tour-cover")).toHaveCount(3);
  await expect(page.locator("#tourShapes figure svg")).toHaveCount(4);
  await page.locator("#tourDesign").scrollIntoViewIfNeeded();
  const token = page.locator("#tourDesigned svg");
  await expect(token).toBeAttached();
  const before = await token.innerHTML();
  await page.locator("#tourOpts [data-v='window']").click();
  await expect.poll(() => token.innerHTML()).not.toBe(before);
  const turn = page.locator(".tour-turn").first();
  await turn.click();
  await expect(turn).toHaveAttribute("aria-pressed", "true");
  await page.locator("#tourSheets").scrollIntoViewIfNeeded();
  await expect(page.locator("#tourSheets .tour-sheet").last().locator("svg")).toHaveCount(9);
  await expect(page.locator("#tourLegend li")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("designing, simply: the token's designs a tap away, the fine changes folded until asked for", async ({ page }) => {
  const errors = await open(page, "/c/senado");
  await pick(page, 1, '#rows [data-pick^="c:"]');
  await next(page);
  const quick = page.locator("#styleQuick [data-dq-pick]");
  await expect(quick.nth(1)).toBeVisible();
  await expect(page.locator("#parts")).toBeHidden();
  const other = page.locator("#styleQuick [data-dq-pick][aria-pressed=false]").first(), name = (await other.getAttribute("title"))!;
  await other.click();
  await expect(page.locator("#styleName")).toContainText(name);
  await page.locator("#tweakToggle").click();
  await expect(page.locator("#parts")).toBeVisible();
  // printing asks how first
  await next(page);
  await expect(page.locator("#flowNext")).toBeDisabled();
  await page.locator('#printPage [data-way="paper"]').click();
  await expect(page.locator("#flowNext")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a token first: the front page's maker carries its name to a new token, in a collection made for it, used again after", async ({ page }) => {
  const errors = await open(page, "/");
  await page.locator("#tourName").fill("Dragón rojo");
  await page.locator("[data-tok-new=maker]").evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/\/c\//);
  await expect(page.locator("#tokenPanel")).toHaveAttribute("open", "", { timeout: 30_000 });
  await expect(page.locator("#ownTokName")).toHaveValue("Dragón rojo");
  expect(new URL(page.url()).search).toBe("");   // a reload doesn't open it again
  const first = new URL(page.url()).pathname;
  await page.goto("/");
  await page.locator(".ol-cta [data-tok-new]").first().evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/\/c\//);
  await expect(page.locator("#tokenPanel")).toHaveAttribute("open", "", { timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe(first);
  expect(errors).toEqual([]);
});

test("what a token shows is the token's: chosen when made, kept, and the design step leaves it be", async ({ page }) => {
  const errors = await open(page, "/");
  await page.locator("#tourName").fill("Lobo");
  await page.locator("[data-tok-new=maker]").evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/\/c\//);
  await expect(page.locator("#tokenPanel")).toHaveAttribute("open", "", { timeout: 30_000 });
  await page.locator("[data-content=text]").click();
  await expect(page.locator("#ownTokIconRow")).toBeHidden();
  await page.locator("[data-content=icon]").click();
  await expect(page.locator("#ownTokNameHint")).toBeVisible();
  await page.locator("#tpDone").click();
  await expect(page.locator("#tokenPanel")).not.toHaveAttribute("open", "");
  await page.locator("[data-own-edit]").first().click();
  await expect(page.locator("[data-content=icon]")).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
});
