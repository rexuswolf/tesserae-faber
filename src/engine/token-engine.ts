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
//   back   – pattern on the bottom face (mirrored so it reads correctly), or a face drawn like
//            a second front: the front again, a face of its own, or a two-state token's other
//            state (see backFaceOf)

import * as THREE from "three";
import { safeIconMarkup, safeTransform } from "./safe-svg.ts";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { Font } from "three/addons/loaders/FontLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type {
  Role, Team, Hex, CoinEdge, ColourRef, TokenSpec, SpecInput, TokenStyle, Relief, ReliefPart, Library, Glyph,
  PartColours, TokenParts, Token, MagnetLayout, TokenIcon, TokenShape, FaceField, BackFace, RingSeparator, AutoText,
  PatternId, PatternSpec, PartName, CardIcon, CardJoin, CardBack,
} from "../types.ts";

export { THREE };

const TRACE_VIEW = 127.559055; // potrace viewBox; traced to a 45 mm square

export const TEAMS: Record<Team, { label: Record<string, string>; colour: Hex; file: string }> = {
  townsfolk: { label: { en: "Townsfolk", es: "Aldeanos" }, colour: "#2f86e0", file: "blue" },
  outsider: { label: { en: "Outsiders", es: "Forasteros" }, colour: "#2f86e0", file: "blue" },
  minion: { label: { en: "Minions", es: "Esbirros" }, colour: "#b3191e", file: "red" },
  demon: { label: { en: "Demons", es: "Demonios" }, colour: "#b3191e", file: "red" },
  traveller: { label: { en: "Travellers", es: "Viajeros" }, colour: "#8a3d9e", file: "purple" },
  fabled: { label: { en: "Fabled", es: "Fábulas" }, colour: "#d4a72c", file: "yellow" },
  loric: { label: { en: "Loric", es: "Lóricos" }, colour: "#3f9651", file: "green" },
  // The grimoire's info tokens (cards): their "team colour" is gold, a filament the export knows.
  info: { label: { en: "Info tokens", es: "Fichas de información" }, colour: "#c9a227", file: "yellow" },
};

/** A coin's side edge (spec.edge; unset is smooth). */
export const COIN_EDGES: { id: CoinEdge; label: string }[] = [{ id: "smooth", label: "Smooth" }, { id: "reeded", label: "Reeded" }, { id: "segmented", label: "Segmented" }];
/** How deep a reeded edge's grooves cut into the coin (mm), and their pitch along the edge. */
export const EDGE_DEPTH = 0.4, EDGE_PITCH = 1.15;
const edged = (spec: Pick<TokenSpec, "edge">) => spec.edge === "reeded" || spec.edge === "segmented";
/** The face's edge: the coin's, or inside a reeded edge's grooves (frames and patterns stay in the solid coin). */
const faceRadius = (spec: Pick<TokenSpec, "diameter" | "edge">) => spec.diameter / 2 - (edged(spec) ? EDGE_DEPTH : 0);
/**
 * A reeded coin's outline (mm, y up): teeth `EDGE_DEPTH` deep every EDGE_PITCH, flat tops and
 * floors (each over 0.4 mm) and steep flanks, so each layer prints as one toothed loop. A
 * segmented edge alternates 12 sections, reeded and smooth. Null for a smooth coin.
 */
export function coinOutline(spec: Pick<TokenSpec, "diameter" | "edge">): [number, number][] | null {
  if (!edged(spec)) return null;
  const R = spec.diameter / 2, r = R - EDGE_DEPTH, n = Math.round((TAU * R) / EDGE_PITCH / 12) * 12, da = TAU / n;
  const P = (rad: number, a: number): [number, number] => [rad * Math.cos(a), rad * Math.sin(a)];
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = i * da;
    if (spec.edge === "segmented" && Math.floor((i * 12) / n) % 2) { out.push(P(R, a), P(R, a + da / 2)); continue; }
    // top 46 % of the pitch, floor 38 %, flanks 8 % each
    out.push(P(R, a), P(R, a + da * 0.46), P(r, a + da * 0.54), P(r, a + da * 0.92));
  }
  return out;
}

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
  { id: "espinas", label: "Thorns" },
  { id: "runas", label: "Runes" },
  { id: "colmillos", label: "Fangs" },
];

export const BACK_STYLES = [
  { id: "none", label: "Plain" },
  { id: "medianoche", label: "Midnight" },
  { id: "guilloche", label: "Guilloché" },
  { id: "rosa", label: "Compass rose" },
  { id: "sol", label: "Sunburst" },
  { id: "eclipse", label: "Eclipse" },
  { id: "orbitas", label: "Orbits" },
  { id: "edition", label: "Edition" },
  { id: "custom", label: "Your SVG" },
];
/** The drawings a back face can carry for its icon (BackFace.art): the back designs that are pictures. */
export const BACK_ORNAMENTS = ["medianoche", "guilloche", "rosa", "sol", "eclipse", "orbitas"];
/** The back designs kept before the back was a face, and what each became (migrateBack): a picture its icon, the edition (or the medallion or shield round it) its words. */
const OLD_BACKS: Record<string, BackFace> = {
  ...Object.fromEntries(BACK_ORNAMENTS.map((id) => [id, { say: "none" as const, art: "none" }])),
  custom: { say: "none", art: "custom" },
  edition: { say: "edition", art: "none" },
  medallon: { say: "edition" },
  escudo: { say: "edition" }, escudete: { say: "edition" },
};

/** An edition's name by language, and the mark used on token backs. */
export interface Edition { name: { en: string; [lang: string]: string }; mark?: string }

/** Editions as coded in TPI's roles.json, with the mark used on token backs. */
export const EDITIONS: Record<string, Edition> = {
  tb: { name: { en: "Trouble Brewing", es: "Trouble Brewing" }, mark: "TB" },
  bmr: { name: { en: "Bad Moon Rising", es: "Bad Moon Rising" }, mark: "BMR" },
  snv: { name: { en: "Sects & Violets", es: "Sects & Violets" }, mark: "S&V" },
  carousel: { name: { en: "The Carousel", es: "The Carousel" }, mark: "C" },
  fabled: { name: { en: "Fabled", es: "Fábulas" }, mark: "F" },
  loric: { name: { en: "Loric", es: "Lóricos" }, mark: "L" },
  grimoire: { name: { en: "Grimoire", es: "Grimorio" }, mark: "G" },
};

export const FILAMENTS = {
  black: "#1d1c21",
  white: "#ece9e2",
  gold: "#c9a227",
  silver: "#a7adb4",
  bronze: "#9a6a3a",
};

/** Token layouts: "classic" (icon in the middle, curved name), "window" (a coloured window
 *  over the top half with the icon on it, the name straight and large below), "solo" (the
 *  icon alone, as large as the coin allows) and "double" (the name along the bottom and again
 *  along the top, turned round, so it reads right way up from both sides of the table). */
// in order of what they carry: the icon and the name (in an arc, twice, under a window), the icon alone, the name alone
export const TOKEN_STYLES: { id: TokenStyle }[] = [{ id: "classic" }, { id: "double" }, { id: "window" }, { id: "solo" }, { id: "text" }];

export const DEFAULT_SPEC: TokenSpec = {
  style: "classic",
  // Which parts of the face stand out of the coin, and by how much (mm). With none raised
  // everything is a flush inlay (nothing to feel by touch) and the token prints face-down;
  // with any raised it prints face-up, the relief built on top.
  relief: { text: false, frame: false, icon: false },
  reliefHeight: 0.6,
  magnet: "none",           // "none" | "pocket" (open hole in the back) | "hidden" (inside, print pauses)
  magnetSize: "6x2",        // diameter x thickness, mm
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
  // mm in from the coin's edge: its side all the base's colour, the frame's never showing round it
  // (a hidden role dealt face-down gives nothing away); 0 takes the frame to the edge
  frameInset: 0.8,
  back: "none",
  backMode: "design",     // the back is the design above, or a face (see BackMode)
  customSvg: null,
  ringBase: "25",
  separator: "dot",
  // a card's: the phrase alone (as cards always were); an icon, when chosen, 30 mm at its side
  cardIcon: "none",
  cardIconSize: 30,
  cardJoin: "spread",
  colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold },
};

/**
 * A reminder token's spec, derived from the character style: smaller coin,
 * smaller raised icon, the reminder word along the bottom, plain back.
 */
export function reminderSpec(spec: TokenSpec): TokenSpec {
  return {
    ...spec,
    // A reminder needs its word, and on a small coin it fits once: icon-only and two-name
    // designs give their reminders the classic layout.
    style: spec.style === "solo" || spec.style === "double" ? "classic" : spec.style,
    reminder: true,
    diameter: spec.reminderDiameter ?? 32,
    textSize: 5,
    // the word sized by its length (short ones up to 7 mm, long ones up to 230°), a little more
    // open than on the character (large letters on a small coin close up at their tops), and
    // the icon as large as fits clear of it (see AUTO_TEXT)
    autoText: true,
    spacing: (spec.spacing ?? 1.1) * 1.14,
    iconScale: 0.85,
    iconOffsetY: 1.5,
    margin: 1.5,
    maxArc: 200,
    frameWidth: Math.min(spec.frameWidth ?? 0.8, 0.6),
    // Same back as the character tokens: the designed backs scale with the coin.
    // A reminder is a token of its own: its character's other state isn't on its back.
    linked: true,
  };
}

/**
 * A reminder's word sized by its length (spec.autoText, off unless set): a short word grows until
 * its ink spans `arc` degrees or stands `cap` mm tall, a long one keeps textSize and shrinks to fit
 * maxArc as before; the icon then takes the largest size that keeps clear of the word and the frame
 * (at most `icon` of the coin, as iconScale), centred in the room left. Classic layout only.
 */
export const AUTO_TEXT: AutoText = { cap: 7, arc: 160, icon: 0.85, maxArc: 230 };
const autoOf = (spec: TokenSpec): AutoText | null =>
  spec.autoText && spec.style === "classic" ? { ...AUTO_TEXT, ...(spec.autoText === true ? {} : spec.autoText) } : null;

// ---------------------------------------------------------------- loading

/** The token lettering: Alegreya SC ExtraBold (SIL OFL), chosen for strokes a 0.4 mm nozzle
 *  can print (tools/font-protos/ measures them). The CSS family serves the few SVG <text>s. */
export const LETTERING = { file: "AlegreyaSC-ExtraBold.ttf", family: "Midnight Mint Lettering" };

/**
 * Prepares the library: the role list and seal (both from Firestore, invite-only)
 * plus the lettering font, which is served with the site from `assetBase`.
 */
export async function loadLibrary(roles: Role[], { sealSvg = null, assetBase = "/" }: { sealSvg?: string | null; assetBase?: string } = {}): Promise<Library> {
  const get = async (name: string, kind: "arrayBuffer") => {
    const res = await fetch(assetBase + name);
    if (!res.ok) throw new Error(`could not load ${name} (${res.status})`);
    return res[kind]();
  };
  const fontBuf = await get(LETTERING.file, "arrayBuffer");
  const font = new Font(new TTFLoader().parse(fontBuf));
  const box = boundsOf(font.generateShapes("H", 1));
  const lib: Library = { roles, font, capHeight: box.max.y - box.min.y || 0.7, sealSvg, glyphs: new Map(), icons: new Map(),
    seal: sealSvg ? parseSvgShapes(sealSvg) : [] };
  return lib;
}

/** The name printed for a role in a translation ("en", "es", "ca", "es-castelgard"…; see translations.ts). */
export const roleName = (role: Role, lang: string): string =>
  // a token of yours says what you wrote in that language, nothing included (not another language's)
  role.edition === "own" && role.names && lang in role.names ? role.names[lang] : role.names?.[lang] || (role as unknown as Partial<Record<string, string>>)[lang] || role.en;

/** Resolves "team" colour references: the token's own colour, else its team's (its group's). */
export function partColours(role: Role, spec: SpecInput): PartColours {
  const team = role.colour ?? TEAMS[role.team].colour;
  const c = { ...DEFAULT_SPEC.colours, ...spec.colours };
  const pick = (v: ColourRef): Hex => (v === "team" ? team : v);
  // A back that is a face is a second front, in its colours (the back colour is for back designs).
  const face = spec.back === FACE_BACK ? backColours(spec) : null;
  return { base: pick(c.base), front: pick(c.front), ink: pick(c.icon ?? c.front), icon: pick(c.base), frame: pick(c.frame), back: pick(face?.front ?? c.back), backIcon: pick(c.base), backFrame: pick(face?.frame ?? c.frame) };
}

// ---------------------------------------------------------------- geometry helpers

function boundsOf(shapes: THREE.Shape[]) {
  const box = new THREE.Box2();
  for (const s of shapes) for (const p of s.getPoints(4)) box.expandByPoint(p);
  if (box.isEmpty()) box.set(new THREE.Vector2(0, 0), new THREE.Vector2(0, 0));
  return box;
}

function parseSvgShapes(svgText: string) {
  const data = new SVGLoader().parse(svgText);
  return data.paths.flatMap((p) => SVGLoader.createShapes(p));
}

/** A closed outline's points with none (nearly) on top of the one before, nor the last on the first: a circle
 *  drawn round to 2π ends a hair off its start, and that point would leave a side face of no width, its edges
 *  shared by four faces (a slicer's "non-manifold edges"). */
function cleanLoop(points: THREE.Vector2[]) {
  const out: THREE.Vector2[] = [];
  for (const p of points) if (!out.length || out[out.length - 1].distanceToSquared(p) > 1e-8) out.push(p);
  while (out.length > 3 && out[0].distanceToSquared(out[out.length - 1]) <= 1e-8) out.pop();
  return out;
}
/** Shapes redrawn as clean straight-sided outlines, `curveSegments` cuts to a curve; any of fewer than three points left out. */
function cleanShapes(shapes: THREE.Shape[], curveSegments: number) {
  return shapes.flatMap((s) => {
    const { shape, holes } = s.extractPoints(curveSegments), outline = cleanLoop(shape);
    if (outline.length < 3) return [];
    const c = new THREE.Shape(outline);
    c.holes = holes.map(cleanLoop).filter((h) => h.length >= 3).map((h) => new THREE.Path(h));
    return [c];
  });
}

/** Extrudes 2D shapes and applies a matrix, keeping triangles outward-facing. */
function extrude(shapes: THREE.Shape[], depth: number, matrix: THREE.Matrix4, curveSegments = 5) {
  if (!shapes.length) return null;
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(cleanShapes(shapes, curveSegments), { depth, bevelEnabled: false, curveSegments: 1 });
  g = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", g.attributes.position.clone());
  g.dispose();
  out.applyMatrix4(matrix);
  if (matrix.determinant() < 0) flipWinding(out);
  out.computeVertexNormals();
  return out;
}

function flipWinding(geom: THREE.BufferGeometry) {
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

const merge = (list: (THREE.BufferGeometry | null | undefined)[]) => {
  const parts = list.filter((g): g is THREE.BufferGeometry => !!g);
  const g = parts.length ? mergeGeometries(parts) : null;
  // bevelled relief: what stands out of the face, summed (see partExtrude)
  if (g && parts.every((p) => aboveOf.has(p))) aboveOf.set(g, parts.reduce((s, p) => s + aboveOf.get(p)!, 0));
  return g;
};

const M = () => new THREE.Matrix4();
const T = (x: number, y: number, z: number) => M().makeTranslation(x, y, z);
const S = (x: number, y: number, z: number) => M().makeScale(x, y, z);
const RZ = (a: number) => M().makeRotationZ(a);
const chain = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), M());

/**
 * A full circle as arcs, one every ~3 mm of radius: each curve is cut into a set number of segments
 * (curveSegments, getPoints), so one arc for a 20 mm circle leaves it a polygon you can see; a bead stays one arc.
 */
function circlePath<T extends THREE.Path>(p: T, x: number, y: number, r: number, cw: boolean): T {
  const n = Math.max(1, Math.ceil(r / 3));
  for (let i = 0; i < n; i++) {
    const a0 = (cw ? -1 : 1) * (i * TAU) / n, a1 = (cw ? -1 : 1) * ((i + 1) * TAU) / n;
    p.absarc(x, y, r, a0, a1, cw);
  }
  return p;
}
function circleShape(r: number) {
  return circlePath(new THREE.Shape(), 0, 0, r, false);
}
function ringShape(rOuter: number, rInner: number) {
  const s = circleShape(rOuter);
  s.holes.push(circlePath(new THREE.Path(), 0, 0, rInner, true));
  return s;
}
function rectShape(x0: number, y0: number, x1: number, y1: number) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
  return s;
}
/** A rectangle along the radius, from r0 to r1, at angle a (radians). */
function radialBar(r0: number, r1: number, width: number, a: number) {
  const s = rectShape(r0, -width / 2, r1, width / 2);
  const pts = s.getPoints().map((p) => p.clone().rotateAround(new THREE.Vector2(), a));
  return new THREE.Shape(pts);
}

// ---------------------------------------------------------------- parts

/** What three's Font holds (its types call it a string): each glyph's advance, in font units. */
interface FontData { glyphs: Record<string, { ha: number } | undefined>; resolution: number }

function glyph(lib: Library, ch: string): Glyph {
  if (lib.glyphs.has(ch)) return lib.glyphs.get(ch)!;
  const shapes = lib.font.generateShapes(ch, 1);
  const data = lib.font.data as unknown as FontData;
  const g = data.glyphs[ch];
  const advance = g ? g.ha / data.resolution : 0.5;
  // Centre each letter on its advance width (normal typesetting); centring on the
  // outline box instead makes the spacing uneven (wide around A and V).
  const info: Glyph = { shapes, advance, center: advance / 2 };
  lib.glyphs.set(ch, info);
  return info;
}

/** A letter's outline points, in font units, about its advance centre (cached). */
function glyphPoints(lib: Library, ch: string) {
  const g = glyph(lib, ch);
  g.points ??= g.shapes.flatMap((s) => s.getPoints(4)).map((p): [number, number] => [p.x - g.center, p.y]);
  return g.points;
}

/**
 * Where the name's ink sits: the middle of the angles its outline covers on the circle,
 * relative to the bottom (270°), in degrees. Letters stand on the circle at `angles`, tops
 * towards the centre, as in letterSvg and the 3D name.
 */
function inkMidAngle(lib: Library, chars: string[], angles: number[], radius: number, em: number) {
  const [lo, hi] = inkRange(lib, chars, angles, radius, em);
  return lo <= hi ? (lo + hi) / 2 - 270 : 0;
}
/** The angles (°) the name's ink covers on the circle, lowest and highest (lo > hi: no ink). */
function inkRange(lib: Library, chars: string[], angles: number[], radius: number, em: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  chars.forEach((ch, i) => {
    if (ch === " ") return;
    for (const [x, y] of glyphPoints(lib, ch)) {
      // along the circle: x·tangent (towards larger angles); towards the centre: y
      const t = x * em, r = radius - y * em;
      const deg = angles[i] + (Math.atan2(t, r) * 180) / Math.PI;
      if (deg < lo) lo = deg;
      if (deg > hi) hi = deg;
    }
  });
  return [lo, hi];
}

/** Inner edge of the frame (mm from centre), so text can stay clear of it. */
function frameInner(spec: TokenSpec) {
  return frameDesign(spec)?.inner ?? spec.diameter / 2;
}

/** The tallest letters of the "text" layout (mm): a "+1" doesn't fill the whole coin. */
const TEXT_MAX_CAP = 12, TEXT_PITCH = 1.35;
/**
 * The "text" layout: the token's words in the middle, straight, in one line or two (split where
 * the letters come out largest), as large as fits inside the frame; no icon. Baselines y up.
 */
export function textLayout(lib: Library, text: string | null | undefined, spec: TokenSpec) {
  const words = (text || "").toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { em: 0, cap: 0, lines: [] as { text: string; y: number }[] };
  const r = frameInner(spec) - 2, width = (line: string) => { const b = boundsOf(textShapes(lib, line, 1)); return b.max.x - b.min.x; };
  const options = [[words.join(" ")], ...words.slice(1).map((_, i) => [words.slice(0, i + 1).join(" "), words.slice(i + 1).join(" ")])];
  let best: { em: number; lines: string[] } | null = null;
  for (const lines of options) {
    // the block's corners on the circle: width × height at size 1, scaled to fit
    const w = Math.max(...lines.map(width)), h = lib.capHeight * (1 + (lines.length - 1) * TEXT_PITCH);
    const em = Math.min((2 * r) / Math.hypot(w, h), TEXT_MAX_CAP / lib.capHeight);
    if (!best || em > best.em * 1.02) best = { em, lines };
  }
  const cap = best!.em * lib.capHeight, total = cap + (best!.lines.length - 1) * TEXT_PITCH * cap;
  return { em: best!.em, cap, lines: best!.lines.map((l, i) => ({ text: l, y: total / 2 - cap - i * TEXT_PITCH * cap })) };
}

/** Where each letter of the curved name goes; shared by 3D and 2D renderers. */
export function layoutName(lib: Library, text: string | null | undefined, spec: TokenSpec) {
  const chars = [...(text || "").toUpperCase()];
  const R = spec.diameter / 2;
  const margin = Math.max(spec.margin, R - frameInner(spec) + 0.9);   // clear of the frame ornament
  const radius = R - margin;
  const auto = autoOf(spec);
  if (auto) {
    // sized by the ink: letters by the capitals' height, a word of signs only ("?") by its own
    const ref = /[\p{L}\p{N}]/u.test(text || "") ? lib.capHeight : inkHeight(lib, chars);
    const arcAt = (size: number) => {
      const P = placeName(lib, chars, size / ref, radius, spec.spacing, Infinity);
      const [lo, hi] = inkRange(lib, chars, P.angles, radius, size / ref);
      return hi - lo;
    };
    // the ink's arc grows about in step with the size: a few rounds reach the target
    let size = spec.textSize;
    for (let i = 0; i < 4; i++) {
      const arc = arcAt(size);
      if (!(arc > 0)) break;
      size = Math.min(auto.cap, (size * auto.arc) / arc);
    }
    size = Math.max(size, Math.min(spec.textSize, auto.cap));
    const em = size / ref, P = placeName(lib, chars, em, radius, spec.spacing, auto.maxArc ?? spec.maxArc);
    return { chars, angles: P.angles, radius, em: em * P.scale, total: P.total, scale: P.scale, letterHeight: size * P.scale, margin };
  }
  const em = spec.textSize / lib.capHeight;
  const P = placeName(lib, chars, em, radius, spec.spacing, spec.maxArc);
  return { chars, angles: P.angles, radius, em: em * P.scale, total: P.total, scale: P.scale, letterHeight: spec.textSize * P.scale, margin };
}

/** The ink's height (font units at 1 em) of the name's characters; the capitals' for none. */
function inkHeight(lib: Library, chars: string[]) {
  let lo = Infinity, hi = -Infinity;
  for (const ch of chars) if (ch !== " ") for (const [, y] of glyphPoints(lib, ch)) { if (y < lo) lo = y; if (y > hi) hi = y; }
  return hi > lo ? Math.max(hi - lo, lib.capHeight * 0.4) : lib.capHeight;
}

/** The letters along the circle at `em`, centred on the bottom, squeezed to maxArc (°). */
function placeName(lib: Library, chars: string[], em: number, radius: number, spacing: number, maxArc: number) {
  const widths = chars.map((c) => (c === " " ? Math.max(glyph(lib, " ").advance, 0.45) : glyph(lib, c).advance) * em * spacing);
  let steps: number[] = [];
  for (let i = 1; i < chars.length; i++) steps.push((widths[i - 1] + widths[i]) / 2);
  let total = (steps.reduce((a, b) => a + b, 0) / radius) * (180 / Math.PI);
  let scale = 1;
  if (total > maxArc) {
    scale = maxArc / total;
    total = maxArc;
    steps = steps.map((s) => s * scale);
  }
  const angles: number[] = [];
  let a = 270 - total / 2;
  chars.forEach((_, i) => {
    if (i > 0) a += (steps[i - 1] / radius) * (180 / Math.PI);
    angles.push(a);
  });
  // Centring on the advance widths leaves the ink off-centre when the end letters have
  // open sides (MAYOR, SAINT: up to 0.7 mm). Turn the name so its ink, as it sits on the
  // circle, spans the same angle either side of the bottom.
  const off = inkMidAngle(lib, chars, angles, radius, em * scale);
  if (off) for (let i = 0; i < angles.length; i++) angles[i] -= off;
  return { angles, total, scale };
}

/** The edition a back prints the name of (the Edition design, a face that says the edition): the role's edition
 *  (a homebrew character's script, a collection's token its catalog), or with backText "collection"
 *  the collection's own name; null for none. */
function backEdition(role: Role, spec: TokenSpec): Edition | null {
  if (spec.backText === "collection" && role.collectionName) return { name: { en: role.collectionName } };
  return EDITIONS[role.edition] ?? (role.editionName ? { name: { en: role.editionName } } : null);
}

/**
 * Edition back: the edition's full name (a homebrew character's: its script's) in the centre, one word per line, as
 * large as fits inside a fine double rim, with a small star above and below.
 * Filled shapes in coin coordinates (mm, y up), shared by the 3D model and 2D.
 */
