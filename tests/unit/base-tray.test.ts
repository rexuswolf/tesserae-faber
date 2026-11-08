import { describe, expect, it } from "vitest";
import { baseLayout, baseSpec, baseSize } from "../../src/engine/token-engine.ts";
import type { Library } from "../../src/types.ts";

// A stand-in font: every glyph 0.6 em wide (the layout only needs advances and the cap height).
const lib = { capHeight: 0.7, glyphs: new Map(), font: { generateShapes: () => [] } } as unknown as Library;
for (const ch of "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZÁ") (lib.glyphs as Map<string, unknown>).set(ch, { shapes: [], center: 0.3, advance: 0.6 });
const layout = (text: string, base = "32") => baseLayout(lib, text, baseSpec({ ringBase: base }));

describe("a base tray", () => {
  it("fits the miniature's base with 0.4 mm of play, inside a 3 mm rim", () => {
    expect(baseSize({ ringBase: "32" })).toEqual({ base: 32, ri: 16.4, ro: 19.4 });
    expect(baseSize({ ringBase: "nonsense" }).base).toBe(25);
  });
  it("prints a number at 6 mm and a word at 4.5 mm", () => {
    expect(layout("2").cap).toBe(6);
    expect(layout("ORCO 3").cap).toBe(4.5);
  });
  it("widens the tab for more text, keeping its sides parallel within the tray", () => {
    const short = layout("2"), long = layout("ORCO 3");
    expect(long.half).toBeGreaterThan(short.half);
    expect(long.R * Math.sin(long.half)).toBeLessThan(long.ro - 1);
  });
  it("shrinks the letters of a text too long for the widest tab, not below 3 mm", () => {
    expect(layout("CAPITÁN GRISK", "25").cap).toBeLessThan(4.5);
    expect(layout("A VERY LONG NAME INDEED FOR A BASE", "25").cap).toBe(3);
  });
  it("reads from the front: letters left to right round the front, in order", () => {
    const a = layout("ORCO 3").letters.map((l) => l.a);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect((a[0] + a.at(-1)!) / 2).toBeCloseTo(-Math.PI / 2, 1);
  });
  it("keeps the rim between 1.5 and 4 mm above its 1 mm floor", () => {
    expect(baseSpec({ height: 0.5 }).height).toBe(1.5);
    expect(baseSpec({ height: 9 }).height).toBe(4);
  });
  it("has no tab when it says nothing: the tray alone", () => {
    const L = layout("");
    expect(L.tab).toBe(false);
    expect(L.letters).toEqual([]);
    expect(L.R).toBe(L.ro);
  });
});
