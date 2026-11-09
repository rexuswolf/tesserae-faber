import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Opens a page of the app, collecting its errors and which adapters it loaded. */
async function open(page: Page, path: string) {
  const errors: string[] = [], adapters = new Set<string>();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { const m = r.url().match(/mock-(auth|roles)/); if (m) adapters.add(m[1]); });
  await page.addInitScript(() => { try { localStorage.setItem("tesserae-styles-tidied-2", "1"); localStorage.setItem("tesserae-peek-hint-row", "1"); } catch { /* blocked */ } });
  await page.goto(path);
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  return { errors, adapters };
}
const tokens = (page: Page) => page.locator("svg[aria-label$='token']");

for (const [path, adapters, minTokens] of [
  ["/botc?admin", ["auth", "roles"], 100],
  ["/c/drawsteel", [], 10],
  ["/c/srd5e", [], 10],
  ["/c/senado", [], 3],
  ["/taller", [], 1],
  ["/", [], 0],
] as const) {
  test(`${path} opens without errors, loading only the adapters it needs`, async ({ page }) => {
    const r = await open(page, path);
    if (minTokens) await expect(tokens(page).nth(minTokens - 1)).toBeAttached();
    expect(r.errors).toEqual([]);
    expect([...r.adapters]).toEqual(adapters);
  });
}

test("?admin signs the admin in", async ({ page }) => {
  const r = await open(page, "/botc?admin");
  await expect(page.locator(".me")).toBeVisible();
  expect([...r.adapters].sort()).toEqual(["auth", "roles"]);
});

test.describe("with the browser's storage blocked", () => {
  for (const path of ["/c/drawsteel", "/c/srd5e", "/c/senado", "/taller"]) {
    test(`${path} still opens`, async ({ page }) => {
      await page.addInitScript(() => {
        for (const n of ["localStorage", "sessionStorage"]) Object.defineProperty(window, n, { get() { throw new DOMException("blocked", "SecurityError"); } });
      });
      const r = await open(page, path);
      await expect(tokens(page).first()).toBeAttached();
      expect(r.errors).toEqual([]);
    });
  }
});

test("a collection that doesn't fit says so, until a save fits again", async ({ page }) => {
  await open(page, "/");
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  await page.locator("[data-own-new]").first().evaluate((b) => (b as HTMLElement).click());
  await page.waitForURL(/\/c\//);
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close()));
  // fill the storage, then save a long description
  await page.evaluate(() => {
    let n = 0;
    for (const size of [400000, 40000, 4000, 400, 40]) { const s = "x".repeat(size); try { for (;;) localStorage.setItem("junk" + n++, s); } catch { /* full */ } }
    (window as unknown as { junk: number }).junk = n;
    (document.querySelector('[data-coll="settings"]') as HTMLElement).click();
    const about = document.querySelector("#osAbout") as HTMLTextAreaElement;
    about.value = "y".repeat(5000); about.dispatchEvent(new Event("input"));
    (document.querySelector("#osSave") as HTMLElement).click();
  });
  const notice = page.locator('.update-toast[data-kind="storage"]');
  await expect(notice).toBeVisible();
  // room again: the next save fits and the notice goes
  await page.evaluate(() => {
    for (let i = 0; i < (window as unknown as { junk: number }).junk; i++) localStorage.removeItem("junk" + i);
    const about = document.querySelector("#osAbout") as HTMLTextAreaElement;
    about.value = "z"; about.dispatchEvent(new Event("input"));
    (document.querySelector("#osSave") as HTMLElement).click();
  });
  await expect(notice).toHaveCount(0);
});

test("Clocktower is private: its key first, and nothing of its library without it", async ({ page }) => {
  const adapters = new Set<string>();
  page.on("request", (r) => { const m = r.url().match(/mock-(auth|roles)/); if (m) adapters.add(m[1]); });
  await page.goto("/botc");
  await expect(page.locator("#gateKey")).toBeVisible({ timeout: 30_000 });
  expect([...adapters]).not.toContain("roles");
  // and it isn't among the collections
  await page.goto("/colecciones");
  await expect(page.locator("#ownHomeBuilt .oh-cover")).not.toHaveCount(0);
  expect(await page.locator('#ownHomeBuilt a[href="/botc"]').count()).toBe(0);
  // a wrong key says so; the right one opens it
  await page.goto("/botc");
  await page.locator("#gateKey").fill("nope");
  await page.locator("#gateAction").click();
  await expect(page.locator("#gateText")).not.toBeEmpty();
  await page.locator("#gateKey").fill("test-key");
  await page.locator("#gateAction").click();
  await expect(page.locator("#gate")).toBeHidden({ timeout: 30_000 });
  await expect(page.locator("svg[aria-label$='token']").nth(99)).toBeAttached();
});
