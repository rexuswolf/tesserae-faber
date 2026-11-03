// Clocktower token engine: builds printable token geometry, previews it in 3D,
// renders 2D thumbnails and exports STLs. Shared by every UI prototype.
//
// A token is a black base coin plus "inlays": thin parts sunk flush into the
// coin's faces and printed in another filament (the same trick the Python
// generator uses for its overlay). Slicers give the later part priority where
// parts overlap, so no boolean geometry is needed and the coin stays flat.
//
//   front  – role icon + curved name, top face (team colour)
//   frame  – border design around the rim, top face
//   back   – pattern on the bottom face (mirrored so it reads correctly)

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { Font } from "three/addons/loaders/FontLoader.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export { THREE };

const TRACE_VIEW = 127.559055; // potrace viewBox; traced to a 45 mm square
const TRACE_MM = 45;

export const TEAMS = {
  townsfolk: { label: { en: "Townsfolk", es: "Aldeanos" }, colour: "#2f86e0", file: "blue" },
  outsider: { label: { en: "Outsiders", es: "Forasteros" }, colour: "#2f86e0", file: "blue" },
  minion: { label: { en: "Minions", es: "Esbirros" }, colour: "#b3191e", file: "red" },
  demon: { label: { en: "Demons", es: "Demonios" }, colour: "#b3191e", file: "red" },
  traveller: { label: { en: "Travellers", es: "Viajeros" }, colour: "#8a3d9e", file: "purple" },
  fabled: { label: { en: "Fabled", es: "Fábulas" }, colour: "#d4a72c", file: "yellow" },
  loric: { label: { en: "Loric", es: "Lóricos" }, colour: "#3f9651", file: "green" },
};

export const FRAME_STYLES = [
  { id: "none", label: "None" },
  { id: "rim", label: "Rim" },
  { id: "double", label: "Double rim" },
  { id: "clock", label: "Clock ticks" },
  { id: "beads", label: "Beads" },
  { id: "acunado", label: "Milled edge" },
  { id: "cordon", label: "Rope" },
  { id: "fases", label: "Moon phases" },
  { id: "firmamento", label: "Stars" },
  { id: "laurel", label: "Laurel" },
];

export const BACK_STYLES = [
  { id: "none", label: "Plain" },
  { id: "medianoche", label: "Midnight" },
  { id: "guilloche", label: "Guilloché" },
  { id: "rosa", label: "Compass rose" },
  { id: "sol", label: "Sunburst" },
  { id: "eclipse", label: "Eclipse" },
  { id: "edition", label: "Edition" },
  { id: "custom", label: "Your SVG" },
];

/** Editions as coded in TPI's roles.json, with the mark used on token backs. */
export const EDITIONS = {
  tb: { name: { en: "Trouble Brewing", es: "Trouble Brewing" }, mark: "TB" },
  bmr: { name: { en: "Bad Moon Rising", es: "Bad Moon Rising" }, mark: "BMR" },
  snv: { name: { en: "Sects & Violets", es: "Sects & Violets" }, mark: "S&V" },
  carousel: { name: { en: "The Carousel", es: "The Carousel" }, mark: "C" },
  fabled: { name: { en: "Fabled", es: "Fábulas" }, mark: "F" },
  loric: { name: { en: "Loric", es: "Lóricos" }, mark: "L" },
};

export const FILAMENTS = {
  black: "#1d1c21",
  white: "#ece9e2",
  gold: "#c9a227",
  silver: "#a7adb4",
  bronze: "#9a6a3a",
};

/** Token layouts: "classic" (curved name, flush inlays, printed face-down) and
 *  "window" (coloured window with the icon in relief, straight name, printed face-up). */
export const TOKEN_STYLES = [{ id: "classic" }, { id: "window" }];

export const DEFAULT_SPEC = {
  style: "classic",
  windowDepth: 0.8,    // mm; how deep the window is (window style, relief finish)
  windowFinish: "relief",   // "relief": icon stands in a recessed window (printed face-up)
                            // "flat": everything flush, nothing to feel by touch (printed face-down)
  lang: "es",
  diameter: 45,
  height: 2,
  depth: 0.2,
  iconScale: 1,
  iconOffsetY: 0,      // mm; raises the icon (reminder tokens make room for their word)
  textSize: 4,
  spacing: 1.1,
  margin: 2,
  maxArc: 180,
  frame: "none",
  frameWidth: 0.8,
  back: "none",
  customSvg: null,
  colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold },
};

/**
 * A reminder token's spec, derived from the character style: smaller coin,
 * smaller raised icon, the reminder word along the bottom, plain back.
 */
export function reminderSpec(spec) {
  return {
    ...spec,
    diameter: spec.reminderDiameter ?? 32,
    textSize: 3,
    iconScale: 0.68,
    iconOffsetY: 3,
    margin: 1.5,
    maxArc: 240,
    frameWidth: Math.min(spec.frameWidth ?? 0.8, 0.6),
    // Same back as the character tokens: the designed backs scale with the coin.
  };
}

// ---------------------------------------------------------------- loading

/**
 * Prepares the library: the role list and seal (both from Firestore, invite-only)
 * plus the Dumbledor font, which is served with the site from `assetBase`.
 */
export async function loadLibrary(roles, { sealSvg = null, assetBase = "/" } = {}) {
  const get = async (name, kind) => {
    const res = await fetch(assetBase + name);
    if (!res.ok) throw new Error(`could not load ${name} (${res.status})`);
    return res[kind]();
  };
  const fontBuf = await get("Dumbledor1_fixed.ttf", "arrayBuffer");
  const font = new Font(new TTFLoader().parse(fontBuf));
  const box = boundsOf(font.generateShapes("H", 1));
  const lib = { roles, font, capHeight: box.max.y - box.min.y || 0.7, sealSvg, glyphs: new Map(), icons: new Map() };
  lib.seal = sealSvg ? parseSvgShapes(sealSvg) : [];
  return lib;
}

/** The name printed for a role in a language ("en" | "es"). */
export const roleName = (role, lang) => role[lang] || role.en;

/** Resolves "team" colour references. */
export function partColours(role, spec) {
  const team = TEAMS[role.team].colour;
  const c = { ...DEFAULT_SPEC.colours, ...spec.colours };
  const pick = (v) => (v === "team" ? team : v);
  return { base: pick(c.base), front: pick(c.front), icon: pick(c.base), frame: pick(c.frame), back: pick(c.back) };
}

// ---------------------------------------------------------------- geometry helpers

