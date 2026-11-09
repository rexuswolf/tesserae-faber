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

test("Clocktower: pick characters, design one from its row, print them on paper", async ({ page }) => {
  const errors = await open(page, "/botc?admin");
  await pick(page, 3, '#rows [data-pick^="c:"]');
  await page.locator("#rows [data-design-row]").first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator("#app")).toHaveAttribute("data-step", "2");
  await next(page);
  await expect(page.locator("#app")).toHaveAttribute("data-step", "3");
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
  await next(page);
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
    await page.locator('#parts [data-part="front"]').evaluate((b) => (b as HTMLElement).click());
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
  await page.locator("[data-tw-templates]").click();
  await page.locator("[data-tw-pick]").first().evaluate((b) => (b as HTMLElement).click());
  await page.locator("[data-tw-go]").first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-taller-act="delete"]')).toBeVisible();
  await page.locator('[data-taller-act="copy"]').click();
  await page.locator('[data-taller-act="mine"]').click();
  // the design and its copy (each listed in more than one place)
  await expect.poll(() => page.locator("[data-taller-open]").evaluateAll((l) => new Set(l.map((b) => b.getAttribute("data-ref"))).size)).toBe(2);
  // a new one from one of yours: yours are among the templates, first, and starting from one copies it
  await page.locator('[data-tw-shape="coin"]').click();
  await page.locator("[data-tw-templates]").click();
  await page.locator('[data-tw-pick^="m:"]').first().evaluate((b) => (b as HTMLElement).click());
  await page.locator("[data-tw-go]").first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator("#tallerName")).toHaveValue(/^(Copia de|Copy of) /);
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

test("a token's back is changed like its front: a two-state token's other state, back to the front's look, plain behind the rest, and its pattern", async ({ page }) => {
  const errors = await open(page, "/c/drawsteel?admin");
  const design = (k: string) => page.evaluate((key) => { const mm = (window as unknown as { __mm: { goStep(n: number): void; designToken(k: string): void } }).__mm; mm.goStep(2); mm.designToken(key); }, k);
  // a click, again until what it brings shows (the sheet may draw itself again meanwhile)
  const step = (s: string, then: () => Promise<void>) => expect(async () => {
    await page.locator(s).first().evaluate((b) => (b as HTMLElement).click());
    await then();
  }).toPass();
  const seen = (s: string) => () => expect(page.locator(s)).toBeVisible({ timeout: 1000 });
  await design("c:ready");   // Ready, Acted when turned over
  await step('.cr-item[data-cr="part"]', seen("#parts"));   // Customise
  await step('#parts [data-part="back"]', seen("#faceTabs"));
  // the design's back, the edition in gold: its other state in gold too, changed from the front
  await step('#faceTabs [data-face="layout"]', seen("#faceTabs [data-back-same]"));
  await step("#faceTabs [data-back-same]", () => expect(page.locator("#faceTabs [data-back-same]")).toHaveCount(0, { timeout: 1000 }));
  await step('[data-choice="style"] [data-v][aria-pressed="false"]', seen("#faceTabs [data-back-same]"));
  // what one-state tokens' backs say and show isn't this token's: its Composition doesn't offer it
  await expect(page.locator("#backSayBox")).toBeHidden();
  // a token without another state, its back plain: its tabs say so, and something can go on it
  await design("c:recovery");
  await step('#faceTabs [data-face="layout"]', seen('[data-choice="style"] [data-v="plain"]'));
  await step('[data-choice="style"] [data-v="plain"]', () => expect(page.locator('[data-choice="style"] [data-v="plain"]')).toHaveAttribute("aria-pressed", "true", { timeout: 1000 }));
  await step('#faceTabs [data-face="frame"]', seen("#backNote [data-back-face]"));
  await step("#backNote [data-back-face]", () => expect(page.locator("#backNote [data-back-face]")).toHaveCount(0, { timeout: 1000 }));
  await step('#faceTabs [data-face="layout"]', () => expect(page.locator('[data-choice="style"] [data-v="plain"]')).toHaveAttribute("aria-pressed", "false", { timeout: 1000 }));
  // its pattern, the back's whatever it carries
  await step('#faceTabs [data-face="pattern"]', seen('[data-pat-side="back"] [data-pat-choice]'));
  expect(errors).toEqual([]);
});

