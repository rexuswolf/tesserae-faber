// Where coins go on A4 pages, shared by the PDF and the app's preview of it.
// Kept apart from print-pdf.js so the preview doesn't load jsPDF.

export const PAGE = { w: 210, h: 297 };   // A4 portrait, mm
// Tight enough for six rows of 45 mm characters (24 a sheet): most home printers print
// 8 mm from the edge, and 2 mm between coins still leaves room to cut.
const MARGIN = 8;                         // home printers can't print to the edge
const GAP = 2;                            // between coins

/** A token's place on a page: (x, y) its centre in mm from the top-left; d a coin's diameter, r a card's corner. */
export interface SheetSlot { index: number; x: number; y: number; w: number; h: number; d: number; r: number; card: boolean }
/** What layoutCoins places: a coin's diameter, or a card. */
export type PaperSize = number | { w: number; h: number; r: number };

/**
 * Places tokens on A4 pages: coins given by their diameter, or cards as { w, h, r }.
 * Rows of equal tokens, each row centred, the biggest first; when a page has no room
 * left for another row of those, smaller ones (reminders) fill the space below.
 * Returns pages of { index, x, y, w, h, d, r, card } with (x, y) the token's centre in
 * mm from the page's top-left (d is a coin's diameter, r a card's corner radius).
 */
export function layoutCoins(sizes: PaperSize[]) {
  const groups = new Map<string, { w: number; h: number; r: number; card: boolean; left: number[] }>();   // "w×h" -> { w, h, r, card, indices still to place, in queue order }
  sizes.forEach((s, index) => {
    const it = typeof s === "number" ? { w: s, h: s, r: s / 2, card: false } : { ...s, card: true };
    const k = `${it.w}×${it.h}×${it.card}`;
    if (!groups.has(k)) groups.set(k, { ...it, left: [] });
    groups.get(k)!.left.push(index);
  });
  const kinds = [...groups.values()].sort((a, b) => b.h - a.h || b.w - a.w);
  const pages: SheetSlot[][] = [];
  while (kinds.some((g) => g.left.length)) {
    const page: SheetSlot[] = [];
    let y = MARGIN;
    for (;;) {
      const g = kinds.find((k) => k.left.length && y + k.h <= PAGE.h - MARGIN);
      if (!g) break;
      const cols = Math.max(1, Math.floor((PAGE.w - 2 * MARGIN + GAP) / (g.w + GAP)));
      const row = g.left.splice(0, cols);
      let x = (PAGE.w - (row.length * g.w + (row.length - 1) * GAP)) / 2;
      for (const index of row) { page.push({ index, x: x + g.w / 2, y: y + g.h / 2, w: g.w, h: g.h, d: g.w, r: g.r, card: g.card }); x += g.w + GAP; }
      y += g.h + GAP;
    }
    if (!page.length) throw new Error(`a ${kinds.find((k) => k.left.length)!.w} mm token doesn't fit on A4`);
    pages.push(page);
  }
  return pages;
}

/** Where a coin printed at x on the front has to be on the back (long-edge flip). */
export const backX = (x: number) => PAGE.w - x;