function boundsOf(shapes) {
  const box = new THREE.Box2();
  for (const s of shapes) for (const p of s.getPoints(4)) box.expandByPoint(p);
  if (box.isEmpty()) box.set(new THREE.Vector2(0, 0), new THREE.Vector2(0, 0));
  return box;
}

function parseSvgShapes(svgText) {
  const data = new SVGLoader().parse(svgText);
  return data.paths.flatMap((p) => SVGLoader.createShapes(p));
}

/** Extrudes 2D shapes and applies a matrix, keeping triangles outward-facing. */
function extrude(shapes, depth, matrix, curveSegments = 5) {
  if (!shapes.length) return null;
  let g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments });
  g = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", g.attributes.position.clone());
  g.dispose();
  out.applyMatrix4(matrix);
  if (matrix.determinant() < 0) flipWinding(out);
  out.computeVertexNormals();
  return out;
}

function flipWinding(geom) {
  const a = geom.attributes.position.array;
  for (let i = 0; i < a.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = a[i + 3 + k];
      a[i + 3 + k] = a[i + 6 + k];
      a[i + 6 + k] = t;
    }
  }
  geom.attributes.position.needsUpdate = true;
}

const merge = (list) => {
  const parts = list.filter(Boolean);
  return parts.length ? mergeGeometries(parts) : null;
};

const M = () => new THREE.Matrix4();
const T = (x, y, z) => M().makeTranslation(x, y, z);
const S = (x, y, z) => M().makeScale(x, y, z);
const RZ = (a) => M().makeRotationZ(a);
const chain = (...ms) => ms.reduce((acc, m) => acc.multiply(m), M());

function circleShape(r, segments = 96) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}
function ringShape(rOuter, rInner) {
  const s = circleShape(rOuter);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}
function rectShape(x0, y0, x1, y1) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
  return s;
}
/** A rectangle along the radius, from r0 to r1, at angle a (radians). */
function radialBar(r0, r1, width, a) {
  const s = rectShape(r0, -width / 2, r1, width / 2);
  const pts = s.getPoints().map((p) => p.clone().rotateAround(new THREE.Vector2(), a));
  return new THREE.Shape(pts);
}

// ---------------------------------------------------------------- parts

function glyph(lib, ch) {
  if (lib.glyphs.has(ch)) return lib.glyphs.get(ch);
  const shapes = lib.font.generateShapes(ch, 1);
  const g = lib.font.data.glyphs[ch];
  const advance = g ? g.ha / lib.font.data.resolution : 0.5;
  // Centre each letter on its advance width (normal typesetting); centring on the
  // outline box instead makes the spacing uneven (wide around A and V).
  const info = { shapes, advance, center: advance / 2 };
  lib.glyphs.set(ch, info);
  return info;
}

/** Inner edge of the frame (mm from centre), so text can stay clear of it. */
function frameInner(spec) {
  return frameDesign(spec)?.inner ?? spec.diameter / 2;
}

/** Where each letter of the curved name goes; shared by 3D and 2D renderers. */
export function layoutName(lib, text, spec) {
  const chars = [...(text || "").toUpperCase()];
  const R = spec.diameter / 2;
  const margin = Math.max(spec.margin, R - frameInner(spec) + 0.9);   // clear of the frame ornament
  const radius = R - margin;
  const em = spec.textSize / lib.capHeight;
  const widths = chars.map((c) => (c === " " ? Math.max(glyph(lib, " ").advance, 0.45) : glyph(lib, c).advance) * em * spec.spacing);
  let steps = [];
  for (let i = 1; i < chars.length; i++) steps.push((widths[i - 1] + widths[i]) / 2);
  let total = (steps.reduce((a, b) => a + b, 0) / radius) * (180 / Math.PI);
  let scale = 1;
  if (total > spec.maxArc) {
    scale = spec.maxArc / total;
    total = spec.maxArc;
    steps = steps.map((s) => s * scale);
  }
  const angles = [];
  let a = 270 - total / 2;
  chars.forEach((_, i) => {
    if (i > 0) a += (steps[i - 1] / radius) * (180 / Math.PI);
    angles.push(a);
  });
  return { chars, angles, radius, em: em * scale, total, scale, letterHeight: spec.textSize * scale, margin };
}

/**
 * Edition back: the edition's full name in the centre, one word per line, as
 * large as fits inside a fine double rim, with a small star above and below.
 * Filled shapes in coin coordinates (mm, y up), shared by the 3D model and 2D.
 */
function editionBack(lib, role, spec) {
  const ed = EDITIONS[role.edition];
  if (!ed) return null;
  const R = spec.diameter / 2, out = R - 0.7;
  const shapes = [annulus(out, out - 0.6), annulus(out - 1.2, out - 1.65)];
  const words = (ed.name[spec.lang] || ed.name.en).toUpperCase().split(/\s+/);
  const track = 0.08;                                     // letter spacing, in em
  const lineW = (w, em) => [...w].reduce((a, c) => a + glyph(lib, c).advance * em * (1 + track), 0) - glyph(lib, w.at(-1)).advance * em * track;
  const ri = out - 1.65 - 1.8;                            // keep clear of the inner rim
  const n = words.length, gap = 0.55;                     // line gap, in cap heights
  // Largest cap height that keeps every line (and the stars) inside the circle.
  const layout = (h) => {
    const em = h / lib.capHeight, H = n * h + (n - 1) * gap * h, star = Math.min(1.7, h * 0.45);
    const lines = words.map((w, i) => ({ w, width: lineW(w, em), base: H / 2 - h - i * (1 + gap) * h }));
    const fits = lines.every((l) => Math.hypot(l.width / 2, Math.max(Math.abs(l.base), Math.abs(l.base + h * 1.25))) <= ri)
      && H / 2 + h * 0.7 + 2 * star <= ri;
    return { em, H, star, lines, fits };
  };
  let lo = 1, hi = spec.diameter * 0.17;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (layout(m).fits) lo = m; else hi = m; }
  const L = layout(lo), h = lo;
  const place = (src, k, dx, dy) => src.map((sh) => {
    const move = (pts) => pts.map((q) => new THREE.Vector2(q.x * k + dx, q.y * k + dy));
    const o = new THREE.Shape(move(sh.getPoints(6)));
    o.holes = sh.holes.map((hp) => new THREE.Path(move(hp.getPoints(6))));
    return o;
  });
  for (const l of L.lines) {
    let x = -l.width / 2;
    for (const c of l.w) {
      const g = glyph(lib, c);
      shapes.push(...place(g.shapes, L.em, x, l.base));
      x += g.advance * L.em * (1 + track);
    }
  }
  // Stars above and below the name, each flanked by two dots.
  const sy = L.H / 2 + h * 0.7 + L.star;
  for (const y of [sy, -sy]) {
    shapes.push(sparkle(0, y, L.star, L.star * 0.32));
    for (const x of [-1, 1]) shapes.push(disc(Math.max(0.3, L.star * 0.2), x * L.star * 2.1, y));
  }
  return shapes;
}

