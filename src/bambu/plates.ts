// How tokens are grouped onto a Bambu printer's plates: filament slots, how many fit, where
// the prime tower goes. The A1 and the A1 mini share the AMS lite (4 filaments) and differ
// in their bed. Shared by the queue's preview and the .3mf writer (bambu3mf.ts),
// which only loads when someone downloads a project.

import FLUSH from "./flush.json";
import type { Foot, Hex, PartName, Plate, PlateItem, PlanToken, PlatePlan } from "../types.ts";
import { coinExtent } from "../engine/token-engine.ts";

// Filament number = index + 1. Must match COLOURS in tools/make_bambu_template.py.
export const FILAMENT_SLOTS = [
  { hex: "#1d1c21", name: "Black" },
  { hex: "#2f86e0", name: "Blue" },
  { hex: "#b3191e", name: "Red" },
  { hex: "#8a3d9e", name: "Purple" },
  { hex: "#d4a72c", name: "Yellow" },
  { hex: "#3f9651", name: "Green" },
  { hex: "#c9a227", name: "Gold" },
  { hex: "#a7adb4", name: "Silver" },
  { hex: "#9a6a3a", name: "Bronze" },
  { hex: "#ece9e2", name: "White" },
];
// Later parts win where parts overlap: the icon sits over the (flat) window, on the front and
// on a two-state token's back.
export const PARTS: PartName[] = ["base", "front", "icon", "frame", "back", "backIcon", "backFrame"];
export interface Printer { id: string; name: string; short: string; bed: number }
// Ids match PRINTERS in tools/make_bambu_template.py, which writes each one's <id>-template.json.
export const PRINTERS: Record<string, Printer> = {
  a1: { id: "a1", name: "Bambu Lab A1", short: "A1", bed: 256 },
  a1mini: { id: "a1mini", name: "Bambu Lab A1 mini", short: "A1 mini", bed: 180 },
};
export const printerOf = (id: string) => PRINTERS[id] ?? PRINTERS.a1;
/**
 * The nozzles both printers take, each with Bambu's standard profile for it
 * (tools/make_bambu_template.py writes <printer><suffix>-template.json): its layer height,
 * the first layer's line width we ask for (the lettering is the first layer, see
 * bambu3mf.ts) and the smallest letters it prints cleanly, which scale with the nozzle.
 */
export interface Nozzle {
  id: string; mm: number; suffix: string; layer: number; firstLine: string; smallLetters: number; towerInfillGap: string | null;
}
export const NOZZLES: Record<string, Nozzle> = {
  "0.4": { id: "0.4", mm: 0.4, suffix: "", layer: 0.2, firstLine: "0.42", smallLetters: 2.5, towerInfillGap: null },
  // On 0.10 mm layers Bambu's square prime tower grows: an Ivory plate's (three colours a
  // layer, the most a face has) measured 56.6 mm and went off the bed, against 43.9 on the
  // 0.4 mm nozzle. Its infill at 100 % gap instead of 150 % brings it to 47.8, which fits the
  // space kept for it (towerSpot).
  "0.2": { id: "0.2", mm: 0.2, suffix: "-n02", layer: 0.1, firstLine: "0.22", smallLetters: 1.25, towerInfillGap: "100%" },
};
export const nozzleOf = (id: string) => NOZZLES[id] ?? NOZZLES["0.4"];
const A1_BED = PRINTERS.a1.bed;
/** Bambu Studio lays a project's plates out on a grid of the bed plus a fifth. */
export const plateStride = (bed = A1_BED) => bed * 1.2;
const MARGIN = 8, GAP = 3;
export const AMS_SLOTS = 4;

/**
 * mm³ to purge going from filament slot `a` to `b`: Bambu Studio's auto-calculated value
 * (flush.json, from tools/make_flush_table.py) plus 20 % so it never falls short, within
 * Bambu's 900 cap. Dark after light needs little (White → Black 200), light after dark a
 * lot (Black → White 700).
 */