function editionBack(lib: Library, role: Role, spec: TokenSpec) {
  // a script's own (homebrew) characters carry their script's name instead
  const ed = backEdition(role, spec);
  if (!ed) return null;
  // its gold rims as far in as the front's frame (frameInset), never nearer the edge than 0.7 mm: the coin's side all the base's
  const R = spec.diameter / 2, out = R - Math.max(0.7, frameInsetOf(spec));
  const shapes: THREE.Shape[] = [annulus(out, out - 0.6), annulus(out - 1.2, out - 1.65)];
  const words = (ed.name[spec.lang] || ed.name[spec.lang?.split("-")[0]] || ed.name.en).toUpperCase().split(/\s+/);
  const track = 0.08;                                     // letter spacing, in em
  const lineW = (w: string, em: number) => [...w].reduce((a, c) => a + glyph(lib, c).advance * em * (1 + track), 0) - glyph(lib, w.at(-1) as string).advance * em * track;
  const ri = out - 1.65 - 1.8;                            // keep clear of the inner rim
  const n = words.length, gap = 0.55;                     // line gap, in cap heights
  // Largest cap height that keeps every line (and the stars) inside the circle.
  const layout = (h: number) => {
    const em = h / lib.capHeight, H = n * h + (n - 1) * gap * h, star = Math.min(1.7, h * 0.45);
    const lines = words.map((w, i) => ({ w, width: lineW(w, em), base: H / 2 - h - i * (1 + gap) * h }));
    const fits = lines.every((l) => Math.hypot(l.width / 2, Math.max(Math.abs(l.base), Math.abs(l.base + h * 1.25))) <= ri)
      && H / 2 + h * 0.7 + 2 * star <= ri;
    return { em, H, star, lines, fits };
  };
  let lo = 1, hi = spec.diameter * 0.17;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (layout(m).fits) lo = m; else hi = m; }
  const L = layout(lo), h = lo;
  const place = (src: THREE.Shape[], k: number, dx: number, dy: number) => src.map((sh) => {
    const move = (pts: THREE.Vector2[]) => pts.map((q) => new THREE.Vector2(q.x * k + dx, q.y * k + dy));
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
const iconMarkup = (role: Role) => role.body ?? role.d!.map((d) => `<path d="${d}"/>`).join("");

/**
 * The icon a token shows: the design's own (spec.icon: {id, g, body}, an uploaded SVG or a
 * game-icons.net icon, placed in the same 127.56-unit square) or the character's.
 */
/** A short tag of an icon's markup (its length and a sampled hash), so caches keyed by it follow its content. */
const contentTag = (s: string) => { let h = 0; for (let i = 0; i < s.length; i += 5) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return `${s.length.toString(36)}${(h >>> 0).toString(36)}`; };
function iconOf(role: Role, spec?: SpecInput) {
  const own = spec?.icon;
  // keyed by id: a script's own character can share an official one's name
  // drawn as HTML in the previews: only its shapes (safe-svg.ts), whatever stored or sent it
  if (own?.body) return { key: `icon:${own.id}`, g: safeTransform(own.g), body: safeIconMarkup(own.body) };
  const body = safeIconMarkup(iconMarkup(role));
  return { key: `${role.iconKey ?? role.id ?? role.en}#${contentTag(body)}`, g: safeTransform(role.g), body };
}
const iconSvg = (icon: Pick<TokenIcon, "body"> & { g?: string }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRACE_VIEW} ${TRACE_VIEW}"><g transform="${icon.g}">${icon.body}</g></svg>`;

function iconShapes(lib: Library, role: Role, spec: TokenSpec) {
  const icon = iconOf(role, spec);
  if (!lib.icons.has(icon.key)) lib.icons.set(icon.key, parseSvgShapes(iconSvg(icon)));
  return lib.icons.get(icon.key)!;
}

/** How many filled shapes an icon ({g, body}) has: 0 means it can't be printed (strokes only, or not vector). */
export function iconShapeCount(icon: Pick<TokenIcon, "body"> & { g?: string }) {
  try { return parseSvgShapes(iconSvg(icon)).length; } catch { return 0; }
}
/** The square icons are drawn in (SVG units): an icon's `g` places its markup inside it. */
export const ICON_VIEW = TRACE_VIEW;

/** Matrix placing traced-SVG shapes (y down, 0..127.56) centred on the coin. */
function tracedMatrix(sizeMm: number, z: number, mirrorX = false, offsetY = 0) {
  const k = sizeMm / TRACE_VIEW;
  return chain(T(0, offsetY, z), S(mirrorX ? -1 : 1, 1, 1), S(k, -k, 1), T(-TRACE_VIEW / 2, -TRACE_VIEW / 2, 0));
}

// ---------------------------------------------------------------- icon-only and two-name layouts

/** Each name's widest arc in the "double" layout (°): two of 180° would meet at the sides. */
const DOUBLE_ARC = 160;
/** Room kept around the fitted icon (mm): from each name's letters, and from the frame. */
const NAME_GAP = 1.2, EDGE_GAP = 1.5;

/** The name as laid out for this design: once, twice (the "double" arcs are narrower), or none. */
function arcName(lib: Library, text: string, spec: TokenSpec) {
  if (spec.style === "solo" || spec.style === "text") return null;
  return layoutName(lib, text, spec.style === "double" ? { ...spec, maxArc: Math.min(spec.maxArc, DOUBLE_ARC) } : spec);
}
/** The turns the name is drawn at (radians): the "double" layout repeats it upside down. */
const nameTurns = (spec: TokenSpec) => (spec.style === "double" ? [0, Math.PI] : [0]);

/** An icon's outline points about its box centre (icon units, y up), and that centre; cached. */
const iconOutlines = new WeakMap<THREE.Shape[], { cx: number; cy: number; w: number; h: number; rel: [number, number][] }>();
function iconOutline(shapes: THREE.Shape[]) {
  let o = iconOutlines.get(shapes);
  if (!o) {
    const pts = shapes.flatMap((sh) => sh.getPoints(4)), box = new THREE.Box2().setFromPoints(pts);
    if (!pts.length) box.set(new THREE.Vector2(0, 0), new THREE.Vector2(0, 0));   // no icon: nothing to place
    const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
    o = { cx, cy, w: box.max.x - box.min.x, h: box.max.y - box.min.y, rel: pts.map((p): [number, number] => [p.x - cx, -(p.y - cy)]) };
    iconOutlines.set(shapes, o);
  }
  return o;
}

const fitted = new Map<string, number | { k: number; dy: number }>();
/** The layouts whose icon is fitted round the name (fittedIcon) rather than drawn at iconScale. */
const fitsIcon = (spec: TokenSpec) => spec.style === "solo" || spec.style === "double" || !!autoOf(spec);
/**
 * "solo" and "double": the icon centred, at the largest scale (mm per icon unit) that keeps
 * NAME_GAP clear of each name's letters and EDGE_GAP clear of the frame; iconScale then
 * shrinks or grows it from there. With autoText (a reminder's word sized by its length) the
 * icon may also move up: the largest that fits anywhere on the vertical axis, at most
 * autoText.icon of the coin, centred in the room it has. Returns the placement in icon units
 * and how far up (mm) it sits.
 */
function fittedIcon(lib: Library, role: Role, spec: TokenSpec, text: string) {
  const shapes = iconShapes(lib, role, spec), o = iconOutline(shapes), auto = autoOf(spec);
  if (auto) {
    const a = fittedAutoIcon(lib, spec, text, shapes, o, auto, iconOf(role, spec).key);
    if (a.k > 0) return a;   // no room anywhere beside the word: the usual layout below
  }
  const key = [iconOf(role, spec).key, text, spec.style, spec.diameter, faceRadius(spec), spec.textSize, spec.spacing, spec.margin, spec.maxArc, spec.frame, spec.frameWidth, frameInsetOf(spec)].join("|");
  if (!fitted.has(key)) {
    const edge = frameInner(spec), L = arcName(lib, text, spec);
    // each name's ink as an annular sector: the angles it covers and how near the centre it reaches
    const sectors: { lo: number; hi: number; rIn: number }[] = [];
    if (L) {
      let lo = Infinity, hi = -Infinity, rIn = Infinity;
      L.chars.forEach((ch, i) => {
        if (ch === " ") return;
        const a = (L.angles[i] * Math.PI) / 180, rot = a + Math.PI / 2, c = Math.cos(rot), sn = Math.sin(rot);
        for (const [gx, gy] of glyphPoints(lib, ch)) {
          const x = gx * L.em, y = gy * L.em;
          const px = L.radius * Math.cos(a) + x * c - y * sn, py = L.radius * Math.sin(a) + x * sn + y * c;
          const deg = ((Math.atan2(py, px) * 180) / Math.PI + 360) % 360;
          lo = Math.min(lo, deg); hi = Math.max(hi, deg); rIn = Math.min(rIn, Math.hypot(px, py));
        }
      });
      if (lo <= hi) for (const turn of nameTurns(spec)) { const d = (turn * 180) / Math.PI; sectors.push({ lo: lo + d - (d ? 360 : 0), hi: hi + d - (d ? 360 : 0), rIn }); }
    }
    const fits = (k: number) => o.rel.every(([ux, uy]) => {
      const x = ux * k, y = uy * k, r = Math.hypot(x, y);
      if (r > edge - EDGE_GAP) return false;
      const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, da = ((NAME_GAP / Math.max(r, 0.5)) * 180) / Math.PI;
      return !sectors.some((sc) => deg >= sc.lo - da && deg <= sc.hi + da && r > sc.rIn - NAME_GAP);
    });
    let lo = 0, hi = spec.diameter / Math.max(o.w, o.h, 1e-6);
    for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    fitted.set(key, lo);
    if (fitted.size > 2000) fitted.delete(fitted.keys().next().value!);
  }
  return { shapes, k: (fitted.get(key) as number) * (spec.iconScale || 1), cx: o.cx, cy: o.cy, dy: 0 };
}

/** The name's ink as an annular sector: the angles it covers (°) and how near the centre it reaches (mm). */
function nameSector(lib: Library, L: ReturnType<typeof layoutName>) {
  let lo = Infinity, hi = -Infinity, rIn = Infinity;
  L.chars.forEach((ch, i) => {
    if (ch === " ") return;
    const a = (L.angles[i] * Math.PI) / 180, rot = a + Math.PI / 2, c = Math.cos(rot), sn = Math.sin(rot);
    for (const [gx, gy] of glyphPoints(lib, ch)) {
      const x = gx * L.em, y = gy * L.em;
      const px = L.radius * Math.cos(a) + x * c - y * sn, py = L.radius * Math.sin(a) + x * sn + y * c;
      const deg = ((Math.atan2(py, px) * 180) / Math.PI + 360) % 360;
      lo = Math.min(lo, deg); hi = Math.max(hi, deg); rIn = Math.min(rIn, Math.hypot(px, py));
    }
  });
  return lo <= hi ? { lo, hi, rIn } : null;
}

/** fittedIcon for autoText: the icon as large as fits (up to auto.icon), moved up the axis to the middle of its room. */
function fittedAutoIcon(lib: Library, spec: TokenSpec, text: string, shapes: THREE.Shape[], o: ReturnType<typeof iconOutline>, auto: AutoText, iconKey: string) {
  const key = ["auto", iconKey, text, spec.diameter, faceRadius(spec), spec.textSize, spec.spacing, spec.margin, spec.maxArc, spec.frame, spec.frameWidth, frameInsetOf(spec), auto.cap, auto.arc, auto.icon, auto.maxArc].join("|");
  if (!fitted.has(key)) {
    const edge = frameInner(spec), sc = nameSector(lib, layoutName(lib, text, spec));
    const fits = (k: number, dy: number) => o.rel.every(([ux, uy]) => {
      const x = ux * k, y = uy * k + dy, r = Math.hypot(x, y);
      if (r > edge - EDGE_GAP) return false;
      if (!sc) return true;
      const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, da = ((NAME_GAP / Math.max(r, 0.5)) * 180) / Math.PI;
      return !(deg >= sc.lo - da && deg <= sc.hi + da && r > sc.rIn - NAME_GAP);
    });
    const largest = (dy: number) => {
      let lo = 0, hi = spec.diameter / Math.max(o.w, o.h, 1e-6);
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fits(m, dy)) lo = m; else hi = m; }
      return lo;
    };
    // where along the vertical axis (mm, up) the icon may sit: from the centre up to half the radius
    const R = spec.diameter / 2, ys: number[] = [];
    for (let i = Math.round(-R * 2.5); i <= Math.round(R * 5); i++) ys.push(i / 10);   // every 0.1 mm
    // the largest anywhere: every 0.5 mm, then every 0.1 mm round the best
    let best = 0, bestK = -1;
    for (const dy of ys.filter((_, i) => i % 5 === 0)) { const kk = largest(dy); if (kk > bestK) { bestK = kk; best = dy; } }
    for (const dy of ys.filter((y) => Math.abs(y - best) < 0.45)) { const kk = largest(dy); if (kk > bestK) { bestK = kk; best = dy; } }
    const k = Math.min(bestK, (spec.diameter * auto.icon) / TRACE_VIEW);
    // at that size, the stretch of the axis where it fits; the icon in its middle
    const ok = ys.filter((y) => fits(k, y));
    let dy = ok.length ? Math.round(((ok[0] + ok[ok.length - 1]) / 2) * 100) / 100 : best;
    if (!fits(k, dy)) dy = best;
    fitted.set(key, { k, dy });
    if (fitted.size > 2000) fitted.delete(fitted.keys().next().value!);
  }
  const f = fitted.get(key) as { k: number; dy: number };
  return { shapes, k: f.k, cx: o.cx, cy: o.cy, dy: f.dy };
}

/** The icon's larger side as printed (mm), for a classic, solo or double coin. */
export function faceIconSize(lib: Library, role: Role, input: SpecInput | undefined, text?: string | null): number {
  const spec = windowFrame(shapeSpec(role, input));
  if (spec.style === "window") return NaN;
  const o = iconOutline(iconShapes(lib, role, spec));
  if (fitsIcon(spec)) return fittedIcon(lib, role, spec, text ?? roleName(role, spec.lang)).k * Math.max(o.w, o.h);
  return (spec.diameter * spec.iconScale / TRACE_VIEW) * Math.max(o.w, o.h);
}

/**
 * Which face a set of inlays goes into. The top one: sunk from the coin's top, its raised
 * parts standing out of it. The bottom one, a back that is a face: sunk from z = 0 and
 * mirrored so it reads right when the coin is turned over; its raised parts (when the front
 * has none: see backRelief) stand out below z = 0, and the coin prints face-down, that face on top.
 */
interface Face { z: number; mirror: boolean; flush: boolean; bottom?: boolean }
const topFace = (spec: TokenSpec): Face => ({ z: spec.height - spec.depth, mirror: false, flush: false });
const bottomFace = (raised: boolean): Face => ({ z: 0, mirror: true, flush: !raised, bottom: true });
/** A face's matrix: on the bottom face, mirrored. */
const onFace = (face: Face, m: THREE.Matrix4) => (face.mirror ? chain(S(-1, 1, 1), m) : m);
const faceHeight = (spec: TokenSpec, part: ReliefPart, face: Face) => (face.flush ? spec.depth : inlayHeight(spec, part));
/** Where a part's inlay starts: on the top face `depth` under the top (its relief above it); on
 *  the bottom face its relief under z = 0, so every part ends `depth` into the coin. */
const partZ = (spec: TokenSpec, part: ReliefPart, face: Face) => (face.bottom ? spec.depth - faceHeight(spec, part, face) : face.z);

function buildFront(lib: Library, role: Role, text: string, spec: TokenSpec, face = topFace(spec)) {
  const top = partZ(spec, "text", face), iconZ = partZ(spec, "icon", face);
  if (spec.style === "text") {
    // the words alone, straight, in the middle
    const TL = textLayout(lib, text, spec);
    const letters = TL.lines.map((line) => { const shapes = textShapes(lib, line.text, TL.em), box = boundsOf(shapes); return partExtrude(shapes, spec, "text", face, onFace(face, T(-(box.min.x + box.max.x) / 2, line.y, top)), 4); });
    return { geom: merge(letters), icon: null, name: { letterHeight: TL.cap || Infinity, scale: 1, total: null, lines: TL.lines.length } };
  }
  let icon;
  if (fitsIcon(spec)) {
    const f = fittedIcon(lib, role, spec, text);
    icon = partExtrude(f.shapes, spec, "icon", face, onFace(face, chain(T(0, f.dy, iconZ), S(f.k, -f.k, 1), T(-f.cx, -f.cy, 0))));
  } else {
    icon = partExtrude(iconShapes(lib, role, spec), spec, "icon", face, onFace(face, tracedMatrix(spec.diameter * spec.iconScale, iconZ, false, spec.iconOffsetY || 0)));
  }
  const L = arcName(lib, text, spec);
  const letters = L ? nameTurns(spec).flatMap((turn) => L.chars.map((c, i) => {
    if (c === " ") return null;
    const g = glyph(lib, c);
    const a = THREE.MathUtils.degToRad(L.angles[i]);
    return partExtrude(g.shapes, spec, "text", face, onFace(face, chain(RZ(turn),
      T(L.radius * Math.cos(a), L.radius * Math.sin(a), top),
      RZ(a + Math.PI / 2), S(L.em, L.em, 1), T(-g.center, 0, 0))), 4);
  })) : [];
  // no name ("solo"): nothing to be too small
  return { geom: merge(letters), icon, name: L ?? { letterHeight: Infinity, scale: 1, total: 0 } };
}

function buildFrame(spec: TokenSpec, face = topFace(spec)) {
  const design = frameDesign(spec);
  if (!design) return null;
  return partExtrude(design.shapes, spec, "frame", face, onFace(face, T(0, 0, partZ(spec, "frame", face))), 24);
}

/** Fits arbitrary shapes into a circle of radius r (used for uploaded SVGs). */
function fitShapes(shapes: THREE.Shape[], r: number, svgYDown = true) {
  const box = boundsOf(shapes);
  const size = new THREE.Vector2(); box.getSize(size);
  const centre = new THREE.Vector2(); box.getCenter(centre);
  const k = (r * 2 * 0.70710678) / Math.max(size.x, size.y, 1e-6); // fit the bounding square inside the circle
  return chain(S(k, svgYDown ? -k : k, 1), T(-centre.x, -centre.y, 0));
}

function buildBack(lib: Library, role: Role, text: string, spec: TokenSpec) {
  const R = spec.diameter / 2, d = spec.depth;
  // The back is seen from below, so mirror X to read correctly when flipped over.
  const mirror = S(-1, 1, 1);
  const shapes: THREE.Shape[] = [];
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
      let custom: THREE.Shape[];
      try { custom = parseSvgShapes(spec.customSvg); } catch { return null; }
      if (!custom.length) return null;
      return extrude(custom, d, chain(mirror, fitShapes(custom, R - 1.2)), 6);
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- window style

/** The window: a circle cut off by a straight line near the middle. */
function windowPoints(Rw: number, cutY: number, n = 72) {
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
export function windowLayout(lib: Library, text: string | null | undefined, spec: TokenSpec) {
  const R = spec.diameter / 2;
  const rim = Math.max(1.6, spec.diameter * 0.045);
  const Rw = R - rim;
  const cutY = -R * 0.2;
  // name: one or two straight lines in the band under the window
  const words = (text || "").toUpperCase().trim().split(/\s+/).filter(Boolean);
  const options: (string | string[])[] = [words.join(" ")];
  if (words.length > 1) {
    let best: { score: number; lines: string[] } | null = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const score = Math.max(a.length, b.length);
      if (!best || score < best.score) best = { score, lines: [a, b] };
    }
    options.push(best!.lines);
  }
  const widthAt1 = (line: string) => { const box = boundsOf(lib.font.generateShapes(line, 1 / lib.capHeight)); return box.max.x - box.min.x; };
  const bottom = -(R - rim * 0.9);
  const gap = 1.2, lead = 1.45;
  let best: { cap: number; lines: string[]; baselines: number[] } | null = null;
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
  const fit = best ?? { cap: 1.2, lines: [words.join(" ")], baselines: [cutY - gap - 1.2] };
  // Centre the name block in the band under the window (a touch above the middle).
  const blockTop = fit.baselines[0] + fit.cap, blockBottom = fit.baselines[fit.baselines.length - 1];
  const free = (blockBottom - bottom) - (cutY - gap - blockTop);
  if (free > 0) fit.baselines = fit.baselines.map((y) => y - (free / 2) * 0.8);
  return {
    R, Rw, cutY, rim, cap: fit.cap, em: fit.cap / lib.capHeight,
    lines: fit.lines.map((t, i) => ({ text: t, y: fit.baselines[i] })),
    icon: { top: Rw - 1.4, bottom: cutY + 1.0, halfWidth: Rw * 0.78 },
  };
}

/** SVG path data for one glyph at font size 1, in font units (y up). Cached. */
function glyphPath(lib: Library, ch: string) {
  lib.glyphPaths ??= new Map();
  if (!lib.glyphPaths.has(ch)) {
    const ring = (pts: THREE.Vector2[]) => pts.map((pt, i) => `${i ? "L" : "M"}${pt.x.toFixed(4)} ${pt.y.toFixed(4)}`).join("") + "Z";
    lib.glyphPaths.set(ch, glyph(lib, ch).shapes.map((sh) => ring(sh.getPoints(6)) + sh.holes.map((h) => ring(h.getPoints(6))).join("")).join(""));
  }
  return lib.glyphPaths.get(ch)!;
}

/**
 * One letter as an SVG path: centred on its advance at (x, y) (SVG coordinates),
 * rotated by `deg`, at font size `em` — the same geometry the 3D model uses.
 */
function letterSvg(lib: Library, ch: string, x: number, y: number, deg: number, em: number, fill: string) {
  const g = glyph(lib, ch);
  return `<path fill="${fill}" fill-rule="evenodd" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg.toFixed(1)}) scale(${em.toFixed(4)} ${(-em).toFixed(4)}) translate(${(-g.center).toFixed(4)} 0)" d="${glyphPath(lib, ch)}"/>`;
}

/** SVG path data for font shapes (y up), moved by (dx, y) and flipped to SVG's y-down. */
/** An uploaded back's outlines as SVG path data, fitted as buildBack fits them (seen from the back). */
const customBacks = new Map<string, string>();
function customBackPath(spec: TokenSpec) {
  if (!spec.customSvg) return "";
  const key = `${spec.diameter}|${spec.customSvg}`;
  if (!customBacks.has(key)) {
    let d = "";
    try {
      const shapes = parseSvgShapes(spec.customSvg);
      if (shapes.length) {
        const m = fitShapes(shapes, spec.diameter / 2 - 1.2), v = new THREE.Vector3();
        const ring = (pts: THREE.Vector2[]) => pts.map((p, i) => { v.set(p.x, p.y, 0).applyMatrix4(m); return `${i ? "L" : "M"}${v.x.toFixed(2)} ${(-v.y).toFixed(2)}`; }).join("") + "Z";
        d = shapes.map((sh) => ring(sh.getPoints(6)) + sh.holes.map((h) => ring(h.getPoints(6))).join("")).join("");
      }
    } catch { /* an SVG that won't parse: no artwork, as in the model */ }
    customBacks.set(key, d);
    if (customBacks.size > 50) customBacks.delete(customBacks.keys().next().value!);
  }
  return customBacks.get(key)!;
}
/** Shapes built once per key and then reused, so caches keyed on the shapes themselves (the bevel's) hold. */
const shapeMemo = new Map<string, THREE.Shape[]>();
function memoShapes(key: string, make: () => THREE.Shape[]) {
  let s = shapeMemo.get(key);
  if (!s) { shapeMemo.set(key, (s = make())); if (shapeMemo.size > 400) shapeMemo.delete(shapeMemo.keys().next().value!); }
  return s;
}
const textShapes = (lib: Library, text: string, size: number) => memoShapes(`t|${text}|${size}`, () => lib.font.generateShapes(text, size));
function shapesToPath(shapes: THREE.Shape[], dx: number, y: number, div = 6) {
  const ring = (pts: THREE.Vector2[]) => pts.map((pt, i) => `${i ? "L" : "M"}${(pt.x + dx).toFixed(2)} ${(-(pt.y + y)).toFixed(2)}`).join("") + "Z";
  return shapes.map((sh) => ring(sh.getPoints(div)) + sh.holes.map((h) => ring(h.getPoints(div))).join("")).join("");
}

/** An icon's outline points (its outer contours), kept for the shapes they're of. */
const iconPoints = new WeakMap<THREE.Shape[], THREE.Vector2[]>();
const pointsOf = (shapes: THREE.Shape[]) => { let p = iconPoints.get(shapes); if (!p) iconPoints.set(shapes, (p = shapes.flatMap((sh) => sh.getPoints(4)))); return p; };
/**
 * Matrix that fits the role's icon into the window (from its SVG coordinates): as large as its box
 * lets it, and no larger than the window's circle does (an icon wide at its top, like a diamond, would
 * otherwise reach past the coin where the box's corners do); the design's icon scale on top.
 */
function windowIconMatrix(lib: Library, role: Role, W: WindowLayout, z: number, spec: TokenSpec) {
  const shapes = iconShapes(lib, role, spec);
  const box = boundsOf(shapes), size = new THREE.Vector2(); box.getSize(size);
  const h = W.icon.top - W.icon.bottom;
  const cy = (W.icon.top + W.icon.bottom) / 2;
  const bcx = (box.min.x + box.max.x) / 2, bcy = (box.min.y + box.max.y) / 2;
  const limit = W.Rw - 1.2, pts = pointsOf(shapes);
  const inside = (k: number) => pts.every((q) => Math.hypot((q.x - bcx) * k, cy - (q.y - bcy) * k) <= limit);
  let fit = Math.min((2 * W.icon.halfWidth) / Math.max(size.x, 1e-6), h / Math.max(size.y, 1e-6));
  if (!inside(fit)) { let lo = 0, hi = fit; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inside(m)) lo = m; else hi = m; } fit = lo; }
  const k = fit * (spec.iconScale || 1);
  return { shapes, k, cy, bcx, bcy, m: chain(T(0, cy, z), S(k, -k, 1), T(-bcx, -bcy, 0)) };
}

