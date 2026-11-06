// Paper tokens: the print queue as an A4 PDF to print double-sided at home.
//
// Pages come in pairs, front then back. Printed double-sided flipping on the
// long edge, a point at x on the front lands at (pageWidth - x) on the back, so
// every back is drawn at the mirrored x and the same y as its front.
//
// This module (and jsPDF / svg2pdf.js with it) is loaded on demand with import(),
// so it doesn't weigh on the app's first load.
import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { tokenSvg, CARD, isCard, isRing, ringSize } from "../engine/token-engine.ts";
import { PAGE, layoutCoins, backX } from "./layout.ts";
import type { SheetSlot } from "./layout.ts";
import type { Library, Role, TokenSpec } from "../types.ts";

export { PAGE, layoutCoins, backX };

const BLEED = 1.2;                        // coin colour past the cut line, both sides,
                                          // so a slightly off duplex never shows white
const FOOTER = 6;                         // page label baseline, inside the bottom margin

const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;
// The token's colour: the first shape of tokenSvg (a coin's circle, a card's rect, a ring's path).
const baseColour = (svg: string) => svg.match(/^<svg[^>]*><(?:circle|rect|path)[^>]* fill="(#[0-9a-fA-F]{6})"/)?.[1] ?? null;

/** A coin or a card (c from layoutCoins), with a little bleed in its colour under it; a ring
 *  (`hole`, its hole's radius) has its bleed inside the hole too, which is cut out. */
async function drawToken(doc: jsPDF, svg: string, cx: number, c: SheetSlot, hole = 0) {
  const fill = baseColour(svg);
  if (fill) {
    doc.setFillColor(fill);
    if (c.card) doc.roundedRect(cx - c.w / 2 - BLEED, c.y - c.h / 2 - BLEED, c.w + 2 * BLEED, c.h + 2 * BLEED, c.r + BLEED, c.r + BLEED, "F");
    else doc.circle(cx, c.y, c.d / 2 + BLEED, "F");
    if (hole) { doc.setFillColor("#ffffff"); doc.circle(cx, c.y, hole - BLEED, "F"); }
  }
  // tokenSvg's viewBox is the token plus 0.5 mm all round.
  const el = parser!.parseFromString(svg, "image/svg+xml").documentElement;
  await svg2pdf(el, doc, { x: cx - c.w / 2 - 0.5, y: c.y - c.h / 2 - 0.5, width: c.w + 1, height: c.h + 1 });
}

/**
 * Builds the PDF.
 *   entries: [{ role, spec, text }]  (spec already resolved: reminders use reminderSpec)
 *   labels:  { front, back } page labels, e.g. "cara" / "dorso"
 *   backs:   false for fronts only: one page per sheet, printed one-sided
 * Returns { blob, sheets, coins }.
 */
export async function buildPrintPdf(lib: Library, entries: { role: Role; spec: TokenSpec; text?: string | null }[], { labels = { front: "front", back: "back" }, title = "Midnight Mint", backs = true, onProgress }: {
  labels?: { front: string; back: string }; title?: string; backs?: boolean; onProgress?: (done: number, total: number) => void;
} = {}) {
  // Paper has no magnets: drop the 3D-only pocket from the back.
  const paper = entries.map((e) => ({ ...e, spec: { ...e.spec, magnet: "none" as const } }));
  const pages = layoutCoins(paper.map((e) => (isCard(e.role) ? CARD : e.spec.diameter)));
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({ title, creator: "Midnight Mint" });
  // Hints for viewers that honour them (Acrobat): real size, and duplex on the long edge or one-sided.
  doc.viewerPreferences({ PrintScaling: "None", Duplex: backs ? "DuplexFlipLongEdge" : "Simplex" });

  const sides: ("front" | "back")[] = backs ? ["front", "back"] : ["front"];
  const total = paper.length * sides.length;
  let done = 0;
  const step = async () => { done++; onProgress?.(done, total); await new Promise((r) => setTimeout(r)); };
  for (const [p, coins] of pages.entries()) {
    for (const side of sides) {
      if (p || side === "back") doc.addPage("a4", "portrait");
      for (const c of coins) {
        const { role, spec, text } = paper[c.index];
        const svg = tokenSvg(lib, role, spec, { side, text });
        await drawToken(doc, svg, side === "front" ? c.x : backX(c.x), c, isRing(role) ? ringSize(spec).inner : 0);
        await step();
      }
      // Cut guides on the front only: a thin grey line on the edge of each token (and round a ring's hole).
      if (side === "front") {
        doc.setDrawColor(150); doc.setLineWidth(0.15);
        for (const c of coins) {
          if (c.card) doc.roundedRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, c.r, c.r, "S");
          else doc.circle(c.x, c.y, c.d / 2, "S");
          const { role, spec } = paper[c.index];
          if (isRing(role)) doc.circle(c.x, c.y, ringSize(spec).inner, "S");
        }
      }
      doc.setFontSize(7); doc.setTextColor(150);
      doc.text(`${title} · ${p + 1}/${pages.length}${backs ? ` · ${labels[side]}` : ""}`, PAGE.w / 2, PAGE.h - FOOTER, { align: "center" });
    }
  }
  return { blob: doc.output("blob"), sheets: pages.length, coins: paper.length };
}
