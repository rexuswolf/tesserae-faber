import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildToken, DEFAULT_SPEC } from "../../src/engine/token-engine.ts";
import type { Library, Role } from "../../src/types.ts";

// No name and no icon: the frame alone is built.
const lib = { capHeight: 0.7, glyphs: new Map(), icons: new Map(), font: { generateShapes: () => [] } } as unknown as Library;
const role = { id: "x", team: "townsfolk", en: "-", content: "none", d: [], body: "", g: "" } as unknown as Role;
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

describe("the Greek key and wave frames", () => {
  it("are closed solids at any size, width and gap from the edge: every edge between exactly two faces", () => {
    // sizes and widths where a corner of the triangulation once fell on a key's side and left a crack
    for (const frame of ["greca", "greca2", "greca3", "ola", "aletas"]) for (const [d, w, inset] of [[32, 0.6, 0], [28, 0.8, 2], [42, 0.8, 0], [45, 1.6, 0], [25, 2, 0], [45, 0.8, 0], [55, 0.8, 0.8]]) {
      const t = buildToken(lib, role, { ...DEFAULT_SPEC, frame, diameter: d, frameWidth: w, frameInset: inset, style: "solo" } as never, "");
      expect(openEdges(t.parts.frame!), `${frame} ${d} mm, ${w}, ${inset}`).toBe(0);
    }
  });
});