const FLUSH_MARGIN = 1.2;
export const purge = (a: number, b: number) => (a === b ? 0 : Math.min(900, Math.ceil((FLUSH.matrix[a][b] * FLUSH_MARGIN) / 10) * 10));

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** How far apart two colours look ("redmean": RGB weighted as the eye weighs it). */
function colourGap(a: string, b: string) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b), rm = (r1 + r2) / 2;
  return (2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2;
}
/** A colour's filament: its own, else the one that looks most like it (a colour of your own prints in it). */
export const slotOf = (hex: Hex) => {
  const h = String(hex).toLowerCase(), i = FILAMENT_SLOTS.findIndex((s) => s.hex === h);
  if (i >= 0) return i;
  if (!/^#[0-9a-f]{6}$/.test(h)) throw new Error(`no filament for colour ${hex}`);
  let best = 0;
  FILAMENT_SLOTS.forEach((s, j) => { if (colourGap(h, s.hex) < colourGap(h, FILAMENT_SLOTS[best].hex)) best = j; });
  return best;
};
/** Whether a colour is a filament's own (else it prints in the nearest: slotOf). */
export const isFilament = (hex: string) => FILAMENT_SLOTS.some((s) => s.hex === hex.toLowerCase());

/** Filament slots one token needs. */
function tokenSlots(token: PlanToken) {
  return new Set(PARTS.filter((p) => token.parts[p]).map((p) => slotOf(token.colours[p])));
}

// The prime tower: Bambu's 35 mm wide, or narrower (down to 20) when that fits it in the strip right of the
// tokens, so no token's place is kept for it (the A1 mini: nine 45 mm coins a plate, not eight). Deepest
// measured (4 filaments, A1 settings, 35 mm wide): about 35 mm plus brim; a narrower one is as much deeper (the
// same purge a layer): 20 mm wide, 4 filaments, sliced on the A1 mini, 26.4 × 65.4 mm with its brim. Its brim is
// 3.2 mm round it; towerSpot puts it 3 mm right of where its room starts.
export const TOWER_WIDTH = 35;
const TOWER_MIN = 20, TOWER_DEPTH = 40, TOWER_BRIM = 3.2, TOWER_FROM = 3;
/** How deep a tower this wide can grow (mm, with its brim). */
const towerDepth = (tower: number) => TOWER_DEPTH * Math.max(1, TOWER_WIDTH / tower);

/** A token's footprint: a coin's diameter, or a card's { w, h }. */
const footOf = (f: number | Foot): Foot => (typeof f === "number" ? { w: f, h: f } : f);

/** The grid for a footprint on a bed (mm): columns, rows, and whether the tower fits in the strip on the right
 *  (from past the last column to 1 mm short of the bed's edge). */
function gridFor(foot: number | Foot, bed: number, tower = TOWER_WIDTH) {
  const { w, h } = footOf(foot);
  const cols = Math.max(1, Math.floor((bed - 2 * MARGIN + GAP) / (w + GAP)));
  const rows = Math.max(1, Math.floor((bed - 2 * MARGIN + GAP) / (h + GAP)));
  const strip = bed - (MARGIN + cols * (w + GAP));
  return { w, h, cols, rows, strip, towerInStrip: strip >= TOWER_FROM + tower + TOWER_BRIM + 1 };
}
/** The widest tower (down to 20 mm) that fits in the strip beside this footprint's tokens, if narrower than 35. */
function stripTower(foot: number | Foot, bed: number) {
  const w = Math.floor(gridFor(foot, bed).strip - TOWER_FROM - TOWER_BRIM - 1);
  return w >= TOWER_MIN && w < TOWER_WIDTH ? w : null;
}

/**
 * Grid positions (mm, plate coordinates) for tokens of this footprint, filling rows
 * from the top-left. The prime tower goes in the free strip on the right if it fits
 * there (cards); otherwise the bottom of the last column is kept for it: as many slots
 * as its depth needs (1 for 45 mm coins, 2 for 32 mm).
 */
export function slotsFor(foot: number | Foot, bed = A1_BED, tower = TOWER_WIDTH) {
  const g = gridFor(foot, bed, tower), px = g.w + GAP, py = g.h + GAP;
  const reserved = g.towerInStrip ? 0 : Math.min(g.rows, Math.ceil((towerDepth(tower) + 2 - MARGIN + GAP) / py));
  const out: { x: number; y: number }[] = [];
  for (let row = 0; row < g.rows; row++) {
    for (let col = 0; col < g.cols; col++) {
      if (col === g.cols - 1 && row >= g.rows - reserved) continue;
      out.push({ x: MARGIN + g.w / 2 + col * px, y: bed - MARGIN - g.h / 2 - row * py });
    }
  }
  return out.length ? out : [{ x: bed / 2, y: bed / 2 }];
}

/** How many tokens of this footprint fit on one plate (leaving room for the tower). */
export function perPlate(foot: number | Foot, bed = A1_BED, tower = TOWER_WIDTH) {
  return slotsFor(foot, bed, tower).length;
}

/**
 * Groups tokens onto plates. Each plate holds one group only (Good, Evil,
 * Travellers, Fabled, Loric), at most `perPlate` tokens and at most 4 filaments
 * (the AMS lite).
 * @param items [{token, title, group}] group is a label such as "Good".
 * @param bed the printer's bed in mm (the A1's by default).
 */
export function planPlates<I extends PlateItem>(items: I[], { bed = A1_BED }: { bed?: number } = {}): PlatePlan<I> {
  const groups: string[] = [];
  for (const it of items) if (!groups.includes(it.group)) groups.push(it.group);
  // Each group has its own grid: reminder tokens are smaller, so more fit per plate;
  // cards (info tokens) have their own group and footprint.
  const feet = groups.map((group) => {
    const mineItems = items.filter((it) => it.group === group);
    const card = mineItems.find((it) => it.token.foot)?.token.foot;
    // a polygon coin by the circle round its corners, so neighbours never meet
    const diameter = card ? card.w : Math.max(...mineItems.map((it) => 2 * coinExtent(it.token.spec)));
    return { group, diameter, foot: card ?? diameter };
  });
  // The tower one width for the whole project: Bambu's, or one narrow enough for a group's strip, whichever
  // makes fewer plates (a narrower tower is deeper, so it can take more room on a plate that has no strip for it).
  const widths = [TOWER_WIDTH, ...new Set(feet.map((f) => stripTower(f.foot, bed)).filter((w): w is number => w !== null))].sort((a, b) => b - a);
  const plans = widths.map((tower) => ({ tower, plates: plateGroups(items, feet, bed, tower) }));
  const best = plans.reduce((a, b) => (b.plates.length < a.plates.length ? b : a));
  return { plates: best.plates, bed, tower: best.tower };
}

function plateGroups<I extends PlateItem>(items: I[], feet: { group: string; diameter: number; foot: number | Foot }[], bed: number, tower: number) {
  const plates: Plate<I>[] = [];
  for (const { group, diameter, foot } of feet) {
    const capacity = perPlate(foot, bed, tower);
    const members = items.filter((it) => it.group === group).map((it) => ({ ...it, slots: tokenSlots(it.token) }))
      .sort((a, b) => [...a.slots].sort().join().localeCompare([...b.slots].sort().join()) || a.title.localeCompare(b.title));
    const mine: Plate<I>[] = [];
    for (const it of members) {
      if (it.slots.size > AMS_SLOTS) throw new Error(`${it.title} needs ${it.slots.size} filaments; the AMS lite holds ${AMS_SLOTS}`);
      let plate = mine.find((p) => p.items.length < capacity && new Set([...p.slots, ...it.slots]).size <= AMS_SLOTS);
      if (!plate) { plate = { name: "", group, diameter, foot, capacity, items: [], slots: new Set() }; mine.push(plate); }
      plate.items.push(it);
      it.slots.forEach((sl) => plate!.slots.add(sl));
    }
    mine.forEach((p, i) => { p.name = mine.length > 1 ? `${group} ${i + 1}` : group; });
    plates.push(...mine);
  }
  return plates;
}

/** Where the prime tower goes on a plate: the free strip on the right, or the bottom-right slot. */
export function towerSpot(foot: number | Foot, bed = A1_BED, tower = TOWER_WIDTH) {
  const g = gridFor(foot, bed, tower);
  const left = g.towerInStrip ? MARGIN + g.cols * (g.w + GAP) : MARGIN + (g.cols - 1) * (g.w + GAP);
  return { x: left + TOWER_FROM, y: MARGIN + 2 };   // the tower grows towards +y from here
}
