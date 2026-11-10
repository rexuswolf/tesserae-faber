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

test("the address says the step: ?disenar=<the token>, ?imprimir; Back goes back a step, and a reload stays", async ({ page }) => {
  const errors = await open(page, "/botc?admin");
  await pick(page, 2, '#rows [data-pick^="c:"]');
  await page.locator("#rows [data-design-row]").first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator("#app")).toHaveAttribute("data-step", "2");
  // the token being redesigned, in the address; another one replaces it there (not a step more)
  await expect(page).toHaveURL(/\/botc\?admin&disenar=c:[\w-]+$/);
  const second = await page.locator("#designGrid [data-design]").nth(1).getAttribute("data-design");
  await page.locator("#designGrid [data-design]").nth(1).evaluate((b) => (b as HTMLElement).click());
  await expect(page).toHaveURL(new RegExp(`disenar=${second}$`));
  await next(page);
  await expect(page.locator("#app")).toHaveAttribute("data-step", "3");
  await expect(page).toHaveURL(/\/botc\?admin&imprimir$/);
  await page.goBack();
  await expect(page.locator("#app")).toHaveAttribute("data-step", "2");
  await page.reload();
  await expect(page.locator("#app")).toHaveAttribute("data-step", "2", { timeout: 30_000 });
  await expect(page.locator(`#designGrid [data-design="${second}"]`)).toHaveAttribute("aria-current", "true");
  await page.goBack();
  await expect(page.locator("#app")).toHaveAttribute("data-step", "1");
  await expect(page).toHaveURL(/\/botc\?admin$/);
  expect(errors).toEqual([]);
});

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

