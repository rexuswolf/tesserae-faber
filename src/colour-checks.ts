// Colour checks on a token's design: inlays you can't tell from the coin, and light inlays
// on a dark coin too shallow to cover it. Shared by the workshop (step 2) and the Print step.
import { FACE_BACK, partColours } from "./engine/token-engine.ts";
import type { Role, SpecInput } from "./types.ts";

/** CIELAB of an "#rrggbb" colour (D65), as Bambu Studio's flush predictor computes it. */
function lab(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((x) => (x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92) * 100);
  const [R, G, B] = lin;
  const x = 0.412453 * R + 0.35758 * G + 0.180423 * B, y = 0.212671 * R + 0.71516 * G + 0.072169 * B, z = 0.019334 * R + 0.119193 * G + 0.950227 * B;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 0.137931);
  const xn = f(x / 95.0489), yn = f(y / 100), zn = f(z / 108.884);
  return [116 * yn - 16, 500 * (xn - yn), 200 * (yn - zn)];
}

/** CIEDE2000 colour difference: under ~10 two filaments read as the same colour on a token. */
export function deltaE(hex1: string, hex2: string) {
  const [l1, a1, b1] = lab(hex1), [l2, a2, b2] = lab(hex2);
  const p25 = 25 ** 7, rad = Math.PI / 180;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + p25)));
  const pa1 = (1 + G) * a1, pa2 = (1 + G) * a2;
  const pc1 = Math.hypot(pa1, b1), pc2 = Math.hypot(pa2, b2);
  const h = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI));
  const ph1 = h(pa1, b1), ph2 = h(pa2, b2);
  let dh = ph2 - ph1;
  if (dh < -Math.PI) dh += 2 * Math.PI; else if (dh > Math.PI) dh -= 2 * Math.PI;
  const dL = l2 - l1, dC = pc2 - pc1, dH = pc1 * pc2 === 0 ? 0 : 2 * Math.sqrt(pc1 * pc2) * Math.sin(dh / 2);
  const Lm = (l1 + l2) / 2, Cpm = (pc1 + pc2) / 2, Hs = ph1 + ph2;
  const Hm = pc1 * pc2 === 0 ? Hs : Math.abs(ph1 - ph2) <= Math.PI ? Hs / 2 : Hs < 2 * Math.PI ? (Hs + 2 * Math.PI) / 2 : (Hs - 2 * Math.PI) / 2;
  const T = 1 - 0.17 * Math.cos(Hm - 30 * rad) + 0.24 * Math.cos(2 * Hm) + 0.32 * Math.cos(3 * Hm + 6 * rad) - 0.2 * Math.cos(4 * Hm - 63 * rad);
  const dth = 30 * rad * Math.exp(-(((Hm - 275 * rad) / (25 * rad)) ** 2));
  const RC = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + p25));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -Math.sin(2 * dth) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

export const lightness = (hex: string) => lab(hex)[0];

// Same colour, or as good as (Yellow and Gold are 2.4 apart; every other pair of the
// app's filaments is over 16).
const CLASH = 10;
// A light filament (L* 65 and up: Yellow, Gold, Silver, White) one layer deep over a dark
// coin (L* 45 or less: Black, Red, Purple) lets the coin show through and looks greyish.
// A rule of thumb for PLA, not a measurement: 0.4 mm (two layers) covers it.
const LIGHT = 65, DARK = 45, COVERS = 0.4;

/**
 * What's wrong with a token's colours: `clash`, the inlaid parts ("front": name and icon,
 * "frame", "back") the same colour as the coin; `light`, the light parts too shallow on a
 * dark coin. Parts the design doesn't have (no frame, a plain back) aren't checked.
 */
/** The inlaid parts a colour check looks at ("front" is the name and the icon). */
export type InlayPart = "front" | "frame" | "back";

export function colourIssues(role: Role, spec: SpecInput): { clash: InlayPart[]; light: InlayPart[] } {
  const c = partColours(role, spec);
  const parts: InlayPart[] = ["front"];
  if (spec.frame && spec.frame !== "none") parts.push("frame");
  // a back design; or a back face in a colour of its own (in the front's, it's checked with the front)
  if (spec.back && spec.back !== "none" && (spec.back !== FACE_BACK || c.back !== c.front)) parts.push("back");
  const clash = parts.filter((p) => deltaE(c[p], c.base) < CLASH);
  const dark = lightness(c.base) <= DARK;
  const light = dark && (spec.depth ?? 0.2) < COVERS ? parts.filter((p) => !clash.includes(p) && lightness(c[p]) >= LIGHT) : [];
  return { clash, light };
}

export const LIGHT_DEPTH = COVERS;
