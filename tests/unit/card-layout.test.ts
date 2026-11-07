import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cardLayout, cardSpec, cardBackOf, printsBack, CARD, CARD_ICONS, CARD_JOINS, DEFAULT_SPEC } from "../../src/engine/token-engine.ts";
import type { CardIcon, CardJoin, Library, Role } from "../../src/types.ts";

// A stand-in font: every letter 0.6 em wide and 0.7 em tall from its baseline, one box per line
// (the layout only measures the lines' ink).
const W = 0.6, CAP = 0.7;
const box = (text: string, size: number) => {
  const s = new THREE.Shape(), w = text.length * W * size;
  s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, CAP * size); s.lineTo(0, CAP * size); s.closePath();
  return text ? [s] : [];
};
const lib = { capHeight: CAP, font: { generateShapes: box } } as unknown as Library;
const PAD = 7, inner = { x: CARD.w / 2 - PAD, y: CARD.h / 2 - PAD };
const PHRASES = ["Tesoro", "Ley de la República", "This character selected you", "Did you nominate today?"];

/** The card layout as it was before icons (the phrase alone, in up to 3 lines): what a card without one must still get. */
function before(text: string) {
  const words = text.toUpperCase().trim().split(/\s+/).filter(Boolean), width = (l: string) => l.length * W;
  const Wd = CARD.w - 2 * PAD, Hd = CARD.h - 2 * PAD;
  let best: { em: number; lines: string[] } | null = null;
  const splits = (n: number, k: number): number[][] => (k === 1 ? [[n]] : Array.from({ length: n - k + 1 }, (_, i) => i + 1).flatMap((a) => splits(n - a, k - 1).map((r) => [a, ...r])));
  for (let k = 1; k <= Math.min(3, words.length || 1); k++) for (const sizes of splits(Math.max(1, words.length), k)) {
    let at = 0;
    const lines = sizes.map((n) => { const l = words.slice(at, at + n).join(" "); at += n; return l; });
    const em = Math.min(Wd / Math.max(...lines.map(width), 1e-6), 8 / CAP, Hd / (CAP * (1 + (k - 1) * 1.6)));
    if (!best || em > best.em + 1e-6) best = { em, lines };
  }
  const cap = best!.em * CAP, pitch = cap * 1.6, total = cap + (best!.lines.length - 1) * pitch;
  return { em: best!.em, lines: best!.lines.map((l, i) => ({ text: l, y: total / 2 - cap - i * pitch })) };
}
/** Each line's ink as a box (mm). */
const inks = (L: ReturnType<typeof cardLayout>) => L.lines.map((l) => ({ x0: l.x - (l.text.length * W * L.em) / 2, x1: l.x + (l.text.length * W * L.em) / 2, y0: l.y, y1: l.y + L.cap }));
const spec = (cardIcon: CardIcon, cardJoin: CardJoin, cardIconSize = 30) => ({ cardIcon, cardJoin, cardIconSize });

