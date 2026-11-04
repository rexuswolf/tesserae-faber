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
import { tokenSvg } from "../engine/token-engine.js";
import { PAGE, layoutCoins, backX } from "./layout.js";

export { PAGE, layoutCoins, backX };

const BLEED = 1.2;                        // coin colour past the cut line, both sides,
                                          // so a slightly off duplex never shows white
const FOOTER = 6;                         // page label baseline, inside the bottom margin

const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;
const baseColour = (svg) => svg.match(/^<svg[^>]*><circle r="[^"]*" fill="(#[0-9a-fA-F]{6})"/)?.[1] ?? null;

async function drawCoin(doc, svg, cx, cy, d) {
  // Bleed: a slightly bigger disc in the coin colour under the design.
  const fill = baseColour(svg);
  if (fill) { doc.setFillColor(fill); doc.circle(cx, cy, d / 2 + BLEED, "F"); }
  // tokenSvg's viewBox is the coin plus 0.5 mm all round.
  const el = parser.parseFromString(svg, "image/svg+xml").documentElement;
  const box = d + 1;
  await svg2pdf(el, doc, { x: cx - box / 2, y: cy - box / 2, width: box, height: box });
}

/**
 * Builds the PDF.
 *   entries: [{ role, spec, text }]  (spec already resolved: reminders use reminderSpec)
 *   labels:  { front, back } page labels, e.g. "cara" / "dorso"
 * Returns { blob, sheets, coins }.
 */
export async function buildPrintPdf(lib, entries, { labels = { front: "front", back: "back" }, title = "Midnight Mint", onProgress } = {}) {
  // Paper has no magnets: drop the 3D-only pocket from the back.
  const paper = entries.map((e) => ({ ...e, spec: { ...e.spec, magnet: "none" } }));
  const pages = layoutCoins(paper.map((e) => e.spec.diameter));
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({ title, creator: "Midnight Mint" });
  // Hints for viewers that honour them (Acrobat): real size, duplex on the long edge.
  doc.viewerPreferences({ PrintScaling: "None", Duplex: "DuplexFlipLongEdge" });

  const total = paper.length * 2;
  let done = 0;
  const step = async () => { done++; onProgress?.(done, total); await new Promise((r) => setTimeout(r)); };
  for (const [p, coins] of pages.entries()) {
    for (const side of ["front", "back"]) {
      if (p || side === "back") doc.addPage("a4", "portrait");
      for (const c of coins) {
        const { role, spec, text } = paper[c.index];
        const svg = tokenSvg(lib, role, spec, { side, text });
        await drawCoin(doc, svg, side === "front" ? c.x : backX(c.x), c.y, c.d);
        await step();
      }
      // Cut guides on the front only: a thin grey circle on the edge of each coin.
      if (side === "front") {
        doc.setDrawColor(150); doc.setLineWidth(0.15);
        for (const c of coins) doc.circle(c.x, c.y, c.d / 2, "S");
      }
      doc.setFontSize(7); doc.setTextColor(150);
      doc.text(`${title} · ${p + 1}/${pages.length} · ${labels[side]}`, PAGE.w / 2, PAGE.h - FOOTER, { align: "center" });
    }
  }
  return { blob: doc.output("blob"), sheets: pages.length, coins: paper.length };
}