test("a token's back says words of its own, shows its icon, has an illustration behind, and its layout follows", async ({ page }) => {
  const errors = await open(page, "/c/drawsteel?admin");
  await page.evaluate((key) => { const mm = (window as unknown as { __mm: { goStep(n: number): void; designToken(k: string): void } }).__mm; mm.goStep(2); mm.designToken(key); }, "c:recovery");
  const step = (s: string, then: () => Promise<void>) => expect(async () => {
    await page.locator(s).first().evaluate((b) => (b as HTMLElement).click());
    await then();
  }).toPass();
  const seen = (s: string) => () => expect(page.locator(s)).toBeVisible({ timeout: 1000 });
  const pressed = (s: string) => () => expect(page.locator(s)).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  await step('.cr-item[data-cr="part"]', seen("#parts"));
  await step('#parts [data-part="back"]', seen("#faceTabs"));
  // the design's back was the edition's name: words alone, in the text layout
  await step('#faceTabs [data-face="layout"]', pressed('#backSay [data-v="edition"]'));
  await step('#backSay [data-v="phrase"]', seen("#backPhrase"));
  await page.locator("#backPhrase").fill("Recursos compartidos");
  await expect(page.locator("#backPhrase")).toHaveValue("Recursos compartidos");
  await step('#faceTabs [data-face="layout"]', pressed('[data-choice="style"] [data-v="text"]'));
  // an illustration behind (its Background), the sun: one drawing filling what the frame leaves
  await step('#faceTabs [data-face="pattern"]', seen('[data-pat-side="back"] [data-pat="ill-sol"]'));
  await step('[data-pat-side="back"] [data-pat="ill-sol"]', pressed('[data-pat-side="back"] [data-pat="ill-sol"]'));
  // its icon: the layout has both again; the icon alone keeps the words for later
  await step('#faceTabs [data-face="layout"]', seen('#backArt [data-v="token"]'));
  await step('#backArt [data-v="token"]', pressed('#backArt [data-v="token"]'));
  // its colour, its own: in Composition's settings, apart from the name's
  await step("#compMore", seen('.metal[data-colour="icon"]'));
  await step('.metal[data-colour="icon"] button[data-v="#ece9e2"]', pressed('.metal[data-colour="icon"] button[data-v="#ece9e2"]'));
  await step('#faceTabs [data-face="layout"]', pressed('[data-choice="style"] [data-v="classic"]'));
  await step('[data-choice="style"] [data-v="solo"]', pressed('[data-choice="style"] [data-v="solo"]'));
  await step('[data-choice="style"] [data-v="classic"]', pressed('[data-choice="style"] [data-v="classic"]'));
  await step('#faceTabs [data-face="layout"]', pressed('#backSay [data-v="phrase"]'));
  await expect(page.locator("#backPhrase")).toHaveValue("Recursos compartidos");
  expect(errors).toEqual([]);
});

