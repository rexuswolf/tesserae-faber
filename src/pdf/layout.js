// Where coins go on A4 pages, shared by the PDF and the app's preview of it.
// Kept apart from print-pdf.js so the preview doesn't load jsPDF.

export const PAGE = { w: 210, h: 297 };   // A4 portrait, mm
// Tight enough for six rows of 45 mm characters (24 a sheet): most home printers print
// 8 mm from the edge, and 2 mm between coins still leaves room to cut.
const MARGIN = 8;                         // home printers can't print to the edge
const GAP = 2;                            // between coins

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