test("Clocktower, as a collection: everything, its coins and cards, then the scripts (its editions locked, then yours)", async ({ page }) => {
  const errors = await open(page, "/botc?admin");
  await expect(page.locator('#library [data-ed="all"]')).toBeVisible();
  await expect(page.locator('#library [data-ed="f:coin"]')).toBeVisible();
  await expect(page.locator('#library [data-ed="grimoire"]')).toBeVisible();
  await expect(page.locator("#spine .spine-sec h2").filter({ visible: true })).toHaveText(["Scripts"]);
  await expect(page.locator("#editions .ed .list-lock").first()).toBeVisible();
  // everything: the characters and the grimoire's cards; the coins: the characters alone
  const count = async () => (await page.locator("#rows [data-pick^=\"c:\"]").count());
  await page.locator('#library [data-ed="all"]').click();
  const everything = await count();
  await page.locator('#library [data-ed="f:coin"]').click();
  await expect(page.locator("#edTitle")).toHaveText("Tokens");   // the coins: tokens, now that everything is a component
  expect(await count()).toBeLessThan(everything);
  // its own words: reminders; and no copy to make (its library is private)
  await expect(page.locator("#rows").getByText(/\d reminders?$/).first()).toBeVisible();
  await expect(page.locator(".built-copy")).toBeHidden();
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
  expect((await download).suggestedFilename()).toMatch(/^blood-on-the-clocktower-\d+-tokens-.+\.3mf$/);
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
  // the design's back as it comes: nothing changed, nothing to undo; its layout changed, Back is marked and can be undone
  await step('#faceTabs [data-face="layout"]', seen('[data-choice="style"]'));
  await expect(page.locator('#parts [data-part="back"] .part-dot')).toHaveCount(0);
  await expect(page.locator("#partUndo")).toBeHidden();
  await step('[data-choice="style"] [data-v][aria-pressed="false"]', seen('#parts [data-part="back"] .part-dot'));
  await step("#partUndo", () => expect(page.locator('#parts [data-part="back"] .part-dot')).toHaveCount(0, { timeout: 1000 }));
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
  // its colour, its own: in Composition, under its layout, apart from the name's
  await expect(page.locator('.metal[data-colour="icon"]')).toBeVisible();
  await step('.metal[data-colour="icon"] button[data-v="#ece9e2"]', pressed('.metal[data-colour="icon"] button[data-v="#ece9e2"]'));
  // any colour, with the picker: shown as chosen, and which filament it prints in
  const iconColours = page.locator('.metal[data-colour="icon"]:visible');
  await iconColours.locator("input[type=color]").fill("#ff2a8a");
  await expect(iconColours.locator(".pick")).toHaveClass(/\bon\b/);
  await expect(iconColours.locator(".metal-note")).toBeVisible();
  await expect(iconColours.locator('button[aria-pressed="true"]')).toHaveCount(0);
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
    c.tokens = ["2", "ORCO 3"].map((n, i) => ({ id: `p${i}`, shape: "base" as const, group: "g1", name: n, icon: null, linked: [] }));
    c.catalogs = [{ id: "k1", name: "Peanas", tokens: c.tokens.map((t) => t.id) }];
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

test("a collection of pieces: a silhouette, a plain one and a hexagon, to the Bambu project and the paper", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page, "/");
  const id = await page.evaluate(async () => {
    const C = await import("/src/collection.ts"), U = await import("/src/ui-icons.ts");
    const c = C.starterCollection();
    // the last one carried its name alone as a coin once: a piece shows its icon all the same
    c.tokens = ["meeple", "stack", "two-coins"].map((ic, i) => ({ id: `p${i}`, shape: "piece" as const, group: "g1", name: ic, icon: U.uiTokenIcon(ic), linked: [], ...(i === 2 ? { content: "text" as const } : {}) }));
    c.catalogs = [{ id: "k1", name: "Piezas", tokens: c.tokens.map((t) => t.id) }];
    return C.addCollection(c);
  });
  await page.goto(`/c/${id}`);
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await pick(page, 3);
  await next(page);
  // the designer: its Composition has the outlines and the icon on top or not; the hexagon changes the preview
  await page.evaluate(() => (window as unknown as { __mm: { designToken(k: string): void } }).__mm.designToken("p2"));
  // silhouette or shape; a shape shows the shapes
  const kind = (k: string) => page.locator(`#pieceKinds [data-piece-kind="${k}"]`);
  await expect(kind("silhouette")).toBeAttached({ timeout: 10_000 });
  await expect(kind("silhouette")).toBeEnabled();   // it has an icon: its silhouette
  await expect(page.locator('[data-choice="pieceIcon"] [data-v]')).toHaveCount(3);   // on top, top and bottom, none
  await expect(async () => {
    await kind("shape").evaluate((b) => (b as HTMLElement).click());
    await expect(kind("shape")).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
  const hex = page.locator('[data-choice="pieceShape"] [data-v="hexagon"]');
  const before = await page.locator("#workshop svg[aria-label]").first().innerHTML();
  // the tiles may draw themselves again meanwhile: click until the choice takes
  await expect(async () => {
    await hex.evaluate((b) => (b as HTMLElement).click());
    await expect(hex).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
  await expect.poll(() => page.locator("#workshop svg[aria-label]").first().innerHTML()).not.toBe(before);
  await next(page);
  await expect(async () => {
    await page.locator('#printPage [data-way="3d"]').click();
    await expect(page.locator('#printPage [data-way="3d"]')).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
  }).toPass();
  await expect(page.locator("#flowNext")).toBeEnabled();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await next(page);
  expect((await download).suggestedFilename()).toMatch(/\.3mf$/);
  await page.locator('#printPage [data-way="paper"]').click();
  const pdf = page.waitForEvent("download", { timeout: 60_000 });
  await next(page);
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  expect(errors).toEqual([]);
});

test("cards with a back: the Senate's laws to the Bambu project and the paper, both sides", async ({ page }) => {
  const errors = await open(page, "/c/senado");
  await page.locator('[data-ed="f:card"]').first().evaluate((b) => (b as HTMLElement).click());   // its laws: its cards
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
    expect(file.suggestedFilename()).toMatch(/^secret-caesar-/);   // named after its collection
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
  await expect(page.locator("#tourShapes figure svg")).toHaveCount(5);   // coins, cards, rings, bases and pieces
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

/** A token made from the front page's maker: made at once, open where it's designed on its Token tab. Its id. */
async function makeToken(page: Page, name: string) {
  await page.locator("#tourName").fill(name);
  await page.locator("[data-tok-new=maker]").evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/disenar=c%3A|disenar=c:/, { timeout: 30_000 });
  await expect(page.locator("#crTok #ownTokName")).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).searchParams.get("disenar")!.slice(2);
}
/** A click on what's there now (the tabs redraw a frame later: a click on the old ones is lost), until it takes; and a tab that's open. */
function clicks(page: Page) {
  const go = (s: string, then?: () => Promise<void>) => expect(async () => {
    await page.locator(s).first().evaluate((b) => (b as HTMLElement).click());
    if (then) await then();
  }).toPass();
  const on = (s: string) => () => expect(page.locator(s)).toHaveAttribute("aria-selected", "true", { timeout: 1000 });
  return { go, on };
}
const SVG = { name: "wolf.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg>') };

test("a token first: the front page's maker makes it at once, in a collection made for it, open on its Token tab; used again after", async ({ page }) => {
  const errors = await open(page, "/");
  await makeToken(page, "Dragón rojo");
  await expect(page.locator("#crTok #ownTokName")).toHaveValue("Dragón rojo");
  await expect(page.locator('#parts [data-part="token"]')).toHaveAttribute("aria-selected", "true");
  expect(new URL(page.url()).searchParams.has("nueva")).toBe(false);   // a reload doesn't make another
  const first = new URL(page.url()).pathname;
  await page.goto("/");
  await page.locator(".ol-cta [data-tok-new]").first().evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/disenar=/, { timeout: 30_000 });
  await expect(page.locator("#crTok #ownTokName")).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe(first);
  expect(errors).toEqual([]);
});

test("a token of yours is made and changed where it's designed: its Token tab, what it is; the list's pen opens it there; a shape, another like it, or none", async ({ page }) => {
  const errors = await open(page, "/");
  const id = await makeToken(page, "Lobo"), { go, on } = clicks(page);
  // what it is: its name (the lists say it), its shape; not what its faces carry
  await expect(page.locator("#crTok #ownTokText")).toBeHidden();
  await page.locator("#crTok #ownTokName").fill("Lobo gris");
  // the list's pen: back here, on its Token tab
  await page.evaluate(() => (window as unknown as { __mm: { goStep(n: number): void } }).__mm.goStep(1));
  await expect(page.locator(`[data-own-edit="${id}"]`).first()).toBeVisible();
  await expect(page.locator("#rows")).toContainText("Lobo gris");
  await page.locator(`[data-own-edit="${id}"]`).first().click();
  await expect(page.locator('#parts [data-part="token"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#crTok #ownTokName")).toHaveValue("Lobo gris");
  // a card now: its tabs are a card's
  await go('#tpShape [data-shape="card"]', () => expect(page.locator('#tpShape [data-shape="card"]')).toHaveAttribute("aria-checked", "true", { timeout: 1000 }));
  await expect(page.locator('#parts [data-part="back"]')).toBeVisible();
  await expect(page.locator('#parts [data-part="token"]')).toHaveAttribute("aria-selected", "true");   // still on its Token tab
  // another like it: made at once, open here, its name ready to write over
  await page.locator("#ownTokAnother").evaluate((b) => (b as HTMLElement).click());   // (a note at the bottom may lie over it)
  await expect.poll(() => new URL(page.url()).searchParams.get("disenar")).not.toBe(`c:${id}`);
  await expect(page.locator('#tpShape [data-shape="card"]')).toHaveAttribute("aria-checked", "true");
  // and gone: the token before it is open
  page.once("dialog", (d) => void d.accept());
  await page.locator("#ownTokDelete").evaluate((b) => (b as HTMLElement).click());   // (a note at the bottom may lie over it)
  await expect.poll(() => new URL(page.url()).searchParams.get("disenar")).toBe(`c:${id}`);
  await go('#parts [data-part="front"]', on('#parts [data-part="front"]'));
  expect(errors).toEqual([]);
});

test("a new group from a token's Token tab, even the second, is named there at once; its name and colour change there", async ({ page }) => {
  const errors = await open(page, "/");
  await makeToken(page, "Lobo");
  // a new collection has one group: it's there to name, with "+ New group"
  await expect(page.locator("#crTok #ownTokGroupRow")).toBeVisible();
  await expect(page.locator("#ownTokGroups [data-group]")).toHaveCount(1);
  await page.locator("#ownTokGroups [data-group-new]").click();
  const name = page.locator("#ownTokGroupName");
  await expect(name).toBeFocused();
  await page.keyboard.type("Lobos");   // over its stand-in name, selected
  await expect(page.locator('#ownTokGroups [aria-pressed="true"]')).toHaveText("Lobos");
  // the colours are named after their filaments: Yellow and Gold are two
  await expect(page.locator('#ownTokGroupEdit [data-gcolour="#d4a72c"]')).toHaveAttribute("title", "Yellow");
  await expect(page.locator('#ownTokGroupEdit [data-gcolour="#c9a227"]')).toHaveAttribute("title", "Gold");
  await page.locator('#ownTokGroupEdit [data-gcolour="#c9a227"]').click();
  await expect(page.locator('#ownTokGroupEdit [data-gcolour="#c9a227"]')).toHaveAttribute("aria-pressed", "true");
  // emptied, it keeps its name; and it's kept
  await name.fill(""); await name.blur();
  await expect(name).toHaveValue("Lobos");
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("button", { name: /^Component Lobo/ }).click({ timeout: 30_000 });   // a reload opens on its Front
  await expect(page.locator('#ownTokGroups [aria-pressed="true"]')).toHaveText("Lobos");
  expect(errors).toEqual([]);
});

test("a collection's settings are a page of their own: its tabs, its About beside its preview, kept on Save, asked before they're lost", async ({ page }) => {
  const errors = await open(page, "/");
  await makeToken(page, "Lobo");
  await page.locator('[data-coll="settings"]').first().evaluate((b) => (b as HTMLElement).click());
  await expect.poll(() => new URL(page.url()).searchParams.has("ajustes")).toBe(true);
  await expect(page.locator("#settingsPage")).toBeVisible();
  await expect(page.locator("#osSave")).toBeDisabled();   // nothing changed yet
  // its name: on the top bar as it's written
  await page.locator("#osName").fill("Bestiario");
  await expect(page.locator(".coll-name").first()).toHaveText("Bestiario");
  await expect(page.locator("#osState")).toHaveText("Unsaved changes");
  // About: Markdown, read beside it
  await page.locator('[data-sp-tab="about"]').click();
  await page.locator("#osAbout").fill("Mis **lobos**.\n\n- [Iconos](https://game-icons.net)");
  await expect(page.locator("#osAboutPreview strong")).toHaveText("lobos");
  await expect(page.locator('#osAboutPreview a[href="https://game-icons.net"]')).toHaveText("Iconos");
  await page.locator("#osSave").click();
  await expect(page.locator("#osState")).toHaveText("Saved");
  await expect(page.locator("#osSave")).toBeDisabled();
  // changed again and left: asked; said yes, it's as it was saved
  await page.locator('[data-sp-tab="general"]').click();
  await page.locator("#osName").fill("Otro nombre");
  page.once("dialog", (d) => void d.accept());
  await page.locator("#flowSteps .top-back").click();
  await expect.poll(() => new URL(page.url()).searchParams.has("ajustes")).toBe(false);
  await expect(page.locator(".coll-name").first()).toHaveText("Bestiario");
  // kept: after a reload, the page says it again
  await page.reload();
  await page.locator('[data-coll="settings"]').first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator("#osName")).toHaveValue("Bestiario", { timeout: 30_000 });
  await page.locator('[data-sp-tab="about"]').click();
  await expect(page.locator("#osAboutPreview strong")).toHaveText("lobos");
  expect(errors).toEqual([]);
});

test("the sidebar: everything, a shape each where there's more than one, then the lists (the collection's own locked, yours kept beside it)", async ({ page }) => {
  const errors = await open(page, "/c/srd5e");
  await expect(page.locator('#library [data-ed="all"]')).toBeVisible();
  await expect(page.locator('#library [data-ed="f:coin"]')).toBeVisible();
  await expect(page.locator('#library [data-ed="f:ring"]')).toBeVisible();
  await expect(page.locator('#library [data-ed="f:card"]')).toHaveCount(0);   // no cards in it
  await expect(page.locator("#editions .spine-sec h2")).toHaveText("Lists");
  await expect(page.locator("#editions .ed .list-lock")).toHaveCount(5);   // its five, fixed
  // a list of yours, in one of the app's collections: made, and there after a reload
  await page.locator("#editions [data-list-new]").click();
  await page.locator("#ownCatName").fill("Saturday");
  await page.locator("#ownCatText").fill("Blinded\nPoisoned");
  await page.locator("#ownCatSave").click();
  await expect(page.locator("#editions .ed").filter({ hasText: "Saturday" })).toBeVisible();
  await expect(page.locator("#edTitle")).toHaveText("Saturday");
  await page.reload();
  await expect(page.locator("#editions .ed").filter({ hasText: "Saturday" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#editions .ed").filter({ hasText: "Saturday" }).locator(".list-lock")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a collection kept with types and sections opens with shapes and lists", async ({ page }) => {
  const errors = await open(page, "/");
  const id = await page.evaluate(async () => {
    const C = await import("/src/collection.ts");
    const old = { ...C.starterCollection(), catalogs: undefined,
      types: [{ id: "fichas", name: "Fichas", title: "Todas", shape: "coin" }, { id: "aros", name: "Aros", title: "Aros", shape: "ring" }, { id: "marcas", name: "Marcas", title: "Marcas", shape: "coin" }],
      tokens: [{ id: "a", type: "fichas", group: "g1", name: "Uno", icon: null, linked: [] }, { id: "b", type: "aros", group: "g1", name: "Dos", icon: null, linked: [] }, { id: "c", type: "marcas", group: "g1", name: "Tres", icon: null, linked: [] }],
      sections: [{ id: "s1", title: "Catálogos", open: true, catalogs: [{ id: "k1", name: "Partida", tokens: ["a", "b"] }] }] };
    return C.addCollection(old as never);
  });
  await page.goto(`/c/${id}`);
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#library [data-ed="f:ring"]')).toBeVisible();
  // "Marcas" a list now (nothing else shows just it), "Aros" not (the rings' entry does), "Partida" kept
  await expect(page.locator("#editions .ed")).toHaveText([/Todas/, /Marcas/, /Partida/]);
  expect(errors).toEqual([]);
});

test("a collection's settings: its categories, and its own names for categories and lists, said across the app", async ({ page }) => {
  const errors = await open(page, "/");
  await makeToken(page, "Lobo");
  await page.locator('[data-coll="settings"]').first().evaluate((b) => (b as HTMLElement).click());
  // Names: the categories are "bando" (masculine), the lists "guiones"
  const row = (k: string) => page.locator(`#osWords [data-word="${k}"]`);
  await row("group").locator('[data-part="one"]').fill("bando");
  await row("group").locator('[data-part="many"]').fill("bandos");
  await row("list").locator('[data-part="one"]').fill("guion");
  await row("list").locator('[data-part="many"]').fill("guiones");
  await expect(page.locator('[data-sp-tab="groups"]')).toHaveText("Bandos");
  // a second one, in its tab
  await page.locator('[data-sp-tab="groups"]').click();
  await expect(page.locator("#ownGroupAdd")).toHaveText("+ Bando");
  await page.locator("#ownGroupAdd").click();
  await expect(page.locator("#ownGroupList .own-group")).toHaveCount(2);
  await page.locator("#osSave").click();
  await expect(page.locator("#osState")).toHaveText("Saved");
  // said where the token is changed, and in the sidebar
  await page.locator("#flowSteps .top-back").click();
  await expect(page.locator("#editions .spine-sec h2")).toHaveText("Guiones");
  await expect(page.locator("#editions [data-list-new]")).toHaveAttribute("title", "New guion");
  await page.reload();
  await expect(page.locator("#editions .spine-sec h2")).toHaveText("Guiones", { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("a category's colour: the app's filaments, then Bambu's PLA Basic; one of those says which filament it prints in", async ({ page }) => {
  const errors = await open(page, "/");
  await makeToken(page, "Lobo");
  await page.locator('[data-coll="settings"]').first().evaluate((b) => (b as HTMLElement).click());
  await page.locator('[data-sp-tab="groups"]').click();
  await page.locator("#ownGroupList .og-dot").first().click();
  await expect(page.locator("#ownGroupList .og-colour[open] .sw-note")).toHaveCount(0);   // the app's: prints as it is
  await page.locator('#ownGroupList .og-colour[open] [data-colour="#00b1b7"]').click();
  await expect(page.locator("#ownGroupList .og-dot").first()).toHaveAttribute("title", "Turquoise · Bambu PLA Basic");
  await page.locator("#ownGroupList .og-dot").first().click();
  await expect(page.locator("#ownGroupList .og-colour[open] .sw-note")).toContainText("prints in blue");
  expect(errors).toEqual([]);
});

test("a token of yours without an icon: the layouts that show one wait for it, and Plain carries nothing", async ({ page }) => {
  const errors = await open(page, "/");
  await makeToken(page, "Lobo");
  const { go, on } = clicks(page);
  await go('#parts [data-part="front"]', on('#parts [data-part="front"]'));
  // no dialog: its front's text and icon are in the front's Composition
  await expect(page.locator("#crOwn #ownTokText")).toBeVisible();
  await expect(page.locator("#crOwn #ownTokName")).toBeHidden();
  // without an icon (the one it may have found for its name, taken off)
  if (await page.locator("#crOwn #ownTokChip [data-icon-none]").count()) await page.locator("#crOwn #ownTokChip [data-icon-none]").click();
  await expect(page.locator("#crOwn #ownTokChip [data-icon-none]")).toHaveCount(0);
  await go('#faceTabs [data-face="layout"]', on('#faceTabs [data-face="layout"]'));
  for (const v of ["classic", "window", "solo", "double"]) await expect(page.locator(`[data-choice="style"] [data-v="${v}"]`)).toBeDisabled();
  await expect(page.locator('[data-choice="style"] [data-v="text"]')).toBeEnabled();
  // its text is its name, written in the field; emptied, it says nothing (not its name again)
  await expect(page.locator("#crOwn #ownTokText")).toHaveValue("Lobo");
  await page.locator("#crOwn #ownTokText").fill("");
  // with neither a text nor an icon, only Plain is there
  await expect(page.locator('[data-choice="style"] [data-v="text"]')).toBeDisabled();
  await expect(page.locator('[data-choice="style"] [data-v="text"] small')).toHaveText(/./);
  await expect(page.locator('[data-choice="style"] [data-v="none"]')).toHaveAttribute("aria-pressed", "true");   // what it prints now
  await expect(page.locator("#crOwn #ownTokText")).toHaveValue("");
  // Plain: nothing on it, said under its text
  await go('[data-choice="style"] [data-v="none"]', () => expect(page.locator('[data-choice="style"] [data-v="none"]')).toHaveAttribute("aria-pressed", "true", { timeout: 1000 }));
  await expect(page.locator("#ownTokNameHint")).toBeVisible();
  // an icon given: it shows, and the layouts with one are there again
  await page.locator("#ownTokSvg").setInputFiles(SVG);
  await expect(page.locator('[data-choice="style"] [data-v="solo"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-choice="style"] [data-v="solo"]')).toBeEnabled();
  await expect(page.locator('[data-choice="style"] [data-v="classic"]')).toBeDisabled();   // its text is still empty
  expect(errors).toEqual([]);
});

test("a token of yours is changed where it's designed, in the collection: each face's Composition has what it carries", async ({ page }) => {
  const errors = await open(page, "/");
  const id = await makeToken(page, "Lobo"), { go, on } = clicks(page);
  await go('#parts [data-part="front"]', on('#parts [data-part="front"]'));
  // an icon of its own (an SVG of yours: no waiting on game-icons.net), so it can be its icon alone
  await page.locator("#crOwn #ownTokSvg").setInputFiles(SVG);
  await expect(page.locator("#crOwn #ownTokChip [data-icon-none]")).toBeVisible();
  await expect(page.locator("#crOwn #ownTokName")).toBeHidden();
  await page.locator("#crOwn #ownTokText").fill("LOBO GRIS");
  // its back's: another state with its own text
  await go('#parts [data-part="back"]', on('#parts [data-part="back"]'));
  await go('#faceTabs [data-face="layout"]', on('#faceTabs [data-face="layout"]'));
  // no other state: the design's back (what it says on all your coins); switched on, its own name and icon instead
  await expect(page.locator("#ownTokFlipName")).toBeHidden();
  await expect(page.locator("#backSayBox")).toBeVisible();
  await page.locator("#ownTokFlipOn").check();
  await expect(page.locator("#backSayBox")).toBeHidden();
  await expect(page.locator("#ownTokFlipName")).toHaveValue("");
  await page.locator("#ownTokFlipName").fill("Lobo herido");
  await expect(page.locator("#ownTokFlipName")).toHaveValue("Lobo herido");
  // its front's layouts are what it carries (no tick for its text beside them): Symbol only makes it its icon alone, and back to both
  await go('#parts [data-part="front"]', on('#parts [data-part="front"]'));
  await go('#faceTabs [data-face="layout"]', on('#faceTabs [data-face="layout"]'));
  await page.locator('[data-choice="style"] [data-v="solo"]').click();
  await expect(page.locator('[data-choice="style"] [data-v="solo"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-choice="style"] [data-v="classic"]').click();
  await expect(page.locator('[data-choice="style"] [data-v="classic"]')).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
  // the collection's own: what it keeps says so (a moment after)
  await expect.poll(() => page.evaluate((tid) => {
    const key = Object.keys(localStorage).find((k) => localStorage.getItem(k)?.includes(`"id":"${tid}"`) && localStorage.getItem(k)?.includes('"tokens"'));
    const tk = JSON.parse(localStorage.getItem(key!)!).tokens.find((x: { id: string }) => x.id === tid);
    return [typeof tk.text === "string" ? tk.text : tk.text?.en, typeof tk.flip?.name === "string" ? tk.flip.name : tk.flip?.name?.en];
  }, id)).toEqual(["LOBO GRIS", "Lobo herido"]);
  expect(errors).toEqual([]);
});
