// Rough filament and time for a plate, without slicing: what the Print step shows before
// the download. Calibrated against Bambu Studio's own slicing (A1 and A1 mini, PLA Basic,
// Bambu's standard profile for each nozzle, 15 % infill): grams within 5 % on average for
// the filaments that matter (3 g or more).
import { nozzleOf, purge, slotOf } from "./plates.js";

export const DENSITY = 1.26;     // g/cm³, Bambu PLA Basic (filament_density in the templates)
const INFILL = 0.15;
// Per nozzle: the profile's layer height and solid shells (top + bottom layers), and the
// time model, a least-squares fit on plates sliced by Bambu Studio.
export const CAL = {
  // 0.20 mm layers, 5 + 3 shells. 29 plates (Fast print on the A1 and A1 mini, Ivory coin,
  // Hidden magnet, all of Trouble Brewing; and info cards on both): within 3 % on average,
  // 17 % at worst. Cards' big solid faces take a few minutes more each.
  "0.4": { layer: 0.2, shells: 8, walls: 0.04,
    t0: 3.00, perToken: 1.60, perBodyMm3: 0.00106, perInlayMm3: 0.0139, perSwap: 2.86, perCard: 3.26 },
  // 0.10 mm layers, 7 + 5 shells. 36 plates (Fast print and Ivory coin on the A1 and A1 mini,
  // Hidden magnet on the A1 mini, all of Trouble Brewing): within 4 % on average, 13 % at
  // worst; grams 3 % under on average. No cards in that set: perCard scales the 0.4 mm one
  // like perToken (×3.3).
  "0.2": { layer: 0.1, shells: 12, walls: 0.04,
    t0: 9.43, perToken: 5.34, perBodyMm3: 0.00559, perInlayMm3: 0.0391, perSwap: 5.02, perCard: 10.9 },
};
/** Share of a body this thick (mm) that the slicer fills. */
const bodyFill = (h, c) => { const sh = c.shells * c.layer; return Math.min(1, (Math.min(h, sh) + Math.max(0, h - sh) * INFILL) / h + c.walls); };

const FACE = ["front", "icon", "frame"], BACK = ["back"];

/**
 * What a plate needs. `items` are {token: {spec, colours: part -> hex, foot?}, vol: part -> mm³}.
 * Returns the colour changes, grams per filament slot and minutes, plus the inputs the
 * time is fitted on.
 */
export function plateFeatures(items, nozzle = "0.4") {
  const c = CAL[nozzleOf(nozzle).id];
  let n = 0, cards = 0, body = 0, inlay = 0, layers = 1, reliefLayers = 0;
  const face = new Set(), back = new Set(), raised = new Set(), mm3 = new Map();
  const add = (slot, v) => mm3.set(slot, (mm3.get(slot) || 0) + v);
  for (const { token, vol } of items) {
    const { spec, colours } = token, base = slotOf(colours.base);
    n++; if (token.foot) cards++; body += vol.base;   // the coin as built: a magnet may have made it thicker than its spec
    const footArea = token.foot ? token.foot.w * token.foot.h : Math.PI * (spec.diameter / 2) ** 2;   // a card, or a coin
    const h = vol.base / footArea;
    layers = Math.max(layers, Math.round(spec.depth / c.layer));
    // Raised parts (vol.above: part -> mm³ standing out of the face) add layers above the
    // coin with only their own colours; only the rest of each inlay displaces coin.
    let inlays = 0, sunk = 0;
    for (const part of [...FACE, ...BACK]) {
      if (!vol[part]) continue;
      const slot = slotOf(colours[part] ?? colours.base), up = vol.above?.[part] || 0;
      add(slot, vol[part]); inlays += vol[part]; sunk += vol[part] - up;
      if (slot !== base) (FACE.includes(part) ? face : back).add(slot);
      if (up) { raised.add(slot); reliefLayers = Math.max(reliefLayers, Math.round((spec.reliefHeight ?? 0.6) / c.layer)); }
    }
    add(base, Math.max(0, vol.base - sunk - (vol.magnet || 0)) * bodyFill(h, c));
    face.add(base); back.add(base);
    inlay += inlays;
  }
  // Colour changes and their purge (of the filament coming in). Each multi-colour layer
  // carries on with the colour the last one ended on and goes through the others: the face
  // starts on the inlays' first colour (loaded with the plate's start) and ends its first
  // layer on the coin's (firstLayerOrder in bambu3mf.js); the next face layers go back the
  // other way, and the body after them needs the coin's colour. The back's layers likewise.
  const coin = items.length ? slotOf(items[0].token.colours.base) : 0;
  let swaps = 0, at = null;
  const walk = (path) => { for (const b of path) { if (at !== null && at !== b) { swaps++; add(b, purge(at, b)); } at = b; } };
  const layered = (path) => {
    if (path.length < 2) return;
    for (let i = 0; i < layers; i++) walk(i % 2 ? [...path].reverse() : path);
  };
  const faceOrder = [...face].filter((s) => s !== coin).concat(coin);
  layered(faceOrder);
  for (let i = 0; i < reliefLayers; i++) walk(i % 2 ? [...raised].reverse() : [...raised]);   // the relief
  walk([coin]);                                        // the body
  layered([coin, ...[...back].filter((s) => s !== coin)]);
  const slots = [...mm3.keys()];
  const grams = slots.sort((a, b) => a - b).map((s) => [s, (mm3.get(s) * DENSITY) / 1000]);
  // Time also counts the plate's first load of an inlay colour: it takes as long as a
  // change (perSwap was fitted that way), though its purge isn't in the plate's grams.
  const loads = swaps + (faceOrder.length > 1 ? 1 : 0);   // + the first load
  const minutes = c.t0 + c.perToken * n + c.perCard * cards + c.perBodyMm3 * body + c.perInlayMm3 * inlay + c.perSwap * loads;
  return { n, cards, body, inlay, swaps, loads, grams, minutes };
}
