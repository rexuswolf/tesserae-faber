import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// The icon search over the real index: English as game-icons.net names them, Spanish through its words.
const index = JSON.parse(readFileSync("public/game-icons.json", "utf8")) as string[];
vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => index }));
const { searchGameIcons } = await import("../../src/icons.ts");
const names = async (q: string) => (await searchGameIcons(q)).map((p) => p.slice(p.indexOf("/") + 1));

describe("searching icons", () => {
  it("finds them by their English names", async () => {
    expect(await names("wolf")).toContain("wolf-head");
  });
  it("finds them by Spanish words, with or without accents, singular or plural", async () => {
    expect(await names("lobo")).toContain("wolf-head");
    expect(await names("poción")).toEqual(expect.arrayContaining([expect.stringContaining("potion")]));
    expect(await names("dragones")).toEqual(expect.arrayContaining([expect.stringContaining("dragon")]));
  });
  it("finds nothing for a word it doesn't know", async () => {
    expect(await names("xyzzy")).toEqual([]);
  });
});