/**
 * The icon's SVG markup in the traced 127.56-unit square: traced path data
 * (role.d), or a vector icon's markup (role.body), placed by role.g.
 */
const iconMarkup = (role) => role.body ?? role.d.map((d) => `<path d="${d}"/>`).join("");

function iconShapes(lib, role) {
  if (!lib.icons.has(role.en)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRACE_VIEW} ${TRACE_VIEW}"><g transform="${role.g}">${iconMarkup(role)}</g></svg>`;
    lib.icons.set(role.en, parseSvgShapes(svg));
  }
  return lib.icons.get(role.en);
}

/** Matrix placing traced-SVG shapes (y down, 0..127.56) centred on the coin. */
function tracedMatrix(sizeMm, z, mirrorX = false, offsetY = 0) {
  const k = sizeMm / TRACE_VIEW;
  return chain(T(0, offsetY, z), S(mirrorX ? -1 : 1, 1, 1), S(k, -k, 1), T(-TRACE_VIEW / 2, -TRACE_VIEW / 2, 0));
}

function buildFront(lib, role, text, spec) {
  const top = spec.height - spec.depth;
  const icon = extrude(iconShapes(lib, role), spec.depth, tracedMatrix(spec.diameter * spec.iconScale, top, false, spec.iconOffsetY || 0));
  const L = layoutName(lib, text, spec);
  const letters = L.chars.map((c, i) => {
    if (c === " ") return null;
    const g = glyph(lib, c);
    const a = THREE.MathUtils.degToRad(L.angles[i]);
    return extrude(g.shapes, spec.depth, chain(
      T(L.radius * Math.cos(a), L.radius * Math.sin(a), top),
      RZ(a + Math.PI / 2), S(L.em, L.em, 1), T(-g.center, 0, 0)), 4);
  });
  return { geom: merge([icon, ...letters]), name: L };
}

function buildFrame(spec) {
  const R = spec.diameter / 2, w = spec.frameWidth, z = spec.height - spec.depth;
  const out = R - 0.4;
  const design = frameDesign(spec);
  if (!design) return null;
  void out; void w;
  return extrude(design.shapes, spec.depth, T(0, 0, z), 24);
}

/** Fits arbitrary shapes into a circle of radius r (used for uploaded SVGs). */
function fitShapes(shapes, r, svgYDown = true) {
  const box = boundsOf(shapes);
  const size = new THREE.Vector2(); box.getSize(size);
  const centre = new THREE.Vector2(); box.getCenter(centre);
  const k = (r * 2 * 0.70710678) / Math.max(size.x, size.y, 1e-6); // fit the bounding square inside the circle
  return chain(S(k, svgYDown ? -k : k, 1), T(-centre.x, -centre.y, 0));
}

function buildBack(lib, role, text, spec) {
  const R = spec.diameter / 2, d = spec.depth;
  // The back is seen from below, so mirror X to read correctly when flipped over.
  const mirror = S(-1, 1, 1);
  const shapes = [];
  const designed = backDesign(spec.back, R);
  if (designed) return extrude(designed, d, chain(mirror), 24);
  switch (spec.back) {
    case "seal":
      return extrude(lib.seal, d, chain(mirror, tracedMatrix(spec.diameter, 0)));
    case "clock": {
      shapes.push(ringShape(R - 0.6, R - 1.4));
      for (let h = 0; h < 12; h++) shapes.push(radialBar(R - (h % 3 ? 3.0 : 4.2), R - 1.3, h % 3 ? 0.6 : 1.0, (h / 12) * Math.PI * 2));
      // Five to midnight.
      shapes.push(radialBar(-1.2, R * 0.42, 1.4, THREE.MathUtils.degToRad(92.5))); // hour hand
      shapes.push(radialBar(-1.6, R * 0.66, 0.9, THREE.MathUtils.degToRad(120))); // minute hand
      shapes.push(circleShape(1.6));
      return extrude(shapes, d, chain(mirror), 24);
    }
    case "rings":
      for (const [o, i] of [[R - 0.6, R - 1.6], [R * 0.72, R * 0.72 - 0.8], [R * 0.44, R * 0.44 - 0.8]]) shapes.push(ringShape(o, i));
      shapes.push(circleShape(R * 0.16));
      return extrude(shapes, d, chain(mirror), 32);
    case "edition": {
      const ed = editionBack(lib, role, spec);
      return ed ? extrude(ed, d, chain(mirror), 32) : null;
    }
    case "name": {
      const t = (text || "").toUpperCase();
      if (!t.trim()) return null;
      const s = lib.font.generateShapes(t, 1);
      const box = boundsOf(s), size = new THREE.Vector2(); box.getSize(size);
      const k = Math.min((spec.diameter * 0.7) / size.x, (spec.textSize * 1.4) / Math.max(size.y, 1e-6));
      const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
      shapes.push(ringShape(R - 0.6, R - 1.4));
      const ring = extrude(shapes, d, chain(mirror), 32);
      const word = extrude(s, d, chain(mirror, S(k, k, 1), T(-cx, -cy, 0)), 4);
      return merge([ring, word]);
    }
    case "custom": {
      if (!spec.customSvg) return null;
      let custom;
      try { custom = parseSvgShapes(spec.customSvg); } catch { return null; }
      if (!custom.length) return null;
      return extrude(custom, d, chain(mirror, fitShapes(custom, R - 1.2)), 6);
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- window style

const FLOOR = 0.4;   // colour layer at the bottom of the window

/** Window depth that fits the coin (keeps the floor, a black core and the back inlay). */
function windowDepthFor(spec) {
  const back = spec.back && spec.back !== "none" ? spec.depth : 0;
  return Math.max(0.4, Math.min(spec.windowDepth, spec.height - FLOOR - MIN_CORE - back));
}

/** The window: a circle cut off by a straight line near the middle. */
function windowPoints(Rw, cutY, n = 72) {
  const xc = Math.sqrt(Math.max(Rw * Rw - cutY * cutY, 0));
  const a0 = Math.atan2(cutY, xc), a1 = Math.PI - a0;
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(new THREE.Vector2(Rw * Math.cos(a), Rw * Math.sin(a))); }
  return pts;   // closes back along the straight edge
}

/**
 * Where everything goes in the window style (coin coordinates, mm, y up):
 * the window, the icon box inside it, and the name as straight lines below.
 */
export function windowLayout(lib, text, spec) {
  const R = spec.diameter / 2;
  const rim = Math.max(1.6, spec.diameter * 0.045);
  const Rw = R - rim;
  const cutY = -R * 0.2;
  // name: one or two straight lines in the band under the window
  const words = (text || "").toUpperCase().trim().split(/\s+/).filter(Boolean);
  const options = [words.join(" ")];
  if (words.length > 1) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const score = Math.max(a.length, b.length);
      if (!best || score < best.score) best = { score, lines: [a, b] };
    }
    options.push(best.lines);
  }
  const widthAt1 = (line) => { const box = boundsOf(lib.font.generateShapes(line, 1 / lib.capHeight)); return box.max.x - box.min.x; };
  const bottom = -(R - rim * 0.9);
  const gap = 1.2, lead = 1.45;
  let best = null;
  for (const opt of options) {
    const lines = Array.isArray(opt) ? opt : [opt];
    if (!lines[0]) break;
    const w = lines.map(widthAt1);
    for (let cap = spec.textSize; cap >= 1.2; cap -= 0.05) {
      const baselines = lines.map((_, i) => cutY - gap - cap - i * cap * lead);
      if (baselines[baselines.length - 1] < bottom) continue;
      const fits = lines.every((_, i) => w[i] * cap <= 2 * Math.sqrt(Math.max((R - rim) ** 2 - baselines[i] ** 2, 0)) - 2);
      if (fits) { if (!best || cap > best.cap + 0.15) best = { cap, lines, baselines }; break; }
    }
  }
  best ??= { cap: 1.2, lines: [words.join(" ")], baselines: [cutY - gap - 1.2] };
  // Centre the name block in the band under the window (a touch above the middle).
  const blockTop = best.baselines[0] + best.cap, blockBottom = best.baselines[best.baselines.length - 1];
  const free = (blockBottom - bottom) - (cutY - gap - blockTop);
  if (free > 0) best.baselines = best.baselines.map((y) => y - (free / 2) * 0.8);
  return {
    R, Rw, cutY, rim, cap: best.cap, em: best.cap / lib.capHeight,
    lines: best.lines.map((t, i) => ({ text: t, y: best.baselines[i] })),
    icon: { top: Rw - 1.4, bottom: cutY + 1.0, halfWidth: Rw * 0.78 },
  };
}

