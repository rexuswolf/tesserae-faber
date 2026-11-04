// How tokens are grouped onto the A1's plates: filament slots, how many fit, where the
// prime tower goes. Shared by the queue's preview and the .3mf writer (bambu3mf.js),
// which only loads when someone downloads a project.

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
export const PARTS = ["base", "front", "icon", "frame", "back"];
export const BED = 256;                 // A1 build plate, mm
export const PLATE_STRIDE = BED * 1.2;  // Bambu Studio lays plates out on this grid
const MARGIN = 8, GAP = 3;
export const AMS_SLOTS = 4;

export const slotOf = (hex) => {
  const i = FILAMENT_SLOTS.findIndex((s) => s.hex === String(hex).toLowerCase());
  if (i < 0) throw new Error(`no filament for colour ${hex}`);
  return i;
};

/** Filament slots one token needs. */
function tokenSlots(token) {
  return new Set(PARTS.filter((p) => token.parts[p]).map((p) => slotOf(token.colours[p])));
}

/** Tokens per row on a plate for this diameter. */
const perRowFor = (diameter) => Math.max(1, Math.floor((BED - 2 * MARGIN + GAP) / (diameter + GAP)));

// Deepest prime tower measured (4 filaments, A1 settings): about 35 mm plus brim.
const TOWER_DEPTH = 40;

/**
 * Grid positions (mm, plate coordinates) for tokens of this diameter, filling
 * rows from the top-left. The bottom of the last column is kept free for the
 * prime tower: as many slots as its depth needs (1 for 45 mm, 2 for 32 mm).
 */
export function slotsFor(diameter) {
  const n = perRowFor(diameter), pitch = diameter + GAP, first = MARGIN + diameter / 2;
  const reserved = Math.min(n, Math.ceil((TOWER_DEPTH + 2 - MARGIN + GAP) / pitch));
  const out = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (col === n - 1 && row >= n - reserved) continue;
      out.push({ x: first + col * pitch, y: BED - first - row * pitch });
    }
  }
  return out.length ? out : [{ x: BED / 2, y: BED / 2 }];
}

/** How many tokens of this diameter fit on one plate (leaving room for the tower). */
export function perPlate(diameter) {
  return slotsFor(diameter).length;
}

/**
 * Groups tokens onto plates. Each plate holds one group only (Good, Evil,
 * Travellers, Fabled, Loric), at most `perPlate` tokens and at most 4 filaments
 * (the AMS lite).
 * @param items [{token, title, group}] group is a label such as "Good".
 */
export function planPlates(items) {
  const groups = [];
  for (const it of items) if (!groups.includes(it.group)) groups.push(it.group);
  const plates = [];
  for (const group of groups) {
    // Each group has its own grid: reminder tokens are smaller, so more fit per plate.
    const diameter = Math.max(...items.filter((it) => it.group === group).map((it) => it.token.spec.diameter));
    const capacity = perPlate(diameter);
    const members = items.filter((it) => it.group === group).map((it) => ({ ...it, slots: tokenSlots(it.token) }))
      .sort((a, b) => [...a.slots].sort().join().localeCompare([...b.slots].sort().join()) || a.title.localeCompare(b.title));
    const mine = [];
    for (const it of members) {
      if (it.slots.size > AMS_SLOTS) throw new Error(`${it.title} needs ${it.slots.size} filaments; the AMS lite holds ${AMS_SLOTS}`);
      let plate = mine.find((p) => p.items.length < capacity && new Set([...p.slots, ...it.slots]).size <= AMS_SLOTS);
      if (!plate) { plate = { group, diameter, capacity, items: [], slots: new Set() }; mine.push(plate); }
      plate.items.push(it);
      it.slots.forEach((sl) => plate.slots.add(sl));
    }
    mine.forEach((p, i) => { p.name = mine.length > 1 ? `${group} ${i + 1}` : group; });
    plates.push(...mine);
  }
  return { plates };
}

/** Where the prime tower goes on every plate: the free bottom-right slot. */
export function towerSpot(diameter) {
  const n = perRowFor(diameter), pitch = diameter + GAP;
  const left = MARGIN + (n - 1) * pitch;           // left edge of the last column
  return { x: left + 3, y: MARGIN + 2 };            // the tower grows towards +y from here
}
