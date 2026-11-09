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
