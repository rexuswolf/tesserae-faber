import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, frameDesign, coinExtent, coinOutlinePoints, coinOutline, tokenSvg, buildToken, loadLibrary, THREE } from "../../src/engine/token-engine.ts";
import type { CoinOutline, TokenSpec } from "../../src/types.ts";

const spec = (outline: CoinOutline | undefined, extra: Partial<TokenSpec> = {}): TokenSpec => ({ ...DEFAULT_SPEC, diameter: 40, frame: "rim", frameWidth: 1, ...(outline ? { outline } : {}), ...extra });
const SIDES: [CoinOutline, number][] = [["square", 4], ["pentagon", 5], ["hexagon", 6]];

describe("a coin with sides", () => {
  it("is as wide across its flats as the diameter, its corners reaching further (rounded)", () => {
    expect(coinExtent(spec(undefined))).toBe(20);
    for (const [o, n] of SIDES) {
      const pts = coinOutlinePoints(spec(o))!, sharp = 20 / Math.cos(Math.PI / n);
      const minY = Math.min(...pts.map(([, y]) => y));
      expect(minY, o).toBeCloseTo(-20, 3);                  // a flat at the bottom, 20 mm down
      expect(coinExtent(spec(o)), o).toBeGreaterThan(20);
      expect(coinExtent(spec(o)), o).toBeLessThan(sharp);   // the corners rounded
    }
  });
  it("has a round coin's outline unchanged, and no reeded edge of its own", () => {
    expect(coinOutline(spec(undefined))).toBeNull();
    expect(coinOutlinePoints(spec(undefined))).toBeNull();
    expect(coinOutline(spec(undefined, { edge: "reeded" }))).not.toBeNull();
    expect(coinOutline(spec("hexagon", { edge: "reeded" }))!.length).toBe(coinOutline(spec("hexagon"))!.length);   // the polygon, not teeth
  });
  it("has its frame inside its outline, along every edge", () => {
    for (const [o] of SIDES) {
      const s = spec(o), E = coinExtent(s);
      const pts = frameDesign(s)!.shapes.flatMap((sh) => sh.getPoints(8));
      expect(Math.max(...pts.map((p) => Math.hypot(p.x, p.y))), o).toBeLessThanOrEqual(E + 1e-6);
      expect(Math.min(...pts.map((p) => p.y)), o).toBeCloseTo(-20 + (s.frameInset ?? 0), 1);   // along the bottom flat, its inset in
    }
  });
  it("draws and builds: its picture as wide as its corners, its body the polygon", async () => {
    const font = (await import("node:fs")).readFileSync("public/AlegreyaSC-ExtraBold.ttf");
    const fetchFont = globalThis.fetch;
    globalThis.fetch = (async () => new Response(font)) as typeof fetch;
    try {
      const lib = await loadLibrary([]);
      const role = { id: "t", en: "Overlord", es: "Overlord", team: "demon", edition: "own", editionName: "x", d: [], body: '<path d="M10 10h100v100h-100z"/>', g: "" } as never;
      for (const [o] of SIDES) {
        const s = spec(o), E = coinExtent(s);
        const svg = tokenSvg(lib, role, s);
        expect(svg, o).toContain(`viewBox="${(-E - 0.5).toFixed(2)}`);
        const t = buildToken(lib, role, s, "Overlord");
        const box = new THREE.Box3().setFromBufferAttribute(t.parts.base!.getAttribute("position") as THREE.BufferAttribute);
        expect(box.min.y, o).toBeCloseTo(-20, 2);
        expect(Math.max(box.max.x, -box.min.x), o).toBeLessThanOrEqual(E + 1e-6);
        expect(t.parts.front, o).toBeTruthy();             // the name, along its edge
      }
    } finally { globalThis.fetch = fetchFont; }
  });
});
