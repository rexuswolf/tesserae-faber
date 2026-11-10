import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildToken, pieceSpec, pieceOutline, pieceFoot, tokenSvg, PIECE_SHAPES } from "../../src/engine/token-engine.ts";
import { GI_PLACE } from "../../src/icons.ts";
import { UI_ICONS } from "../../src/ui-icons.ts";
import type { Library, Role } from "../../src/types.ts";

const lib = { capHeight: 0.7, glyphs: new Map(), icons: new Map(), font: { generateShapes: () => [] } } as unknown as Library;
// a piece of a game-icons.net icon (the meeple, and the stack of layers: three islands), placed as the app places them
const piece = (icon: string) => ({ id: `p-${icon}`, kind: "piece", team: "townsfolk", en: icon, d: [], g: GI_PLACE, body: UI_ICONS[icon].body.replace(/currentColor/g, "#000") }) as unknown as Role;
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

describe("a piece", () => {
  it("keeps to what prints: 15 to 60 mm, 2 to 12 mm thick, its margin 0.4 to 4 mm; only its icon raised", () => {
    const s = pieceSpec({ diameter: 5, height: 40, pieceMargin: 9, frame: "rim", relief: { text: true, frame: true, icon: true }, pieceShape: "nonsense" as never });
    expect([s.diameter, s.height, s.pieceMargin, s.frame, s.pieceShape]).toEqual([15, 12, 4, "none", "silhouette"]);
    expect(s.relief).toEqual({ text: false, frame: false, icon: true });
    expect(pieceSpec({ pieceIcon: false, relief: { text: false, frame: false, icon: true } }).relief.icon).toBe(false);   // no icon, nothing raised
  });
  it("a silhouette reaches its margin past the icon, filled: one outline, no holes, inside its footprint", () => {
    for (const margin of [0.4, 2, 4]) {
      const spec = pieceSpec({ pieceShape: "silhouette", diameter: 25, pieceMargin: margin }), out = pieceOutline(lib, piece("meeple"), spec);
      expect(out).toHaveLength(1);
      expect(out[0].holes).toHaveLength(0);
      const b = new THREE.Box2().setFromPoints(out[0].getPoints());
      expect(Math.max(-b.min.x, b.max.x, -b.min.y, b.max.y)).toBeLessThanOrEqual(pieceFoot(spec) / 2 + 1e-6);
    }
  });
  it("is closed solids a slicer takes as they are, whatever its outline, icon or relief", () => {
    for (const icon of ["meeple", "stack"]) for (const pieceShape of PIECE_SHAPES) for (const [pieceIcon, raised] of [[true, false], [true, true], [false, false]]) {
      const t = buildToken(lib, piece(icon), { pieceShape, pieceIcon, diameter: 25, height: 4, relief: { text: false, frame: false, icon: raised } }, "");
      for (const [part, g] of Object.entries(t.parts)) if (g) expect(openEdges(g), `${icon} ${pieceShape} ${pieceIcon} ${raised}: ${part}`).toBe(0);
      expect(!!t.parts.icon).toBe(pieceIcon);
      expect(t.foot).toEqual({ w: pieceFoot(t.spec), h: pieceFoot(t.spec) });
    }
  });
  it("can carry its icon underneath too, flush and mirrored: then nothing is raised and the two inlays share the thickness", () => {
    const s = pieceSpec({ pieceBack: true, height: 2, depth: 1.6, relief: { text: false, frame: false, icon: true } });
    expect([s.pieceBack, s.relief.icon, s.depth]).toEqual([true, false, 0.8]);
    expect(pieceSpec({ pieceBack: true, pieceIcon: false }).pieceBack).toBe(false);   // no icon, none underneath
    const t = buildToken(lib, piece("meeple"), { pieceBack: true, height: 4 }, "");
    expect(openEdges(t.parts.backIcon!)).toBe(0);
    const box = new THREE.Box3().setFromBufferAttribute(t.parts.backIcon!.attributes.position as THREE.BufferAttribute);
    expect(box.min.z).toBeCloseTo(0, 5); expect(box.max.z).toBeCloseTo(t.spec.depth, 5);   // sunk from the bottom, as deep as the top's
    expect(t.colours.backIcon).toBe(t.colours.icon);
    // a silhouette's is where the top's is (its outline's from below); a simple shape's mirrored, to read turned over
    // where a drawing's weight lies across (its triangles' mean x, by area): a mirror image's is the other side
    const meanX = (g: THREE.BufferGeometry) => { const p = g.attributes.position.array; let sx = 0, sa = 0;
      for (let i = 0; i < p.length; i += 9) { const a = Math.abs((p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 6] - p[i]) * (p[i + 4] - p[i + 1])); sx += a * (p[i] + p[i + 3] + p[i + 6]) / 3; sa += a; }
      return sx / sa; };
    const sil = buildToken(lib, piece("two-coins"), { pieceBack: true }, "");   // a lopsided icon
    expect(Math.abs(meanX(sil.parts.icon!))).toBeGreaterThan(0.05);
    expect(meanX(sil.parts.backIcon!)).toBeCloseTo(meanX(sil.parts.icon!), 2);
    const hex = buildToken(lib, piece("two-coins"), { pieceBack: true, pieceShape: "hexagon" }, "");
    expect(meanX(hex.parts.backIcon!)).toBeCloseTo(-meanX(hex.parts.icon!), 2);
    expect(tokenSvg(lib, piece("meeple"), { pieceBack: true }, { side: "back" })).toContain("scale(-1 1)");
  });
  it("is drawn as its outline in its colour, with its icon on it or not", () => {
    const svg = (pieceIcon: boolean) => tokenSvg(lib, piece("meeple"), { pieceIcon, colours: { base: "#ff0000", front: "#ffffff", frame: "#ffffff", back: "#000000" } });
    expect(svg(true)).toContain('fill="#ff0000"');
    expect(svg(true)).toContain('fill="#ffffff"');
    expect(svg(false)).not.toContain('fill="#ffffff"');
  });
});