/** SVG path data for one glyph at font size 1, in font units (y up). Cached. */
function glyphPath(lib, ch) {
  lib.glyphPaths ??= new Map();
  if (!lib.glyphPaths.has(ch)) {
    const ring = (pts) => pts.map((pt, i) => `${i ? "L" : "M"}${pt.x.toFixed(4)} ${pt.y.toFixed(4)}`).join("") + "Z";
    lib.glyphPaths.set(ch, glyph(lib, ch).shapes.map((sh) => ring(sh.getPoints(6)) + sh.holes.map((h) => ring(h.getPoints(6))).join("")).join(""));
  }
  return lib.glyphPaths.get(ch);
}

/**
 * One letter as an SVG path: centred on its advance at (x, y) (SVG coordinates),
 * rotated by `deg`, at font size `em` — the same geometry the 3D model uses.
 */
function letterSvg(lib, ch, x, y, deg, em, fill) {
  const g = glyph(lib, ch);
  return `<path fill="${fill}" fill-rule="evenodd" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg.toFixed(1)}) scale(${em.toFixed(4)} ${(-em).toFixed(4)}) translate(${(-g.center).toFixed(4)} 0)" d="${glyphPath(lib, ch)}"/>`;
}

/** SVG path data for font shapes (y up), moved by (dx, y) and flipped to SVG's y-down. */
function shapesToPath(shapes, dx, y, div = 6) {
  const ring = (pts) => pts.map((pt, i) => `${i ? "L" : "M"}${(pt.x + dx).toFixed(2)} ${(-(pt.y + y)).toFixed(2)}`).join("") + "Z";
  return shapes.map((sh) => ring(sh.getPoints(div)) + sh.holes.map((h) => ring(h.getPoints(div))).join("")).join("");
}

/** Matrix that fits the role's icon into the window (from its SVG coordinates). */
function windowIconMatrix(lib, role, W, z, spec) {
  const shapes = iconShapes(lib, role);
  const box = boundsOf(shapes), size = new THREE.Vector2(); box.getSize(size);
  const h = W.icon.top - W.icon.bottom;
  const k = Math.min((2 * W.icon.halfWidth) / Math.max(size.x, 1e-6), h / Math.max(size.y, 1e-6)) * (spec.iconScale || 1);
  const cy = (W.icon.top + W.icon.bottom) / 2;
  const bcx = (box.min.x + box.max.x) / 2, bcy = (box.min.y + box.max.y) / 2;
  return { shapes, k, cy, bcx, bcy, m: chain(T(0, cy, z), S(k, -k, 1), T(-bcx, -bcy, 0)) };
}

/** Is this token printed face-up? Only the window style with relief. */
export const printsFaceUp = (spec) => spec.style === "window" && spec.windowFinish !== "flat";

function buildWindowToken(lib, role, text, spec) {
  if (spec.windowFinish === "flat") return buildFlatWindowToken(lib, role, text, spec);
  const H = spec.height, p = windowDepthFor(spec);
  const W = windowLayout(lib, text, spec);
  const pts = windowPoints(W.Rw, W.cutY);
  const windowShape = new THREE.Shape(pts);
  const ring = circleShape(W.R);
  ring.holes.push(new THREE.Path([...pts].reverse()));
  const I = windowIconMatrix(lib, role, W, H - p, spec);
  // Coin colour: full disc below the window, the top layer with the window cut out,
  // and the icon standing in the window up to the surface.
  const base = merge([
    extrude([circleShape(W.R)], H - p, T(0, 0, 0), 48),
    extrude([ring], p, T(0, 0, H - p), 48),
    extrude(I.shapes, p, I.m, 5),
  ]);
  // Team colour: the window floor and the name (flush inlay on the top layer).
  const floor = extrude([windowShape], FLOOR, T(0, 0, H - p - FLOOR), 48);
  const letters = W.lines.map((line) => {
    const shapes = lib.font.generateShapes(line.text, W.em);
    const box = boundsOf(shapes);
    return extrude(shapes, spec.depth, T(-(box.min.x + box.max.x) / 2, line.y, H - spec.depth), 4);
  });
  return {
    base, front: merge([floor, ...letters]),
    name: { letterHeight: W.cap, scale: W.cap / spec.textSize, total: null, lines: W.lines.length },
  };
}