/** Which face parts stand out of the coin ({text, frame, icon}). */
export const reliefOf = (spec?: { relief?: Partial<Relief> } | null): Relief => ({ text: !!spec?.relief?.text, frame: !!spec?.relief?.frame, icon: !!spec?.relief?.icon });
/** Does anything stand out of the face? Then the token prints face-up. */
export const hasRelief = (spec?: { relief?: Partial<Relief> } | null) => Object.values(reliefOf(spec)).some(Boolean);
const FLAT: Relief = { text: false, frame: false, icon: false };
/**
 * Which parts of a back face stand out ({text, frame, icon}; none for a back design). Only one
 * face can have raised parts, since the other lies on the bed: the back's count only while the
 * front's are all flush. A two-state token's other state under a back design is a face too, with the back's settings.
 * The workshop never lets both be raised; this is the rule should a design say otherwise.
 */
export function backRelief(spec: SpecInput): Relief {
  if (spec.back !== FACE_BACK || hasRelief(spec)) return FLAT;
  return reliefOf(spec.backFace);
}
/** How far the relief stands out of its face (mm), 0 when nothing is raised on either. */
export const reliefTop = (spec: SpecInput) => (hasRelief(spec) || hasRelief({ relief: backRelief(spec) }) ? spec.reliefHeight ?? DEFAULT_SPEC.reliefHeight : 0);
/** Is this token printed face-up? When anything on its front is raised. A raised back prints
 *  face-down like a flush token, its back on top. */
export const printsFaceUp = hasRelief;
/** How tall a face part's inlay is: the inlay depth, plus the relief when it's raised. */
const inlayHeight = (spec: TokenSpec, part: ReliefPart) => spec.depth + (reliefOf(spec)[part] ? reliefTop(spec) : 0);

/**
 * The window layout: every colour is an inlay in the coin's top; the icon is its own part
 * in the coin colour, laid over the window. Raised parts stand out of the face.
 */
type WindowLayout = ReturnType<typeof windowLayout>;

function buildWindowFace(lib: Library, role: Role, text: string, spec: TokenSpec, face = topFace(spec)) {
  const d = spec.depth, z = face.z;
  const W = windowLayout(lib, text, spec);
  const I = windowIconMatrix(lib, role, W, partZ(spec, "icon", face), spec);
  const window = extrude([new THREE.Shape(windowPoints(W.Rw, W.cutY))], d, onFace(face, T(0, 0, z)), 48);
  const letters = W.lines.map((line) => {
    const shapes = textShapes(lib, line.text, W.em);
    const box = boundsOf(shapes);
    return partExtrude(shapes, spec, "text", face, onFace(face, T(-(box.min.x + box.max.x) / 2, line.y, partZ(spec, "text", face))), 4);
  });
  return {
    window, letters: merge(letters),
    icon: partExtrude(I.shapes, spec, "icon", face, onFace(face, I.m), 5),
    name: { letterHeight: W.cap, scale: W.cap / spec.textSize, total: null, lines: W.lines.length },
  };
}

// ---------------------------------------------------------------- designed backs
//
// The back is the same on every token (so it gives nothing away) and is printed
// as one colour, so each design is a set of filled shapes. Nothing is thinner
// than ~0.45 mm, so it prints cleanly with a 0.4 mm nozzle.

const TAU = Math.PI * 2;
const pt = (r: number, a: number) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
/** pt as [x, y], to spread into a shape's position. */
const ptXY = (r: number, a: number) => pt(r, a).toArray() as [number, number];
const polygon = (points: THREE.Vector2[]) => new THREE.Shape(points);
function disc(r: number, x = 0, y = 0) { return circlePath(new THREE.Shape(), x, y, r, false); }
function annulus(rOut: number, rIn: number, x = 0, y = 0) {
  const sh = disc(rOut, x, y);
  sh.holes.push(circlePath(new THREE.Path(), x, y, rIn, true));
  return sh;
}
/** A tapered hand or ray from r0 to r1 at angle a: width w0 at the base, w1 at the tip. */
function taper(r0: number, r1: number, a: number, w0: number, w1: number) {
  const n = new THREE.Vector2(-Math.sin(a), Math.cos(a));
  const b = pt(r0, a), t = pt(r1, a);
  return polygon([b.clone().addScaledVector(n, w0 / 2), t.clone().addScaledVector(n, w1 / 2),
    t.clone().addScaledVector(n, -w1 / 2), b.clone().addScaledVector(n, -w0 / 2)]);
}
/** A four-pointed star (sparkle) with long and short arms. */
function sparkle(x: number, y: number, long: number, short: number, rot = 0) {
  const pts: THREE.Vector2[] = [];
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
function crescent(cx: number, cy: number, r: number, bx: number, by: number, br: number, n = 120) {
  const inShadow = ([x, y]: number[]) => Math.hypot(x - bx, y - by) < br;
  const inMoon = ([x, y]: number[]) => Math.hypot(x - cx, y - cy) < r;
  const ring = (x: number, y: number, rr: number) => Array.from({ length: n }, (_, i) => [x + rr * Math.cos((i * TAU) / n), y + rr * Math.sin((i * TAU) / n)]);
  const moon = ring(cx, cy, r), shadow = ring(bx, by, br);
  // Lit arc: start where the moon's edge leaves the shadow and follow it until it re-enters.
  const k = moon.findIndex((q, i) => !inShadow(q) && inShadow(moon[(i - 1 + n) % n]));
  if (k < 0) return disc(r, cx, cy);
  const outer: number[][] = [];
  for (let j = 0; j < n && !inShadow(moon[(k + j) % n]); j++) outer.push(moon[(k + j) % n]);
  // Shadow arc inside the moon, from the end of the lit arc back to its start.
  const last = outer[outer.length - 1];
  let m = 0, best = Infinity;
  shadow.forEach((q, i) => { const dd = Math.hypot(q[0] - last[0], q[1] - last[1]); if (inMoon(q) && dd < best) { best = dd; m = i; } });
  const walk = (step: number) => { const out: number[][] = []; for (let j = 0; j < n; j++) { const q = shadow[(m + step * j + n * n) % n]; if (!inMoon(q)) break; out.push(q); } return out; };
  const a = walk(-1), b = walk(1);
  const inner = a.length >= b.length ? a : b;
  return polygon([...outer, ...inner].map(([x, y]) => new THREE.Vector2(x, y)));
}

/** A beaded border: n small discs on a circle. */
/** An elliptical band (a planet's ring): semi-axes a and b, band width w, turned by rot, at (x, y). */
function ellipseRing(a: number, b: number, w: number, rot: number, x = 0, y = 0, n = 120) {
  const at = (A: number, B: number, i: number) => {
    const t = (i * TAU) / n, ex = A * Math.cos(t), ey = B * Math.sin(t);
    return new THREE.Vector2(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot));
  };
  const sh = new THREE.Shape(Array.from({ length: n }, (_, i) => at(a, b, i)));
  sh.holes.push(new THREE.Path(Array.from({ length: n }, (_, i) => at(a - w, b - w, n - i))));
  return sh;
}
const beads = (r: number, n: number, size: number) => Array.from({ length: n }, (_, i) => disc(size, ...ptXY(r, (i * TAU) / n)));

// ---------------------------------------------------------------- designed frames
//
// The frame is a band of ornament just inside the coin's edge. `inner` is where
// it ends, so the curved name always sits clear of it. Nothing is thinner than
// ~0.45 mm. All outlines are wound the same way so overlaps add up (SVG nonzero).

/** Same winding for every hole-less outline, so overlapping shapes merge in 2D. */
function ccw(sh: THREE.Shape) {
  if (sh.holes.length) return sh;
  const pts = sh.getPoints(8);
  return THREE.ShapeUtils.isClockWise(pts) ? new THREE.Shape(pts.reverse()) : sh;
}
/** A band between two radii from angle a0 to a1 (radians, a0 < a1). */
function arcBand(rOut: number, rIn: number, a0: number, a1: number, n = 96) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) pts.push(pt(rOut, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) pts.push(pt(rIn, a0 + ((a1 - a0) * i) / n));
  return polygon(pts);
}
/** A pointed leaf from base (x, y) along direction `dir` (radians). */
function leaf(x: number, y: number, dir: number, len: number, width: number, n = 14) {
  const ax = Math.cos(dir), ay = Math.sin(dir), nx = -ay, ny = ax, side: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, h = (width / 2) * Math.sin(Math.PI * t) ** 0.8;
    side.push([x + ax * len * t, y + ay * len * t, h]);
  }
  const left = side.map(([px, py, h]) => new THREE.Vector2(px + nx * h, py + ny * h));
  const right = side.slice(1, -1).reverse().map(([px, py, h]) => new THREE.Vector2(px - nx * h, py - ny * h));
  return polygon([...left, ...right]);
}
/** Lit part of a moon of radius r at (x, y): phase 0 new, 0.5 full, 1 new again. */
function moonPhase(x: number, y: number, r: number, phase: number) {
  const lit = 1 - Math.abs(1 - 2 * phase);            // 0 (new) .. 1 (full)
  const waxing = phase < 0.5 ? 1 : -1;                 // light on the right while waxing
  if (lit > 0.97) return [disc(r, x, y)];
  if (lit < 0.03) return [annulus(r, r - 0.45, x, y)];  // new moon: just the outline
  // The shadow is a disc the same size, slid across the moon.
  const off = 2 * r * lit;
  return [crescent(x, y, r, x - waxing * off, y, r * (lit > 0.5 ? 1 : 1.04))];
}

/** How far inside the coin's edge the frame starts (mm): none, it runs out to the edge. */
/** How far in from the coin's edge its frame starts (mm): the design's (frameInset), none unless it says. */
const frameInsetOf = (spec: Partial<Pick<TokenSpec, "frameInset">>) => Math.min(Math.max(+(spec.frameInset ?? 0) || 0, 0), 3);
/** Sides of the coin's outline (buildBase's cylinder). */
const coinSegments = () => 160;
/**
 * The frame's outer ring, with the coin outline's own corners: a cylinder of n sides has one
 * at the bottom (-y), so n divisible by 4 puts them where a circle from angle 0 has its own.
 * The ring's edge is then exactly the coin's, leaving no slivers of coin poking out past it.
 */
function edgeRing(rOut: number, rIn: number, n: number) {
  const ring = (r: number) => Array.from({ length: n }, (_, k) => pt(r, (k * TAU) / n));
  const sh = new THREE.Shape(ring(rOut));
  sh.holes.push(new THREE.Path(ring(rIn).reverse()));
  return sh;
}

const frameDesigns = new Map<string, { shapes: THREE.Shape[]; inner: number } | null>();
/** Filled shapes for the front frame and its inner edge, or null for none (the same ones for the same frame). */
export function frameDesign(spec: TokenSpec): { shapes: THREE.Shape[]; inner: number } | null {
  const key = `${spec.frame}|${spec.frameWidth}|${frameInsetOf(spec)}|${faceRadius(spec)}`;
  if (!frameDesigns.has(key)) {
    frameDesigns.set(key, makeFrameDesign(spec));
    if (frameDesigns.size > 100) frameDesigns.delete(frameDesigns.keys().next().value!);
  }
  return frameDesigns.get(key)!;
}
function makeFrameDesign(spec: TokenSpec): { shapes: THREE.Shape[]; inner: number } | null {
  const w = spec.frameWidth, out = faceRadius(spec) - frameInsetOf(spec), edge = out - w;
  const rim = edgeRing(out, edge, coinSegments());
  const sh: THREE.Shape[] = [rim];
  let inner = edge;
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
      const rm = edge - 1.9, mr = 1.2;              // 0.7 mm clear of the rim
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 2 - (k * TAU) / 8;
        sh.push(...moonPhase(...ptXY(rm, a), mr, (0.5 + k / 8) % 1));
        for (const f of [0.32, 0.5, 0.68]) sh.push(disc(f === 0.5 ? 0.4 : 0.3, ...ptXY(rm, a - (f * TAU) / 8)));
      }
      inner = rm - mr - 0.2;
      break;
    }
    case "firmamento": {
      // A night sky band: four-pointed stars, large and small, with dots between.
      const rs = edge - 1.35, n = 12;
      for (let i = 0; i < n * 2; i++) {
        const a = Math.PI / 2 - (i * TAU) / (n * 2);
        if (i % 2) sh.push(disc(0.3, ...ptXY(rs, a)));
        else sh.push(sparkle(...ptXY(rs, a), i % 4 ? 0.85 : 1.2, i % 4 ? 0.3 : 0.38, a));
      }
      inner = rs - 1.2;
      break;
    }
    case "espinas": {
      // A crown of thorns: spikes pointing in from the rim.
      const n = Math.round((TAU * edge) / 2.6);
      for (let i = 0; i < n; i++) sh.push(taper(edge + 0.05, edge - 1.7, (i * TAU) / n, 0.9, 0.12));
      inner = edge - 1.7;
      break;
    }
    case "colmillos": {
      // Fangs: long and short teeth in turn, pointing in.
      const n = 2 * Math.round((TAU * edge) / 7);
      for (let i = 0; i < n; i++) sh.push(taper(edge + 0.05, edge - (i % 2 ? 1.5 : 2.6), (i * TAU) / n, i % 2 ? 0.9 : 1.3, 0.12));
      inner = edge - 2.6;
      break;
    }
    case "runas": {
      // Rune-like marks (made up, no real alphabet) centred between the rim and a thin inner ring, 0.6 mm from each.
      const r0 = edge - 0.6, r1 = r0 - 1.9, ringOut = r1 - 0.6, rIn = ringOut - 0.45, n = Math.round((TAU * edge) / 3.2), w = 0.6;
      const bar = (p: THREE.Vector2, q: THREE.Vector2) => { const d = q.clone().sub(p).normalize(), nn = new THREE.Vector2(-d.y, d.x).multiplyScalar(w / 2);
        return polygon([p.clone().add(nn), q.clone().add(nn), q.clone().sub(nn), p.clone().sub(nn)]); };
      const da = 0.55 / edge;                                   // ~0.55 mm either side of a mark's axis
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n, A = (r: number, k: number) => pt(r, a + k * da), mid = (r0 + r1) / 2;
        const marks = [[[A(r0, 0), A(r1, 0)], [A(r0, 0), A(mid, 1.4)]], [[A(r0, -1), A(r1, -1)], [A(r0, 1), A(r1, 1)], [A(mid, -1), A(mid, 1)]],
          [[A(r0, -1), A(r1, 1)], [A(r0, 1), A(r1, -1)]], [[A(r0, -1), A(r1, 0)], [A(r1, 0), A(r0, 1)]]][i % 4];
        for (const [p, q] of marks) sh.push(bar(p, q));
      }
      sh.push(annulus(ringOut, rIn)); inner = rIn;
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
      const mirrorX = (s: THREE.Shape) => polygon(s.getPoints(8).map((p) => new THREE.Vector2(-p.x, p.y)));
      sh.push(...branch, ...branch.map(mirrorX), disc(0.8, ...ptXY(rl, -Math.PI / 2)));
      inner = rl - 1.45;
      break;
    }
    default: break;
  }
  return { shapes: sh.map(ccw), inner };
}

/** Filled shapes for a designed back, or null if `id` isn't one of them. */
export function backDesign(id: string, R: number): THREE.Shape[] | null {
  return backShapes(id, R)?.map(ccw) ?? null;
}

// Same winding for every outline (ccw), so overlapping hands and hub merge in 2D. None has a border of
// its own: a back's frame is its face's (its Frame setting), so it's never drawn twice.
function backShapes(id: string, R: number): THREE.Shape[] | null {
  const out = R - 0.7;
  switch (id) {
    case "medianoche":
    case "reloj": {   // ("reloj", the clock alone, was its borderless twin for a day)
      // Weighted hour markers, a small crescent moon at XII and tapered hands at five to midnight.
      const sh: THREE.Shape[] = [];
      for (let h = 0; h < 12; h++) {
        const a = Math.PI / 2 - (h * TAU) / 12;
        if (h === 0) continue;                                     // XII holds the moon
        if (h % 3 === 0) sh.push(taper(out - 6.2, out - 3.2, a, 1.5, 0.9));
        else sh.push(sparkle(...ptXY(out - 4.1, a), 0.9, 0.38, a));
      }
      const moonY = out - 5.45;                                   // crescent at XII, ~0.45 mm below the ring
      sh.push(crescent(0, moonY, 2.3, 1.06, moonY + 0.55, 1.96));
      const minute = Math.PI / 2 + (5 * TAU) / 60, hour = Math.PI / 2 + (0.08 * TAU) / 12;
      sh.push(taper(-2.6, R * 0.6, minute, 1.8, 0.6), taper(-2.0, R * 0.38, hour, 2.6, 0.9), disc(1.7), annulus(2.7, 2.15));
      return sh;
    }
    case "guilloche": {
      // Engraved lace: interlocking rings around the centre.
      const sh: THREE.Shape[] = [];
      const n = 16, c = R * 0.34, r = R * 0.36;
      for (let i = 0; i < n; i++) sh.push(annulus(r, r - 0.5, ...ptXY(c, (i * TAU) / n)));
      sh.push(annulus(R * 0.2, R * 0.2 - 0.5), disc(1.2));
      return sh;
    }
    case "rosa": {
      // Sixteen-point compass rose.
      const sh: THREE.Shape[] = [];
      const long = out - 2.6, mid = long * 0.62, short = long * 0.42, inner = 1.6;
      const star = (n: number, r: number, w: number, rot: number) => {
        const pts: THREE.Vector2[] = [];
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
      const sh: THREE.Shape[] = [];
      const n = 32, r0 = R * 0.24, rl = out - 1.4, rs = out - 4.2;
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n;
        sh.push(i % 2 ? taper(r0 + 1.2, rs, a, 1.0, 0.45) : taper(r0 + 1.2, rl, a, 1.6, 0.5));
      }
      sh.push(annulus(r0, r0 - 0.55), disc(r0 - 1.3));
      return sh;
    }
    case "eclipse": {
      // A crescent moon with a few stars.
      const sh: THREE.Shape[] = [];
      const mr = R * 0.44;
      sh.push(crescent(-R * 0.06, -R * 0.02, mr, R * 0.1, R * 0.08, mr * 0.9));
      for (const [x, y, s] of [[0.42, 0.34, 1.0], [0.4, -0.4, 0.7], [0.5, -0.06, 0.55], [-0.08, 0.55, 0.5], [0.3, 0.58, 0.4]])
        sh.push(sparkle(x * R, y * R, 1.7 * s + 0.4, 0.45 * s + 0.2));
      return sh;
    }
    case "orbitas": {
      // A rayed sun, three orbits with their planets (the middle one ringed).
      const sh = [disc(R * 0.13)];
      for (let i = 0; i < 12; i++) sh.push(taper(R * 0.17, R * 0.25, (i * TAU) / 12, 1.0, 0.45));
      const orbits = [R * 0.4, R * 0.6, R * 0.8];
      for (const r of orbits) sh.push(annulus(r + 0.25, r - 0.25));
      const p1 = ptXY(orbits[0], 0.7), p2 = ptXY(orbits[1], 3.6), p3 = ptXY(orbits[2], 5.35);
      sh.push(disc(R * 0.06, ...p1));
      sh.push(disc(R * 0.085, ...p2), ellipseRing(R * 0.16, R * 0.055, 0.5, -0.35, ...p2));
      sh.push(disc(R * 0.05, ...p3), disc(0.4, p3[0] + R * 0.085, p3[1] + R * 0.04));
      return sh;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- background patterns
//
// A pattern fills a face behind everything on it: thin lines or small cells, continuous, with the
// icon, the name and the frame (on the back, its design) on top. Everything is a flush inlay, so
// "on top" means the pattern is taken away round each of them, a halo of coin colour (at least
// PATTERN_MIN) that keeps them readable. It's a flush inlay too, in a colour the token already
// has: it joins that part's geometry, so it never needs a filament of its own.
//
// The cut is worked out on a fine grid (PATTERN_GRID): the pattern's own signed distance, the
// distance to the face's ink (rasterised, then a Euclidean distance transform) less the halo, and
// the coin's edge, the least of them; then anything thinner than PATTERN_MIN is opened away
// (eroded and grown back) and pieces under PATTERN_MIN across left out; the outline is traced
// (marching squares) and simplified. The 3D model and the SVG use the same outlines.

type Pt = [number, number];
type Poly = Pt[];
/** An outline with its holes (mm, y up). */
interface Ring { outer: Poly; holes: Poly[] }

/** The patterns, by id. More can follow (stripes, dots, scales, hexagons): each is a signed distance. */
export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: "rombos-lineas", label: "Harlequin lines" },
  { id: "damero-rombos", label: "Harlequin checks" },
  { id: "escamas", label: "Scales (lines)" },
  { id: "escamas-relleno", label: "Scales" },
  { id: "rayas", label: "Bend stripes" },
  { id: "cuartelado", label: "Quartered" },
  { id: "damero", label: "Checkerboard" },
];
/** The illustrations a face's background can be (Midnight, Guilloché, the sun…): one drawing filling what its frame leaves. */
export const ILLUSTRATIONS: PatternId[] = BACK_ORNAMENTS.map((id) => `ill-${id}` as PatternId);
export const isIllustration = (id: string | undefined) => !!id && id.startsWith("ill-") && BACK_ORNAMENTS.includes(id.slice(4));
const PATTERN_IDS = new Set<string>([...PATTERNS.map((p) => p.id), ...ILLUSTRATIONS]);
/** The thinnest line, gap or piece a pattern prints (mm): about a nozzle's width and a half. */
export const PATTERN_MIN = 0.6;
/** The halo of coin colour round what sits on a pattern (mm), unless the pattern sets its own. */
export const PATTERN_HALO = 0.8;
/** A harlequin rhombus's height to its width. */
const HARLEQUIN = 1.6;
/** The grid the cut is worked out on (mm), and how far inside the coin's edge a pattern stops. */
const PATTERN_GRID = 0.05, PATTERN_EDGE = 0.7;

const polyArea = (p: Poly) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return s / 2; };
function inPoly(x: number, y: number, p: Poly) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(x: number, y: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function edgeDist(x: number, y: number, p: Poly) {
  let d = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) d = Math.min(d, segDist(x, y, p[j], p[i]));
  return d;
}
const boxOf = (p: Poly) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};

/** What a pattern's fields are when it leaves them out: a rhombus's width, the line (the gap between cells) and the halo (mm). */
const PATTERN_DEFAULTS: Record<string, { scale: number; line: number; halo: number }> = {
  "rombos-lineas": { scale: 3.2, line: PATTERN_MIN, halo: PATTERN_HALO },
  "damero-rombos": { scale: 3, line: 0.7, halo: PATTERN_HALO },
  "escamas": { scale: 4.4, line: PATTERN_MIN, halo: PATTERN_HALO },
  "escamas-relleno": { scale: 3.6, line: 0.7, halo: PATTERN_HALO },
  "rayas": { scale: 4, line: 1.6, halo: PATTERN_HALO },
  "cuartelado": { scale: 4, line: 0.7, halo: PATTERN_HALO },
  "damero": { scale: 5, line: 0.7, halo: PATTERN_HALO },
};
/** An illustration has no size or line of its own: it's drawn as it is, its halo the usual. */
export const patternDefaults = (id: PatternId) => PATTERN_DEFAULTS[id] ?? { scale: 0, line: PATTERN_MIN, halo: PATTERN_HALO };
/** Patterns without a size: the face quartered. */
export const patternFixed = (id: PatternId) => id === "cuartelado" || isIllustration(id);
/** Patterns whose `line` is the gap between filled cells (or stripes), not a line's width. */
export const patternFilled = (id: PatternId) => id === "damero-rombos" || id === "escamas-relleno" || id === "rayas" || id === "cuartelado" || id === "damero";

/**
 * Fish scales, `w` wide, as the distance (mm) from a point to the nearest edge between scales
 * (and whether it's that far inside a scale). Scales are circles of radius r = w/2 in rows r apart,
 * each row offset half a scale; a row lies over the one below it, so each scale shows its round
 * lower edge and hangs, point up, between two of the row above.
 */
function scaleEdge(x: number, y: number, w: number) {
  const r = w / 2, near = (n: number) => { const off = n & 1 ? r : 0, cx = 2 * r * Math.round((x - off) / (2 * r)) + off; return [cx, n * r]; };
  const n0 = Math.floor(y / r) + 1;
  for (let n = n0; n >= n0 - 2; n--) {
    const [cx, cy] = near(n), d = Math.hypot(x - cx, y - cy);
    if (d >= r) continue;
    // its own edge, and the scales over it: the two of the row above and the one above those
    let e = r - d;
    for (const [ax, ay] of [[cx - r, cy + r], [cx + r, cy + r], [cx, cy + 2 * r]]) e = Math.min(e, Math.hypot(x - ax, y - ay) - r);
    return e;
  }
  return 0;
}

