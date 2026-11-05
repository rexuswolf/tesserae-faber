// How tokens are grouped onto a Bambu printer's plates: filament slots, how many fit, where
// the prime tower goes. The A1 and the A1 mini share the AMS lite (4 filaments) and differ
// in their bed. Shared by the queue's preview and the .3mf writer (bambu3mf.js),
// which only loads when someone downloads a project.

import FLUSH from "./flush.json";
import type { Foot, Hex, PartName, Plate, PlateItem, PlanToken, PlatePlan } from "../types.ts";

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
// Later parts win where parts overlap: the icon sits over the (flat) window.
export const PARTS: PartName[] = ["base", "front", "icon", "frame", "back"];
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
 * bambu3mf.js) and the smallest letters it prints cleanly, which scale with the nozzle.
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

export const slotOf = (hex: Hex) => {
  const i = FILAMENT_SLOTS.findIndex((s) => s.hex === String(hex).toLowerCase());
  if (i < 0) throw new Error(`no filament for colour ${hex}`);
  return i;
};

/** Filament slots one token needs. */
function tokenSlots(token: PlanToken) {
  return new Set(PARTS.filter((p) => token.parts[p]).map((p) => slotOf(token.colours[p])));
}

// Deepest prime tower measured (4 filaments, A1 settings): about 35 mm plus brim.
const TOWER_DEPTH = 40, TOWER_WIDTH = 41;   // 35 mm (prime_tower_width) plus its brim

/** A token's footprint: a coin's diameter, or a card's { w, h }. */
const footOf = (f: number | Foot): Foot => (typeof f === "number" ? { w: f, h: f } : f);

/** The grid for a footprint on a bed (mm): columns, rows, and the free strip on the right. */
function gridFor(foot: number | Foot, bed: number) {
  const { w, h } = footOf(foot);
  const cols = Math.max(1, Math.floor((bed - 2 * MARGIN + GAP) / (w + GAP)));
  const rows = Math.max(1, Math.floor((bed - 2 * MARGIN + GAP) / (h + GAP)));
  const strip = bed - 2 * MARGIN - (cols * w + (cols - 1) * GAP) - GAP;
  return { w, h, cols, rows, strip, towerInStrip: strip >= TOWER_WIDTH };
}

/**
 * Grid positions (mm, plate coordinates) for tokens of this footprint, filling rows
 * from the top-left. The prime tower goes in the free strip on the right if it fits
 * there (cards); otherwise the bottom of the last column is kept for it: as many slots
 * as its depth needs (1 for 45 mm coins, 2 for 32 mm).
 */
export function slotsFor(foot: number | Foot, bed = A1_BED) {
  const g = gridFor(foot, bed), px = g.w + GAP, py = g.h + GAP;
  const reserved = g.towerInStrip ? 0 : Math.min(g.rows, Math.ceil((TOWER_DEPTH + 2 - MARGIN + GAP) / py));
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
export function perPlate(foot: number | Foot, bed = A1_BED) {
  return slotsFor(foot, bed).length;
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
  const plates: Plate<I>[] = [];
  for (const group of groups) {
    // Each group has its own grid: reminder tokens are smaller, so more fit per plate;
    // cards (info tokens) have their own group and footprint.
    const mineItems = items.filter((it) => it.group === group);
    const card = mineItems.find((it) => it.token.foot)?.token.foot;
    const diameter = card ? card.w : Math.max(...mineItems.map((it) => it.token.spec.diameter));
    const foot = card ?? diameter;
    const capacity = perPlate(foot, bed);
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
  return { plates, bed };
}

/** Where the prime tower goes on a plate: the free strip on the right, or the bottom-right slot. */
export function towerSpot(foot: number | Foot, bed = A1_BED) {
  const g = gridFor(foot, bed);
  const left = g.towerInStrip ? MARGIN + g.cols * (g.w + GAP) : MARGIN + (g.cols - 1) * (g.w + GAP);
  return { x: left + 3, y: MARGIN + 2 };            // the tower grows towards +y from here
}
