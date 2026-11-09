import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, frameDesign } from "../../src/engine/token-engine.ts";
import type { TokenSpec } from "../../src/types.ts";

/** The outermost point of a frame's shapes (mm from the centre). */
const outer = (spec: TokenSpec) => Math.max(...frameDesign(spec)!.shapes.flatMap((sh) => sh.getPoints().map((p) => Math.hypot(p.x, p.y))));

describe("a coin's frame apart from its edge", () => {
  const spec = (frameInset: number): TokenSpec => ({ ...DEFAULT_SPEC, frame: "rim", frameWidth: 1, frameInset });
  it("reaches the edge at 0, as it always did", () => {
    expect(outer(spec(0))).toBeCloseTo(DEFAULT_SPEC.diameter / 2, 1);
  });
  it("starts that far in, its inside too: the coin's side is the base's all round", () => {
    expect(outer(spec(0.8))).toBeCloseTo(DEFAULT_SPEC.diameter / 2 - 0.8, 1);
    expect(frameDesign(spec(0.8))!.inner).toBeCloseTo(frameDesign(spec(0))!.inner - 0.8, 5);
  });
  it("is kept within reason from a file", () => {
    expect(outer(spec(-2))).toBeCloseTo(DEFAULT_SPEC.diameter / 2, 1);
    expect(outer(spec(99))).toBeCloseTo(DEFAULT_SPEC.diameter / 2 - 3, 1);
  });
});

describe("Clocktower's coin designs", () => {
  it("keep their frame 0.8 mm in from the edge; a frameless one has no gap, and the other shapes none", async () => {
    const { BOTC_STYLES } = await import("../../src/botc-styles.ts");
    for (const d of BOTC_STYLES.coin) {
      const frame = d.spec.frame ?? DEFAULT_SPEC.frame;
      expect(d.spec.frameInset, d.id).toBe(frame === "none" ? undefined : 0.8);
    }
    for (const sh of ["ring", "card", "base"] as const) for (const d of BOTC_STYLES[sh]) expect(d.spec.frameInset, `${sh} ${d.id}`).toBeUndefined();
  });
  it("one kept before the gap existed compares as the design's, one of yours with a gap of its own as it is", async () => {
    const { keptBefore, yoursBeforeInset } = await import("../../src/app/looks.ts");
    expect(DEFAULT_SPEC.frameInset).toBe(0.8);   // by default a frame starts in from the edge
    const { frameInset: _none, ...mine } = { ...DEFAULT_SPEC, frame: "rim" };
    expect(yoursBeforeInset(mine).frameInset).toBe(0);   // one of yours kept before: still at the edge
    expect(yoursBeforeInset({ ...mine, frameInset: 1.2 }).frameInset).toBe(1.2);
    const design = { ...DEFAULT_SPEC, frame: "rim", frameInset: 0.8 } as TokenSpec;
    const { frameInset: _gone, ...old } = design;
    expect(keptBefore(old as TokenSpec, design).frameInset).toBe(0.8);
    expect(keptBefore({ ...design, frameInset: 0 }, design).frameInset).toBe(0);
  });
});

describe("Clocktower's coin designs", () => {
  it("offer Midnight and Basic; the others are hidden, still there for a token that has one", async () => {
    const { BOTC_STYLES } = await import("../../src/botc-styles.ts");
    const { ownStylesOf } = await import("../../src/collection.ts");
    expect(ownStylesOf({ styles: BOTC_STYLES }, "coin").map((d) => d.id)).toEqual(["edicion", "basico"]);
    expect(BOTC_STYLES.coin.filter((d) => d.hidden).map((d) => d.id)).toEqual(["noche", "medianoche", "arlequin"]);
  });
});

describe("Clocktower's back", () => {
  it("is the same on every token: the midnight clock without its border, in a plain rim", async () => {
    const { BOTC_STYLES } = await import("../../src/botc-styles.ts");
    const spec = BOTC_STYLES.coin.find((d) => d.id === "edicion")!.spec as { back?: string; backFace?: { frame?: string } };
    expect(spec.back).toBe("medianoche");
    expect(spec.backFace?.frame).toBe("rim");
  });
  it("no back drawing has a border of its own: its frame is the face's, never drawn twice", async () => {
    const { backDesign, BACK_ORNAMENTS } = await import("../../src/engine/token-engine.ts");
    const far = (id: string) => Math.max(...backDesign(id, 20)!.flatMap((sh) => sh.getPoints().map((p) => Math.hypot(p.x, p.y))));
    for (const id of BACK_ORNAMENTS) expect(far(id), id).toBeLessThan(20 - 1.6);   // clear of a rim 0.8 mm wide, 0.8 mm in
  });
});

describe("Clocktower's Basic", () => {
  it("is Midnight's front, thinner, with a plain back", async () => {
    const { BOTC_STYLES } = await import("../../src/botc-styles.ts");
    const by = (id: string) => BOTC_STYLES.coin.find((d) => d.id === id)!.spec as Record<string, unknown>;
    const mid = by("edicion"), basic = by("basico");
    for (const k of ["style", "frame", "frameWidth", "frameInset", "depth", "colours"]) expect(basic[k], k).toEqual(mid[k]);
    expect(basic.back).toBe("none");
    expect(basic.height).toBe(1.4);
  });
});