/**
 * A pattern as a signed distance (mm, positive inside), centred on the coin, and how wide its
 * lines (or cells) and the gaps between them come out. `scale` is a rhombus's width, its height
 * HARLEQUIN times that.
 */
function patternField(p: PatternSpec) {
  const cells = p.id === "damero-rombos", d = patternDefaults(p.id);
  if (p.id === "escamas" || p.id === "escamas-relleno") {
    // lines along the scales' edges, or the scales themselves with `line` of coin between them
    const w = Math.max(2.4, p.scale ?? d.scale), line = Math.max(PATTERN_MIN, p.line ?? d.line), r = w / 2;
    return p.id === "escamas"
      ? { sdf: (x: number, y: number) => line / 2 - scaleEdge(x, y, w), line, width: line, gap: r - line }
      : { sdf: (x: number, y: number) => scaleEdge(x, y, w) - line / 2, line, width: w - line, gap: line };
  }
  if (p.id === "cuartelado") {
    // the field quartered, heraldry's way: the first and fourth quarters (top left, bottom right as
    // you look at it) filled, `line` of coin along the cross between them
    const line = Math.max(PATTERN_MIN, p.line ?? d.line);
    return { sdf: (x: number, y: number) => (x * y < 0 ? 1 : -1) * Math.min(Math.abs(x), Math.abs(y)) - line / 2, line, width: Infinity, gap: line };
  }
  if (p.id === "damero") {
    // a checkerboard of squares `scale` across, one filled square on the centre; where two meet at a
    // corner each stops `line`/2 short of it
    const P = Math.max(1.5, p.scale ?? d.scale), line = Math.max(PATTERN_MIN, Math.min(P / 2, p.line ?? d.line));
    const sdf = (x: number, y: number) => {
      const u = x + P / 2, v = y + P / 2, i = Math.floor(u / P), j = Math.floor(v / P), fu = u - i * P, fv = v - j * P;
      const e = Math.min(fu, P - fu, fv, P - fv);
      return ((i + j) & 1) === 0 ? e - line / 2 : -(e + line / 2);
    };
    return { sdf, line, width: P - line, gap: line * Math.SQRT2 };
  }
  if (p.id === "rayas") {
    // a heraldic bend: broad stripes from the top left to the bottom right, one through the centre
    const P = Math.max(2 * PATTERN_MIN, p.scale ?? d.scale), line = Math.max(PATTERN_MIN, Math.min(P - PATTERN_MIN, p.line ?? d.line));
    return { sdf: (x: number, y: number) => { const t = (x + y) / Math.SQRT2; return (P - line) / 2 - Math.abs(t - P * Math.round(t / P)); }, line, width: P - line, gap: line };
  }
  const a = Math.max(1.5, p.scale ?? d.scale), b = a * HARLEQUIN, s = Math.hypot(a / 2, b / 2), h = (a * b) / (4 * s);
  const line = Math.max(PATTERN_MIN, p.line ?? d.line);
  if (cells) {
    // a checkerboard of rhombi a wide and b tall: the filled ones on a grid (a, b), each shrunk so
    // that where two meet at a corner `line` of coin shows between them (more at the taller corners)
    const f = 1 - line / a, A = (a / 2) * f, B = (b / 2) * f, k = 1 / Math.hypot(1 / A, 1 / B);
    const sdf = (x: number, y: number) => {
      const m0 = Math.floor(x / a), n0 = Math.floor(y / b);
      let best = -Infinity;
      for (const m of [m0, m0 + 1]) for (const n of [n0, n0 + 1]) best = Math.max(best, (1 - Math.abs(x - m * a) / A - Math.abs(y - n * b) / B) * k);
      return best;
    };
    return { sdf, line, width: 2 * h * f, gap: line };
  }
  // lines along the sides of rhombi a wide and b tall, a rhombus centred on the coin: two families
  // of parallel lines, `line` wide, 2h apart (h the rhombus's apothem)
  const normals = [[-a / 2, b / 2], [a / 2, b / 2]].map(([dx, dy]) => [-dy / s, dx / s]);
  const sdf = (x: number, y: number) => {
    let best = -Infinity;
    for (const [nx, ny] of normals) { const t = nx * x + ny * y - h; best = Math.max(best, line / 2 - Math.abs(t - 2 * h * Math.round(t / (2 * h)))); }
    return best;
  };
  return { sdf, line, width: line, gap: 2 * h - line };
}

/** Euclidean distance transform (Felzenszwalb–Huttenlocher): each cell's distance (cells) to the nearest set one. */
function distanceTransform(set: Uint8Array, W: number, H: number) {
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), out = new Float32Array(W * H);
  const pass = (len: number) => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = set[y * W + x] ? 0 : 1e20; pass(H); for (let y = 0; y < H; y++) out[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = out[y * W + x]; pass(W); for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]); }
  return out;
}

/** Douglas–Peucker on a closed outline. */
function simplifyLoop(p: Poly, tol: number): Poly {
  if (p.length < 8) return p;
  let far = 0, fd = -1;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(p.length); keep[0] = keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, p.length]];
  while (stack.length) {
    const [i, j] = stack.pop()!, b = p[j % p.length];
    let m = -1, md = tol;
    for (let k = i + 1; k < j; k++) { const d = segDist(p[k][0], p[k][1], p[i], b); if (d > md) { md = d; m = k; } }
    if (m >= 0) { keep[m] = 1; stack.push([i, m], [m, j]); }
  }
  return p.filter((_, i) => keep[i]);
}

/** Marching squares: the outlines where the grid's field crosses 0, as outlines with their holes (mm). */
function traceField(F: Float32Array, W: number, H: number, x0: number, y0: number, px: number, tol = 0.008): Ring[] {
  const adj = new Int32Array(2 * W * H * 2).fill(-1);
  const link = (e1: number, e2: number) => { adj[2 * e1 + (adj[2 * e1] < 0 ? 0 : 1)] = e2; adj[2 * e2 + (adj[2 * e2] < 0 ? 0 : 1)] = e1; };
  const Hid = (i: number, j: number) => 2 * (j * W + i), Vid = (i: number, j: number) => 2 * (j * W + i) + 1;
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const f0 = F[j * W + i], f1 = F[j * W + i + 1], f2 = F[(j + 1) * W + i + 1], f3 = F[(j + 1) * W + i];
    const c = (f0 > 0 ? 1 : 0) | (f1 > 0 ? 2 : 0) | (f2 > 0 ? 4 : 0) | (f3 > 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const e0 = Hid(i, j), e1 = Vid(i + 1, j), e2 = Hid(i, j + 1), e3 = Vid(i, j), mid = f0 + f1 + f2 + f3 > 0;
    switch (c) {
      case 1: case 14: link(e3, e0); break;
      case 2: case 13: link(e0, e1); break;
      case 3: case 12: link(e3, e1); break;
      case 4: case 11: link(e1, e2); break;
      case 6: case 9: link(e0, e2); break;
      case 7: case 8: link(e3, e2); break;
      case 5: if (mid) { link(e0, e1); link(e2, e3); } else { link(e3, e0); link(e1, e2); } break;
      case 10: if (mid) { link(e3, e0); link(e1, e2); } else { link(e0, e1); link(e2, e3); } break;
    }
  }
  const point = (e: number): Pt => {
    const k = e >> 1, i = k % W, j = (k - i) / W, va = F[k], vb = e & 1 ? F[k + W] : F[k + 1], t = va / (va - vb);
    return e & 1 ? [x0 + i * px, y0 + (j + t) * px] : [x0 + (i + t) * px, y0 + j * px];
  };
  const seen = new Uint8Array(2 * W * H), loops: Poly[] = [];
  for (let e = 0; e < 2 * W * H; e++) {
    if (seen[e] || adj[2 * e] < 0) continue;
    const loop: Poly = [];
    let prev = -1, cur = e;
    while (!seen[cur]) {
      seen[cur] = 1; loop.push(point(cur));
      const a = adj[2 * cur], b = adj[2 * cur + 1], next = a !== prev && !seen[a] ? a : b;
      prev = cur; cur = next;
      if (cur < 0) break;
    }
    if (loop.length >= 3) loops.push(simplifyLoop(loop, tol));
  }
  // even depth: an outline; odd: a hole in the smallest outline round it
  const info = loops.map((l) => ({ l, box: boxOf(l), area: Math.abs(polyArea(l)) }));
  const inside = (a: typeof info[0], b: typeof info[0]) => a !== b && b.area > a.area && a.box[0] >= b.box[0] && a.box[2] <= b.box[2] && a.box[1] >= b.box[1] && a.box[3] <= b.box[3] && inPoly(a.l[0][0], a.l[0][1], b.l);
  const rings = new Map<typeof info[0], Ring>(), holes: [typeof info[0], typeof info[0]][] = [];
  for (const a of info) {
    const around = info.filter((b) => inside(a, b));
    if (around.length % 2 === 0) rings.set(a, { outer: a.l, holes: [] });
    else holes.push([a, around.reduce((m, b) => (b.area < m.area ? b : m))]);
  }
  for (const [hole, parent] of holes) rings.get(parent)?.holes.push(hole.l);
  return [...rings.values()];
}

/** Fills outlines (each with its holes) into the grid's cells (even-odd), by rows. */
function rasterise(rings: Ring[], set: Uint8Array, W: number, H: number, x0: number, y0: number, px: number) {
  for (const r of rings) {
    const all = [r.outer, ...r.holes], [, by0, , by1] = boxOf(r.outer);
    for (let j = Math.max(0, Math.ceil((by0 - y0) / px)); j <= Math.min(H - 1, Math.floor((by1 - y0) / px)); j++) {
      const y = y0 + j * px, xs: number[] = [];
      for (const p of all) for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
        const [xi, yi] = p[i], [xk, yk] = p[k];
        if ((yi > y) !== (yk > y)) xs.push(xi + ((y - yi) * (xk - xi)) / (yk - yi));
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2)
        for (let i = Math.max(0, Math.ceil((xs[q] - x0) / px)); i <= Math.min(W - 1, Math.floor((xs[q + 1] - x0) / px)); i++) set[j * W + i] = 1;
    }
    // the outlines too, so a tip or a stroke thinner than a cell isn't lost between cell centres
    for (const p of all) for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
      const [xa, ya] = p[k], [xb, yb] = p[i], n = Math.ceil(Math.hypot(xb - xa, yb - ya) / (px / 2));
      for (let t = 0; t <= n; t++) {
        const ci = Math.round((xa + ((xb - xa) * t) / n - x0) / px), cj = Math.round((ya + ((yb - ya) * t) / n - y0) / px);
        if (ci >= 0 && ci < W && cj >= 0 && cj < H) set[cj * W + ci] = 1;
      }
    }
  }
}

interface PatternCut { rings: Ring[]; line: number; width: number; gap: number; halo: number; minPiece: number; ink: Ring[] }

/**
 * Fills `solid` into the grid as its silhouette: each outline without its holes, and whatever it
 * walls in once grown by the halo (a gap between wings and a tail, say) — the cells more than the
 * halo from it that can't be reached from the grid's edge without coming nearer.
 */
function fillSolid(solid: Ring[], set: Uint8Array, W: number, H: number, x0: number, px: number, halo: number) {
  const N = W * H, s = new Uint8Array(N);
  rasterise(solid.map((r) => ({ outer: r.outer, holes: [] })), s, W, H, x0, x0, px);
  const d = distanceTransform(s, W, H), open = (k: number) => d[k] * px > halo + px;
  const out = new Uint8Array(N), stack = new Int32Array(N);
  let top = 0;
  const push = (k: number) => { if (!out[k] && open(k)) { out[k] = 1; stack[top++] = k; } };
  for (let i = 0; i < W; i++) { push(i); push((H - 1) * W + i); }
  for (let j = 0; j < H; j++) { push(j * W); push(j * W + W - 1); }
  while (top) {
    const k = stack[--top], i = k % W;
    if (i > 0) push(k - 1);
    if (i < W - 1) push(k + 1);
    if (k >= W) push(k - W);
    if (k < N - W) push(k + W);
  }
  for (let k = 0; k < N; k++) if (s[k] || (!out[k] && open(k))) set[k] = 1;
}

/**
 * Opens a field (mm, positive inside, on a grid of `px`; `core` its cells more than half
 * PATTERN_MIN inside): grown back from the core, so nothing in it is thinner than PATTERN_MIN,
 * and pieces smaller than that across left out. Returns the smallest piece kept (mm across).
 */
function openField(F: Float32Array, core: Uint8Array, W: number, H: number, px: number) {
  const N = W * H, rho = PATTERN_MIN / 2;
  // grown back: what's left is the pattern without anything thinner than PATTERN_MIN
  const dCore = distanceTransform(core, W, H);
  for (let k = 0; k < N; k++) F[k] = Math.min(F[k], rho + px - dCore[k] * px);
  // pieces: each one's widest point (the field is a distance inside); the small ones go
  const label = new Int32Array(N).fill(-1), stack = new Int32Array(N);
  let minPiece = Infinity;
  for (let s = 0; s < N; s++) {
    if (F[s] <= 0 || label[s] >= 0) continue;
    let top = 0, peak = 0;
    const members: number[] = [];
    stack[top++] = s; label[s] = s;
    while (top) {
      const k = stack[--top], i = k % W;
      members.push(k); peak = Math.max(peak, F[k]);
      for (const d of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) {
        const q = k + d;
        if (q < 0 || q >= N || Math.abs((q % W) - i) > 1 || F[q] <= 0 || label[q] >= 0) continue;
        label[q] = s; stack[top++] = q;
      }
    }
    if (2 * peak < PATTERN_MIN - 0.03) for (const k of members) F[k] = -px;
    else minPiece = Math.min(minPiece, 2 * peak);
  }
  return minPiece;
}

/**
 * A pattern over a coin of radius R, behind `ink` (what sits on it) and `solid` (what sits on it
 * as a silhouette: the icon, its holes and what it walls in filled; see fillSolid): the pattern
 * where it is at least the halo away from them and PATTERN_EDGE inside the coin's edge, opened so
 * nothing in it is thinner than PATTERN_MIN, pieces smaller than that left out.
 */
function cutPattern(p: PatternSpec, R: number, ink: Ring[], solid: Ring[] = [], inner = R, edge = Infinity): PatternCut {
  const ill = isIllustration(p.id);
  const P = ill ? { sdf: () => 0, line: PATTERN_MIN, width: PATTERN_MIN, gap: PATTERN_MIN } : patternField(p), halo = Math.max(PATTERN_MIN, p.halo ?? PATTERN_HALO), px = PATTERN_GRID, rho = PATTERN_MIN / 2;
  const x0 = -R - 2 * px, W = Math.ceil((2 * R + 4 * px) / px) + 1, H = W, N = W * H;
  const inkSet = new Uint8Array(N);
  rasterise(ink, inkSet, W, H, x0, x0, px);
  if (solid.length) fillSolid(solid, inkSet, W, H, x0, px, halo);
  const dInk = distanceTransform(inkSet, W, H);
  // an illustration: its drawing at the size the frame leaves, as a signed distance on the grid
  let drawn: Float32Array | null = null;
  if (ill) {
    const shape = new Uint8Array(N), rest = new Uint8Array(N);
    rasterise(ringsOf(backDesign(p.id.slice(4), Math.min(inner, R - PATTERN_EDGE) + 0.7) ?? [], undefined, 24), shape, W, H, x0, x0, px);
    for (let k = 0; k < N; k++) rest[k] = shape[k] ? 0 : 1;
    const toShape = distanceTransform(shape, W, H), toRest = distanceTransform(rest, W, H);
    drawn = new Float32Array(N);
    for (let k = 0; k < N; k++) drawn[k] = shape[k] ? toRest[k] * px : -toShape[k] * px;
  }
  // its outer edge a perfect circle: inside the coin's edge, and the halo inside the frame's innermost point (`edge`)
  const F = new Float32Array(N), core = new Uint8Array(N), rOut = Math.min(R - PATTERN_EDGE, edge - halo);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i * px, y = x0 + j * px, k = j * W + i;
    const f = Math.min(drawn ? drawn[k] : P.sdf(x, y), dInk[k] * px - halo - px, rOut - Math.hypot(x, y));   // less a cell: the ink may reach that far past a cell centre
    F[k] = f;
    if (f > rho - px / 2) core[k] = 1;                 // eroded by half the least width
  }
  const minPiece = drawn ? PATTERN_MIN : openField(F, core, W, H, px);   // a drawing's lines print as drawn
  return { rings: traceField(F, W, H, x0, x0, px), line: P.line, width: P.width, gap: P.gap, halo, minPiece, ink: [...ink, ...solid] };
}

const patternCuts = new Map<string, PatternCut | null>();
const cached = (key: string, make: () => PatternCut | null) => {
  if (!patternCuts.has(key)) {
    patternCuts.set(key, make());
    if (patternCuts.size > 200) patternCuts.delete(patternCuts.keys().next().value!);
  }
  return patternCuts.get(key)!;
};

/** Shapes (with holes) as outlines in mm, y up. */
const ringsOf = (shapes: THREE.Shape[], m: (x: number, y: number) => Pt = (x, y) => [x, y], div = 8): Ring[] =>
  shapes.map((sh) => ({ outer: sh.getPoints(div).map((q) => m(q.x, q.y)), holes: sh.holes.map((hp) => hp.getPoints(div).map((q) => m(q.x, q.y))) }));

/** What the front draws over its pattern: the name (each, if twice) and the frame, and the icon as a silhouette (mm). */
function frontInk(lib: Library, role: Role, spec: TokenSpec, text: string): { ink: Ring[]; solid: Ring[] } {
  // (the frame isn't here: a pattern stops at a circle inside it, its halo clear of the frame's innermost point; see frontPattern)
  if (spec.style === "text") {
    const TL = textLayout(lib, text, spec), ink: Ring[] = [];
    for (const line of TL.lines) { const shapes = textShapes(lib, line.text, TL.em), box = boundsOf(shapes), dx = -(box.min.x + box.max.x) / 2; ink.push(...ringsOf(shapes, (x, y) => [x + dx, y + line.y], 6)); }
    return { ink, solid: [] };
  }
  const shapes = iconShapes(lib, role, spec), ink: Ring[] = [];
  const solid = fitsIcon(spec)
    ? ((f) => ringsOf(shapes, (x, y) => [(x - f.cx) * f.k, -(y - f.cy) * f.k + f.dy], 4))(fittedIcon(lib, role, spec, text))
    : ((k, off) => ringsOf(shapes, (x, y) => [k * (x - TRACE_VIEW / 2), -k * (y - TRACE_VIEW / 2) + off], 4))((spec.diameter * spec.iconScale) / TRACE_VIEW, spec.iconOffsetY || 0);
  const L = arcName(lib, text, spec);
  if (L) for (const turn of nameTurns(spec)) L.chars.forEach((ch, i) => {
    if (ch === " ") return;
    const g = glyph(lib, ch), a = (L.angles[i] * Math.PI) / 180, c = Math.cos(a + Math.PI / 2), s = Math.sin(a + Math.PI / 2), ct = Math.cos(turn), st = Math.sin(turn);
    ink.push(...ringsOf(g.shapes, (gx, gy) => {
      const x = (gx - g.center) * L.em, y = gy * L.em, px = L.radius * Math.cos(a) + x * c - y * s, py = L.radius * Math.sin(a) + x * s + y * c;
      return [px * ct - py * st, px * st + py * ct];
    }, 6));
  });
  return { ink, solid };
}

/**
 * What a back design draws over the back's pattern (mm, as seen with the coin turned over), each
 * shape's holes filled but for a ring's (a hole most of its outline: the pattern runs inside a
 * medallion's ring, not inside a letter or a moon).
 */
function backInk(lib: Library, role: Role, spec: TokenSpec): Ring[] {
  const shapes = spec.back === "edition" ? editionBack(lib, role, spec) : backDesign(spec.back, spec.diameter / 2);
  return ringsOf(shapes ?? [], undefined, 24).map((r) => {
    const a = Math.abs(polyArea(r.outer));
    return { outer: r.outer, holes: r.holes.filter((h) => Math.abs(polyArea(h)) > 0.6 * a) };
  });
}

/** The front's pattern, behind the icon, the name and the frame; null for none (or the window layout). */
function frontPattern(lib: Library, role: Role, spec: TokenSpec, text: string): PatternCut | null {
  const p = spec.frontPattern;
  if (!p || !PATTERN_IDS.has(p.id) || spec.style === "window" || !SHAPE_FEATURES[shapeOf(role)].pattern) return null;
  const key = ["front", JSON.stringify({ ...p, colour: null }), iconOf(role, spec).key, text, spec.style, spec.diameter, spec.textSize, spec.spacing, spec.margin, spec.maxArc,
    spec.frame, spec.frameWidth, frameInsetOf(spec), spec.iconScale, spec.iconOffsetY, JSON.stringify(spec.autoText ?? null), faceRadius(spec)].join("|");
  // an illustration fills what the frame leaves, a little clear of it
  const fd = frameDesign(spec), inner = fd ? fd.inner - 0.8 : faceRadius(spec);
  return cached(key, () => { const { ink, solid } = frontInk(lib, role, spec, text); return cutPattern(p, faceRadius(spec), ink, solid, inner, fd ? fd.inner : Infinity); });
}

/** The back's pattern, behind its design; null for none (or a back that is a face: backFaceOf draws it there, like a front's). */
function backPattern(lib: Library, role: Role, spec: TokenSpec): PatternCut | null {
  const p = spec.backPattern;
  if (!p || !PATTERN_IDS.has(p.id) || spec.back === FACE_BACK || spec.back === "custom" || spec.back === "seal" || !SHAPE_FEATURES[shapeOf(role)].pattern) return null;
  const ed = backEdition(role, spec)?.name.en ?? "";
  const key = ["back", JSON.stringify(p), spec.back, spec.back === "custom" ? spec.customSvg : "", ed, spec.lang, spec.diameter, faceRadius(spec)].join("|");
  return cached(key, () => cutPattern(p, faceRadius(spec), backInk(lib, role, spec)));
}

/** The front part the pattern joins: the frame's or the name's, whichever has its colour (the frame's if neither). */
function patternPart(role: Role, spec: TokenSpec): "frame" | "front" {
  const c = spec.frontPattern?.colour ?? "frame";
  if (c === "frame" || c === "front") return c;
  const pc = partColours(role, spec), want = c === "team" ? role.colour ?? TEAMS[role.team].colour : c;
  return pc.frame === want ? "frame" : pc.front === want ? "front" : "frame";
}