/**
 * Flat window: the same layout, but every colour is a flush inlay, so the face
 * is smooth to the touch (players can't feel which character they drew).
 * The icon is its own part in the coin colour, laid over the window.
 */
function buildFlatWindowToken(lib, role, text, spec) {
  const H = spec.height, d = spec.depth;
  const W = windowLayout(lib, text, spec);
  const I = windowIconMatrix(lib, role, W, H - d, spec);
  const window = extrude([new THREE.Shape(windowPoints(W.Rw, W.cutY))], d, T(0, 0, H - d), 48);
  const letters = W.lines.map((line) => {
    const shapes = lib.font.generateShapes(line.text, W.em);
    const box = boundsOf(shapes);
    return extrude(shapes, d, T(-(box.min.x + box.max.x) / 2, line.y, H - d), 4);
  });
  return {
    base: buildBase(spec),
    front: merge([window, ...letters]),
    icon: extrude(I.shapes, d, I.m, 5),
    name: { letterHeight: W.cap, scale: W.cap / spec.textSize, total: null, lines: W.lines.length },
  };
}

// ---------------------------------------------------------------- designed backs
//
// The back is the same on every token (so it gives nothing away) and is printed
// as one colour, so each design is a set of filled shapes. Nothing is thinner
// than ~0.45 mm, so it prints cleanly with a 0.4 mm nozzle.

const TAU = Math.PI * 2;
const pt = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
const polygon = (points) => new THREE.Shape(points);
function disc(r, x = 0, y = 0) { const sh = new THREE.Shape(); sh.absarc(x, y, r, 0, TAU, false); return sh; }
function annulus(rOut, rIn, x = 0, y = 0) {
  const sh = disc(rOut, x, y);
  const hole = new THREE.Path(); hole.absarc(x, y, rIn, 0, TAU, true);
  sh.holes.push(hole);
  return sh;
}
/** A tapered hand or ray from r0 to r1 at angle a: width w0 at the base, w1 at the tip. */
function taper(r0, r1, a, w0, w1) {
  const n = new THREE.Vector2(-Math.sin(a), Math.cos(a));
  const b = pt(r0, a), t = pt(r1, a);
  return polygon([b.clone().addScaledVector(n, w0 / 2), t.clone().addScaledVector(n, w1 / 2),
    t.clone().addScaledVector(n, -w1 / 2), b.clone().addScaledVector(n, -w0 / 2)]);
}
/** A four-pointed star (sparkle) with long and short arms. */
function sparkle(x, y, long, short, rot = 0) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * TAU) / 8, r = i % 2 ? short : long;
    pts.push(new THREE.Vector2(x + r * Math.cos(a), y + r * Math.sin(a)));
  }
  return polygon(pts);
}
/**
 * A crescent: the disc (cx, cy, r) minus the shadow disc (bx, by, br), as one
 * outline: the lit part of the moon's edge, then the shadow's edge inside the moon.
 */
function crescent(cx, cy, r, bx, by, br, n = 120) {
  const inShadow = ([x, y]) => Math.hypot(x - bx, y - by) < br;
  const inMoon = ([x, y]) => Math.hypot(x - cx, y - cy) < r;
  const ring = (x, y, rr) => Array.from({ length: n }, (_, i) => [x + rr * Math.cos((i * TAU) / n), y + rr * Math.sin((i * TAU) / n)]);
  const moon = ring(cx, cy, r), shadow = ring(bx, by, br);
  // Lit arc: start where the moon's edge leaves the shadow and follow it until it re-enters.
  const k = moon.findIndex((q, i) => !inShadow(q) && inShadow(moon[(i - 1 + n) % n]));
  if (k < 0) return disc(r, cx, cy);
  const outer = [];
  for (let j = 0; j < n && !inShadow(moon[(k + j) % n]); j++) outer.push(moon[(k + j) % n]);
  // Shadow arc inside the moon, from the end of the lit arc back to its start.
  const last = outer[outer.length - 1];
  let m = 0, best = Infinity;
  shadow.forEach((q, i) => { const dd = Math.hypot(q[0] - last[0], q[1] - last[1]); if (inMoon(q) && dd < best) { best = dd; m = i; } });
  const walk = (step) => { const out = []; for (let j = 0; j < n; j++) { const q = shadow[(m + step * j + n * n) % n]; if (!inMoon(q)) break; out.push(q); } return out; };
  const a = walk(-1), b = walk(1);
  const inner = a.length >= b.length ? a : b;
  return polygon([...outer, ...inner].map(([x, y]) => new THREE.Vector2(x, y)));
}

/** A beaded border: n small discs on a circle. */
const beads = (r, n, size) => Array.from({ length: n }, (_, i) => disc(size, ...pt(r, (i * TAU) / n).toArray()));

// ---------------------------------------------------------------- designed frames
//
// The frame is a band of ornament just inside the coin's edge. `inner` is where
// it ends, so the curved name always sits clear of it. Nothing is thinner than
// ~0.45 mm. All outlines are wound the same way so overlaps add up (SVG nonzero).

/** Same winding for every hole-less outline, so overlapping shapes merge in 2D. */
function ccw(sh) {
  if (sh.holes.length) return sh;
  const pts = sh.getPoints(8);
  return THREE.ShapeUtils.isClockWise(pts) ? new THREE.Shape(pts.reverse()) : sh;
}
/** A band between two radii from angle a0 to a1 (radians, a0 < a1). */
function arcBand(rOut, rIn, a0, a1, n = 96) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(pt(rOut, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) pts.push(pt(rIn, a0 + ((a1 - a0) * i) / n));
  return polygon(pts);
}
/** A pointed leaf from base (x, y) along direction `dir` (radians). */
function leaf(x, y, dir, len, width, n = 14) {
  const ax = Math.cos(dir), ay = Math.sin(dir), nx = -ay, ny = ax, side = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, h = (width / 2) * Math.sin(Math.PI * t) ** 0.8;
    side.push([x + ax * len * t, y + ay * len * t, h]);
  }
  const left = side.map(([px, py, h]) => new THREE.Vector2(px + nx * h, py + ny * h));
  const right = side.slice(1, -1).reverse().map(([px, py, h]) => new THREE.Vector2(px - nx * h, py - ny * h));
  return polygon([...left, ...right]);
}
/** Lit part of a moon of radius r at (x, y): phase 0 new, 0.5 full, 1 new again. */
function moonPhase(x, y, r, phase) {
  const lit = 1 - Math.abs(1 - 2 * phase);            // 0 (new) .. 1 (full)
  const waxing = phase < 0.5 ? 1 : -1;                 // light on the right while waxing
  if (lit > 0.97) return [disc(r, x, y)];
  if (lit < 0.03) return [annulus(r, r - 0.45, x, y)];  // new moon: just the outline
  // The shadow is a disc the same size, slid across the moon.
  const off = 2 * r * lit;
  return [crescent(x, y, r, x - waxing * off, y, r * (lit > 0.5 ? 1 : 1.04))];
}

