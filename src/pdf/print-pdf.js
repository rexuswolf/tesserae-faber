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

export const PAGE = { w: 210, h: 297 };   // A4 portrait, mm
const MARGIN = 10;                        // home printers can't print to the edge
const GAP = 3;                            // between coins
const BLEED = 1.2;                        // coin colour past the cut line, both sides,
                                          // so a slightly off duplex never shows white
const FOOTER = 6;                         // page label baseline, inside the bottom margin

/**
 * Places coins of the given diameters on A4 pages: rows of equal coins, each row
 * centred, the biggest coins first; when a page has no room left for another row
 * of those, smaller coins (reminders) fill the space below. Returns pages of
 * { index, x, y, d } with (x, y) the coin's centre in mm from the page's top-left.
 */
export function layoutCoins(diameters) {
  const groups = new Map();   // diameter -> indices still to place, in queue order
  diameters.forEach((d, index) => { if (!groups.has(d)) groups.set(d, []); groups.get(d).push(index); });
  const sizes = [...groups.keys()].sort((a, b) => b - a);
  const left = () => sizes.some((d) => groups.get(d).length);
  const pages = [];
  while (left()) {
    const page = [];
    let y = MARGIN;
    for (;;) {
      const d = sizes.find((s) => groups.get(s).length && y + s <= PAGE.h - MARGIN);
      if (d == null) break;
      const cols = Math.max(1, Math.floor((PAGE.w - 2 * MARGIN + GAP) / (d + GAP)));
      const row = groups.get(d).splice(0, cols);
      let x = (PAGE.w - (row.length * d + (row.length - 1) * GAP)) / 2;
      for (const index of row) { page.push({ index, x: x + d / 2, y: y + d / 2, d }); x += d + GAP; }
      y += d + GAP;
    }
    if (!page.length) throw new Error(`a ${sizes.find((s) => groups.get(s).length)} mm token doesn't fit on A4`);
    pages.push(page);
  }
  return pages;
}

/** Where a coin printed at x on the front has to be on the back (long-edge flip). */
export const backX = (x) => PAGE.w - x;

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