const v2 = (q: Poly) => q.map(([x, y]) => new THREE.Vector2(x, y));
const cutShapeCache = new WeakMap<PatternCut, THREE.Shape[]>();
const cutShapes = (cut: PatternCut) => {
  let out = cutShapeCache.get(cut);
  if (!out) cutShapeCache.set(cut, (out = cut.rings.map((r) => { const sh = new THREE.Shape(v2(r.outer)); sh.holes = r.holes.map((h) => new THREE.Path(v2(h))); return sh; })));
  return out;
};
/** SVG path data for a pattern (fill-rule evenodd), flipped to SVG's y-down. */
const cutPath = (cut: PatternCut) => cut.rings.flatMap((r) => [r.outer, ...r.holes]).map((q) => q.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(3)} ${(-y).toFixed(3)}`).join("") + "Z").join("");

// ---------------------------------------------------------------- bevelled relief
//
// A raised part with a bevel (spec.reliefBevel, mm) has sloped walls, like a struck coin's: above
// the face it is a stack of thin layers, each its outline grown inward a little more, up to the
// bevel at the top. Gaps inside it keep their width at the face and open upward. No layer
// overhangs the one under it, so it prints face-up without supports. A stroke never narrows past
// BEVEL_MIN_TOP: where the part is narrower than twice the bevel plus that, its top keeps that
// width (the bevel there is less), and what is narrower than that already keeps its straight walls.

/** The least width (mm) a bevel leaves on top of a raised stroke. */
export const BEVEL_MIN_TOP = 0.4;
/** The bevel's layers (mm), a print layer each (the relief starts on one: the coin is whole
 *  layers); the grid its outlines are worked out on, and how far they may stray from it once
 *  simplified (a tenth of a nozzle: the frame's milling alone is thousands of corners a layer). */
const BEVEL_STEP = 0.2, BEVEL_GRID = 0.05, BEVEL_TOL = 0.04;
/** How far a raised part's top is inset (mm): 0 for straight walls (unset), on a face that is raised. */
// frames of fine repeated detail (milling, beads, rope, stars…) would only get a hair of bevel for
// a model many times heavier: only plain line frames are bevelled
const BEVEL_FRAMES = new Set(["rim", "double", "line", "corners"]);
const bevelOf = (spec: TokenSpec, part: ReliefPart, face: Face) =>
  face.flush || !reliefOf(spec)[part] || !reliefTop(spec) || (part === "frame" && !BEVEL_FRAMES.has(String(spec.frame))) ? 0 : Math.max(0, spec.reliefBevel || 0);
/** The volume of a bevelled part out of its face (mm³); a straight one's is its share of the prism. */
const aboveOf = new WeakMap<THREE.BufferGeometry, number>();

/**
 * A face part's inlay: `shapes` placed by `m` (a similarity: scale, turn, mirror) and extruded
 * through its face; when raised with a bevel, its relief in layers (bevelLayers).
 */
function partExtrude(shapes: THREE.Shape[], spec: TokenSpec, part: ReliefPart, face: Face, m: THREE.Matrix4, curveSegments = 5) {
  const h = faceHeight(spec, part, face), b = bevelOf(spec, part, face), e = m.elements, k = Math.sqrt(Math.abs(e[0] * e[5] - e[4] * e[1])) || 1;
  // each curve cut by its printed length, not a set count: a large one stays round
  shapes = smoothShapes(shapes, k, curveSegments); curveSegments = 1;
  if (!b || !shapes.length) return extrude(shapes, h, m, curveSegments);
  const r = reliefTop(spec), d = h - r;
  const n = Math.max(1, Math.round(r / BEVEL_STEP)), step = r / n;
  const layers = bevelLayers(shapes, b / k, BEVEL_MIN_TOP / k, BEVEL_GRID / k, n, curveSegments);
  // the relief is local z [d, h] on the top face, [0, r] on the bottom one (its outside at 0)
  const up = layers.map((l) => extrude(l.shapes, (l.to - l.from) * step, chain(m, T(0, 0, face.bottom ? r - l.to * step : d + l.from * step)), curveSegments));
  const g = merge([extrude(shapes, d, face.bottom ? chain(m, T(0, 0, r)) : m, curveSegments), ...up]);
  if (g) aboveOf.set(g, up.reduce((s, l) => s + geometryVolume(l), 0));
  return g;
}

/** The longest straight piece a curve is cut into, printed (mm): finer than the nozzle draws. */
const CURVE_STEP = 0.35;
const smoothCache = new WeakMap<THREE.Shape[], Map<string, THREE.Shape[]>>();
/**
 * Shapes with their curves cut into straight pieces by their printed size (`k` mm per unit): at
 * least `least` a curve, one every CURVE_STEP mm, at most 96; lines stay one piece.
 */
function smoothShapes(shapes: THREE.Shape[], k: number, least: number): THREE.Shape[] {
  const key = `${k.toFixed(4)}|${least}`, memo = smoothCache.get(shapes) ?? new Map<string, THREE.Shape[]>();
  smoothCache.set(shapes, memo);
  const hit = memo.get(key); if (hit) return hit;
  const outline = (p: THREE.Path) => {
    const pts: THREE.Vector2[] = [];
    for (const c of p.curves) {
      const n = (c as THREE.LineCurve).isLineCurve ? 1 : Math.min(96, Math.max(least, Math.ceil((c.getLength() * k) / CURVE_STEP)));
      for (const q of c.getPoints(n)) if (!pts.length || !pts[pts.length - 1].equals(q)) pts.push(q);
    }
    if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-9) pts.pop();
    return pts;
  };
  const out = shapes.map((s) => { const o = new THREE.Shape(outline(s)); o.holes = s.holes.map((hole) => new THREE.Path(outline(hole))); return o; });
  memo.set(key, out);
  return out;
}

/** One block of a bevelled part's relief: its outline, from layer `from` up to (not with) `to`. */
interface BevelLayer { shapes: THREE.Shape[]; from: number; to: number }
const bevelCache = new WeakMap<THREE.Shape[], Map<string, BevelLayer[]>>();
/**
 * The outlines of a bevelled part's `n` layers (in its shapes' units: `b` the bevel, `minTop`
 * the least top width, `px` the grid), each grown inward by its share of the bevel, i.e. where
 * the signed distance to the part's edge is at least that inset, but never more than the part's
 * local half-width less half of minTop: its half-width there being the largest disc inside the
 * part that covers the point (worked out up to what can matter, the bevel plus half of minTop).
 */
function bevelLayers(shapes: THREE.Shape[], b: number, minTop: number, px: number, n: number, div: number): BevelLayer[] {
  const key = [b, minTop, px, n, div].map((v) => v.toPrecision(6)).join("|");
  let per = bevelCache.get(shapes);
  if (!per) bevelCache.set(shapes, (per = new Map()));
  if (per.has(key)) return per.get(key)!;
  const rings = ringsOf(shapes, undefined, div);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) { const [a, c, e, f] = boxOf(r.outer); x0 = Math.min(x0, a); y0 = Math.min(y0, c); x1 = Math.max(x1, e); y1 = Math.max(y1, f); }
  x0 -= 3 * px; y0 -= 3 * px;
  const W = Math.ceil((x1 + 3 * px - x0) / px) + 1, H = Math.ceil((y1 + 3 * px - y0) / px) + 1, N = W * H;
  const set = new Uint8Array(N), out = new Uint8Array(N);
  rasterise(rings, set, W, H, x0, y0, px);
  for (let q = 0; q < N; q++) out[q] = set[q] ? 0 : 1;
  // signed distance to the edge (units): inside positive, the edge half a cell off a cell centre
  const dIn = distanceTransform(out, W, H), dOut = distanceTransform(set, W, H), sd = new Float32Array(N);
  for (let q = 0; q < N; q++) sd[q] = set[q] ? (dIn[q] - 0.5) * px : -(dOut[q] - 0.5) * px;
  // local half-width, capped at rho: rho where a disc that wide fits (the part opened by rho)...
  const rho = b + minTop / 2, hw = new Float32Array(N), core = new Uint8Array(N);
  for (let q = 0; q < N; q++) if (sd[q] >= rho) core[q] = 1;
  const dCore = distanceTransform(core, W, H);
  for (let q = 0; q < N; q++) if (set[q] && dCore[q] * px <= rho + px / 2) hw[q] = rho;
  // ...elsewhere the largest disc of a cell's own (one inside a neighbour's adds nothing)
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const q = j * W + i, rq = sd[q];
    if (rq <= 0 || rq >= rho) continue;
    if (sd[q - 1] >= rq + px || sd[q + 1] >= rq + px || sd[q - W] >= rq + px || sd[q + W] >= rq + px
      || sd[q - W - 1] >= rq + px * Math.SQRT2 || sd[q - W + 1] >= rq + px * Math.SQRT2 || sd[q + W - 1] >= rq + px * Math.SQRT2 || sd[q + W + 1] >= rq + px * Math.SQRT2) continue;
    const c = rq / px + 0.5, ci = Math.ceil(c), c2 = c * c;
    for (let dj = -ci; dj <= ci; dj++) {
      const jj = j + dj; if (jj < 0 || jj >= H) continue;
      for (let di = -ci; di <= ci; di++) {
        const ii = i + di; if (ii < 0 || ii >= W || di * di + dj * dj > c2) continue;
        const p = jj * W + ii; if (hw[p] < rq) hw[p] = rq;
      }
    }
  }
  const cap = new Float32Array(N);
  for (let q = 0; q < N; q++) cap[q] = Math.max(0, Math.min(b, hw[q] - minTop / 2));
  // Each piece stops changing at the layer that reaches its largest inset: from there up it is
  // one block (a thin piece, one block from the face up), not a pile of the same outline.
  const comp = new Int32Array(N).fill(-1), last: number[] = [], stack = new Int32Array(N);
  for (let q0 = 0; q0 < N; q0++) {
    if (!set[q0] || comp[q0] >= 0) continue;
    const c = last.length;
    let top = 0, most = 0;
    comp[q0] = c; stack[top++] = q0;
    while (top) {
      const q = stack[--top], i = q % W;
      if (cap[q] > most) most = cap[q];
      for (const dq of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) {
        const o = q + dq;
        if (o < 0 || o >= N || Math.abs((o % W) - i) > 1 || !set[o] || comp[o] >= 0) continue;
        comp[o] = c; stack[top++] = o;
      }
    }
    last.push(Math.min(n - 1, Math.max(0, Math.ceil((most * n) / b - 1e-6) - 1)));
  }
  // outlines anticlockwise, holes clockwise: ExtrudeGeometry only puts the holes right with that
  const turn = (q: Poly, ccw: boolean) => (polyArea(q) > 0 === ccw ? q : [...q].reverse());
  const F = new Float32Array(N), layers: BevelLayer[] = [];
  for (let i = 0; i < n; i++) {
    const s = (b * (i + 1)) / n;
    // the pieces still sloping past this layer (one layer tall), and those whose top it is (to the top)
    for (const top of [false, true]) {
      if (!last.some((e) => (top ? e === i : e > i))) continue;
      for (let q = 0; q < N; q++) {
        const c = comp[q];
        F[q] = c < 0 ? sd[q] : (top ? last[c] === i : last[c] > i) ? sd[q] - Math.min(s, cap[q]) : -px;
      }
      const shapes = traceField(F, W, H, x0, y0, px, (px * BEVEL_TOL) / BEVEL_GRID).map((r) => { const sh = new THREE.Shape(v2(turn(r.outer, true))); sh.holes = r.holes.map((h) => new THREE.Path(v2(turn(h, false)))); return sh; });
      if (shapes.length) layers.push({ shapes, from: i, to: top ? n : i + 1 });
    }
  }
  per.set(key, layers);
  return layers;
}

/**
 * What a token's pattern on one side came out as, measured on its outlines: how many pieces, the
 * line's width (the cells' across), the gap between lines (cells), the halo, the smallest piece
 * kept (mm across) and the least room (mm) between the pattern and what sits on it. Null with none.
 */
export function patternReport(lib: Library, role: Role, input: SpecInput | undefined, side: "front" | "back" = "front") {
  if (shapeOf(role) !== "coin") return null;
  const spec = windowFrame(shapeSpec(role, input)), text = roleName(role, spec.lang);
  const bf = side === "back" ? backFaceOf(role, spec, text) : null;   // a back that is a face has its pattern as a front's
  const cut = side === "front" ? frontPattern(lib, role, spec, text) : bf ? frontPattern(lib, bf.role, bf.spec, bf.text) : backPattern(lib, role, spec);
  if (!cut) return null;
  const boxes = cut.rings.map((r) => boxOf(r.outer));
  let clear = Infinity;
  for (const ir of cut.ink) for (const q of [ir.outer, ...ir.holes]) for (const [x, y] of q) cut.rings.forEach((r, i) => {
    const b = boxes[i];
    if (x < b[0] - clear || x > b[2] + clear || y < b[1] - clear || y > b[3] + clear) return;
    if (inPoly(x, y, r.outer) && !r.holes.some((h) => inPoly(x, y, h))) { clear = 0; return; }
    for (const e of [r.outer, ...r.holes]) clear = Math.min(clear, edgeDist(x, y, e));
  });
  return { pieces: cut.rings.length, line: cut.line, width: cut.width, gap: cut.gap, halo: cut.halo, minPiece: cut.minPiece,
    clear: Number.isFinite(clear) ? clear : null, part: (side === "front" ? patternPart(role, spec) : "back") as PartName };
}

function buildBase(spec: TokenSpec) {
  // a reeded edge: the toothed outline straight up the coin's height
  const outline = coinOutline(spec);
  if (outline) return extrude([new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))], spec.height, T(0, 0, 0), 1)!;
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
export function fittingDepth(spec: TokenSpec) {
  const faces = spec.back && spec.back !== "none" ? 2 : 1;
  const max = Math.max(0.2, Math.floor(((spec.height - MIN_CORE) / faces) * 5) / 5);   // whole 0.2 mm layers
  return { depth: Math.min(spec.depth, max), clamped: spec.depth > max, max };
}

/** Magnet sizes (diameter x thickness, mm) commonly sold for crafts. */
export const MAGNET_SIZES = ["5x2", "6x2", "6x3", "8x1", "8x2", "10x1", "10x2", "10x3"];
const LAYER = 0.2, SHELL = 0.6;                  // print layer; plastic kept around the magnet
const upLayer = (v: number) => Math.ceil(v / LAYER - 1e-6) * LAYER;
const mm2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Where the magnet goes, in the centre of the coin.
 *  "pocket": an open hole in the back; the magnet is glued in after printing.
 *  "hidden": a sealed cavity inside the coin; the print pauses so the magnet can go in.
 * Heights snap to the 0.2 mm layers so the pause lands on a layer boundary.
 * Returns null without a magnet; otherwise the hole (model z, back face at z = 0),
 * the minimum coin height and, for "hidden", the print height to pause at
 * (Bambu pauses before printing the layer that ends at that height).
 */
export function magnetLayout(spec: TokenSpec): MagnetLayout | null {
  if (!spec.magnet || spec.magnet === "none") return null;
  const [md, mt] = String(spec.magnetSize || "6x2").split("x").map(Number);
  const faceUp = printsFaceUp(spec);
  const front = spec.depth;                      // the face's inlays (any relief stands above the coin)
  const back = spec.back && spec.back !== "none" ? spec.depth : 0;
  const hole = upLayer(mt + 0.2);                // 0.2 mm headroom so the nozzle never touches it
  const radius = (md + 0.3) / 2;                 // 0.3 mm play so it drops in
  // Plastic needed between the hole and each face. The colour inlays are solid
  // plastic too, so they count towards it.
  const faceSide = upLayer(Math.max(front, SHELL));
  const backSide = upLayer(Math.max(back, SHELL));
  if (spec.magnet === "pocket") {
    return { kind: "pocket", md, mt, radius, faceUp, z0: 0, z1: hole, minHeight: mm2(hole + faceSide) };
  }
  // Print coordinates: z' up from the bed. Face-down prints have the front on the bed.
  const lo = faceUp ? backSide : faceSide;       // floor under the cavity
  const roof = faceUp ? faceSide : backSide;     // roof over it
  const minHeight = mm2(lo + hole + roof);
  const H = Math.max(spec.height, minHeight);
  const hi = mm2(H - roof - hole);               // highest start that keeps the roof
  // Keep the magnet as close to the back as possible: that's the side that rests
  // on the metal. Face-down prints have the back on top; face-up ones on the bed.
  const c0 = faceUp ? lo : hi;
  const c1 = mm2(c0 + hole);
  return {
    kind: "hidden", md, mt, radius, faceUp, minHeight, pauseZ: mm2(c1 + LAYER),
    z0: faceUp ? c0 : mm2(H - c1), z1: faceUp ? c1 : mm2(H - c0),
  };
}

/** The magnet hole as a solid, cut out of the coin by the slicer (a negative part). */
function magnetCut(m: MagnetLayout) {
  const extra = m.kind === "pocket" ? 0.3 : 0;   // poke through the back face
  const g = new THREE.CylinderGeometry(m.radius, m.radius, m.z1 - m.z0 + extra, 64);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (m.z0 - extra + m.z1) / 2);
  return g;
}

/** A closed mesh's volume (mm³), from its triangles. */
export function geometryVolume(geom: THREE.BufferGeometry | null | undefined) {
  if (!geom?.attributes?.position) return 0;
  const pos = geom.attributes.position, idx = geom.index?.array, n = idx ? idx.length : pos.count;
  let v = 0;
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a), bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b), cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v) / 6;
}

/** Below this letter height (mm) a name may not print cleanly with a 0.4 mm nozzle. */
export const SMALL_LETTERS_MM = 2.5;

/** How tall the name's letters come out (mm), without building any geometry. */
export function nameLetterHeight(lib: Library, input: SpecInput, text: string, role: Role | null = null): number {
  if (isCard(role)) return cardFaceOf(lib, role!, cardContent(role, cardSpec(input)), "front", text)!.L.cap;
  if (isRing(role)) return ringLayout(lib, text, ringSpec(input)).letterHeight;
  if (isBase(role)) return role?.content === "none" ? Infinity : baseLayout(lib, text, baseSpec(input)).cap;
  const spec = windowFrame({ ...DEFAULT_SPEC, ...input, colours: { ...DEFAULT_SPEC.colours, ...input?.colours } });
  const front = spec.style === "window" ? windowLayout(lib, text, spec).cap
    : spec.style === "text" ? textLayout(lib, text, spec).cap || Infinity
    : arcName(lib, text, spec)?.letterHeight ?? Infinity;   // "solo" has no name to be too small
  // a two-state token's smaller name, of its two
  const other = flipFace(role, spec);
  return other ? Math.min(front, nameLetterHeight(lib, input, roleName(other, spec.lang))) : front;
}

// ---------------------------------------------------------------- info cards

/**
 * Cards (the grimoire's info tokens, "This is the Demon"…, and a collection's types of shape
 * "card") are rounded cards, not coins: a body in the card colour, the phrase, the icon and the
 * frame as flush inlays, printed face-down like the classic coins. Roles with kind "info" are drawn
 * this way. A face is the phrase alone, or with the token's icon beside it or alone (cardIcon,
 * cardJoin, cardIconSize: one layout makes them all, cardLayout); its back, when the design has one,
 * a face of its own laid out the same way (cardBack), the same on every card of the design.
 */
export const CARD = { w: 85, h: 55, r: 4 };
const CARD_PAD = 7, CARD_MAX_CAP = 8, CARD_PITCH = 1.6, CARD_FRAME_INSET = 1.2;
/** The room between a card's icon and its phrase (mm), and the width of the line between them ("column"). */
const CARD_GAP = 3, CARD_RULE = 0.6;
export const isCard = (role: Role | null | undefined) => role?.kind === "info";
/** Where a card's icon goes, and how it sits with the phrase (see CardIcon, CardJoin). */
export const CARD_ICONS: CardIcon[] = ["none", "left", "right", "only"];
export const CARD_JOINS: CardJoin[] = ["spread", "column", "together"];
/** A card icon's size (mm): from what still reads to nearly the card's height inside its padding. */
export const CARD_ICON_MM = { min: 12, max: 40 };
const oneOf = <V extends string>(v: unknown, list: readonly V[], or: V): V => (list.includes(v as V) ? (v as V) : or);
const iconMm = (v: unknown, or: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(CARD_ICON_MM.max, Math.max(CARD_ICON_MM.min, v)) : or);
const isColourRef = (v: unknown): v is ColourRef => typeof v === "string" && (v === "team" || /^#[0-9a-f]{6}$/i.test(v));

/** A card's spec: the set's colours, frame, height and depth, its icon's place and its back; no style, coin back or magnet. */
export function cardSpec(spec: SpecInput | undefined): TokenSpec {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec?.colours } };
  // `diameter` is the card's long side, so the 3D view frames it like a coin that size. Its back is
  // cardBack: a coin's back design (an older card's, say) doesn't reach it.
  return {
    ...s, style: "classic", relief: DEFAULT_SPEC.relief, back: "none", backMode: "design", magnet: "none", diameter: CARD.w, depth: Math.min(s.depth, s.height - 0.4),
    cardIcon: oneOf(s.cardIcon, CARD_ICONS, "none"), cardIconSize: iconMm(s.cardIconSize, DEFAULT_SPEC.cardIconSize), cardJoin: oneOf(s.cardJoin, CARD_JOINS, "spread"),
    cardBack: s.cardBack?.on === true ? cardBackOf(s) : null,
  };
}

/**
 * A card's back with everything filled in, whatever was kept (an older or hand-written spec): its
 * phrase, icon and their layout (the icon alone in the middle unless said), the face's frame, and
 * colours of its own; a face in the group's colour starts in gold, so the backs of a deck match.
 */
export function cardBackOf(spec: SpecInput): CardBack & Required<Pick<CardBack, "text" | "cardIcon" | "cardIconSize" | "cardJoin" | "frame" | "frameWidth">> & { icon: TokenIcon | null; colours: { text: ColourRef; frame: ColourRef } } {
  const b: Partial<CardBack> = spec.cardBack && typeof spec.cardBack === "object" ? spec.cardBack : {};
  const c = { ...DEFAULT_SPEC.colours, ...spec.colours }, start = (v: ColourRef) => (v === "team" ? FILAMENTS.gold : v);
  const icon = b.icon && typeof b.icon === "object" && typeof b.icon.body === "string" && typeof b.icon.id === "string" ? b.icon : null;
  return {
    on: b.on === true,
    text: typeof b.text === "string" ? b.text : "",
    ...(b.name === "collection" ? { name: "collection" as const } : {}),
    icon,
    cardIcon: oneOf(b.cardIcon, CARD_ICONS, "only"),
    cardIconSize: iconMm(b.cardIconSize, DEFAULT_SPEC.cardIconSize),
    cardJoin: oneOf(b.cardJoin, CARD_JOINS, "spread"),
    frame: typeof b.frame === "string" ? b.frame : spec.frame ?? DEFAULT_SPEC.frame,
    frameWidth: typeof b.frameWidth === "number" && Number.isFinite(b.frameWidth) ? b.frameWidth : spec.frameWidth ?? DEFAULT_SPEC.frameWidth,
    colours: { text: isColourRef(b.colours?.text) ? b.colours.text : start(c.front), frame: isColourRef(b.colours?.frame) ? b.colours.frame : start(c.frame) },
  };
}
/** Whether a token's design prints anything on its back: a card's back of its own, or a coin's back design. */
export const printsBack = (role: Role | null | undefined, spec: SpecInput) =>
  (isCard(role) ? spec.cardBack?.on === true : (spec.back ?? DEFAULT_SPEC.back) !== "none");

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** The phrase in up to 3 balanced lines, at the biggest letters that fit a box w × h (mm); each line's width as it comes out. */
function fitPhrase(lib: Library, words: string[], W: number, H: number) {
  const width = (line: string) => { const b = boundsOf(lib.font.generateShapes(line, 1)); return b.max.x - b.min.x; };
  let best: { em: number; lines: string[]; widths: number[] } | null = null;
  // every way to cut the words into 1–3 lines
  const splits = (n: number, k: number): number[][] => (k === 1 ? [[n]] : Array.from({ length: n - k + 1 }, (_, i) => i + 1).flatMap((a) => splits(n - a, k - 1).map((r) => [a, ...r])));
  for (let k = 1; k <= Math.min(3, words.length || 1); k++) {
    for (const sizes of splits(Math.max(1, words.length), k)) {
      let at = 0;
      const lines = sizes.map((n) => { const l = words.slice(at, at + n).join(" "); at += n; return l; }), widths = lines.map(width);
      const em = Math.min(W / Math.max(...widths, 1e-6), (CARD_MAX_CAP / lib.capHeight),
        H / (lib.capHeight * (1 + (k - 1) * CARD_PITCH)));
      if (!best || em > best.em + 1e-6) best = { em, lines, widths };
    }
  }
  return { ...best!, widths: best!.widths.map((w) => w * best!.em) };
}
/** A card face as laid out (mm, the card's centre at 0, y up): the phrase's lines (each its ink's centre `x` and
 *  baseline `y`), the icon's square (none without one) and the line between them ("column"). */
export interface CardLayout {
  em: number;
  /** The phrase's capital height: Infinity with no phrase (the icon alone). */
  cap: number;
  lines: { text: string; x: number; y: number }[];
  icon: { x: number; y: number; size: number } | null;
  rule: { x: number; h: number } | null;
}
/**
 * A card face's layout, inside the padding that keeps it clear of any frame. Without an icon (or
 * with cardIcon "none") the phrase in up to 3 balanced lines, as large as fits; with one, the icon
 * a square of cardIconSize at the side asked, the phrase fitted to the room it leaves: centred in it
 * ("spread"), aligned towards a thin line beside the icon ("column"), or, with the icon about its
 * height (cardIconSize at most), one block with it in the middle ("together"); "only", the icon alone.
 */
export function cardLayout(lib: Library, text: string | null | undefined, spec: Pick<TokenSpec, "cardIcon" | "cardIconSize" | "cardJoin">, hasIcon = false): CardLayout {
  const words = (text || "").toUpperCase().trim().split(/\s+/).filter(Boolean);
  const W = CARD.w - 2 * CARD_PAD, H = CARD.h - 2 * CARD_PAD, edge = W / 2;
  const at = hasIcon ? oneOf(spec.cardIcon, CARD_ICONS, "none") : "none", size = Math.min(iconMm(spec.cardIconSize, DEFAULT_SPEC.cardIconSize), H);
  if (at === "only") return { em: 0, cap: Infinity, lines: [], icon: { x: 0, y: 0, size }, rule: null };
  // the fitted phrase in the box from x0 to x1: centred, or against its left (-1) or right (1) side
  const set = (f: ReturnType<typeof fitPhrase>, x0: number, x1: number, align: number) => {
    const cap = f.em * lib.capHeight, pitch = cap * CARD_PITCH, total = cap + (f.lines.length - 1) * pitch;
    return { em: f.em, cap, lines: f.lines.map((l, i) => ({ text: l, y: total / 2 - cap - i * pitch, x: align < 0 ? x0 + f.widths[i] / 2 : align > 0 ? x1 - f.widths[i] / 2 : (x0 + x1) / 2 })) };
  };
  if (at === "none") return { ...set(fitPhrase(lib, words, W, H), -edge, edge, 0), icon: null, rule: null };
  const sx = at === "left" ? -1 : 1, join = oneOf(spec.cardJoin, CARD_JOINS, "spread");
  if (join === "together") {
    // the icon as tall as the phrase comes out beside the smallest icon (within its sizes), then the
    // phrase fitted beside that icon, and the two centred as one block
    const first = fitPhrase(lib, words, W - CARD_ICON_MM.min - CARD_GAP, H);
    const tall = first.em * lib.capHeight * (1 + (first.lines.length - 1) * CARD_PITCH);
    const s = Math.min(size, Math.max(CARD_ICON_MM.min, tall)), f = fitPhrase(lib, words, W - s - CARD_GAP, H), tw = Math.max(...f.widths, 0);
    const x0 = -(s + CARD_GAP + tw) / 2;
    return sx < 0
      ? { ...set(f, x0 + s + CARD_GAP, x0 + s + CARD_GAP + tw, -1), icon: { x: x0 + s / 2, y: 0, size: s }, rule: null }
      : { ...set(f, x0, x0 + tw, 1), icon: { x: x0 + tw + CARD_GAP + s / 2, y: 0, size: s }, rule: null };
  }
  const icon = { x: sx * (edge - size / 2), y: 0, size };
  if (join === "column") {
    // the line a gap past the icon, the phrase a gap past the line, aligned towards it
    const room = size + 2 * CARD_GAP + CARD_RULE, f = fitPhrase(lib, words, W - room, H);
    const rule = { x: sx * (edge - size - CARD_GAP - CARD_RULE / 2), h: H - 4 };
    return { ...(sx < 0 ? set(f, -edge + room, edge, -1) : set(f, -edge, edge - room, 1)), icon, rule };
  }
  const room = size + CARD_GAP, f = fitPhrase(lib, words, W - room, H);
  return { ...(sx < 0 ? set(f, -edge + room, edge, 0) : set(f, -edge, edge - room, 0)), icon, rule: null };
}

/** How far each arm of a corner bracket ("corners") runs along the card's edge (mm). */
const CARD_CORNER_ARM = 11;
/** A card's frame width, as it prints. */
const cardFrameWidth = (spec: CardFrame) => Math.min(Math.max(spec.frameWidth, 0.4), 2);
/**
 * A card's frame as filled shapes: a line inside the edge ("rim", or any design: a card's frame is a
 * line), or "corners", only its corners: an L along each corner of that line, the frame's width,
 * with a dot inside it, like old playing cards; or "laurel", the line with a sprig of laurel inside
 * each corner, following it. None for "none".
 */
function cardFrameShapes(spec: CardFrame): THREE.Shape[] | null {
  if (spec.frame === "none") return null;
  const fw = cardFrameWidth(spec), i = CARD_FRAME_INSET;
  if (spec.frame === "corners") return cardCorners(fw);
  const outer = roundedRect(CARD.w - 2 * i, CARD.h - 2 * i, CARD.r - i);
  outer.holes.push(roundedRect(CARD.w - 2 * (i + fw), CARD.h - 2 * (i + fw), Math.max(0.5, CARD.r - i - fw)));
  return spec.frame === "laurel" ? [outer, ...cardLaurels()] : [outer];
}
/**
 * Four laurel sprigs, one inside each corner of the card's line: a stem 12 mm along the long side,
 * round the corner and 10 mm down the short one, leaves in pairs (the coin laurel's, 3 × 1.35 mm,
 * smaller towards the tip) and a leaf at its end; clear of the text (CARD_PAD).
 */
function cardLaurels(): THREE.Shape[] {
  const X = CARD.w / 2 - CARD_FRAME_INSET - 3.4, Y = CARD.h / 2 - CARD_FRAME_INSET - 3.4, r = 3, out: THREE.Shape[] = [];
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    // the stem's path, from along the long side, round the corner, down the short one
    const pts: [number, number][] = [[sx * (X - 12), sy * Y], [sx * (X - r), sy * Y]];
    const a0 = sy > 0 ? Math.PI / 2 : -Math.PI / 2, a1 = sx > 0 ? 0 : sy > 0 ? Math.PI : -Math.PI;
    for (let k = 1; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; pts.push([sx * (X - r) + r * Math.cos(a), sy * (Y - r) + r * Math.sin(a)]); }
    pts.push([sx * X, sy * (Y - 10)]);
    out.push(...sprig(pts));
  }
  return out.map(ccw);   // one winding, so leaves and stem merge (2D and 3D)
}
/** A sprig along a polyline: its stem (0.5 mm) and a pair of leaves every 2.2 mm, then its end leaf. */
function sprig(pts: [number, number][]): THREE.Shape[] {
  const out: THREE.Shape[] = [], step = 2.2, half = 0.25;
  // the stem, a band along the path
  const norm = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = Math.atan2(b[1] - a[1], b[0] - a[0]); return [-Math.sin(d), Math.cos(d)]; });
  out.push(polygon([...pts.map((p, i) => new THREE.Vector2(p[0] + norm[i][0] * half, p[1] + norm[i][1] * half)), ...pts.map((p, i) => new THREE.Vector2(p[0] - norm[i][0] * half, p[1] - norm[i][1] * half)).reverse()]));
  // leaf pairs along it
  const at: [number, number, number][] = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0), dir = Math.atan2(y1 - y0, x1 - x0);
    for (let d = carry; d < L; d += step) at.push([x0 + ((x1 - x0) * d) / L, y0 + ((y1 - y0) * d) / L, dir]);
    carry = (((carry - L) % step) + step) % step;
  }
  at.slice(1).forEach(([x, y, dir], i, all) => {
    const k = 1 - 0.3 * (i / Math.max(1, all.length - 1));
    out.push(leaf(x, y, dir - 0.62, 3 * k, 1.35 * k), leaf(x, y, dir + 0.62, 3 * k, 1.35 * k));
  });
  const [tx, ty] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
  out.push(leaf(tx, ty, Math.atan2(ty - py, tx - px), 2.4, 1.1));
  return out;
}
function cardCorners(fw: number): THREE.Shape[] {
  const i = CARD_FRAME_INSET, X = CARD.w / 2 - i, Y = CARD.h / 2 - i, ro = CARD.r - i, ri = Math.max(0.5, ro - fw), L = CARD_CORNER_ARM;
  const dot = 0.9, at = fw + 1.4 + dot;   // the dot's centre, in from the line's corner: 1.4 mm of card between them
  const out: THREE.Shape[] = [];
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    // the edge's arc runs from the side along x to the side along y: clockwise where the signs agree
    const cw = sx * sy > 0, aY = sy > 0 ? Math.PI / 2 : -Math.PI / 2, aX = sx > 0 ? 0 : Math.PI;
    const s = new THREE.Shape();
    s.moveTo(sx * (X - L), sy * Y);
    s.lineTo(sx * (X - ro), sy * Y);
    s.absarc(sx * (X - ro), sy * (Y - ro), ro, aY, aX, cw);
    s.lineTo(sx * X, sy * (Y - L));
    s.lineTo(sx * (X - fw), sy * (Y - L));
    s.absarc(sx * (X - fw - ri), sy * (Y - fw - ri), ri, aX, aY, !cw);
    s.lineTo(sx * (X - L), sy * (Y - fw));
    s.closePath();
    out.push(s, disc(dot, sx * (X - at), sy * (Y - at)));
  }
  return out;
}

/** A card's frame: its design and width (a face's, or its back's own). */
type CardFrame = Pick<TokenSpec, "frame" | "frameWidth">;
/** How far in from the edge a card's face plate starts when the card is its back's colour (mm). */
const CARD_FACE_INSET = 0.6;
/** The colour behind a card's back, when it has a back and that isn't the card's own colour. */
const cardBackBase = (spec: TokenSpec) => (spec.cardBack?.on && spec.colours.backBase && spec.colours.backBase !== spec.colours.base ? spec.colours.backBase : null);

/** An icon's drawing on a card: its shapes (SVG units, y down), their box, and its markup for the 2D picture. */
interface CardArt { shapes: THREE.Shape[]; box: THREE.Box2; g: string; body: string }
const artBoxes = new WeakMap<THREE.Shape[], THREE.Box2>();
function cardArt(lib: Library, key: string, g: string, body: string): CardArt | null {
  if (!body) return null;
  let shapes = lib.icons.get(key);
  if (!shapes) {
    try { shapes = parseSvgShapes(iconSvg({ g, body })); } catch { shapes = []; }   // an icon that won't parse: none
    lib.icons.set(key, shapes);
  }
  if (!shapes.length) return null;
  if (!artBoxes.has(shapes)) artBoxes.set(shapes, boundsOf(shapes));
  return { shapes, box: artBoxes.get(shapes)!, g, body };
}
/** The token's icon on its card (its own, or its character's): none for a token without one, as Clocktower's info tokens. */
function cardFaceArt(lib: Library, role: Role, spec: TokenSpec) {
  if (!spec.icon?.body && !role.body && !role.d?.length) return null;
  const icon = iconOf(role, spec);
  return cardArt(lib, icon.key, icon.g, icon.body);
}
/** A card back's own icon (the design's: kept in a file or your designs, so drawn only as shapes, safe-svg.ts). */
function cardBackArt(lib: Library, icon: TokenIcon | null) {
  if (!icon?.body) return null;
  const body = safeIconMarkup(icon.body);
  return cardArt(lib, `cardback:${icon.id}#${contentTag(body)}`, safeTransform(icon.g), body);
}