/** Filled shapes for the front frame and its inner edge, or null for none. */
export function frameDesign(spec) {
  const R = spec.diameter / 2, w = spec.frameWidth, out = R - 0.4, edge = out - w;
  const rim = annulus(out, edge, 0, 0);
  let sh = [rim], inner = edge;
  switch (spec.frame) {
    case "none": return null;
    case "rim": break;
    case "double": {
      const t = Math.max(0.45, w * 0.6);
      sh.push(annulus(edge - 0.6, edge - 0.6 - t)); inner = edge - 0.6 - t;
      break;
    }
    case "clock": {
      // A watch chapter ring: 60 minute ticks, bolder tapered hour bars.
      const len = 1.5;
      for (let m = 0; m < 60; m++) {
        const a = Math.PI / 2 - (m * TAU) / 60;
        if (m % 5 === 0) sh.push(taper(edge - len, edge + 0.05, a, m % 15 === 0 ? 0.6 : 0.5, m % 15 === 0 ? 1.0 : 0.8));
        else sh.push(taper(edge - 0.75, edge + 0.05, a, 0.45, 0.45));
      }
      inner = edge - len;
      break;
    }
    case "beads": {
      const rb = edge - 0.95, n = Math.round((TAU * rb) / 1.85);
      sh.push(...beads(rb, n, 0.55)); inner = rb - 0.55;
      break;
    }
    case "acunado": {
      // Milled coin edge: fine reeds between the rim and a thin inner fillet.
      const r1 = edge - 1.25, n = Math.round((TAU * edge) / 1.05);
      for (let i = 0; i < n; i++) sh.push(taper(r1, edge + 0.05, (i * TAU) / n, 0.45, 0.55));
      sh.push(annulus(r1 + 0.05, r1 - 0.45)); inner = r1 - 0.45;
      break;
    }
    case "cordon": {
      // Twisted rope: slanted strands between the rim and a fine inner fillet.
      const r1 = edge - 0.35, r2 = r1 - 1.3, n = Math.round((TAU * r1) / 1.25), da = TAU / n, skew = da * 0.9;
      for (let i = 0; i < n; i++) {
        const a = i * da, a2 = a + da * 0.58;
        sh.push(polygon([pt(r2, a), pt(r2, a2), pt(r1, a2 + skew), pt(r1, a + skew)]));
      }
      sh.push(annulus(r2 - 0.3, r2 - 0.75)); inner = r2 - 0.75;
      break;
    }
    case "fases": {
      // The moon's phases around the coin: full at the top, new at the bottom,
      // with a row of small stars between them.
      const rm = edge - 1.6, mr = 1.25;
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 2 - (k * TAU) / 8;
        sh.push(...moonPhase(...pt(rm, a).toArray(), mr, (0.5 + k / 8) % 1));
        for (const f of [0.32, 0.5, 0.68]) sh.push(disc(f === 0.5 ? 0.4 : 0.3, ...pt(rm, a - (f * TAU) / 8).toArray()));
      }
      inner = rm - mr - 0.2;
      break;
    }
    case "firmamento": {
      // A night sky band: four-pointed stars, large and small, with dots between.
      const rs = edge - 1.35, n = 12;
      for (let i = 0; i < n * 2; i++) {
        const a = Math.PI / 2 - (i * TAU) / (n * 2);
        if (i % 2) sh.push(disc(0.3, ...pt(rs, a).toArray()));
        else sh.push(sparkle(...pt(rs, a).toArray(), i % 4 ? 0.85 : 1.2, i % 4 ? 0.3 : 0.38, a));
      }
      inner = rs - 1.2;
      break;
    }
    case "laurel": {
      // Two laurel branches rising from a knot at the bottom, open at the top.
      const rl = edge - 1.55, a0 = -Math.PI / 2 + 0.07, a1 = Math.PI / 2 - 0.2;
      const branch = [arcBand(rl + 0.23, rl - 0.23, a0, a1)];
      const steps = Math.floor(((a1 - a0) * rl) / 1.7);
      for (let i = 0; i < steps; i++) {
        const a = a0 + 0.1 + (i / steps) * (a1 - a0 - 0.12), tangent = a + Math.PI / 2;
        const size = 1 - 0.3 * (i / steps);                       // leaves shrink towards the tip
        const [x, y] = pt(rl, a).toArray();
        branch.push(leaf(x, y, tangent - 0.62, 1.9 * size, 0.95 * size), leaf(x, y, tangent + 0.62, 1.9 * size, 0.95 * size));
      }
      const [tx, ty] = pt(rl, a1).toArray();
      branch.push(leaf(tx, ty, a1 + Math.PI / 2, 1.3, 0.75));     // the branch's top leaf
      const mirrorX = (s) => polygon(s.getPoints(8).map((p) => new THREE.Vector2(-p.x, p.y)));
      sh.push(...branch, ...branch.map(mirrorX), disc(0.8, ...pt(rl, -Math.PI / 2).toArray()));
      inner = rl - 1.45;
      break;
    }
    default: break;
  }
  return { shapes: sh.map(ccw), inner };
}