test("relief is a section of its own: which face stands out, which of its parts, how high", async ({ page }) => {
  const errors = await open(page, "/c/drawsteel?admin");
  await page.evaluate((key) => { const mm = (window as unknown as { __mm: { goStep(n: number): void; designToken(k: string): void } }).__mm; mm.goStep(2); mm.designToken(key); }, "c:recovery");
  const step = (s: string, then: () => Promise<void>) => expect(async () => {
    await page.locator(s).first().evaluate((b) => (b as HTMLElement).click());
    await then();
  }).toPass();
  const pressed = (s: string, v = "true") => () => expect(page.locator(s)).toHaveAttribute("aria-pressed", v, { timeout: 1000 });
  await step('.cr-item[data-cr="part"]', () => expect(page.locator("#parts")).toBeVisible({ timeout: 1000 }));
  await step('#parts [data-part="relief"]', pressed('[data-relief-face="none"]'));
  await expect(page.locator("#reliefHeightBox")).toBeHidden();
  // the front up: its parts, and the height they stand
  await step('[data-relief-face="front"]', pressed('[data-relief-part="text"]'));
  await expect(page.locator("#reliefHeightBox")).toBeVisible();
  await step('[data-relief-part="frame"]', pressed('[data-relief-part="frame"]', "false"));
  // the back up instead: the front flush, what stood out carried over (the back's words alone: no icon to raise)
  await step('[data-relief-face="back"]', pressed('[data-relief-face="back"]'));
  await expect(page.locator('[data-relief-part="icon"]')).toHaveCount(0);
  await expect(page.locator('[data-relief-part="frame"]')).toHaveAttribute("aria-pressed", "false");
  await step('[data-relief-face="none"]', () => expect(page.locator("#reliefPartsBox")).toBeHidden({ timeout: 1000 }));
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

test("designing, as a creator: Design and the parts under it; customised, another design asks first", async ({ page }) => {
  const errors = await open(page, "/c/senado");
  await pick(page, 1, '#rows [data-pick^="c:"]');
  await page.locator("#rows [data-design-row]").first().evaluate((b) => (b as HTMLElement).click());
  // the designs, a list; the parts in sight under it, none lit while Design is open
  const designs = page.locator("#crDesigns [data-cr-pick]");
  await expect(designs.nth(1)).toBeVisible();
  await expect(page.locator("#parts")).toBeVisible();
  // another design: the list may still be drawing itself for the token (another shape's designs a moment before), so
  // take one, choose it, and see it chosen, until it takes
  await expect(async () => {
    const name = (await page.locator("#crDesigns [data-cr-pick][aria-selected=false]").first().getAttribute("data-name", { timeout: 1000 }))!;
    await page.locator(`#crDesigns [data-cr-pick][data-name="${name}"]`).click({ timeout: 1000 });
    await expect(page.locator("#crValDesign")).toHaveText(name, { timeout: 1000 });
  }).toPass();
  // a change of its own: Customised, with its two actions
  await page.locator('#parts [data-part="body"]').click();   // the card's colour, in Card
  await page.locator('[data-panel="body"] .metal[data-colour="base"] button[aria-pressed=false]').first().click();
  await expect(page.locator("#crActs")).toBeVisible();
  await page.locator('.cr-item[data-cr="design"]').click();
  await expect(page.locator("#crDesigns [data-cr-mine]")).toHaveAttribute("aria-selected", "true");
  // another design drops the changes: it asks, and Cancel keeps them
  await page.locator("#crDesigns [data-cr-pick]:not([data-on])").first().click();
  await page.locator('#crDesigns [data-cr-ask=""]').click();
  await expect(page.locator("#crActs")).toBeVisible();
  await page.locator("#crDesigns [data-cr-pick]:not([data-on])").first().click();
  await page.locator('#crDesigns [data-cr-ask="go"]').click();
  await expect(page.locator("#crActs")).toBeHidden();
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
  // an icon of its own (an SVG of yours: no waiting on game-icons.net), so it can do without its name
  await page.locator("#ownTokSvg").setInputFiles({ name: "wolf.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg>') });
  await expect(page.locator("#ownTokChip [data-icon-none]")).toBeVisible();
  // its name not printed: its icon alone
  await page.locator("#ownTokPrint").uncheck();
  await expect(page.locator("#ownTokNameHint")).toBeVisible();
  // its icon removed: its name alone, which then has to print
  await page.locator("#ownTokChip [data-icon-none]").click();
  await expect(page.locator("#ownTokPrint")).toBeChecked();
  await expect(page.locator("#ownTokPrint")).toBeDisabled();
  await page.locator("#tpDone").click();
  await expect(page.locator("#tokenPanel")).not.toHaveAttribute("open", "");
  await page.locator("[data-own-edit]").first().click();
  await expect(page.locator("#ownTokPrint")).toBeChecked();
  await expect(page.locator("#ownTokChip [data-icon-none]")).toHaveCount(0);   // no icon now
  expect(errors).toEqual([]);
});

test("a token of yours is changed where it's designed: each face's Composition has what it carries, the token beside it", async ({ page }) => {
  const errors = await open(page, "/");
  await page.locator("#tourName").fill("Lobo");
  await page.locator("[data-tok-new=maker]").evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/\/c\//);
  await expect(page.locator("#tokenPanel")).toHaveAttribute("open", "", { timeout: 30_000 });
  // an icon of its own (an SVG of yours: no waiting on game-icons.net), so it can be its icon alone
  await page.locator("#ownTokSvg").setInputFiles({ name: "wolf.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg>') });
  await expect(page.locator("#ownTokChip [data-icon-none]")).toBeVisible();
  await page.locator("#tpDone").click();
  const id = await page.locator("[data-own-edit]").first().getAttribute("data-own-edit");
  await page.evaluate((key) => { const mm = (window as unknown as { __mm: { goStep(n: number): void; designToken(k: string): void } }).__mm; mm.goStep(2); mm.designToken(key); }, `c:${id}`);
  // a click on what's there now (the tabs redraw a frame later: a click on the old ones is lost), until it takes
  const go = (s: string, then?: () => Promise<void>) => expect(async () => {
    await page.locator(s).first().evaluate((b) => (b as HTMLElement).click());
    if (then) await then();
  }).toPass();
  const on = (s: string) => () => expect(page.locator(s)).toHaveAttribute("aria-selected", "true", { timeout: 1000 });
  await go('.cr-item[data-cr="part"]');
  await go('#parts [data-part="front"]', on('#parts [data-part="front"]'));
  // no dialog: its front's text and icon are in the front's Composition
  await expect(page.locator("#crOwn #ownTokText")).toBeVisible();
  await expect(page.locator("#crOwn #ownTokName")).toBeHidden();
  await expect(page.locator("#tokenPanel")).not.toHaveAttribute("open", "");
  await page.locator("#crOwn #ownTokText").fill("LOBO GRIS");
  // its back's: another state with its own text
  await go('#parts [data-part="back"]', on('#parts [data-part="back"]'));
  await go('#faceTabs [data-face="layout"]', on('#faceTabs [data-face="layout"]'));
  await expect(page.locator("#ownTokFlipName")).toHaveValue("");
  await page.locator("#ownTokFlipName").fill("Lobo herido");
  await expect(page.locator("#ownTokFlipName")).toHaveValue("Lobo herido");
  // its front's layouts are what it carries: Symbol only makes it its icon alone, and back to both
  await go('#parts [data-part="front"]', on('#parts [data-part="front"]'));
  await go('#faceTabs [data-face="layout"]', on('#faceTabs [data-face="layout"]'));
  await page.locator('[data-choice="style"] [data-v="solo"]').click();
  await expect(page.locator('[data-choice="style"] [data-v="solo"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ownTokPrint")).not.toBeChecked();   // its text not printed
  await page.locator('[data-choice="style"] [data-v="classic"]').click();
  await expect(page.locator('[data-choice="style"] [data-v="classic"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ownTokPrint")).toBeChecked();
  expect(errors).toEqual([]);
});