describe("a card's face", () => {
  it("without an icon, lays the phrase out as cards always were", () => {
    for (const text of PHRASES) for (const at of CARD_ICONS) {
      // a design with an icon on a token without one: the phrase alone, as before
      const L = cardLayout(lib, text, spec(at, "spread"), false), old = before(text);
      expect(L.icon).toBeNull();
      expect(L.em).toBeCloseTo(old.em, 6);
      expect(L.lines.map((l) => [l.text, +l.y.toFixed(6), l.x])).toEqual(old.lines.map((l) => [l.text, +l.y.toFixed(6), 0]));
    }
    expect(cardLayout(lib, "Tesoro", spec("none", "column"), true).icon).toBeNull();
  });

  it("puts the icon and the phrase inside the padding, apart, for every place and join", () => {
    for (const text of PHRASES) for (const at of ["left", "right"] as const) for (const join of CARD_JOINS) for (const size of [12, 30, 40]) {
      const L = cardLayout(lib, text, spec(at, join, size), true), i = L.icon!;
      const icon = { x0: i.x - i.size / 2, x1: i.x + i.size / 2, y0: -i.size / 2, y1: i.size / 2 };
      const what = `${text} ${at} ${join} ${size}`;
      expect(icon.x0, what).toBeGreaterThanOrEqual(-inner.x - 1e-6);
      expect(icon.x1, what).toBeLessThanOrEqual(inner.x + 1e-6);
      expect(icon.y1, what).toBeLessThanOrEqual(inner.y + 1e-6);
      expect(i.size, what).toBeLessThanOrEqual(size + 1e-6);
      for (const ink of inks(L)) {
        expect(ink.x0, what).toBeGreaterThanOrEqual(-inner.x - 1e-6);
        expect(ink.x1, what).toBeLessThanOrEqual(inner.x + 1e-6);
        expect(ink.y0, what).toBeGreaterThanOrEqual(-inner.y - 1e-6);
        expect(ink.y1, what).toBeLessThanOrEqual(inner.y + 1e-6);
        // the phrase on the icon's other side, a gap away
        if (at === "left") expect(ink.x0 - icon.x1, what).toBeGreaterThan(2.9);
        else expect(icon.x0 - ink.x1, what).toBeGreaterThan(2.9);
      }
      // "column": the line between them, the phrase against it
      if (join === "column") {
        const r = L.rule!;
        expect(r, what).not.toBeNull();
        if (at === "left") { expect(r.x).toBeGreaterThan(icon.x1); expect(Math.min(...inks(L).map((k) => k.x0))).toBeGreaterThan(r.x); }
        else { expect(r.x).toBeLessThan(icon.x0); expect(Math.max(...inks(L).map((k) => k.x1))).toBeLessThan(r.x); }
        const near = at === "left" ? inks(L).map((k) => k.x0) : inks(L).map((k) => k.x1);
        expect(Math.max(...near) - Math.min(...near), `${what}: aligned towards the line`).toBeLessThan(1e-6);
      } else expect(L.rule, what).toBeNull();
    }
  });

  it("spreads the icon to the card's side, and keeps it with the phrase in the middle together", () => {
    const spread = cardLayout(lib, "Ley de la República", spec("left", "spread"), true);
    expect(spread.icon!.x - spread.icon!.size / 2).toBeCloseTo(-inner.x, 6);
    const together = cardLayout(lib, "Tesoro", spec("right", "together", 40), true), ink = inks(together)[0];
    // one block, centred: as much room on its left as on its right
    const left = ink.x0 + inner.x, right = inner.x - (together.icon!.x + together.icon!.size / 2);
    expect(left).toBeCloseTo(right, 6);
    // the icon about the phrase's height (never under 12 mm), not the 40 mm asked
    expect(together.icon!.size).toBeLessThan(40);
    expect(together.icon!.size).toBeGreaterThanOrEqual(12);
  });

  it("shows the icon alone, as large as asked, with no phrase", () => {
    const L = cardLayout(lib, "Tesoro", spec("only", "spread", 36), true);
    expect(L.lines).toEqual([]);
    expect(L.cap).toBe(Infinity);
    expect(L.icon).toEqual({ x: 0, y: 0, size: 36 });
  });
});

describe("a card's spec and back", () => {
  const card = { id: "x", en: "X", team: "info", edition: "", kind: "info" } as Role;
  it("keeps a card without the new fields as it was, and drops nonsense", () => {
    const s = cardSpec({ frame: "laurel" });
    expect([s.cardIcon, s.cardIconSize, s.cardJoin, s.cardBack]).toEqual(["none", DEFAULT_SPEC.cardIconSize, "spread", null]);
    const odd = cardSpec({ cardIcon: "middle" as CardIcon, cardIconSize: 400, cardJoin: 3 as unknown as CardJoin });
    expect([odd.cardIcon, odd.cardIconSize, odd.cardJoin]).toEqual(["none", 40, "spread"]);
  });
  it("reads an older card's coin back as no back", () => {
    const s = cardSpec({ back: "custom", customSvg: "<svg/>" });
    expect(s.back).toBe("none");
    expect(s.cardBack).toBeNull();
    expect(printsBack(card, { back: "custom" })).toBe(false);
    expect(printsBack(card, { cardBack: { on: true } })).toBe(true);
  });
  it("fills a back in: the icon alone, the face's frame, and gold for a face in the group's colour", () => {
    const b = cardBackOf({ frame: "laurel", frameWidth: 0.6, cardBack: { on: true, text: "El Senado" } });
    expect(b).toMatchObject({ on: true, text: "El Senado", icon: null, cardIcon: "only", frame: "laurel", frameWidth: 0.6, colours: { text: "#c9a227", frame: "#c9a227" } });
    expect(cardBackOf({ cardBack: { on: true, icon: { id: "x" } as never, colours: { text: "red" } } })).toMatchObject({ icon: null, colours: { text: "#c9a227" } });
  });
});