/** Filled shapes for a designed back, or null if `id` isn't one of them. */
export function backDesign(id, R) {
  const out = R - 0.7;
  switch (id) {
    case "medianoche": {
      // Beaded border, a fine inner ring, weighted hour markers, a small crescent
      // moon at XII and tapered hands at five to midnight.
      const sh = [annulus(out, out - 0.55), ...beads(out - 1.45, 64, 0.32), annulus(out - 2.2, out - 2.7)];
      for (let h = 0; h < 12; h++) {
        const a = Math.PI / 2 - (h * TAU) / 12;
        if (h === 0) continue;                                     // XII holds the moon
        if (h % 3 === 0) sh.push(taper(out - 6.2, out - 3.2, a, 1.5, 0.9));
        else sh.push(sparkle(...pt(out - 4.1, a).toArray(), 0.9, 0.38, a));
      }
      const moonY = out - 5.4;                                    // crescent at XII
      sh.push(crescent(0, moonY, 2.7, 1.25, moonY + 0.65, 2.3));
      const minute = Math.PI / 2 + (5 * TAU) / 60, hour = Math.PI / 2 + (0.08 * TAU) / 12;
      sh.push(taper(-2.6, R * 0.6, minute, 1.8, 0.6), taper(-2.0, R * 0.38, hour, 2.6, 0.9), disc(1.7), annulus(2.7, 2.15));
      return sh;
    }
    case "guilloche": {
      // Engraved lace: interlocking rings around the centre, framed by a double rim.
      const sh = [annulus(out, out - 0.6), annulus(out - 1.3, out - 1.8)];
      const n = 16, c = R * 0.34, r = R * 0.36;
      for (let i = 0; i < n; i++) sh.push(annulus(r, r - 0.5, ...pt(c, (i * TAU) / n).toArray()));
      sh.push(annulus(R * 0.2, R * 0.2 - 0.5), disc(1.2));
      return sh;
    }
    case "rosa": {
      // Sixteen-point compass rose inside a ring of beads.
      const sh = [annulus(out, out - 0.6), ...beads(out - 1.4, 48, 0.3)];
      const long = out - 2.6, mid = long * 0.62, short = long * 0.42, inner = 1.6;
      const star = (n, r, w, rot) => {
        const pts = [];
        for (let i = 0; i < n * 2; i++) {
          const a = rot + (i * Math.PI) / n;
          pts.push(pt(i % 2 ? inner + w : r, a));
        }
        return polygon(pts);
      };
      sh.push(star(4, long, 1.6, Math.PI / 2), star(4, mid, 1.2, Math.PI / 2 + Math.PI / 4), star(8, short, 0.6, Math.PI / 2 + Math.PI / 8));
      sh.push(annulus(long * 0.3, long * 0.3 - 0.5));
      return sh;
    }
    case "sol": {
      // Art-deco sunburst: alternating long and short rays around a ringed disc.
      const sh = [annulus(out, out - 0.6)];
      const n = 32, r0 = R * 0.24, rl = out - 1.4, rs = out - 4.2;
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n;
        sh.push(i % 2 ? taper(r0 + 1.2, rs, a, 1.0, 0.45) : taper(r0 + 1.2, rl, a, 1.6, 0.5));
      }
      sh.push(annulus(r0, r0 - 0.55), disc(r0 - 1.3));
      return sh;
    }
    case "eclipse": {
      // A crescent moon with a few stars, inside a fine double rim.
      const sh = [annulus(out, out - 0.6), annulus(out - 1.2, out - 1.65)];
      const mr = R * 0.44;
      sh.push(crescent(-R * 0.06, -R * 0.02, mr, R * 0.1, R * 0.08, mr * 0.9));
      for (const [x, y, s] of [[0.42, 0.34, 1.0], [0.4, -0.4, 0.7], [0.5, -0.06, 0.55], [-0.08, 0.55, 0.5], [0.3, 0.58, 0.4]])
        sh.push(sparkle(x * R, y * R, 1.7 * s + 0.4, 0.45 * s + 0.2));
      return sh;
    }
    default:
      return null;
  }
}

function buildBase(spec) {
  const g = new THREE.CylinderGeometry(spec.diameter / 2, spec.diameter / 2, spec.height, 160);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, spec.height / 2);
  return g;
}

/**
 * Builds every part of a token.
 * @returns {{parts: {base, front, frame, back}, colours, name}} geometries are
 *   null for parts the spec leaves out; `name` describes the curved text layout.
 */
/** Keep at least this much black coin between the coloured inlays. */
export const MIN_CORE = 0.4;

/**
 * Inlay depth that fits: the front (and the back, if it has a pattern) go into
 * the coin, leaving at least MIN_CORE of base. Returns { depth, clamped }.
 */
export function fittingDepth(spec) {
  const faces = spec.back && spec.back !== "none" ? 2 : 1;
  const max = Math.max(0.2, Math.floor(((spec.height - MIN_CORE) / faces) * 5) / 5);   // whole 0.2 mm layers
  return { depth: Math.min(spec.depth, max), clamped: spec.depth > max, max };
}

/** In the window style only a plain rim fits around the window (other frames would float over it). */
function windowFrame(spec) {
  if (spec.style !== "window" || spec.frame === "none") return spec;
  const rim = Math.max(1.6, spec.diameter * 0.045);
  return { ...spec, frame: "rim", frameWidth: Math.min(spec.frameWidth, rim - 0.6) };
}

export function buildToken(lib, role, spec, text) {
  spec = windowFrame({ ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec?.colours } });
  const fit = fittingDepth(spec);
  spec = { ...spec, depth: fit.depth };
  text ??= roleName(role, spec.lang);
  if (spec.style === "window") {
    const w = buildWindowToken(lib, role, text, spec);
    return {
      parts: { base: w.base, front: w.front, icon: w.icon || null, frame: buildFrame(spec), back: buildBack(lib, role, text, spec) },
      colours: partColours(role, spec), name: w.name, spec, depthClamped: fit.clamped ? fit.max : null,
    };
  }
  const front = buildFront(lib, role, text, spec);
  return {
    parts: { base: buildBase(spec), front: front.geom, frame: buildFrame(spec), back: buildBack(lib, role, text, spec) },
    colours: partColours(role, spec),
    name: front.name,
    spec,
    depthClamped: fit.clamped ? fit.max : null,
  };
}

// ---------------------------------------------------------------- 3D viewer

