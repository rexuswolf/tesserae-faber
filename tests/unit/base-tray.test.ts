import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { baseLayout, baseSpec, baseSize, buildToken } from "../../src/engine/token-engine.ts";
import type { Library, Role } from "../../src/types.ts";

// A stand-in font: every glyph 0.6 em wide (the layout only needs advances and the cap height).
const lib = { capHeight: 0.7, glyphs: new Map(), font: { generateShapes: () => [] } } as unknown as Library;
// each glyph a plain block, enough to build the tray's letters
const block = () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.5, 0); s.lineTo(0.5, 0.7); s.lineTo(0, 0.7); return [s]; };
for (const ch of "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZÁ") (lib.glyphs as Map<string, unknown>).set(ch, { shapes: block(), center: 0.3, advance: 0.6 });
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
  it("is closed solids a slicer takes as they are: every edge between exactly two faces", () => {
    // the points welded as a slicer does (to a ten-thousandth of a mm), each edge's faces counted
    const openEdges = (g: THREE.BufferGeometry) => {
      const p = g.attributes.position.array, key = (i: number) => [0, 1, 2].map((k) => Math.round(p[3 * i + k] * 1e4)).join(",");
      const edges = new Map<string, number>();
      for (let t = 0; t < p.length / 9; t++) for (let k = 0; k < 3; k++) {
        const a = key(3 * t + k), b = key(3 * t + ((k + 1) % 3));
        if (a !== b) { const e = a < b ? `${a}|${b}` : `${b}|${a}`; edges.set(e, (edges.get(e) ?? 0) + 1); }
      }
      return [...edges.values()].filter((n) => n !== 2).length;
    };
    for (const text of ["", "2", "ORCO 3", "A VERY LONG NAME INDEED FOR A BASE"]) {
      const role = { id: "x", kind: "base", team: "townsfolk", en: text || "-", ...(text ? {} : { content: "none" }) } as unknown as Role;
      const t = buildToken(lib, role, { ringBase: "32", frame: "line" } as never, text);
      for (const [part, g] of Object.entries(t.parts)) if (g) expect(openEdges(g), `${text || "(none)"}: ${part}`).toBe(0);
    }
  });
  it("stands raised text on the top, none of it sunk: its layers its colour alone", () => {
    const role = { id: "x", kind: "base", team: "townsfolk", en: "2" } as unknown as Role;
    const t = buildToken(lib, role, { ringBase: "32", relief: { text: true, frame: false, icon: false }, reliefHeight: 0.6 } as never, "2");
    const box = new THREE.Box3().setFromBufferAttribute(t.parts.front!.attributes.position as THREE.BufferAttribute);
    expect(box.min.z).toBeCloseTo(t.spec.height, 5);
    expect(box.max.z).toBeCloseTo(t.spec.height + 0.6, 5);
  });
});

