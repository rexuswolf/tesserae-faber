import { describe, expect, it } from "vitest";
import { reminderSpec, shapeSpec, DEFAULT_SPEC, backFaceOf } from "../../src/engine/token-engine.ts";
import { starterCollection, tokenRole } from "../../src/collection.ts";
import type { OwnToken } from "../../src/collection.ts";
import type { Role, TokenContent } from "../../src/types.ts";

// What a token carries is the token's: whatever its design lays out, a coin shows that.
const coin = (content?: TokenContent) => ({ id: "t", en: "Wolf", body: "<path/>", g: "", d: [], team: "g1", edition: "own", ...(content ? { content } : {}) }) as unknown as Role;
const styleOf = (content: TokenContent | undefined, style = DEFAULT_SPEC.style) => shapeSpec(coin(content), { ...DEFAULT_SPEC, style }).style;

describe("a token's content", () => {
  it("lays a coin out for it, whatever its design's layout", () => {
    expect(styleOf("icon", "classic")).toBe("solo");
    expect(styleOf("text", "window")).toBe("text");
    expect(styleOf("both", "solo")).toBe("classic");
    expect(styleOf("both", "window")).toBe("window");
    expect(styleOf(undefined, "solo")).toBe("solo");   // unset: as its design has it
  });
  it("places a card's icon for it: beside the phrase, alone, or none", () => {
    const card = (content: TokenContent) => shapeSpec({ ...coin(content), kind: "info" } as Role, { ...DEFAULT_SPEC, cardIcon: "none" }).cardIcon;
    expect(card("both")).toBe("left");
    expect(card("icon")).toBe("only");
    expect(card("text")).toBe("none");
    expect(shapeSpec({ ...coin("both"), kind: "info" } as Role, { ...DEFAULT_SPEC, cardIcon: "right" }).cardIcon).toBe("right");
  });
  it("is the front's: the back keeps its own layout, its icon alone or its words alone", () => {
    const back = (style: "solo" | "text") => {
      const r = coin("both"), spec = shapeSpec(r, { ...DEFAULT_SPEC, backMode: "own", backFace: { style } });
      const bf = backFaceOf(r, spec, "Wolf")!;
      return shapeSpec(bf.role, { ...bf.spec, back: "none", backMode: "design" }).style;   // as the back is drawn
    };
    expect(back("solo")).toBe("solo");
    expect(back("text")).toBe("text");
    // an icon-only token's back laid out with its name: so it stays
    const r = coin("icon"), spec = shapeSpec(r, { ...DEFAULT_SPEC, backMode: "own", backFace: { style: "window" } });
    const bf = backFaceOf(r, spec, "Wolf")!;
    expect(shapeSpec(bf.role, { ...bf.spec, back: "none", backMode: "design" }).style).toBe("window");
  });
  it("leaves a linked token its word", () => {
    expect(shapeSpec(coin("icon"), reminderSpec({ ...DEFAULT_SPEC, style: "classic" })).style).toBe("classic");
  });
  it("keeps the icon of a token that shows only its name, without drawing it", () => {
    const c = starterCollection();
    const tk: OwnToken = { ...c.tokens[0], icon: { id: "lorc/wolf-head", g: "", body: "<path/>" } as OwnToken["icon"], content: "text" };
    expect(tokenRole(c, tk).body).toBe("");
    expect(tokenRole(c, { ...tk, content: "both" }).body).toBe("<path/>");
  });
  it("prints its text, and is named in the lists by its name", () => {
    const c = starterCollection();
    const tk: OwnToken = { ...c.tokens[0], name: "Blood wolf", text: "WOLF" };
    const r = tokenRole(c, tk);
    expect(r.en).toBe("WOLF");
    expect(r.listNames?.en).toBe("Blood wolf");
    expect(tokenRole(c, { ...tk, text: undefined }).listNames).toBeUndefined();
  });
});