/** A card face as it's drawn: its layout, icon, frame, and the colours of its phrase (and icon) and of its frame. */
interface CardFace { L: CardLayout; art: CardArt | null; frame: CardFrame; ink: Hex; line: Hex }
/**
 * A card's face: the front, the token's phrase and icon in the design's layout; or the back (when the
 * design has one), its own phrase (the collection's name, when it says so and the token has one) and icon.
 */
function cardFaceOf(lib: Library, role: Role, spec: TokenSpec, side: "front" | "back", text: string): CardFace | null {
  const team = role.colour ?? TEAMS[role.team].colour, pick = (v: ColourRef): Hex => (v === "team" ? team : v);
  if (side === "front") {
    const art = spec.cardIcon !== "none" ? cardFaceArt(lib, role, spec) : null, L = cardLayout(lib, text, spec, !!art);
    return { L, art, frame: spec, ink: pick(spec.colours.front), line: pick(spec.colours.frame) };
  }
  const b = spec.cardBack;
  if (!b?.on) return null;
  const back = cardBackOf({ ...spec, cardBack: b }), words = back.name === "collection" && role.collectionName ? role.collectionName : back.text;
  const art = back.cardIcon !== "none" ? cardBackArt(lib, back.icon) : null;
  return { L: cardLayout(lib, words, back, !!art), art, frame: back, ink: pick(back.colours.text), line: pick(back.colours.frame) };
}
/** Places an icon's drawing in its square (centre x, y; the drawing's larger side `size`), from its SVG units. */
function cardArtMatrix(art: CardArt, at: { x: number; y: number; size: number }, z: number) {
  const b = art.box, k = at.size / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 1e-6);
  return chain(T(at.x, at.y, z), S(k, -k, 1), T(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, 0));
}
/** The line between the icon and the phrase ("column"), as a shape. */
const cardRule = (r: { x: number; h: number }) => rectShape(r.x - CARD_RULE / 2, -r.h / 2, r.x + CARD_RULE / 2, r.h / 2);
/**
 * A card face as inlays `d` deep from height z: its phrase, its icon, and its frame with the line
 * beside the icon. `m` places the face: the back is mirrored, to read right when the card is turned over.
 */
function cardFaceGeom(lib: Library, f: CardFace, z: number, d: number, m: THREE.Matrix4) {
  const letters = merge(f.L.lines.map((line) => {
    const shapes = lib.font.generateShapes(line.text, f.L.em);
    if (!shapes.length) return null;
    const box = boundsOf(shapes);
    return extrude(shapes, d, chain(m, T(line.x - (box.min.x + box.max.x) / 2, line.y, z)), 4);
  }));
  const icon = f.art && f.L.icon ? extrude(f.art.shapes, d, chain(m, cardArtMatrix(f.art, f.L.icon, z)), 6) : null;
  const frame = cardFrameShapes(f.frame);
  const lines = merge([frame ? extrude(frame, d, chain(m, T(0, 0, z)), 16) : null, f.L.rule ? extrude([cardRule(f.L.rule)], d, chain(m, T(0, 0, z)), 1) : null]);
  return { letters, icon, lines };
}

function buildCard(lib: Library, role: Role, input: SpecInput | undefined, text?: string | null): Token {
  const spec = cardContent(role, cardSpec(input));
  text ??= roleName(role, spec.lang);
  const H = spec.height, d = spec.depth;
  const front = cardFaceOf(lib, role, spec, "front", text)!, back = cardFaceOf(lib, role, spec, "back", text);
  const F = cardFaceGeom(lib, front, H - d, d, M());
  // the back, seen from below: mirrored to read right when the card is turned over; its plate (a
  // colour of its own) under it, its phrase and icon (backIcon) and its frame (backFrame) over the plate (later parts win)
  const B = back ? cardFaceGeom(lib, back, 0, d, S(-1, 1, 1)) : null, plate = cardBackBase(spec);
  const team = role.colour ?? TEAMS[role.team].colour, pick = (v: ColourRef): Hex => (v === "team" ? team : v);
  // A back of its own colour makes the whole card that colour (its edges too: a deck shows nothing
  // from the side) and the face a plate of the card's colour, CARD_FACE_INSET in from the edge.
  const full = () => roundedRect(CARD.w, CARD.h, CARD.r), faceRect = () => roundedRect(CARD.w - 2 * CARD_FACE_INSET, CARD.h - 2 * CARD_FACE_INSET, CARD.r - CARD_FACE_INSET);
  const rim = () => { const s = full(); s.holes.push(faceRect()); return s; };
  const c = partColours(role, spec);
  return {
    parts: {
      base: plate ? extrude([faceRect()], d, T(0, 0, H - d), 16) : extrude([full()], H, T(0, 0, 0), 16),
      front: F.letters, icon: F.icon, frame: F.lines,
      back: plate ? merge([extrude([full()], H - d, T(0, 0, 0), 16), extrude([rim()], d, T(0, 0, H - d), 16)]) : null,
      backIcon: B ? merge([B.letters, B.icon]) : null, backFrame: B?.lines ?? null },
    // the icon in the phrase's colour, like a coin's classic icon; the back's in its own
    colours: { ...c, icon: front.ink, back: pick(plate ?? spec.colours.base), backIcon: back?.ink ?? c.back, backFrame: back?.line ?? c.backFrame, hole: "#0b090c" },
    name: { letterHeight: front.L.cap, scale: 1, total: null, lines: front.L.lines.length },
    spec, magnet: null, depthClamped: null, card: true, foot: { w: CARD.w, h: CARD.h },
  };
}

/**
 * Which of a card's parts print, and in which colours, as buildCard makes them but without their
 * geometry (the print plan counts a plate's colours with it): the phrase and the body always; the
 * icon, the frame (with the line beside the icon) and the back's plate, phrase and icon, and frame
 * as the design has them.
 */
export function cardPlan(lib: Library, role: Role, input: SpecInput): { parts: Record<PartName, 1 | null>; colours: Record<PartName, Hex> } {
  const spec = cardContent(role, cardSpec(input)), text = roleName(role, spec.lang), c = partColours(role, spec);
  const front = cardFaceOf(lib, role, spec, "front", text)!, back = cardFaceOf(lib, role, spec, "back", text), plate = cardBackBase(spec);
  const lines = (f: CardFace | null) => !!f && (f.frame.frame !== "none" || !!f.L.rule), icon = (f: CardFace | null) => !!(f?.art && f.L.icon);
  const one = (yes: boolean) => (yes ? 1 : null);
  return {
    parts: { base: 1, front: 1, icon: one(icon(front)), frame: one(lines(front)), back: one(!!plate),
      backIcon: one(!!back && (icon(back) || back.L.lines.some((l) => l.text))), backFrame: one(lines(back)) },
    colours: { base: c.base, front: c.front, icon: front.ink, frame: c.frame, back: plate ? (plate === "team" ? role.colour ?? TEAMS[role.team].colour : plate) : c.base,
      backIcon: back?.ink ?? c.back, backFrame: back?.line ?? c.frame },
  };
}

/** A card face in the 2D picture, as it's seen (a back too: the picture isn't mirrored). */
function cardFaceSvg(lib: Library, f: CardFace) {
  const { w, h, r } = CARD;
  let body = "";
  for (const line of f.L.lines) {
    const shapes = lib.font.generateShapes(line.text, f.L.em);
    if (!shapes.length) continue;
    const box = boundsOf(shapes);
    body += `<path fill="${f.ink}" fill-rule="evenodd" d="${shapesToPath(shapes, line.x - (box.min.x + box.max.x) / 2, line.y)}"/>`;
  }
  if (f.art && f.L.icon) {
    const b = f.art.box, at = f.L.icon, k = at.size / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 1e-6);
    body += `<g fill="${f.ink}" transform="translate(${at.x.toFixed(3)} ${(-at.y).toFixed(3)}) scale(${k.toFixed(5)}) translate(${(-(b.min.x + b.max.x) / 2).toFixed(3)} ${(-(b.min.y + b.max.y) / 2).toFixed(3)})"><g transform="${f.art.g}">${f.art.body}</g></g>`;
  }
  if (f.L.rule) body += `<path fill="${f.line}" d="${shapesToPath([cardRule(f.L.rule)], 0, 0, 1)}"/>`;
  const fw = cardFrameWidth(f.frame), i = CARD_FRAME_INSET + fw / 2, frame = f.frame.frame;
  if (frame === "corners") body += `<path fill="${f.line}" d="${shapesToPath(cardCorners(fw), 0, 0, 16)}"/>`;
  if (frame === "laurel") body += `<path fill="${f.line}" d="${shapesToPath(cardLaurels(), 0, 0, 8)}"/>`;
  if (frame !== "none" && frame !== "corners") body += `<rect x="${-w / 2 + i}" y="${-h / 2 + i}" width="${w - 2 * i}" height="${h - 2 * i}" rx="${Math.max(0.5, r - i)}" fill="none" stroke="${f.line}" stroke-width="${fw}"/>`;
  return body;
}

function cardSvg(lib: Library, role: Role, input: SpecInput | undefined, side: "front" | "back", text?: string | null) {
  const spec = cardContent(role, cardSpec(input));
  const c = partColours(role, spec), label = text ?? roleName(role, spec.lang);
  const { w, h, r } = CARD, i = CARD_FACE_INSET;
  // the card's colour all round: a back of its own colour makes the card that colour, its face a plate of its own
  const plate = cardBackBase(spec), team = role.colour ?? TEAMS[role.team].colour, edge = plate ? (plate === "team" ? team : plate) : c.base;
  let body = side === "front" && plate ? `<rect x="${-w / 2 + i}" y="${-h / 2 + i}" width="${w - 2 * i}" height="${h - 2 * i}" rx="${r - i}" fill="${c.base}"/>` : "";
  const face = cardFaceOf(lib, role, spec, side, label);
  if (face) body += cardFaceSvg(lib, face);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2 - 0.5} ${-h / 2 - 0.5} ${w + 1} ${h + 1}" role="img" aria-label="${esc(label)}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${r}" fill="${edge}"/>${body}</svg>`;
}


// ---------------------------------------------------------------- condition rings

/**
 * Condition rings (a collection's types of shape "ring") are flat rings that slip over a
 * miniature's base, the token's name running all the way round, repeated with a dot between,
 * so it reads from any side of the table. A fine line runs along each edge (as the coin's rim
 * does) when the design has a frame. They print like the coins: the body in the coin colour, the letters, dots
 * and lines as inlays (flush or raised); no icon, back or magnet. Roles with kind "ring".
 */
export const RING_BASES = ["25", "32", "40", "50"];
/** Play between the ring and the base on each side, the ring's width, and the coin colour kept
 *  between the letters and the lines or edges (mm): wider than the nozzle, so it prints. */
const RING_PLAY = 0.6, RING_WIDTH = 6, RING_TEXT_GAP = 0.7;
export const isRing = (role: Role | null | undefined) => role?.kind === "ring";
/** What can go between repeats of a ring's name: the dot (the default), a diamond, a star, or nothing (the gap stays). */
export const RING_SEPARATORS: RingSeparator[] = ["dot", "diamond", "star", "none"];

/** A ring's radii (mm) for the base its design is for: the hole, and the outer edge. */
export function ringSize(spec: { ringBase?: string }) {
  const base = Number(RING_BASES.includes(spec.ringBase ?? "") ? spec.ringBase : DEFAULT_SPEC.ringBase);
  const inner = base / 2 + RING_PLAY;
  return { base, inner, outer: inner + RING_WIDTH };
}

/**
 * The ring's fine edge lines (mm wide, null without a frame) and the band left between them
 * for the letters, which is as tall as they can be: the default frame width (0.8 mm) gives the
 * thinnest line that prints well, 0.45 mm, and letters of at most 3.7 mm.
 */
export function ringBand(spec: Pick<TokenSpec, "frame" | "frameWidth">) {
  const line = spec.frame === "none" ? null : Math.min(Math.max(spec.frameWidth * 0.55, 0.45), 0.8);
  return { line, band: RING_WIDTH - 2 * ((line ?? 0) + RING_TEXT_GAP) };
}

/** A ring's spec: the set's colours, frame, relief, height and depth; `diameter` its outer edge, so plates, paper and the 3D view size it right. */
export function ringSpec(input: SpecInput | undefined): TokenSpec {
  const s = normalizeSpec({ ...DEFAULT_SPEC, ...input, colours: { ...DEFAULT_SPEC.colours, ...input?.colours } });
  const spec: TokenSpec = { ...s, style: "classic", relief: { ...reliefOf(s), icon: false }, back: "none", magnet: "none", diameter: 2 * ringSize(s).outer };
  return { ...spec, depth: fittingDepth(spec).depth };
}

/**
 * Where the name goes round the ring: as many times as fit with a comfortable gap (at least
 * twice, the letters shrinking if they must), each repetition centred on its share of the
 * circle with a dot halfway to the next. Letters stand on a circle inside the band, tops
 * outwards, reading clockwise. Angles in degrees, engine space (y up).
 */
export function ringLayout(lib: Library, text: string | null | undefined, spec: TokenSpec) {
  const { inner, outer } = ringSize(spec), mid = (inner + outer) / 2;
  const { line, band } = ringBand(spec);
  const want = Math.min(spec.textSize, band);
  const chars = [...(text || "").toUpperCase().trim()];
  const adv = chars.map((c) => (c === " " ? Math.max(glyph(lib, " ").advance, 0.45) : glyph(lib, c).advance) * spec.spacing);
  const word = adv.reduce((a, b) => a + b, 0);                    // in em
  const circ = 2 * Math.PI * mid, gap = want * 1.6;               // room for the dot and some air either side
  let em = want / lib.capHeight, n = Math.floor(circ / (word * em + gap));
  if (n < 2) { n = 2; em = Math.min(em, (circ / 2 - gap) / Math.max(word, 1e-6)); }
  const cap = em * lib.capHeight;
  const letters: { ch: string; a: number }[] = [], dots: number[] = [];
  for (let k = 0; k < n; k++) {
    const centre = 90 - (k * 360) / n;                            // the first on top, then clockwise
    let s = -(word * em) / 2;
    chars.forEach((ch, i) => {
      const at = s + (adv[i] * em) / 2;
      s += adv[i] * em;
      if (ch !== " ") letters.push({ ch, a: centre - (at / mid) * (180 / Math.PI) });
    });
    dots.push(centre - 180 / n);
  }
  const sep: RingSeparator = RING_SEPARATORS.includes(spec.separator) ? spec.separator : "dot";
  return { inner, outer, mid, line, letters, dots, sep, em, cap, n, base: mid - cap / 2, dot: Math.max(0.5, cap * 0.2), letterHeight: cap, scale: cap / want };
}

/**
 * The marks between repeats other than the dot, as filled shapes, each where its dot would be and
 * about its size, kept within the letters' height: a diamond long across the band and narrow
 * round the ring, or a five-pointed star with a point outwards.
 */
function ringMarks(L: ReturnType<typeof ringLayout>): THREE.Shape[] {
  const half = L.cap / 2;
  return L.dots.map((deg) => {
    const a = THREE.MathUtils.degToRad(deg), c = pt(L.mid, a);
    const at = (r: number, t: number) => c.clone().add(pt(r, t));
    if (L.sep === "diamond") {
      const along = Math.min(L.dot * 2.2, half), across = L.dot * 1.3;
      return polygon([at(along, a), at(across, a + Math.PI / 2), at(along, a + Math.PI), at(across, a - Math.PI / 2)]);
    }
    const R = Math.min(L.dot * 1.9, half), r = R * 0.5;
    return polygon(Array.from({ length: 10 }, (_, k) => at(k % 2 ? r : R, a + (k * Math.PI) / 5)));
  });
}

/** The lines along the ring's edges, as filled shapes: drawn like its body, so their edges are the body's. */
const ringLines = (L: ReturnType<typeof ringLayout>) => (L.line ? [annulus(L.outer, L.outer - L.line), annulus(L.inner + L.line, L.inner)] : []);

