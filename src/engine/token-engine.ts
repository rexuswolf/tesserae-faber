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
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { Font } from "three/addons/loaders/FontLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type {
  Role, Team, Hex, ColourRef, TokenSpec, SpecInput, TokenStyle, Relief, ReliefPart, Library, Glyph,
  PartColours, TokenParts, Token, MagnetLayout, TokenIcon, TokenShape, FaceField, BackFace, RingSeparator, AutoText,
  PatternId, PatternSpec, PartName,
} from "../types.ts";

export { THREE };

const TRACE_VIEW = 127.559055; // potrace viewBox; traced to a 45 mm square
const TRACE_MM = 45;

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
  { id: "medallon", label: "Medallion" },
  { id: "custom", label: "Your SVG" },
];

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
export const TOKEN_STYLES: { id: TokenStyle }[] = [{ id: "classic" }, { id: "window" }, { id: "solo" }, { id: "double" }];

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
  back: "none",
  backMode: "design",     // the back is the design above, or a face (see BackMode)
  customSvg: null,
  ringBase: "25",
  separator: "dot",
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
export const roleName = (role: Role, lang: string): string => role.names?.[lang] || (role as unknown as Partial<Record<string, string>>)[lang] || role.en;

/** Resolves "team" colour references: the token's own colour, else its team's (its group's). */
export function partColours(role: Role, spec: SpecInput): PartColours {
  const team = role.colour ?? TEAMS[role.team].colour;
  const c = { ...DEFAULT_SPEC.colours, ...spec.colours };
  const pick = (v: ColourRef): Hex => (v === "team" ? team : v);
  // A back that is a face is a second front, in its colours (the back colour is for back designs).
  const face = spec.back === FACE_BACK ? backColours(spec) : null;
  return { base: pick(c.base), front: pick(c.front), icon: pick(c.base), frame: pick(c.frame), back: pick(face?.front ?? c.back), backIcon: pick(c.base), backFrame: pick(face?.frame ?? c.frame) };
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

/** Extrudes 2D shapes and applies a matrix, keeping triangles outward-facing. */
function extrude(shapes: THREE.Shape[], depth: number, matrix: THREE.Matrix4, curveSegments = 5) {
  if (!shapes.length) return null;
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments });
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
  return parts.length ? mergeGeometries(parts) : null;
};

const M = () => new THREE.Matrix4();
const T = (x: number, y: number, z: number) => M().makeTranslation(x, y, z);
const S = (x: number, y: number, z: number) => M().makeScale(x, y, z);
const RZ = (a: number) => M().makeRotationZ(a);
const chain = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), M());

