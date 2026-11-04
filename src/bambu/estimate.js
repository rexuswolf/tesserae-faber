// Rough filament and time for a plate, without slicing: what the Print step shows before
// the download. Calibrated against Bambu Studio's own slicing (A1 and A1 mini, PLA Basic,
// 0.20 mm layers, 15 % infill) on three designs: grams within 5 % on average for the
// filaments that matter (3 g or more), 18 % at worst.
import { slotOf } from "./plates.js";

export const DENSITY = 1.26;     // g/cm³, Bambu PLA Basic (filament_density in the templates)
const LAYER = 0.2;               // mm
const FLUSH = 400;               // mm³ purged per colour change (flush_volumes_matrix in the templates)
// The coin's body: solid top and bottom shells (5 + 3 layers), 15 % infill between, plus walls.
const SHELLS = 8 * LAYER, INFILL = 0.15;
export const CAL = {
  walls: 0.04,                   // extra share of the body for the walls
  // Minutes, a least-squares fit on 29 plates sliced by Bambu Studio (Fast print on the A1 and
  // A1 mini, Ivory coin, Hidden magnet, all of Trouble Brewing; and info cards on both):
  // within 3 % on average, 17 % at worst. Cards' big solid faces take a few minutes more each.
  t0: 3.00, perToken: 1.60, perBodyMm3: 0.00106, perInlayMm3: 0.0139, perSwap: 2.86, perCard: 3.26,
};
/** Share of a body this thick (mm) that the slicer fills. */
const bodyFill = (h) => Math.min(1, (Math.min(h, SHELLS) + Math.max(0, h - SHELLS) * INFILL) / h + CAL.walls);

const FACE = ["front", "icon", "frame"], BACK = ["back"];

/**
 * What a plate needs. `items` are {token: {spec, colours: part -> hex, foot?}, vol: part -> mm³}.
 * Returns the colour changes, grams per filament slot and minutes, plus the inputs the
 * time is fitted on.
 */
export function plateFeatures(items) {
  let n = 0, cards = 0, body = 0, inlay = 0, layers = 1;
  const face = new Set(), back = new Set(), mm3 = new Map();
  const add = (slot, v) => mm3.set(slot, (mm3.get(slot) || 0) + v);
  for (const { token, vol } of items) {
    const { spec, colours } = token, base = slotOf(colours.base);
    n++; if (token.foot) cards++; body += vol.base;   // the coin as built: a magnet may have made it thicker than its spec
    const footArea = token.foot ? token.foot.w * token.foot.h : Math.PI * (spec.diameter / 2) ** 2;   // a card, or a coin
    const h = vol.base / footArea;
    layers = Math.max(layers, Math.round(spec.depth / LAYER));
    let inlays = 0;
    for (const part of [...FACE, ...BACK]) {
      if (!vol[part]) continue;
      const slot = slotOf(colours[part] ?? colours.base);
      add(slot, vol[part]); inlays += vol[part];
      if (slot !== base) (FACE.includes(part) ? face : back).add(slot);
    }
    add(base, Math.max(0, vol.base - inlays - (vol.magnet || 0)) * bodyFill(h));
    face.add(base); back.add(base);
    inlay += inlays;
  }
  // The AMS swaps within each layer that has several colours, and once back to the coin's.
  const swaps = layers * (face.size - 1) + layers * (back.size - 1) + (face.size > 1 ? 1 : 0);
  // Purge: shared out among the plate's filaments.
  const slots = [...mm3.keys()];
  for (const s of slots) add(s, (swaps * FLUSH) / slots.length);
  const grams = slots.sort((a, b) => a - b).map((s) => [s, (mm3.get(s) * DENSITY) / 1000]);
  const minutes = CAL.t0 + CAL.perToken * n + CAL.perCard * cards + CAL.perBodyMm3 * body + CAL.perInlayMm3 * inlay + CAL.perSwap * swaps;
  return { n, cards, body, inlay, swaps, grams, minutes };
}