function buildRing(lib: Library, role: Role, input: SpecInput | undefined, text?: string | null): Token {
  const spec = ringSpec(input);
  text ??= roleName(role, spec.lang);
  const L = ringLayout(lib, text, spec), H = spec.height, top = H - spec.depth;
  const letters = L.letters.map(({ ch, a }) => {
    const g = glyph(lib, ch), r = THREE.MathUtils.degToRad(a);
    return partExtrude(g.shapes, spec, "text", topFace(spec), chain(T(L.base * Math.cos(r), L.base * Math.sin(r), top), RZ(r - Math.PI / 2), S(L.em, L.em, 1), T(-g.center, 0, 0)), 4);
  });
  const ringKey = JSON.stringify([L.sep, L.dot, L.mid, L.cap, L.dots]);
  const dots = L.sep === "dot" ? partExtrude(memoShapes(`dots|${ringKey}`, () => L.dots.map((a) => disc(L.dot, ...ptXY(L.mid, THREE.MathUtils.degToRad(a))))), spec, "text", topFace(spec), T(0, 0, top), 8)
    : L.sep === "none" ? null : partExtrude(memoShapes(`marks|${ringKey}`, () => ringMarks(L)), spec, "text", topFace(spec), T(0, 0, top), 1);
  const front = merge([...letters, dots]);
  const frame = L.line ? partExtrude(memoShapes(`lines|${L.outer}|${L.inner}|${L.line}`, () => ringLines(L)), spec, "frame", topFace(spec), T(0, 0, top), 64) : null;
  const R = reliefOf(spec), r = reliefTop(spec), above = (g: THREE.BufferGeometry | null) => (g && r ? aboveOf.get(g) ?? geometryVolume(g) * r / (spec.depth + r) : 0);
  return {
    parts: { base: extrude([annulus(L.outer, L.inner)], H, T(0, 0, 0), 64), front, icon: null, frame, back: null },
    colours: { ...partColours(role, spec), hole: "#0b090c" },
    name: { letterHeight: L.letterHeight, scale: L.scale, total: null, repeats: L.n },
    spec, magnet: null, depthClamped: null,
    above: { front: R.text ? above(front) : 0, frame: R.frame ? above(frame) : 0 },
  };
}

function ringSvg(lib: Library, role: Role, input: SpecInput | undefined, side: "front" | "back", text?: string | null) {
  const spec = ringSpec(input);
  const c = partColours(role, spec), label = text ?? roleName(role, spec.lang);
  const L = ringLayout(lib, label, spec), o = L.outer, i = L.inner;
  let body = "";
  if (side === "front") {
    // SVG y points down: angle a in engine space is -a on screen.
    for (const { ch, a } of L.letters) {
      const r = (a * Math.PI) / 180;
      body += letterSvg(lib, ch, L.base * Math.cos(r), -L.base * Math.sin(r), 90 - a, L.em, c.front);
    }
    if (L.sep === "diamond" || L.sep === "star") body += `<path fill="${c.front}" d="${shapesToPath(ringMarks(L), 0, 0)}"/>`;
    else if (L.sep === "dot") for (const a of L.dots) body += `<circle cx="${(L.mid * Math.cos((a * Math.PI) / 180)).toFixed(2)}" cy="${(-L.mid * Math.sin((a * Math.PI) / 180)).toFixed(2)}" r="${L.dot.toFixed(2)}" fill="${c.front}"/>`;
    if (L.line) body += `<path fill="${c.frame}" fill-rule="evenodd" d="${shapesToPath(ringLines(L), 0, 0, 48)}"/>`;
  }
  // the ring itself first, in the coin colour (print-pdf.ts reads its colour from it)
  const ring = `M${o} 0A${o} ${o} 0 1 0 ${-o} 0A${o} ${o} 0 1 0 ${o} 0ZM${i} 0A${i} ${i} 0 1 1 ${-i} 0A${i} ${i} 0 1 1 ${i} 0Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-o - 0.5} ${-o - 0.5} ${2 * o + 1} ${2 * o + 1}" role="img" aria-label="${esc(label)}"><path fill="${c.base}" fill-rule="evenodd" d="${ring}"/>${body}</svg>`;
}

// ---------------------------------------------------------------- miniature bases

/**
 * A base tray: the tray a miniature's own base sits in (a floor and a rim round it), with a tab in
 * front, a stretch of the rim grown outwards, that carries the token's text along it (a number, a
 * name and its number…). The tab grows as wide as its text needs, its sides parallel and its outer
 * corners rounded; a text too long for the widest tab (about the tray's) gets smaller letters.
 * It prints face-up (the pocket can't be face-down), the text sunk flush into the top or raised.
 */
export const isBase = (role: Role | null | undefined) => role?.kind === "base";
/** Play round the miniature's base, the rim's width and the floor's thickness (mm); the rim stands `height` above the floor. */
const BASE_PLAY = 0.4, BASE_RIM = 3, BASE_FLOOR = 1;

/** A tray's radii (mm) for the base its design is for: the pocket, and the rim's outer edge. */
export function baseSize(spec: { ringBase?: string }) {
  const base = Number(RING_BASES.includes(spec.ringBase ?? "") ? spec.ringBase : DEFAULT_SPEC.ringBase);
  const ri = base / 2 + BASE_PLAY;
  return { base, ri, ro: ri + BASE_RIM };
}

/** A tray's spec: `height` its rim above the floor (1.5 to 4 mm); `diameter` what it takes on the plate. */
export function baseSpec(input: SpecInput | undefined): TokenSpec {
  const s = normalizeSpec({ ...DEFAULT_SPEC, ...input, colours: { ...DEFAULT_SPEC.colours, ...input?.colours } });
  const spec: TokenSpec = { ...s, style: "classic", relief: { ...reliefOf(s), icon: false }, back: "none", magnet: "none",
    height: Math.min(4, Math.max(1.5, s.height)), diameter: 2 * (baseSize(s).ro + 6) };
  return { ...spec, depth: fittingDepth(spec).depth };
}

/**
 * Where the text goes on the tab: letters along a circle, feet near the tab's edge and tops towards
 * the middle, centred on the front (-y), read from the front. Its size: 6 mm for a number of one or
 * two figures, 4.5 mm for more, smaller (down to 3) when the tab would be wider than the tray.
 */
export function baseLayout(lib: Library, text: string | null | undefined, spec: TokenSpec) {
  const { ri, ro } = baseSize(spec);
  const chars = [...(text || "").toUpperCase().trim()];
  // nothing to say: no tab, the tray alone
  if (!chars.length) return { ri, ro, R: ro, ext: 0, cap: 0, em: 0, foot: ro, half: 0, letters: [] as { ch: string; a: number }[], line: spec.frame === "none" ? null : Math.min(Math.max(spec.frameWidth * 0.55, 0.45), 0.8), tab: false };
  const adv = chars.map((c) => (c === " " ? Math.max(glyph(lib, " ").advance, 0.45) : glyph(lib, c).advance) * spec.spacing);
  const word = adv.reduce((a, b) => a + b, 0);
  let cap = chars.length <= 2 ? 6 : 4.5;
  for (;;) {
    const ext = Math.max(4, cap - 0.4), R = ro + ext, foot = R - 1.3, mid = foot - cap / 2, em = cap / lib.capHeight;
    const half = (word * em / 2 + 2) / mid;   // the tab's half-span (radians): the text and 2 mm past it each side
    if (R * Math.sin(Math.min(half, Math.PI / 2)) < ro - 1 || cap <= 3) {
      const letters: { ch: string; a: number }[] = [];
      let at = -(word * em) / 2;
      chars.forEach((ch, i) => { const w = adv[i] * em; if (ch !== " ") letters.push({ ch, a: -Math.PI / 2 + (at + w / 2) / mid }); at += w; });
      const line = spec.frame === "none" ? null : Math.min(Math.max(spec.frameWidth * 0.55, 0.45), 0.8);
      return { ri, ro, R, ext, cap, em, foot, half, letters, line, tab: true };
    }
    cap = Math.max(3, cap - 0.25);
  }
}

/** The tray's outline (the rim's circle and its tab), `inset` mm in: the edge line's inner side. */
function baseOutline(L: ReturnType<typeof baseLayout>, inset = 0) {
  const ro = L.ro - inset, R = L.R - inset, rc = Math.max(0.2, Math.min(2, L.ext / 2 - 0.2) - inset);
  const s = new THREE.Shape(), xs = L.R * Math.sin(Math.min(L.half, Math.PI / 2)) - inset;
  if (!L.tab) { s.absarc(0, 0, ro, 0, TAU, false); return s; }   // no tab: the rim's circle
  if (xs < L.ro - 1 - inset) {
    // sides parallel, straight down to the rim; the outer corners rounded
    const yc = -Math.sqrt((R - rc) ** 2 - (xs - rc) ** 2), yj = -Math.sqrt(ro * ro - xs * xs);
    const fr = Math.atan2(yc, xs - rc), fl = Math.atan2(yc, -(xs - rc));
    s.moveTo(xs, yj);
    s.absarc(0, 0, ro, Math.atan2(yj, xs), Math.atan2(yj, -xs) + TAU, false);
    s.lineTo(-xs, yc);
    s.absarc(-xs + rc, yc, rc, Math.PI, fl + TAU, false);
    s.absarc(0, 0, R, fl, fr, false);
    s.absarc(xs - rc, yc, rc, fr, 0, false);
    s.lineTo(xs, yj);
    return s;
  }
  // a tab wrapping further round than the tray is wide (the shortest letters still too long): sides along the radius.
  // Inset, the corners keep their centres (smaller by `inset`) and each side moves `inset` into the tab, parallel to it.
  const a0 = -Math.PI / 2 - L.half, a1 = -Math.PI / 2 + L.half, rc0 = rc + inset, rr = L.R - rc0, tilt = Math.asin(rc0 / rr), along = Math.sqrt(rr * rr - rc0 * rc0);
  const c0 = a0 + tilt, c1 = a1 - tilt;
  const side = (a: number, sign: number, t: number) => [t * Math.cos(a) - sign * inset * Math.sin(a), t * Math.sin(a) + sign * inset * Math.cos(a)] as const;
  const onRim = Math.sqrt(Math.max(ro * ro - inset * inset, 0));
  const [j0x, j0y] = side(a0, 1, onRim), [j1x, j1y] = side(a1, -1, onRim), [t0x, t0y] = side(a0, 1, along);
  s.moveTo(j1x, j1y);
  s.absarc(0, 0, ro, Math.atan2(j1y, j1x), Math.atan2(j0y, j0x) + TAU, false);
  s.lineTo(t0x, t0y);
  s.absarc(rr * Math.cos(c0), rr * Math.sin(c0), rc, a0 - Math.PI / 2, c0, false);
  s.absarc(0, 0, R, c0, c1, false);
  s.absarc(rr * Math.cos(c1), rr * Math.sin(c1), rc, c1, a1 + Math.PI / 2, false);
  s.lineTo(j1x, j1y);
  return s;
}
/** The fine lines along the tray's outer edge and round its pocket, as filled shapes. */
function baseLines(L: ReturnType<typeof baseLayout>): THREE.Shape[] {
  if (!L.line) return [];
  const edge = baseOutline(L); edge.holes.push(new THREE.Path(baseOutline(L, L.line).getPoints(24)));
  return [edge, annulus(L.ri + L.line, L.ri)];
}

/** The tray as one closed solid: its outline from 0 to `H`, the pocket of radius `ri` sunk in it down to the floor.
 *  (A floor and a wall laid on it would share a face, and the slicer warns of non-manifold edges.) */
function trayBody(outline: THREE.Shape, ri: number, H: number) {
  let out = cleanLoop(outline.getPoints(24));
  if (THREE.ShapeUtils.isClockWise(out)) out = out.reverse();
  const pocket = new THREE.Path(); pocket.absarc(0, 0, ri, 0, TAU, false);
  let hole = cleanLoop(pocket.getPoints(24));
  if (THREE.ShapeUtils.isClockWise(hole)) hole = hole.reverse();
  const pos: number[] = [], v = (p: THREE.Vector2, z: number) => [p.x, p.y, z];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { tri(a, b, c); tri(a, c, d); };
  // the bottom (facing down) and the pocket's floor (facing up), each the whole of its outline
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(out, [])) tri(v(out[a], 0), v(out[c], 0), v(out[b], 0));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(hole, [])) tri(v(hole[a], BASE_FLOOR), v(hole[b], BASE_FLOOR), v(hole[c], BASE_FLOOR));
  // the top, round the pocket (facing up): earcut wants the hole clockwise
  const cw = [...hole].reverse(), all = [...out, ...cw];
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(out, [cw])) tri(v(all[a], H), v(all[b], H), v(all[c], H));
  // the outer side, facing out; the pocket's wall, facing in
  out.forEach((p, i) => { const q = out[(i + 1) % out.length]; quad(v(p, 0), v(q, 0), v(q, H), v(p, H)); });
  hole.forEach((p, i) => { const q = hole[(i + 1) % hole.length]; quad(v(p, BASE_FLOOR), v(p, H), v(q, H), v(q, BASE_FLOOR)); });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function buildTray(lib: Library, role: Role, input: SpecInput | undefined, text?: string | null): Token {
  const s = baseSpec(input);
  text ??= roleName(role, s.lang);
  const L = baseLayout(lib, role.content === "none" ? "" : text, s), H = BASE_FLOOR + s.height, spec: TokenSpec = { ...s, height: H }, top = H - spec.depth;
  const body = trayBody(baseOutline(L), L.ri, H);
  const front = merge(L.letters.map(({ ch, a }) => {
    const g = glyph(lib, ch);
    return partExtrude(g.shapes, spec, "text", topFace(spec), chain(T(L.foot * Math.cos(a), L.foot * Math.sin(a), top), RZ(a + Math.PI / 2), S(L.em, L.em, 1), T(-g.center, 0, 0)), 4);
  }));
  const frame = L.line ? partExtrude(baseLines(L), spec, "frame", topFace(spec), T(0, 0, top), 24) : null;
  const R = reliefOf(spec), r = reliefTop(spec), above = (g: THREE.BufferGeometry | null) => (g && r ? aboveOf.get(g) ?? geometryVolume(g) * r / (spec.depth + r) : 0);
  return {
    parts: { base: body, front, icon: null, frame, back: null },
    colours: partColours(role, spec),
    name: { letterHeight: L.cap, scale: L.cap / ([...(text || "").trim()].length <= 2 ? 6 : 4.5), total: null, tab: true },
    spec, magnet: null, depthClamped: null, faceUp: true,
    above: { front: R.text ? above(front) : 0, frame: R.frame ? above(frame) : 0 },
  };
}

function baseSvg(lib: Library, role: Role, input: SpecInput | undefined, side: "front" | "back", text?: string | null) {
  const spec = baseSpec(input), c = partColours(role, spec), label = text ?? roleName(role, spec.lang);
  const L = baseLayout(lib, role.content === "none" ? "" : label, spec), v = L.R + 0.5;
  // the tray in the coin colour first (print-pdf.ts reads its colour from it), the pocket shaded
  let body = `<path fill="${c.base}" d="${shapesToPath([baseOutline(L)], 0, 0, 24)}"/><circle r="${L.ri.toFixed(2)}" fill="#000" fill-opacity=".28"/>`;
  if (side === "front") {
    if (L.line) body += `<path fill="${c.frame}" fill-rule="evenodd" d="${shapesToPath(baseLines(L), 0, 0, 24)}"/>`;
    for (const { ch, a } of L.letters) body += letterSvg(lib, ch, L.foot * Math.cos(a), -L.foot * Math.sin(a), -90 - (a * 180) / Math.PI, L.em, c.front);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-v} ${-v} ${2 * v} ${2 * v}" role="img" aria-label="${esc(label)}">${body}</svg>`;
}

// ---------------------------------------------------------------- what each shape has

/**
 * What a token shape can have, the one place that says so: the workshop's tabs for a type are
 * its parts and its face's (main.ts, partsOf and faceTabsOf), and every spec that reaches the
 * print step goes through shapeSpec, so a back or a magnet never counts for a shape that has none.
 * Every shape has the colours of its body and name, its thickness and the colour's depth.
 */
export interface ShapeFeatures {
  /** The layout choice (classic, window, solo, double). */
  layout: boolean;
  /** An icon on the face: its size, and an icon of the token's own. */
  icon: boolean;
  /** The name's letter height as asked for (else it's fitted to the shape). */
  textSize: boolean;
  /** Letter spacing. */
  spacing: boolean;
  /** How far round the edge the name may go. */
  maxArc: boolean;
  /** "designs": any of FRAME_STYLES; "line": only with a frame or without (any design comes out
   *  as a plain line); its width goes with it. */
  frame: "designs" | "line";
  /** The face parts that can stand raised; none: everything flush, printed face-down. */
  relief: ReliefPart[];
  back: boolean;
  magnet: boolean;
  /** A diameter of its own (a card's size is fixed, a ring's is its miniature base's). */
  diameter: boolean;
  /** The miniature base it fits (RING_BASES). */
  ringBase: boolean;
  /** A token of this shape can have two states, its back being the other (see flipFace). */
  flip: boolean;
  /** A mark of its choice between repeats of its name (RING_SEPARATORS). */
  separator: boolean;
  /** Its frame can be only its corners ("corners", a card's). */
  corners: boolean;
  /** A background pattern behind its faces (frontPattern, backPattern). */
  pattern: boolean;
}
export const SHAPE_FEATURES: Record<TokenShape, ShapeFeatures> = {
  // A coin has everything the workshop offers (some layouts leave a control out: see main.ts).
  coin: { layout: true, icon: true, textSize: true, spacing: true, maxArc: true, frame: "designs", relief: ["text", "frame", "icon"], back: true, magnet: true, diameter: true, ringBase: false, flip: true, separator: false, corners: false, pattern: true },
  // A card (85 × 55 mm, Clocktower's Grimoire): the phrase as large as fits, beside the token's icon
  // or without it (where, in its Layout), the frame a line inside the edge, all flush (cardSpec); no magnet; a back of its
  // own, laid out like a face (cardBack).
  card: { layout: true, icon: true, textSize: false, spacing: false, maxArc: false, frame: "line", relief: [], back: true, magnet: false, diameter: false, ringBase: false, flip: false, separator: false, corners: true, pattern: false },
  // A condition ring: the name round and round at the height asked for (as far as its band
  // allows, ringBand), a fine line along each edge, either raised (ringSpec); no icon, back or
  // magnet, and sized by its base.
  ring: { layout: false, icon: false, textSize: true, spacing: true, maxArc: false, frame: "line", relief: ["text", "frame"], back: false, magnet: false, diameter: false, ringBase: true, flip: false, separator: true, corners: false, pattern: false },
  // A base tray (baseSpec): its text along the tab, the edge lines its frame; the base it's for.
  base: { layout: false, icon: false, textSize: false, spacing: true, maxArc: false, frame: "line", relief: ["text", "frame"], back: false, magnet: false, diameter: false, ringBase: true, flip: false, separator: false, corners: false, pattern: false },
};
export const shapeOf = (role: Role | null | undefined): TokenShape => (isCard(role) ? "card" : isRing(role) ? "ring" : isBase(role) ? "base" : "coin");

/**
 * A back that is a face, in its spec (shapeSpec puts it there): the front again, a face of its
 * own, or a two-state token's other state (see backFaceOf). Back designs, their colour and an
 * uploaded back don't apply to it.
 */
export const FACE_BACK = "face";
/** The fields a back face of its own ("own") sets apart from the front's: its layout, name, icon and frame. */
export const FACE_FIELDS: FaceField[] = ["style", "textSize", "spacing", "maxArc", "iconScale", "frame", "frameWidth"];
/**
 * The back face's own look (layout, name, icon, frame): what it changed from the front's. "match"
 * is a back that changed nothing (as designs kept it before the back could be changed); "own" and a
 * back design (for its two-state tokens' other state) keep what was changed.
 */
export const backLookOf = (spec: SpecInput): Partial<TokenSpec> => {
  const b = spec.backFace ?? {};
  return spec.backMode === "match" ? {} : Object.fromEntries(FACE_FIELDS.filter((k) => b[k] != null).map((k) => [k, b[k]]));
};
/** Is the coin's back a face: its other state, or a back that matches the front or has a face of its own? */
export const backIsFace = (role: Role | null | undefined, spec: SpecInput | undefined) =>
  shapeOf(role) === "coin" && (!!flipFace(role, spec) || spec?.backMode === "match" || spec?.backMode === "own");

/** A back face's colours: its own, else the front's. */
function backColours(spec: SpecInput) {
  const c = { ...DEFAULT_SPEC.colours, ...spec.colours }, own = spec.backFace?.colours;
  // the icon: its own on the back, else the back's name's when that's the back's own, else the front's icon's
  return { front: own?.front ?? c.front, frame: own?.frame ?? c.frame, icon: own?.icon ?? (own?.front ? undefined : c.icon) };
}

/**
 * What a coin's back face shows, as a front the engine draws (null when the back is a design):
 * the role (a two-state token's other state, else the token itself), its text, and the spec it's
 * drawn with: the front's look with what the back changed (backLookOf; a linked token keeps its
 * reminder look); the back's relief (backRelief) and colours. `spec` is the token's as its shape prints it.
 */
export function backFaceOf(role: Role, spec: TokenSpec, text: string): { role: Role; text: string; spec: TokenSpec } | null {
  if (spec.back !== FACE_BACK) return null;
  const other = flipFace(role, spec);
  // a linked token (a reminder) has its own sizes; of the back's own look, it takes its frame (or none)
  const own = backLookOf(spec), look = !spec.linked ? own : own.frame != null ? { frame: own.frame } : {};
  const c = backColours(spec);
  // the back's pattern behind it, in the back frame's colour (a pattern under a back design is in the design's)
  const face = windowFrame({ ...spec, ...look, frontPattern: spec.backPattern ? { ...spec.backPattern, colour: "frame" } : undefined, relief: backRelief(spec), colours: { ...spec.colours, front: c.front, frame: c.frame, icon: c.icon } });
  // what the token carries (its content) is its front's: the back's layout is the back's own, drawn as it is
  if (other) return { role: { ...other, content: undefined }, text: roleName(other, spec.lang), spec: { ...face, icon: undefined } };
  return backContent(role, face, text, spec.backFace ?? {});
}

/**
 * What a back's layout needs of what it says and shows: the text layout its words, solo its icon, the
 * others both (whichever was set to nothing comes back as the token's own). The text layout leaves the
 * icon out and solo the words, without forgetting them.
 */
export function backLayoutContent(style: TokenStyle, b: BackFace): Partial<BackFace> {
  return { ...(b.art === "none" && style !== "text" ? { art: "token" } : {}), ...(b.say === "none" && style !== "solo" ? { say: "name" } : {}) };
}
/** A one-state token's back face as it's drawn (`spec` the face's look): its words, its icon, and the layout they make. */
export const backShown = (role: Role, spec: TokenSpec, text: string) => backContent(role, spec, text, spec.backFace ?? {});
/**
 * A one-state token's back as it says it (BackFace.say, .art): its name or the edition's or a phrase
 * of its own (or none), and its icon, an ornament, the uploaded SVG (or none). Without words the
 * icon is alone (the solo layout); without an icon the words are (the text layout).
 */
function backContent(role: Role, spec: TokenSpec, text: string, b: BackFace): { role: Role; text: string; spec: TokenSpec } {
  const ed = b.say === "edition" ? backEdition(role, spec) : null;
  const words = b.say === "none" ? "" : b.say === "phrase" ? (b.phrase ?? "").trim() : b.say === "edition" ? (ed ? (ed.name[spec.lang] || ed.name[spec.lang?.split("-")[0]] || ed.name.en) : "") : text;
  // its own icon: a token showing only its name keeps one for its back (keptIcon)
  const art = !b.art || b.art === "token" ? (role.keptIcon && !role.body ? { ...role.keptIcon, id: `kept:${role.keptIcon.id}` } : null) : b.art === "custom" ? svgIcon(spec.customSvg) : BACK_ORNAMENTS.includes(b.art) ? ornamentIcon(b.art) : null;
  const none = b.art === "none" || (!!b.art && b.art !== "token" && !art) || spec.style === "text";
  const style: TokenStyle = none ? "text" : !words.trim() || spec.style === "solo" ? "solo" : spec.style;
  return { role: { ...role, content: undefined, ...(none ? { body: "", d: [], iconKey: "none" } : {}) }, text: words, spec: { ...spec, style, ...(art ? { icon: art } : {}) } };
}

/** How much of the icon square a drawing made into an icon fills: as much as a game icon's picture, clear of a curved name. */
const ICON_FILL = 0.66;
/** Shapes (mm, y up; or SVG units, y down) as an icon: one path in the icon square, its box centred in it (ICON_FILL). */
function shapesIcon(id: string, shapes: THREE.Shape[], yDown: boolean): TokenIcon | null {
  if (!shapes.length) return null;
  const box = boundsOf(shapes), w = box.max.x - box.min.x, h = box.max.y - box.min.y, k = (TRACE_VIEW * ICON_FILL) / Math.max(w, h, 1e-6);
  const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, half = TRACE_VIEW / 2;
  const ring = (pts: THREE.Vector2[]) => pts.map((p, i) => `${i ? "L" : "M"}${(half + (p.x - cx) * k).toFixed(2)} ${(half + (yDown ? 1 : -1) * (p.y - cy) * k).toFixed(2)}`).join("") + "Z";
  const d = shapes.map((sh) => ring(sh.getPoints(48)) + sh.holes.map((hp) => ring(hp.getPoints(48))).join("")).join("");
  return { id, g: "", body: `<path fill-rule="evenodd" d="${d}"/>` };
}
const ornaments = new Map<string, TokenIcon | null>();
/** A back ornament (BACK_ORNAMENTS) as an icon, drawn at its size on a 45 mm coin. */
export function ornamentIcon(id: string): TokenIcon | null {
  if (!ornaments.has(id)) ornaments.set(id, shapesIcon(`ornament:${id}`, backDesign(id, 22.5) ?? [], false));
  return ornaments.get(id)!;
}
const svgIcons = new Map<string, TokenIcon | null>();
/** An uploaded SVG (the back's "custom") as an icon. */
function svgIcon(svg: string | null | undefined): TokenIcon | null {
  if (!svg) return null;
  const key = contentTag(svg);
  if (!svgIcons.has(key)) {
    let shapes: THREE.Shape[] = [];
    try { shapes = parseSvgShapes(svg); } catch { /* not one we can draw: no icon */ }
    svgIcons.set(key, shapesIcon(`custom:${key}`, shapes, true));
    if (svgIcons.size > 20) svgIcons.delete(svgIcons.keys().next().value!);
  }
  return svgIcons.get(key)!;
}