/** A rotatable preview bound to a canvas. */
export function createViewer(canvas, { background = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: background === null });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3440, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-70, -90, 150); scene.add(key);
  const under = new THREE.DirectionalLight(0xffffff, 1.0); under.position.set(40, 60, -120); scene.add(under);

  const meshes = {};
  for (const name of ["base", "front", "icon", "frame", "back"]) {
    meshes[name] = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }));
    scene.add(meshes[name]);
  }
  // Inlays are flush with the coin; nudge them out so the preview doesn't flicker.
  meshes.front.position.z = meshes.frame.position.z = 0.015;
  meshes.icon.position.z = 0.03;   // over the flat window
  meshes.back.position.z = -0.015;
  let diameter = 45;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  let running = true;
  (function loop() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  function setView(kind = "angle") {
    const d = diameter;
    if (kind === "top") camera.position.set(0, -0.001, d * 2.5);
    else if (kind === "back") camera.position.set(0, 0.001, -d * 2.5);
    else camera.position.set(0, -d * 1.5, d * 1.85);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  return {
    setToken(token) {
      diameter = token.spec.diameter;
      for (const [name, mesh] of Object.entries(meshes)) {
        mesh.geometry.dispose();
        mesh.geometry = token.parts[name] || new THREE.BufferGeometry();
        mesh.material.color.set(token.colours[name]);
      }
    },
    setView,
    controls,
    dispose() { running = false; renderer.dispose(); },
  };
}

// ---------------------------------------------------------------- 2D thumbnails

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * An SVG picture of the token's front (or back), in millimetres. Uses the font
 * family "Dumbledor" — load engine/engine.css on the page for it.
 */
export function tokenSvg(lib, role, spec, { side = "front", text } = {}) {
  spec = windowFrame({ ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec?.colours } });
  const c = partColours(role, spec);
  const R = spec.diameter / 2;
  const label = text ?? roleName(role, spec.lang);
  const k = spec.diameter * spec.iconScale / TRACE_VIEW;
  let body = "";
  if (side === "front" && spec.style === "window") {
    const W = windowLayout(lib, label, spec);
    const I = windowIconMatrix(lib, role, W, 0, spec);
    const d = windowPoints(W.Rw, W.cutY).map((pt, i) => `${i ? "L" : "M"}${pt.x.toFixed(2)} ${(-pt.y).toFixed(2)}`).join("") + "Z";
    body += `<path d="${d}" fill="${c.front}"/>`;
    body += `<g fill="${c.base}" transform="translate(0 ${(-I.cy).toFixed(3)}) scale(${I.k.toFixed(5)}) translate(${(-I.bcx).toFixed(3)} ${(-I.bcy).toFixed(3)})"><g transform="${role.g}">${iconMarkup(role)}</g></g>`;
    // The name as outlines from the same font as the 3D model, so both always match.
    for (const line of W.lines) {
      const shapes = lib.font.generateShapes(line.text, W.em);
      const box = boundsOf(shapes), dx = -(box.min.x + box.max.x) / 2;
      body += `<path fill="${c.front}" fill-rule="evenodd" d="${shapesToPath(shapes, dx, line.y)}"/>`;
    }
    if (spec.frame !== "none") body += `<circle r="${(R - 0.4 - spec.frameWidth / 2).toFixed(2)}" fill="none" stroke="${c.frame}" stroke-width="${spec.frameWidth}"/>`;
  } else if (side === "front") {
    body += `<g fill="${c.front}" transform="translate(0 ${-(spec.iconOffsetY || 0)}) scale(${k}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})"><g transform="${role.g}">${iconMarkup(role)}</g></g>`;
    const L = layoutName(lib, label, spec);
    // SVG y points down: angle a in engine space is -a on screen.
    L.chars.forEach((ch, i) => {
      if (ch === " ") return;
      const a = L.angles[i];
      const x = L.radius * Math.cos((a * Math.PI) / 180), y = -L.radius * Math.sin((a * Math.PI) / 180);
      body += letterSvg(lib, ch, x, y, -(a + 90), L.em, c.front);
    });
    const fd = frameDesign(spec);
    if (fd) body += `<path fill="${c.frame}" fill-rule="nonzero" d="${shapesToPath(fd.shapes, 0, 0, 48)}"/>`;
  } else {
    const back = { seal: "Seal", clock: "Clock", rings: "Rings", name: "Name", custom: "Custom" }[spec.back];
    const designed = backDesign(spec.back, R);
    if (designed) body += `<path fill="${c.back}" fill-rule="nonzero" d="${shapesToPath(designed, 0, 0, 48)}"/>`;
    const ed = spec.back === "edition" ? editionBack(lib, role, spec) : null;
    if (ed) body += `<path fill="${c.back}" fill-rule="evenodd" d="${shapesToPath(ed, 0, 0, 48)}"/>`;
    if (spec.back === "seal" && lib.sealSvg) body += `<g fill="${c.back}" transform="scale(${spec.diameter / TRACE_VIEW}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})">${lib.sealSvg.replace(/^[\s\S]*?<g /, "<g ").replace(/fill="#000000"/, "").replace(/<\/svg>\s*$/, "")}</g>`;
    else if (back && !designed) body += `<text y="1.5" text-anchor="middle" font-size="5" fill="${c.back}" font-family="Dumbledor">${esc(back === "Name" ? label.toUpperCase() : back.toUpperCase())}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - 0.5} ${-R - 0.5} ${spec.diameter + 1} ${spec.diameter + 1}" role="img" aria-label="${esc(label)} token"><circle r="${R}" fill="${c.base}"/>${body}</svg>`;
}

// ---------------------------------------------------------------- export

const slug = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

function stl(geom, spec, faceDown) {
  const g = geom.clone();
  if (faceDown && !printsFaceUp(spec)) {   // the relief window prints face-up
    g.applyMatrix4(M().makeRotationX(Math.PI));
    g.translate(0, 0, spec.height);
  }
  // Binary STLExporter returns a DataView; JSZip needs the underlying buffer.
  return new STLExporter().parse(new THREE.Mesh(g), { binary: true }).buffer;
}

/** Adds one token's STLs to a JSZip folder. */
export function addTokenToZip(zip, token, role, text, { faceDown = true } = {}) {
  const name = `${TEAMS[role.team].file}_${slug(text) || slug(role.en)}`;
  const dir = zip.folder(name);
  const lines = [];
  const order = ["base", "front", "icon", "frame", "back"];
  order.forEach((part, i) => {
    if (!token.parts[part]) return;
    const file = `${i + 1}_${part}.stl`;
    dir.file(file, stl(token.parts[part], token.spec, faceDown));
    lines.push(`${file}  filament ${token.colours[part]}`);
  });
  dir.file("README.txt",
    `${text} (${role.en})\nDiameter ${token.spec.diameter} mm, thickness ${token.spec.height} mm${faceDown ? ", face-down" : ""}.\n\n` +
    `Load all STLs together as ONE object with several parts (Bambu Studio: "Yes" when asked),\nthen give each part its filament:\n\n${lines.join("\n")}\n`);
  return name;
}

/** Offers a file to the viewer: claude.ai's downloads capability, or a plain download. */
export async function saveFile(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return { status: "saved" };
}