function circleShape(r: number, segments = 96) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}
function ringShape(rOuter: number, rInner: number) {
  const s = circleShape(rOuter);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  s.holes.push(hole);
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
    const a = (angles[i] * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);   // outward
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

/**
 * Edition back: the edition's full name (a homebrew character's: its script's) in the centre, one word per line, as
 * large as fits inside a fine double rim, with a small star above and below.
 * Filled shapes in coin coordinates (mm, y up), shared by the 3D model and 2D.
 */
function editionBack(lib: Library, role: Role, spec: TokenSpec) {
  // a script's own (homebrew) characters carry their script's name instead
  const ed: Edition | null = EDITIONS[role.edition] ?? (role.editionName ? { name: { en: role.editionName } } : null);
  if (!ed) return null;
  const R = spec.diameter / 2, out = R - 0.7;
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
function iconOf(role: Role, spec?: SpecInput) {
  const own = spec?.icon;
  // keyed by id: a script's own character can share an official one's name
  return own?.body ? { key: `icon:${own.id}`, g: own.g, body: own.body } : { key: role.iconKey ?? role.id ?? role.en, g: role.g, body: iconMarkup(role) };
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
  if (spec.style === "solo") return null;
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
  if (auto) return fittedAutoIcon(lib, spec, text, shapes, o, auto, iconOf(role, spec).key);
  const key = [iconOf(role, spec).key, text, spec.style, spec.diameter, spec.textSize, spec.spacing, spec.margin, spec.maxArc, spec.frame, spec.frameWidth].join("|");
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
  const key = ["auto", iconKey, text, spec.diameter, spec.textSize, spec.spacing, spec.margin, spec.maxArc, spec.frame, spec.frameWidth, auto.cap, auto.arc, auto.icon, auto.maxArc].join("|");
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
  let icon;
  if (fitsIcon(spec)) {
    const f = fittedIcon(lib, role, spec, text);
    icon = extrude(f.shapes, faceHeight(spec, "icon", face), onFace(face, chain(T(0, f.dy, iconZ), S(f.k, -f.k, 1), T(-f.cx, -f.cy, 0))));
  } else {
    icon = extrude(iconShapes(lib, role, spec), faceHeight(spec, "icon", face), onFace(face, tracedMatrix(spec.diameter * spec.iconScale, iconZ, false, spec.iconOffsetY || 0)));
  }
  const L = arcName(lib, text, spec);
  const letters = L ? nameTurns(spec).flatMap((turn) => L.chars.map((c, i) => {
    if (c === " ") return null;
    const g = glyph(lib, c);
    const a = THREE.MathUtils.degToRad(L.angles[i]);
    return extrude(g.shapes, faceHeight(spec, "text", face), onFace(face, chain(RZ(turn),
      T(L.radius * Math.cos(a), L.radius * Math.sin(a), top),
      RZ(a + Math.PI / 2), S(L.em, L.em, 1), T(-g.center, 0, 0))), 4);
  })) : [];
  // no name ("solo"): nothing to be too small
  return { geom: merge(letters), icon, name: L ?? { letterHeight: Infinity, scale: 1, total: 0 } };
}

function buildFrame(spec: TokenSpec, face = topFace(spec)) {
  const design = frameDesign(spec);
  if (!design) return null;
  return extrude(design.shapes, faceHeight(spec, "frame", face), onFace(face, T(0, 0, partZ(spec, "frame", face))), 24);
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
    case "medallon":
      return extrude(medallionBack(lib, role, spec), d, chain(mirror), 32);
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
function shapesToPath(shapes: THREE.Shape[], dx: number, y: number, div = 6) {
  const ring = (pts: THREE.Vector2[]) => pts.map((pt, i) => `${i ? "L" : "M"}${(pt.x + dx).toFixed(2)} ${(-(pt.y + y)).toFixed(2)}`).join("") + "Z";
  return shapes.map((sh) => ring(sh.getPoints(div)) + sh.holes.map((h) => ring(h.getPoints(div))).join("")).join("");
}

/** Matrix that fits the role's icon into the window (from its SVG coordinates). */
function windowIconMatrix(lib: Library, role: Role, W: WindowLayout, z: number, spec: TokenSpec) {
  const shapes = iconShapes(lib, role, spec);
  const box = boundsOf(shapes), size = new THREE.Vector2(); box.getSize(size);
  const h = W.icon.top - W.icon.bottom;
  const k = Math.min((2 * W.icon.halfWidth) / Math.max(size.x, 1e-6), h / Math.max(size.y, 1e-6)) * (spec.iconScale || 1);
  const cy = (W.icon.top + W.icon.bottom) / 2;
  const bcx = (box.min.x + box.max.x) / 2, bcy = (box.min.y + box.max.y) / 2;
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
 * front's are all flush, and a two-state token's other state under a back design is always flush.
 * The workshop never lets both be raised; this is the rule should a design say otherwise.
 */
export function backRelief(spec: SpecInput): Relief {
  if (spec.back !== FACE_BACK || (spec.backMode !== "match" && spec.backMode !== "own") || hasRelief(spec)) return FLAT;
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
    const shapes = lib.font.generateShapes(line.text, W.em);
    const box = boundsOf(shapes);
    return extrude(shapes, faceHeight(spec, "text", face), onFace(face, T(-(box.min.x + box.max.x) / 2, line.y, partZ(spec, "text", face))), 4);
  });
  return {
    window, letters: merge(letters),
    icon: extrude(I.shapes, faceHeight(spec, "icon", face), onFace(face, I.m), 5),
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
function disc(r: number, x = 0, y = 0) { const sh = new THREE.Shape(); sh.absarc(x, y, r, 0, TAU, false); return sh; }
function annulus(rOut: number, rIn: number, x = 0, y = 0) {
  const sh = disc(rOut, x, y);
  const hole = new THREE.Path(); hole.absarc(x, y, rIn, 0, TAU, true);
  sh.holes.push(hole);
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
const FRAME_INSET = 0;
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

/** Filled shapes for the front frame and its inner edge, or null for none. */
export function frameDesign(spec: TokenSpec): { shapes: THREE.Shape[]; inner: number } | null {
  const R = spec.diameter / 2, w = spec.frameWidth, out = R - FRAME_INSET, edge = out - w;
  const rim = edgeRing(out, edge, coinSegments());
  let sh: THREE.Shape[] = [rim], inner = edge;
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
      // Rune-like marks (made up, no real alphabet) between the rim and a thin inner ring.
      const r0 = edge - 0.5, r1 = edge - 2.0, rIn = r1 - 0.5, n = Math.round((TAU * edge) / 3.2), w = 0.5;
      const bar = (p: THREE.Vector2, q: THREE.Vector2) => { const d = q.clone().sub(p).normalize(), nn = new THREE.Vector2(-d.y, d.x).multiplyScalar(w / 2);
        return polygon([p.clone().add(nn), q.clone().add(nn), q.clone().sub(nn), p.clone().sub(nn)]); };
      const da = 0.55 / edge;                                   // ~0.55 mm either side of a mark's axis
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n, A = (r: number, k: number) => pt(r, a + k * da), mid = (r0 + r1) / 2;
        const marks = [[[A(r0, 0), A(r1, 0)], [A(r0, 0), A(mid, 1.4)]], [[A(r0, -1), A(r1, -1)], [A(r0, 1), A(r1, 1)], [A(mid, -1), A(mid, 1)]],
          [[A(r0, -1), A(r1, 1)], [A(r0, 1), A(r1, -1)]], [[A(r0, -1), A(r1, 0)], [A(r1, 0), A(r0, 1)]]][i % 4];
        for (const [p, q] of marks) sh.push(bar(p, q));
      }
      sh.push(annulus(r1 - 0.05, rIn)); inner = rIn;
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

// Same winding for every outline (ccw), so overlapping hands and hub merge in 2D.
function backShapes(id: string, R: number): THREE.Shape[] | null {
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
        else sh.push(sparkle(...ptXY(out - 4.1, a), 0.9, 0.38, a));
      }
      const moonY = out - 5.45;                                   // crescent at XII, ~0.45 mm below the ring
      sh.push(crescent(0, moonY, 2.3, 1.06, moonY + 0.55, 1.96));
      const minute = Math.PI / 2 + (5 * TAU) / 60, hour = Math.PI / 2 + (0.08 * TAU) / 12;
      sh.push(taper(-2.6, R * 0.6, minute, 1.8, 0.6), taper(-2.0, R * 0.38, hour, 2.6, 0.9), disc(1.7), annulus(2.7, 2.15));
      return sh;
    }
    case "guilloche": {
      // Engraved lace: interlocking rings around the centre, framed by a double rim.
      const sh = [annulus(out, out - 0.6), annulus(out - 1.3, out - 1.8)];
      const n = 16, c = R * 0.34, r = R * 0.36;
      for (let i = 0; i < n; i++) sh.push(annulus(r, r - 0.5, ...ptXY(c, (i * TAU) / n)));
      sh.push(annulus(R * 0.2, R * 0.2 - 0.5), disc(1.2));
      return sh;
    }
    case "rosa": {
      // Sixteen-point compass rose inside a ring of beads.
      const sh = [annulus(out, out - 0.6), ...beads(out - 1.4, 48, 0.3)];
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
    case "orbitas": {
      // A rayed sun, three orbits with their planets (the middle one ringed), in a beaded rim.
      const sh = [annulus(out, out - 0.6), ...beads(out - 1.4, 48, 0.3), disc(R * 0.13)];
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
];
const PATTERN_IDS = new Set(PATTERNS.map((p) => p.id));
/** The thinnest line, gap or piece a pattern prints (mm): about a nozzle's width and a half. */
export const PATTERN_MIN = 0.6;
/** The halo of coin colour round what sits on a pattern (mm), unless the pattern sets its own. */
export const PATTERN_HALO = 0.8;
/** A harlequin rhombus's height to its width. */
const HARLEQUIN = 1.6;
/** The grid the cut is worked out on (mm), and how far inside the coin's edge a pattern stops. */
const PATTERN_GRID = 0.05, PATTERN_EDGE = 0.7;
/** The back medallion's ring, as a share of the coin's radius (its outer edge). */
export const MEDALLION = 0.5;

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
export const patternDefaults = (id: PatternId) => (id === "damero-rombos" ? { scale: 3, line: 0.7, halo: PATTERN_HALO } : { scale: 3.2, line: PATTERN_MIN, halo: PATTERN_HALO });

/**
 * A pattern as a signed distance (mm, positive inside), centred on the coin, and how wide its
 * lines (or cells) and the gaps between them come out. `scale` is a rhombus's width, its height
 * HARLEQUIN times that.
 */
function patternField(p: PatternSpec) {
  const cells = p.id === "damero-rombos", d = patternDefaults(p.id);
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
function traceField(F: Float32Array, W: number, H: number, x0: number, y0: number, px: number): Ring[] {
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
    if (loop.length >= 3) loops.push(simplifyLoop(loop, 0.008));
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
 * A pattern over a coin of radius R, behind `ink` (what sits on it) and `solid` (what sits on it
 * as a silhouette: the icon, its holes and what it walls in filled; see fillSolid): the pattern
 * where it is at least the halo away from them and PATTERN_EDGE inside the coin's edge, opened so
 * nothing in it is thinner than PATTERN_MIN, pieces smaller than that left out.
 */
function cutPattern(p: PatternSpec, R: number, ink: Ring[], solid: Ring[] = []): PatternCut {
  const P = patternField(p), halo = Math.max(PATTERN_MIN, p.halo ?? PATTERN_HALO), px = PATTERN_GRID, rho = PATTERN_MIN / 2;
  const x0 = -R - 2 * px, W = Math.ceil((2 * R + 4 * px) / px) + 1, H = W, N = W * H;
  const inkSet = new Uint8Array(N);
  rasterise(ink, inkSet, W, H, x0, x0, px);
  if (solid.length) fillSolid(solid, inkSet, W, H, x0, px, halo);
  const dInk = distanceTransform(inkSet, W, H);
  const F = new Float32Array(N), core = new Uint8Array(N), rOut = R - PATTERN_EDGE;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i * px, y = x0 + j * px, k = j * W + i;
    const f = Math.min(P.sdf(x, y), dInk[k] * px - halo - px, rOut - Math.hypot(x, y));   // less a cell: the ink may reach that far past a cell centre
    F[k] = f;
    if (f > rho - px / 2) core[k] = 1;                 // eroded by half the least width
  }
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
  const fd = frameDesign(spec);
  if (fd) ink.push(...ringsOf(fd.shapes, undefined, 24));
  return { ink, solid };
}

/**
 * What a back design draws over the back's pattern (mm, as seen with the coin turned over), each
 * shape's holes filled but for a ring's (a hole most of its outline: the pattern runs inside a
 * medallion's ring, not inside a letter or a moon).
 */
function backInk(lib: Library, role: Role, spec: TokenSpec): Ring[] {
  const shapes = spec.back === "medallon" ? medallionBack(lib, role, spec) : spec.back === "edition" ? editionBack(lib, role, spec) : backDesign(spec.back, spec.diameter / 2);
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
    spec.frame, spec.frameWidth, spec.iconScale, spec.iconOffsetY, JSON.stringify(spec.autoText ?? null)].join("|");
  return cached(key, () => { const { ink, solid } = frontInk(lib, role, spec, text); return cutPattern(p, spec.diameter / 2, ink, solid); });
}

/** The back's pattern, behind its design; null for none (or a back that is a face). */
function backPattern(lib: Library, role: Role, spec: TokenSpec): PatternCut | null {
  const p = spec.backPattern;
  if (!p || !PATTERN_IDS.has(p.id) || spec.back === FACE_BACK || !SHAPE_FEATURES[shapeOf(role)].pattern) return null;
  const ed = EDITIONS[role.edition] ? role.edition : role.editionName ?? "";
  const key = ["back", JSON.stringify(p), spec.back, spec.back === "custom" ? spec.customSvg : "", ed, spec.lang, spec.diameter].join("|");
  return cached(key, () => cutPattern(p, spec.diameter / 2, backInk(lib, role, spec)));
}

/** The front part the pattern joins: the frame's or the name's, whichever has its colour (the frame's if neither). */
function patternPart(role: Role, spec: TokenSpec): "frame" | "front" {
  const c = spec.frontPattern?.colour ?? "frame";
  if (c === "frame" || c === "front") return c;
  const pc = partColours(role, spec), want = c === "team" ? role.colour ?? TEAMS[role.team].colour : c;
  return pc.frame === want ? "frame" : pc.front === want ? "front" : "frame";
}

const v2 = (q: Poly) => q.map(([x, y]) => new THREE.Vector2(x, y));
const cutShapes = (cut: PatternCut) => cut.rings.map((r) => { const sh = new THREE.Shape(v2(r.outer)); sh.holes = r.holes.map((h) => new THREE.Path(v2(h))); return sh; });
/** SVG path data for a pattern (fill-rule evenodd), flipped to SVG's y-down. */
const cutPath = (cut: PatternCut) => cut.rings.flatMap((r) => [r.outer, ...r.holes]).map((q) => q.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(3)} ${(-y).toFixed(3)}`).join("") + "Z").join("");

/**
 * Medallion back: a fine rim, and a medallion in the centre (its own fine ring) with a crescent
 * moon and the edition's name (a homebrew character's: its script's) along its lower edge.
 */
function medallionBack(lib: Library, role: Role, spec: TokenSpec) {
  const R = spec.diameter / 2, out = R - 0.7, rm = R * MEDALLION;
  const shapes: THREE.Shape[] = [annulus(out, out - 0.6), annulus(rm, rm - 0.6)];
  const ed: Edition | null = EDITIONS[role.edition] ?? (role.editionName ? { name: { en: role.editionName } } : null);
  const base = rm - 0.6 - 0.7;                          // the name's baseline, 0.7 mm inside the ring
  if (ed) {
    const chars = [...(ed.name[spec.lang] || ed.name[spec.lang?.split("-")[0]] || ed.name.en).toUpperCase()];
    const P = placeName(lib, chars, Math.min(2.6, rm * 0.24) / lib.capHeight, base, 1.1, 220), em = (Math.min(2.6, rm * 0.24) / lib.capHeight) * P.scale;
    chars.forEach((ch, i) => {
      if (ch === " ") return;
      const g = glyph(lib, ch), a = (P.angles[i] * Math.PI) / 180, c = Math.cos(a + Math.PI / 2), s = Math.sin(a + Math.PI / 2);
      const move = (pts: THREE.Vector2[]) => pts.map((q) => { const x = (q.x - g.center) * em, y = q.y * em; return new THREE.Vector2(base * Math.cos(a) + x * c - y * s, base * Math.sin(a) + x * s + y * c); });
      for (const sh of g.shapes) { const o = new THREE.Shape(move(sh.getPoints(6))); o.holes = sh.holes.map((hp) => new THREE.Path(move(hp.getPoints(6)))); shapes.push(o); }
    });
  }
  const mr = rm * 0.45, cy = rm * 0.14;
  shapes.push(crescent(-mr * 0.12, cy, mr, mr * 0.25, cy + mr * 0.2, mr * 0.88));
  shapes.push(sparkle(mr * 0.32, cy + mr * 0.12, Math.min(1.5, mr * 0.3), Math.min(0.5, mr * 0.1)));
  return shapes;
}

/**
 * What a token's pattern on one side came out as, measured on its outlines: how many pieces, the
 * line's width (the cells' across), the gap between lines (cells), the halo, the smallest piece
 * kept (mm across) and the least room (mm) between the pattern and what sits on it. Null with none.
 */
export function patternReport(lib: Library, role: Role, input: SpecInput | undefined, side: "front" | "back" = "front") {
  if (shapeOf(role) !== "coin") return null;
  const spec = windowFrame(shapeSpec(role, input)), text = roleName(role, spec.lang);
  const cut = side === "front" ? frontPattern(lib, role, spec, text) : backPattern(lib, role, spec);
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
  if (isCard(role)) return cardLayout(lib, text, cardSpec(input)).cap;
  if (isRing(role)) return ringLayout(lib, text, ringSpec(input)).letterHeight;
  const spec = windowFrame({ ...DEFAULT_SPEC, ...input, colours: { ...DEFAULT_SPEC.colours, ...input?.colours } });
  const front = spec.style === "window" ? windowLayout(lib, text, spec).cap
    : arcName(lib, text, spec)?.letterHeight ?? Infinity;   // "solo" has no name to be too small
  // a two-state token's smaller name, of its two
  const other = flipFace(role, spec);
  return other ? Math.min(front, nameLetterHeight(lib, input, roleName(other, spec.lang))) : front;
}

// ---------------------------------------------------------------- info cards

/**
 * The grimoire's info tokens ("This is the Demon"…) are rounded cards, not coins: a body
 * in the coin colour, the phrase and the set's frame as flush inlays, printed face-down
 * like the classic coins. Roles with kind "info" are drawn this way.
 */
export const CARD = { w: 85, h: 55, r: 4 };
const CARD_PAD = 7, CARD_MAX_CAP = 8, CARD_PITCH = 1.6, CARD_FRAME_INSET = 1.2;
export const isCard = (role: Role | null | undefined) => role?.kind === "info";

/** A card's spec: the set's colours, frame, height and depth; no style, back or magnet of its own. */
export function cardSpec(spec: SpecInput | undefined): TokenSpec {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec?.colours } };
  // `diameter` is the card's long side, so the 3D view frames it like a coin that size.
  return { ...s, style: "classic", relief: DEFAULT_SPEC.relief, back: "none", magnet: "none", diameter: CARD.w, depth: Math.min(s.depth, s.height - 0.4) };
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** The phrase in up to 3 balanced lines, at the biggest letters that fit inside the padding. */
export function cardLayout(lib: Library, text: string | null | undefined, spec: TokenSpec) {
  const words = (text || "").toUpperCase().trim().split(/\s+/).filter(Boolean);
  const width = (line: string) => { const b = boundsOf(lib.font.generateShapes(line, 1)); return b.max.x - b.min.x; };
  const W = CARD.w - 2 * CARD_PAD, H = CARD.h - 2 * CARD_PAD;
  let best: { em: number; lines: string[] } | null = null;
  // every way to cut the words into 1–3 lines
  const splits = (n: number, k: number): number[][] => (k === 1 ? [[n]] : Array.from({ length: n - k + 1 }, (_, i) => i + 1).flatMap((a) => splits(n - a, k - 1).map((r) => [a, ...r])));
  for (let k = 1; k <= Math.min(3, words.length || 1); k++) {
    for (const sizes of splits(Math.max(1, words.length), k)) {
      let at = 0;
      const lines = sizes.map((n) => { const l = words.slice(at, at + n).join(" "); at += n; return l; });
      const em = Math.min(W / Math.max(...lines.map(width), 1e-6), (CARD_MAX_CAP / lib.capHeight),
        H / (lib.capHeight * (1 + (k - 1) * CARD_PITCH)));
      if (!best || em > best.em + 1e-6) best = { em, lines };
    }
  }
  const fit = best!;
  const cap = fit.em * lib.capHeight, pitch = cap * CARD_PITCH, total = cap + (fit.lines.length - 1) * pitch;
  return { em: fit.em, cap, lines: fit.lines.map((l, i) => ({ text: l, y: total / 2 - cap - i * pitch })) };
}

/** How far each arm of a corner bracket ("corners") runs along the card's edge (mm). */
const CARD_CORNER_ARM = 11;
/** A card's frame width, as it prints. */
const cardFrameWidth = (spec: TokenSpec) => Math.min(Math.max(spec.frameWidth, 0.4), 2);
/**
 * A card's frame as filled shapes: a line inside the edge ("rim", or any design: a card's frame is a
 * line), or "corners", only its corners: an L along each corner of that line, the frame's width,
 * with a dot inside it, like old playing cards. None for "none".
 */
function cardFrameShapes(spec: TokenSpec): THREE.Shape[] | null {
  if (spec.frame === "none") return null;
  const fw = cardFrameWidth(spec), i = CARD_FRAME_INSET;
  if (spec.frame === "corners") return cardCorners(fw);
  const outer = roundedRect(CARD.w - 2 * i, CARD.h - 2 * i, CARD.r - i);
  outer.holes.push(roundedRect(CARD.w - 2 * (i + fw), CARD.h - 2 * (i + fw), Math.max(0.5, CARD.r - i - fw)));
  return [outer];
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

function buildCard(lib: Library, role: Role, input: SpecInput | undefined, text?: string | null): Token {
  const spec = cardSpec(input);
  text ??= roleName(role, spec.lang);
  const H = spec.height, d = spec.depth;
  const L = cardLayout(lib, text, spec);
  const letters = L.lines.map((line) => {
    const shapes = lib.font.generateShapes(line.text, L.em), box = boundsOf(shapes);
    return extrude(shapes, d, T(-(box.min.x + box.max.x) / 2, line.y, H - d), 4);
  });
  const frame = cardFrameShapes(spec);
  return {
    parts: { base: extrude([roundedRect(CARD.w, CARD.h, CARD.r)], H, T(0, 0, 0), 16), front: merge(letters), frame: frame ? extrude(frame, d, T(0, 0, H - d), 16) : null, back: null },
    colours: { ...partColours(role, spec), hole: "#0b090c" },
    name: { letterHeight: L.cap, scale: 1, total: null, lines: L.lines.length },
    spec, magnet: null, depthClamped: null, card: true, foot: { w: CARD.w, h: CARD.h },
  };
}

function cardSvg(lib: Library, role: Role, input: SpecInput | undefined, side: "front" | "back", text?: string | null) {
  const spec = cardSpec(input);
  const c = partColours(role, spec), label = text ?? roleName(role, spec.lang);
  const { w, h, r } = CARD;
  let body = "";
  if (side === "front") {
    const L = cardLayout(lib, label, spec);
    for (const line of L.lines) {
      const shapes = lib.font.generateShapes(line.text, L.em), box = boundsOf(shapes);
      body += `<path fill="${c.front}" fill-rule="evenodd" d="${shapesToPath(shapes, -(box.min.x + box.max.x) / 2, line.y)}"/>`;
    }
    const fw = cardFrameWidth(spec), i = CARD_FRAME_INSET + fw / 2;
    if (spec.frame === "corners") body += `<path fill="${c.frame}" d="${shapesToPath(cardCorners(fw), 0, 0, 16)}"/>`;
    else if (spec.frame !== "none") body += `<rect x="${-w / 2 + i}" y="${-h / 2 + i}" width="${w - 2 * i}" height="${h - 2 * i}" rx="${Math.max(0.5, r - i)}" fill="none" stroke="${c.frame}" stroke-width="${fw}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2 - 0.5} ${-h / 2 - 0.5} ${w + 1} ${h + 1}" role="img" aria-label="${esc(label)}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${r}" fill="${c.base}"/>${body}</svg>`;
}

// ---------------------------------------------------------------- condition rings

/**
 * Condition rings (a collection's types of shape "ring") are flat rings that slip over a
 * miniature's base, the token's name running all the way round, repeated with a dot between,
 * so it reads from any side of the table. A fine line runs along each edge (as the coin's rim
 * does) when the design has a frame. They print like the coins: the body in the coin colour, the letters, dots
 * and lines as inlays (flush or raised); no icon, back or magnet. Roles with kind "ring".
 */
export const RING_BASES = ["25", "32", "40"];
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
    return extrude(g.shapes, inlayHeight(spec, "text"), chain(T(L.base * Math.cos(r), L.base * Math.sin(r), top), RZ(r - Math.PI / 2), S(L.em, L.em, 1), T(-g.center, 0, 0)), 4);
  });
  const dots = L.sep === "dot" ? extrude(L.dots.map((a) => disc(L.dot, ...ptXY(L.mid, THREE.MathUtils.degToRad(a)))), inlayHeight(spec, "text"), T(0, 0, top), 8)
    : L.sep === "none" ? null : extrude(ringMarks(L), inlayHeight(spec, "text"), T(0, 0, top), 1);
  const front = merge([...letters, dots]);
  const frame = L.line ? extrude(ringLines(L), inlayHeight(spec, "frame"), T(0, 0, top), 64) : null;
  const R = reliefOf(spec), r = reliefTop(spec), above = (g: THREE.BufferGeometry | null) => (g && r ? geometryVolume(g) * r / (spec.depth + r) : 0);
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
  // A card (85 × 55 mm, Clocktower's Grimoire): the phrase as large as fits, the frame a line
  // inside the edge, both flush (cardSpec); no icon, back or magnet.
  card: { layout: false, icon: false, textSize: false, spacing: false, maxArc: false, frame: "line", relief: [], back: false, magnet: false, diameter: false, ringBase: false, flip: false, separator: false, corners: true, pattern: false },
  // A condition ring: the name round and round at the height asked for (as far as its band
  // allows, ringBand), a fine line along each edge, either raised (ringSpec); no icon, back or
  // magnet, and sized by its base.
  ring: { layout: false, icon: false, textSize: true, spacing: true, maxArc: false, frame: "line", relief: ["text", "frame"], back: false, magnet: false, diameter: false, ringBase: true, flip: false, separator: true, corners: false, pattern: false },
};
export const shapeOf = (role: Role | null | undefined): TokenShape => (isCard(role) ? "card" : isRing(role) ? "ring" : "coin");

/**
 * A back that is a face, in its spec (shapeSpec puts it there): the front again, a face of its
 * own, or a two-state token's other state (see backFaceOf). Back designs, their colour and an
 * uploaded back don't apply to it.
 */
export const FACE_BACK = "face";
/** The fields a back face of its own ("own") sets apart from the front's: its layout, name, icon and frame. */
export const FACE_FIELDS: FaceField[] = ["style", "textSize", "spacing", "maxArc", "iconScale", "frame", "frameWidth"];
/** Is the coin's back a face: its other state, or a back that matches the front or has a face of its own? */
export const backIsFace = (role: Role | null | undefined, spec: SpecInput | undefined) =>
  shapeOf(role) === "coin" && (!!flipFace(role, spec) || spec?.backMode === "match" || spec?.backMode === "own");

/** A back face's colours: its own with "match" and "own", else (a two-state token's other state under a back design) the front's. */
function backColours(spec: SpecInput) {
  const c = { ...DEFAULT_SPEC.colours, ...spec.colours }, own = spec.backMode === "match" || spec.backMode === "own" ? spec.backFace?.colours : undefined;
  return { front: own?.front ?? c.front, frame: own?.frame ?? c.frame };
}

/**
 * What a coin's back face shows, as a front the engine draws (null when the back is a design):
 * the role (a two-state token's other state, else the token itself), its text, and the spec it's
 * drawn with: the front's look, or with "own" the back's own (a linked token keeps its reminder
 * look); the back's relief (backRelief) and colours. `spec` is the token's as its shape prints it.
 */
export function backFaceOf(role: Role, spec: TokenSpec, text: string): { role: Role; text: string; spec: TokenSpec } | null {
  if (spec.back !== FACE_BACK) return null;
  const other = flipFace(role, spec), b: BackFace = spec.backFace ?? {};
  const look = spec.backMode === "own" && !spec.linked ? Object.fromEntries(FACE_FIELDS.filter((k) => b[k] != null).map((k) => [k, b[k]])) : {};
  const c = backColours(spec);
  const face = windowFrame({ ...spec, ...look, relief: backRelief(spec), colours: { ...spec.colours, front: c.front, frame: c.frame } });
  return other ? { role: other, text: roleName(other, spec.lang), spec: { ...face, icon: undefined } } : { role, text, spec: face };
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
  return { ...role, en: f.en, es: f.es, names: f.names ?? {}, fem: {}, body: f.body, g: f.g, d: undefined, icon: f.icon, author: f.author, iconKey: f.iconKey, flip: undefined };
}

/** A spec as its shape prints it: a card's or a ring's keeps only what it has (no back, magnet or
 *  layout), with its real size for `diameter`; a coin's is the spec, filled in, and a coin whose
 *  back is a face (backIsFace) has FACE_BACK for its back and its magnet hidden inside: a pocket
 *  would cut into the face. */
export function shapeSpec(role: Role | null | undefined, input: SpecInput | undefined): TokenSpec {
  const shape = shapeOf(role);
  if (shape === "card") return cardSpec(input);
  if (shape === "ring") return ringSpec(input);
  const spec = { ...DEFAULT_SPEC, ...input, colours: { ...DEFAULT_SPEC.colours, ...input?.colours } };
  if (!backIsFace(role, spec)) return spec;
  return { ...spec, back: FACE_BACK, customSvg: null, magnet: spec.magnet === "pocket" ? "hidden" : spec.magnet };
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
  return spec;
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
  const fpGeom = fp ? extrude(cutShapes(fp), faceHeight(spec, fpRelief, topFace(spec)), T(0, 0, partZ(spec, fpRelief, topFace(spec))), 1) : null;
  const frontName = fpPart === "front" ? merge([front.name, fpGeom]) : front.name;
  const frameAll = fpPart === "frame" ? merge([frame, fpGeom]) : frame;
  // A back that is a face is drawn like a front on the bottom face (backFaceOf: the front again,
  // a face of its own or a two-state token's other state); any other back is its design.
  const bf = backFaceOf(role, spec, text);
  const backSpec = bf?.spec, backUp = !!backSpec && hasRelief(backSpec);
  const back = bf ? face(bf.role, bf.text, bottomFace(backUp), bf.spec) : null;
  const backFrame = backSpec ? buildFrame(backSpec, bottomFace(backUp)) : null;
  // The relief out of each face, per part (mm³): each raised element is a prism standing
  // `depth` into the coin and `relief` out of it, so that share of its volume.
  const R = reliefOf(spec), B = reliefOf(backSpec), r = reliefTop(spec), above = (g: THREE.BufferGeometry | null | undefined) => (g && r ? geometryVolume(g) * r / (spec.depth + r) : 0);
  // The window's icon is in the coin colour, over the window; the classic one in the team
  // colour like the name. Either is its own part, raised or not; on a back face likewise.
  const iconColour = window ? colours.icon : colours.front;
  const backIconColour = backSpec?.style === "window" ? colours.icon : backSpec ? colours.back : iconColour;
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

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);

/**
 * An SVG picture of the token's front (or back), in millimetres. Uses the font
 * family LETTERING.family (src/style.css loads it).
 */
export function tokenSvg(lib: Library, role: Role, input: SpecInput | undefined, { side = "front", text }: { side?: "front" | "back"; text?: string | null } = {}) {
  if (isCard(role)) return cardSvg(lib, role, input, side, text);
  if (isRing(role)) return ringSvg(lib, role, input, side, text);
  const spec = windowFrame(shapeSpec(role, input));
  // a back that is a face: drawn as a front (a two-state token's other state with its own icon, not the token's)
  const bf = side === "back" ? backFaceOf(role, spec, text ?? roleName(role, spec.lang)) : null;
  if (bf) return tokenSvg(lib, bf.role, { ...bf.spec, back: "none", backMode: "design" }, { text: bf.text });
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
    body += `<g fill="${c.base}" transform="translate(0 ${(-I.cy).toFixed(3)}) scale(${I.k.toFixed(5)}) translate(${(-I.bcx).toFixed(3)} ${(-I.bcy).toFixed(3)})"><g transform="${iconOf(role, spec).g}">${iconOf(role, spec).body}</g></g>`;
    // The name as outlines from the same font as the 3D model, so both always match.
    for (const line of W.lines) {
      const shapes = lib.font.generateShapes(line.text, W.em);
      const box = boundsOf(shapes), dx = -(box.min.x + box.max.x) / 2;
      body += `<path fill="${c.front}" fill-rule="evenodd" d="${shapesToPath(shapes, dx, line.y)}"/>`;
    }
    if (spec.frame !== "none") body += `<circle r="${(R - FRAME_INSET - spec.frameWidth / 2).toFixed(2)}" fill="none" stroke="${c.frame}" stroke-width="${spec.frameWidth}"/>`;
  } else if (side === "front") {
    const icon = iconOf(role, spec);
    if (fitsIcon(spec)) {
      const f = fittedIcon(lib, role, spec, label);
      body += `<g fill="${c.front}" transform="${f.dy ? `translate(0 ${(-f.dy).toFixed(3)}) ` : ""}scale(${f.k.toFixed(5)}) translate(${(-f.cx).toFixed(3)} ${(-f.cy).toFixed(3)})"><g transform="${icon.g}">${icon.body}</g></g>`;
    } else {
      body += `<g fill="${c.front}" transform="translate(0 ${-(spec.iconOffsetY || 0)}) scale(${k}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})"><g transform="${icon.g}">${icon.body}</g></g>`;
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
      body += turn ? `<g transform="rotate(180)">${letters}</g>` : letters;
    }
    const fd = frameDesign(spec);
    if (fd) body += `<path fill="${c.frame}" fill-rule="nonzero" d="${shapesToPath(fd.shapes, 0, 0, 48)}"/>`;
    const fp = frontPattern(lib, role, spec, label);
    if (fp) body += `<path fill="${c[patternPart(role, spec)]}" fill-rule="evenodd" d="${cutPath(fp)}"/>`;
  } else {
    const back = ({ seal: "Seal", clock: "Clock", rings: "Rings", name: "Name", custom: "Custom" } as Record<string, string | undefined>)[spec.back];
    const designed = backDesign(spec.back, R);
    if (designed) body += `<path fill="${c.back}" fill-rule="nonzero" d="${shapesToPath(designed, 0, 0, 48)}"/>`;
    const ed = spec.back === "edition" ? editionBack(lib, role, spec) : null;
    const pocket = magnetLayout(spec);
    if (pocket?.kind === "pocket") body += `<circle r="${pocket.radius.toFixed(2)}" fill="#0b090c" opacity=".85"/>`;
    if (ed) body += `<path fill="${c.back}" fill-rule="evenodd" d="${shapesToPath(ed, 0, 0, 48)}"/>`;
    if (spec.back === "medallon") body += `<path fill="${c.back}" fill-rule="evenodd" d="${shapesToPath(medallionBack(lib, role, spec), 0, 0, 48)}"/>`;
    const bp = backPattern(lib, role, spec);
    if (bp) body += `<path fill="${c.back}" fill-rule="evenodd" d="${cutPath(bp)}"/>`;
    if (spec.back === "seal" && lib.sealSvg) body += `<g fill="${c.back}" transform="scale(${spec.diameter / TRACE_VIEW}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})">${lib.sealSvg.replace(/^[\s\S]*?<g /, "<g ").replace(/fill="#000000"/, "").replace(/<\/svg>\s*$/, "")}</g>`;
    else if (back && !designed) body += `<text y="1.5" text-anchor="middle" font-size="5" fill="${c.back}" font-family="${LETTERING.family}">${esc(back === "Name" ? label.toUpperCase() : back.toUpperCase())}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - 0.5} ${-R - 0.5} ${spec.diameter + 1} ${spec.diameter + 1}" role="img" aria-label="${esc(label)} token"><circle r="${R}" fill="${c.base}"/>${body}</svg>`;
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