/**
 * A coin spec kept before its back was a face: a back design (OLD_BACKS) becomes a face that
 * says and shows the same (the edition's name, the ornament as its icon), in the design's colour.
 * What the face already set stays; a plain back ("none") stays plain.
 */
export function migrateBack<T extends SpecInput | undefined>(spec: T): T {
  if (!spec) return spec;
  // the clock without its border ("reloj", for a day) is Midnight: no drawing has a border now
  if (spec.back === "reloj") spec = { ...spec, back: "medianoche" };
  if (spec.backPattern?.id === "ill-reloj") spec = { ...spec, backPattern: { ...spec.backPattern, id: "ill-medianoche" as PatternId } };
  // a back face whose icon was one of the pictures (as it was for a day): the picture is its background now
  const art = spec.backFace?.art;
  if (art && BACK_ORNAMENTS.includes(art)) {
    spec = { ...spec, backFace: { ...spec.backFace, art: "none" }, ...(spec.backPattern ? {} : { backPattern: { id: `ill-${art}` as PatternId } }) };
  }
  if (spec.backMode && spec.backMode !== "design") return spec;
  const was = spec.back && OLD_BACKS[spec.back];
  if (!was) return spec;
  const b = spec.backFace ?? {}, gold = spec.colours?.back ?? DEFAULT_SPEC.colours.back;
  const ill = BACK_ORNAMENTS.includes(spec.back!) && !spec.backPattern ? { backPattern: { id: `ill-${spec.back}` as PatternId } } : {};
  // `back` stays as it was (a face's isn't read): a token's own change to plain is then a change from it
  return { ...spec, ...ill, backMode: "own", backFace: { ...was, ...b, colours: { front: gold, frame: gold, ...b.colours } } };
}
/** An illustration as an SVG path (y down) at radius r, for the choices' swatches. */
export function illustrationPath(id: PatternId, r: number) {
  return isIllustration(id) ? shapesToPath(backDesign(id.slice(4), r) ?? [], 0, 0, 24) : "";
}

/**
 * A two-state token's other state, as a character the engine draws like any front: the same
 * layout, frame, colours and size, with the other state's name and icon. Null for a token
 * without one, for a shape that has none (SHAPE_FEATURES.flip) and for a linked token (a
 * reminder), which is a token of its own. Its back is always a face (backFaceOf).
 */
export function flipFace(role: Role | null | undefined, spec: SpecInput | undefined): Role | null {
  const f = role?.flip;
  if (!f || !SHAPE_FEATURES[shapeOf(role)].flip || spec?.linked) return null;
  return { ...role, en: f.en, es: f.es, names: f.names ?? {}, fem: {}, body: f.body, g: f.g, d: undefined, icon: f.icon, author: f.author, iconKey: f.iconKey, flip: undefined, content: undefined, keptIcon: undefined, listNames: undefined };   // what the front carries isn't the other state's
}

/** A spec as its shape prints it: a card's or a ring's keeps only what it has (no back, magnet or
 *  layout), with its real size for `diameter`; a coin's is the spec, filled in, and a coin whose
 *  back is a face (backIsFace) has FACE_BACK for its back and its magnet hidden inside: a pocket
 *  would cut into the face. */
/**
 * A coin laid out for what its token carries: only its icon, the icon-only layout (a back of its own too);
 * only its name, the text-only one; both, any layout that shows both (the classic one for the others).
 * A linked token keeps its word.
 */
function withContent(role: Role | null | undefined, spec: TokenSpec): TokenSpec {
  const c = spec.reminder ? undefined : role?.content;
  if (!c) return spec;
  if (c === "both") return spec.style === "solo" || spec.style === "text" ? { ...spec, style: "classic", textSize: LAYOUT_TEXT_SIZE } : spec;
  // the front's only: a back without a layout of its own keeps the design's (its other state carries its own text and icon)
  // nothing (Plain): the icon's layout, the role without an icon (tokenRole): a plain face
  const style: TokenStyle = c === "icon" || c === "none" ? "solo" : "text";
  return { ...spec, style, ...(spec.backFace?.style ? {} : { backFace: { ...spec.backFace, style: spec.style }, ...(spec.backMode === "match" ? { backMode: "own" as const } : {}) }) };
}
const LAYOUT_TEXT_SIZE = DEFAULT_SPEC.textSize;
/** A card laid out for what its token carries: only its phrase, no icon; only its icon, the icon alone; both, the icon beside the phrase (at the left, unless the design puts it at the right). */
function cardContent(role: Role | null | undefined, spec: TokenSpec): TokenSpec {
  const c = spec.reminder ? undefined : role?.content;
  if (!c) return spec;
  const cardIcon = c === "text" ? "none" : c === "icon" ? "only" : spec.cardIcon === "right" ? "right" : "left";
  return { ...spec, cardIcon };
}
export function shapeSpec(role: Role | null | undefined, input: SpecInput | undefined): TokenSpec {
  const shape = shapeOf(role);
  if (shape === "card") return cardContent(role, cardSpec(input));
  if (shape === "ring") return ringSpec(input);
  if (shape === "base") return baseSpec(input);
  input = migrateBack(input);
  const spec = withContent(role, { ...DEFAULT_SPEC, ...input, colours: { ...DEFAULT_SPEC.colours, ...input?.colours } });
  if (!backIsFace(role, spec)) return spec;
  return { ...spec, back: FACE_BACK, customSvg: spec.backFace?.art === "custom" ? spec.customSvg : null, magnet: spec.magnet === "pocket" ? "hidden" : spec.magnet };
}

/**
 * A spec as the engine builds it. A window saved with the old "relief" finish (the icon
 * standing in a recessed window) becomes a window with its icon raised. In the window
 * style only a plain rim fits around the window (other frames would float over it).
 */
export function normalizeSpec(spec: TokenSpec): TokenSpec;
export function normalizeSpec(spec: SpecInput): SpecInput;
export function normalizeSpec(spec: SpecInput): SpecInput {
  if (spec?.style === "window" && spec.windowFinish && spec.windowFinish !== "flat") {
    spec = { ...spec, relief: { ...reliefOf(spec), icon: true } };
  }
  if (spec && "windowFinish" in spec) { spec = { ...spec }; delete spec.windowFinish; delete spec.windowDepth; }
  return migrateBack(spec);
}
function windowFrame(spec: TokenSpec) {
  spec = normalizeSpec(spec);
  if (spec.style !== "window" || spec.frame === "none") return spec;
  const rim = Math.max(1.6, spec.diameter * 0.045);
  return { ...spec, frame: "rim", frameWidth: Math.min(spec.frameWidth, rim - 0.6) };
}

/** A back design with the back's pattern (backPattern) added, in its colour. */
function withBackPattern(lib: Library, role: Role, geom: THREE.BufferGeometry | null, spec: TokenSpec) {
  const bp = backPattern(lib, role, spec);
  return bp ? merge([geom, extrude(cutShapes(bp), spec.depth, S(-1, 1, 1), 1)]) : geom;
}

export function buildToken(lib: Library, role: Role, input: SpecInput | undefined, text?: string | null): Token {
  if (isCard(role)) return buildCard(lib, role, input, text);
  if (isRing(role)) return buildRing(lib, role, input, text);
  if (isBase(role)) return buildTray(lib, role, input, text);
  let spec = windowFrame(shapeSpec(role, input));
  // A magnet may need a thicker coin.
  const need = magnetLayout(spec)?.minHeight ?? 0;
  if (spec.height < need) spec = { ...spec, height: need };
  const fit = fittingDepth(spec);
  spec = { ...spec, depth: fit.depth };
  text ??= roleName(role, spec.lang);
  const magnet = magnetLayout(spec);
  const extras: Pick<TokenParts, "magnet" | "hole" | "magnetBody" | "cavity"> = {
    magnet: magnet ? magnetCut(magnet) : null,
    // Preview only: the open pocket seen from the back.
    hole: magnet?.kind === "pocket" ? (() => {
      const g = new THREE.CylinderGeometry(magnet.radius, magnet.radius, 0.01, 64);
      g.rotateX(Math.PI / 2); g.translate(0, 0, -0.04); return g;
    })() : null,
  };
  if (magnet) {
    // Preview only (X-ray view): the magnet where it rests, and the outline of its hole.
    // It rests on the cavity floor as printed: the face side for face-down prints.
    const bottom = magnet.kind === "hidden" && magnet.faceUp ? magnet.z0 : magnet.z1 - magnet.mt;
    const body = new THREE.CylinderGeometry(magnet.md / 2, magnet.md / 2, magnet.mt, 48);
    body.rotateX(Math.PI / 2); body.translate(0, 0, bottom + magnet.mt / 2);
    extras.magnetBody = body;
    const hole = new THREE.CylinderGeometry(magnet.radius, magnet.radius, magnet.z1 - magnet.z0, 64);
    hole.rotateX(Math.PI / 2); hole.translate(0, 0, (magnet.z0 + magnet.z1) / 2);
    extras.cavity = new THREE.EdgesGeometry(hole, 20);
  }
  const colours: PartColours = { ...partColours(role, spec), hole: "#0b090c" };
  const frame = buildFrame(spec);
  // The face as this layout draws it: its name (and window), its icon and how the name came out.
  const window = spec.style === "window";
  const face = (who: Role, name: string, at?: Face, s = spec) => {
    if (s.style === "window") { const w = buildWindowFace(lib, who, name, s, at); return { name: merge([w.window, w.letters]), letters: w.letters, icon: w.icon, info: w.name }; }
    const f = buildFront(lib, who, name, s, at);
    return { name: f.geom, letters: f.geom, icon: f.icon, info: f.name };
  };
  const front = face(role, text);
  // Background patterns join the part whose colour they are (patternPart; the back's on the back).
  const fp = frontPattern(lib, role, spec, text), fpPart = fp ? patternPart(role, spec) : null;
  const fpRelief: ReliefPart = fpPart === "frame" ? "frame" : "text";
  const fpGeom = fp ? partExtrude(cutShapes(fp), spec, fpRelief, topFace(spec), T(0, 0, partZ(spec, fpRelief, topFace(spec))), 1) : null;
  const frontName = fpPart === "front" ? merge([front.name, fpGeom]) : front.name;
  const frameAll = fpPart === "frame" ? merge([frame, fpGeom]) : frame;
  // A back that is a face is drawn like a front on the bottom face (backFaceOf: the front again,
  // a face of its own or a two-state token's other state); any other back is its design.
  const bf = backFaceOf(role, spec, text);
  const backSpec = bf?.spec, backUp = !!backSpec && hasRelief(backSpec);
  const back = bf ? face(bf.role, bf.text, bottomFace(backUp), bf.spec) : null;
  // its frame, with the back's pattern (backFaceOf puts it in the face's spec, in the frame's colour)
  const bp = bf ? frontPattern(lib, bf.role, bf.spec, bf.text) : null, bface = bottomFace(backUp);
  const bpGeom = bp && backSpec ? partExtrude(cutShapes(bp), backSpec, "frame", bface, onFace(bface, T(0, 0, partZ(backSpec, "frame", bface))), 1) : null;
  const backFrame = backSpec ? merge([buildFrame(backSpec, bface), bpGeom]) : null;
  // The relief out of each face, per part (mm³): each raised element is a prism standing
  // `depth` into the coin and `relief` out of it, so that share of its volume.
  const R = reliefOf(spec), B = reliefOf(backSpec), r = reliefTop(spec), above = (g: THREE.BufferGeometry | null | undefined) => (g && r ? aboveOf.get(g) ?? geometryVolume(g) * r / (spec.depth + r) : 0);
  // The window's icon is in the coin colour, over the window; the classic one in the team
  // colour like the name. Either is its own part, raised or not; on a back face likewise.
  const iconColour = window ? colours.icon : colours.ink!;
  const backIconColour = backSpec?.style === "window" ? colours.icon : backSpec ? partColours(role, backSpec).ink! : iconColour;
  return {
    parts: {
      base: buildBase(spec), front: frontName, icon: front.icon || null, frame: frameAll,
      back: back ? back.name : withBackPattern(lib, role, buildBack(lib, role, text, spec), spec),
      ...(back ? { backIcon: back.icon || null, backFrame } : {}),
      ...extras,
    },
    colours: { ...colours, icon: iconColour, backIcon: backIconColour },
    name: front.info,
    ...(back ? { backName: back.info } : {}),
    spec,
    magnet,
    depthClamped: fit.clamped ? fit.max : null,
    above: {
      front: R.text ? above(fpPart === "front" ? frontName : front.letters) : 0, icon: R.icon ? above(front.icon) : 0, frame: R.frame ? above(frameAll) : 0,
      ...(back && hasRelief(backSpec) ? { back: B.text ? above(back.letters) : 0, backIcon: B.icon ? above(back.icon) : 0, backFrame: B.frame ? above(backFrame) : 0 } : {}),
    },
  };
}

// ---------------------------------------------------------------- 2D thumbnails

/**
 * Relief shading for the 2D picture: raised parts get a bevel (a light rim up-left, a dark rim
 * down-right) and cast a soft shadow down-right on the field, so relief in the coin's own colour
 * still reads, and two-tone relief looks raised. One filter per picture, only when something is
 * raised; its offsets are in mm (the picture's units). Each picture its own id, so a hidden one
 * never takes another's filter with it.
 */
let reliefIds = 0;
/** The coin's disc in the picture: a circle, or its toothed outline for a reeded edge. */
function coinSvg(spec: TokenSpec, fill: string) {
  const o = coinOutline(spec);
  if (!o) return `<circle r="${spec.diameter / 2}" fill="${fill}"/>`;
  return `<path fill="${fill}" d="M${o.map(([x, y]) => `${x.toFixed(2)} ${(-y).toFixed(2)}`).join("L")}Z"/>`;
}
function reliefFilter(id: string, bevel = 0) {
  const s = 0.32, sh = 0.42;
  if (bevel > 0) return bevelFilter(id, bevel, sh);
  return `<defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">`
    + `<feOffset in="SourceAlpha" dx="${sh}" dy="${sh}" result="o"/><feGaussianBlur in="o" stdDeviation="0.18" result="ob"/>`
    + `<feFlood flood-color="#000" flood-opacity=".6"/><feComposite in2="ob" operator="in" result="cast"/>`
    + `<feOffset in="SourceAlpha" dx="${s}" dy="${s}" result="dr"/><feComposite in="SourceAlpha" in2="dr" operator="out" result="ul"/>`
    + `<feFlood flood-color="#fff" flood-opacity=".55"/><feComposite in2="ul" operator="in" result="hi"/>`
    + `<feOffset in="SourceAlpha" dx="${-s}" dy="${-s}" result="ur"/><feComposite in="SourceAlpha" in2="ur" operator="out" result="lr"/>`
    + `<feFlood flood-color="#000" flood-opacity=".4"/><feComposite in2="lr" operator="in" result="lo"/>`
    + `<feMerge><feMergeNode in="cast"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hi"/><feMergeNode in="lo"/></feMerge></filter></defs>`;
}

/**
 * The relief shading of a bevelled relief: its sloped walls a soft band, lit up-left and shaded
 * down-right, as wide as the bevel (the slope of the part's blurred silhouette, so a stroke too
 * thin for a flat top shows rounded), and the same cast shadow. The flat top stays its colour.
 */
function bevelFilter(id: string, bevel: number, sh: number) {
  const blur = Math.max(0.12, bevel * 0.5), o = Math.max(0.1, bevel * 0.45), k = 2, s = 0.32;
  return `<defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">`
    + `<feOffset in="SourceAlpha" dx="${sh}" dy="${sh}" result="o"/><feGaussianBlur in="o" stdDeviation="0.18" result="ob"/>`
    + `<feFlood flood-color="#000" flood-opacity=".6"/><feComposite in2="ob" operator="in" result="cast"/>`
    // the slope: where the blurred silhouette rises toward the light, and where it falls away
    + `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur.toFixed(3)}" result="b"/>`
    + `<feOffset in="b" dx="${(-o).toFixed(3)}" dy="${(-o).toFixed(3)}" result="bu"/><feOffset in="b" dx="${o.toFixed(3)}" dy="${o.toFixed(3)}" result="bd"/>`
    + `<feComposite in="bu" in2="b" operator="arithmetic" k2="${k}" k3="${-k}" result="u"/>`
    + `<feComposite in="bd" in2="b" operator="arithmetic" k2="${k}" k3="${-k}" result="d"/>`
    // and a fine rim at the foot, so the outline stays crisp
    + `<feOffset in="SourceAlpha" dx="${s}" dy="${s}" result="dr"/><feComposite in="SourceAlpha" in2="dr" operator="out" result="ru"/>`
    + `<feOffset in="SourceAlpha" dx="${-s}" dy="${-s}" result="ur"/><feComposite in="SourceAlpha" in2="ur" operator="out" result="rd"/>`
    + `<feMerge result="up"><feMergeNode in="u"/><feMergeNode in="ru"/></feMerge><feComposite in="up" in2="SourceAlpha" operator="in" result="ul"/>`
    + `<feMerge result="dn"><feMergeNode in="d"/><feMergeNode in="rd"/></feMerge><feComposite in="dn" in2="SourceAlpha" operator="in" result="lr"/>`
    + `<feFlood flood-color="#fff" flood-opacity=".65"/><feComposite in2="ul" operator="in" result="hi"/>`
    + `<feFlood flood-color="#000" flood-opacity=".45"/><feComposite in2="lr" operator="in" result="lo"/>`
    + `<feMerge><feMergeNode in="cast"/><feMergeNode in="SourceGraphic"/><feMergeNode in="hi"/><feMergeNode in="lo"/></feMerge></filter></defs>`;
}

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);

/**
 * An SVG picture of the token's front (or back), in millimetres. Uses the font
 * family LETTERING.family (src/style.css loads it).
 */
export function tokenSvg(lib: Library, role: Role, input: SpecInput | undefined, { side = "front", text }: { side?: "front" | "back"; text?: string | null } = {}) {
  if (isCard(role)) return cardSvg(lib, role, input, side, text);
  if (isRing(role)) return ringSvg(lib, role, input, side, text);
  if (isBase(role)) return baseSvg(lib, role, input, side, text);
  const spec = windowFrame(shapeSpec(role, input));
  // a back that is a face: drawn as a front (a two-state token's other state with its own icon, not the token's)
  const bf = side === "back" ? backFaceOf(role, spec, text ?? roleName(role, spec.lang)) : null;
  if (bf) return tokenSvg(lib, bf.role, { ...bf.spec, back: "none", backMode: "design" }, { text: bf.text });
  const c = partColours(role, spec);
  const R = spec.diameter / 2;
  const label = text ?? roleName(role, spec.lang);
  const k = spec.diameter * spec.iconScale / TRACE_VIEW;
  // raised parts drawn with relief shading (reliefFilter); flat ones as they are
  const raised = side === "front" && hasRelief(spec) ? reliefOf(spec) : null, rid = raised ? `tfr${++reliefIds}` : "";
  const flatFrame = !!spec.reliefBevel && !BEVEL_FRAMES.has(String(spec.frame));
  const up = (part: ReliefPart, svg: string) => (raised?.[part] && svg ? `<g filter="url(#${rid}${part === "frame" && flatFrame ? "s" : ""})">${svg}</g>` : svg);
  let body = "";
  if (side === "front" && spec.style === "window") {
    const W = windowLayout(lib, label, spec);
    const I = windowIconMatrix(lib, role, W, 0, spec);
    const d = windowPoints(W.Rw, W.cutY).map((pt, i) => `${i ? "L" : "M"}${pt.x.toFixed(2)} ${(-pt.y).toFixed(2)}`).join("") + "Z";
    body += `<path d="${d}" fill="${c.front}"/>`;
    body += up("icon", `<g fill="${c.base}" transform="translate(0 ${(-I.cy).toFixed(3)}) scale(${I.k.toFixed(5)}) translate(${(-I.bcx).toFixed(3)} ${(-I.bcy).toFixed(3)})"><g transform="${iconOf(role, spec).g}">${iconOf(role, spec).body}</g></g>`);
    // The name as outlines from the same font as the 3D model, so both always match.
    let name = "";
    for (const line of W.lines) {
      const shapes = lib.font.generateShapes(line.text, W.em);
      const box = boundsOf(shapes), dx = -(box.min.x + box.max.x) / 2;
      name += `<path fill="${c.front}" fill-rule="evenodd" d="${shapesToPath(shapes, dx, line.y)}"/>`;
    }
    body += up("text", name);
    if (spec.frame !== "none") body += up("frame", `<circle r="${(faceRadius(spec) - frameInsetOf(spec) - spec.frameWidth / 2).toFixed(2)}" fill="none" stroke="${c.frame}" stroke-width="${spec.frameWidth}"/>`);
  } else if (side === "front") {
    const icon = spec.style === "text" ? null : iconOf(role, spec);
    if (spec.style === "text" || !icon) {
      // the words alone, straight, in the middle
      const TL = textLayout(lib, label, spec);
      body += up("text", TL.lines.map((line) => { const shapes = textShapes(lib, line.text, TL.em), box = boundsOf(shapes); return `<path fill="${c.front}" fill-rule="evenodd" d="${shapesToPath(shapes, -(box.min.x + box.max.x) / 2, line.y)}"/>`; }).join(""));
    } else if (fitsIcon(spec)) {
      const f = fittedIcon(lib, role, spec, label);
      body += up("icon", `<g fill="${c.ink}" transform="${f.dy ? `translate(0 ${(-f.dy).toFixed(3)}) ` : ""}scale(${f.k.toFixed(5)}) translate(${(-f.cx).toFixed(3)} ${(-f.cy).toFixed(3)})"><g transform="${icon.g}">${icon.body}</g></g>`);
    } else {
      body += up("icon", `<g fill="${c.ink}" transform="translate(0 ${-(spec.iconOffsetY || 0)}) scale(${k}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})"><g transform="${icon.g}">${icon.body}</g></g>`);
    }
    const L = arcName(lib, label, spec);
    // SVG y points down: angle a in engine space is -a on screen.
    if (L) for (const turn of nameTurns(spec)) {
      let letters = "";
      L.chars.forEach((ch, i) => {
        if (ch === " ") return;
        const a = L.angles[i];
        const x = L.radius * Math.cos((a * Math.PI) / 180), y = -L.radius * Math.sin((a * Math.PI) / 180);
        letters += letterSvg(lib, ch, x, y, -(a + 90), L.em, c.front);
      });
      body += up("text", turn ? `<g transform="rotate(180)">${letters}</g>` : letters);
    }
    const fd = frameDesign(spec);
    if (fd) body += up("frame", `<path fill="${c.frame}" fill-rule="nonzero" d="${shapesToPath(fd.shapes, 0, 0, 48)}"/>`);
    const fp = frontPattern(lib, role, spec, label);
    if (fp) { const part = patternPart(role, spec); body += up(part === "frame" ? "frame" : "text", `<path fill="${c[part]}" fill-rule="evenodd" d="${cutPath(fp)}"/>`); }
  } else {
    const back = ({ seal: "Seal", clock: "Clock", rings: "Rings", name: "Name", custom: "Custom" } as Record<string, string | undefined>)[spec.back];
    const designed = backDesign(spec.back, R);
    if (designed) body += `<path fill="${c.back}" fill-rule="nonzero" d="${shapesToPath(designed, 0, 0, 48)}"/>`;
    const custom = spec.back === "custom" ? customBackPath(spec) : "";
    if (custom) body += `<path fill="${c.back}" fill-rule="nonzero" d="${custom}"/>`;
    const ed = spec.back === "edition" ? editionBack(lib, role, spec) : null;
    const pocket = magnetLayout(spec);
    if (pocket?.kind === "pocket") body += `<circle r="${pocket.radius.toFixed(2)}" fill="#0b090c" opacity=".85"/>`;
    if (ed) body += `<path fill="${c.back}" fill-rule="evenodd" d="${shapesToPath(ed, 0, 0, 48)}"/>`;
    const bp = backPattern(lib, role, spec);
    if (bp) body += `<path fill="${c.back}" fill-rule="evenodd" d="${cutPath(bp)}"/>`;
    if (spec.back === "seal" && lib.sealSvg) body += `<g fill="${c.back}" transform="scale(${spec.diameter / TRACE_VIEW}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})">${lib.sealSvg.replace(/^[\s\S]*?<g /, "<g ").replace(/fill="#000000"/, "").replace(/<\/svg>\s*$/, "")}</g>`;
    else if (back && !designed && !custom) body += `<text y="1.5" text-anchor="middle" font-size="5" fill="${c.back}" font-family="${LETTERING.family}">${esc(back === "Name" ? label.toUpperCase() : back.toUpperCase())}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - 0.5} ${-R - 0.5} ${spec.diameter + 1} ${spec.diameter + 1}" role="img" aria-label="${esc(label)} token">${raised ? reliefFilter(rid, spec.reliefBevel) + (flatFrame ? reliefFilter(rid + "s") : "") : ""}${coinSvg(spec, c.base)}${body}</svg>`;
}

/** Offers a file to the viewer: claude.ai's downloads capability, or a plain download. */
export async function saveFile(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return { status: "saved" };
}
