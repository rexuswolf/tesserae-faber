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
];

export const BACK_STYLES = [
  { id: "none", label: "Plain" },
  { id: "seal", label: "Clocktower seal" },
  { id: "clock", label: "Clock face" },
  { id: "rings", label: "Rings" },
  { id: "name", label: "Role name" },
  { id: "custom", label: "Your SVG" },
];

export const FILAMENTS = {
  black: "#1d1c21",
  white: "#ece9e2",
  gold: "#c9a227",
  silver: "#a7adb4",
  bronze: "#9a6a3a",
};

export const DEFAULT_SPEC = {
  lang: "es",
  diameter: 45,
  height: 2,
  depth: 0.2,
  iconScale: 1,
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
  return { base: pick(c.base), front: pick(c.front), frame: pick(c.frame), back: pick(c.back) };
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
  const R = spec.diameter / 2, w = spec.frameWidth;
  switch (spec.frame) {
    case "rim": return R - 0.4 - w;
    case "double": return R - 0.4 - w - 0.6 - w * 0.6;
    case "clock": return R - 0.4 - w - 1.4;
    case "beads": return R - 0.4 - w - 0.5 - 1.0;
    default: return R;
  }
}

/** Where each letter of the curved name goes; shared by 3D and 2D renderers. */
export function layoutName(lib, text, spec) {
  const chars = [...(text || "").toUpperCase()];
  const R = spec.diameter / 2;
  const margin = Math.max(spec.margin, R - frameInner(spec) + 0.5);
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

function iconShapes(lib, role) {
  if (!lib.icons.has(role.en)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRACE_VIEW} ${TRACE_VIEW}"><g transform="${role.g}">${role.d.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
    lib.icons.set(role.en, parseSvgShapes(svg));
  }
  return lib.icons.get(role.en);
}

/** Matrix placing traced-SVG shapes (y down, 0..127.56) centred on the coin. */
function tracedMatrix(sizeMm, z, mirrorX = false) {
  const k = sizeMm / TRACE_VIEW;
  return chain(T(0, 0, z), S(mirrorX ? -1 : 1, 1, 1), S(k, -k, 1), T(-TRACE_VIEW / 2, -TRACE_VIEW / 2, 0));
}

function buildFront(lib, role, text, spec) {
  const top = spec.height - spec.depth;
  const icon = extrude(iconShapes(lib, role), spec.depth, tracedMatrix(spec.diameter * spec.iconScale, top));
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
  const shapes = [];
  if (spec.frame === "none") return null;
  shapes.push(ringShape(out, out - w));
  if (spec.frame === "double") shapes.push(ringShape(out - w - 0.6, out - w - 0.6 - w * 0.6));
  if (spec.frame === "clock") {
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      const long = h % 3 === 0;
      shapes.push(radialBar(out - w - (long ? 1.4 : 1.0), out - w + 0.01, long ? 0.8 : 0.5, a));
    }
  }
  if (spec.frame === "beads") {
    const rb = out - w - 0.5 - 0.5, n = Math.round((2 * Math.PI * rb) / 2.2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = new THREE.Shape();
      s.absarc(rb * Math.cos(a), rb * Math.sin(a), 0.5, 0, Math.PI * 2, false);
      shapes.push(s);
    }
  }
  return extrude(shapes, spec.depth, T(0, 0, z), 24);
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
export function buildToken(lib, role, spec, text) {
  spec = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec?.colours } };
  text ??= roleName(role, spec.lang);
  const front = buildFront(lib, role, text, spec);
  return {
    parts: { base: buildBase(spec), front: front.geom, frame: buildFrame(spec), back: buildBack(lib, role, text, spec) },
    colours: partColours(role, spec),
    name: front.name,
    spec,
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
  for (const name of ["base", "front", "frame", "back"]) {
    meshes[name] = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }));
    scene.add(meshes[name]);
  }
  // Inlays are flush with the coin; nudge them out so the preview doesn't flicker.
  meshes.front.position.z = meshes.frame.position.z = 0.015;
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
  spec = { ...DEFAULT_SPEC, ...spec };
  const c = partColours(role, spec);
  const R = spec.diameter / 2;
  const label = text ?? roleName(role, spec.lang);
  const k = spec.diameter * spec.iconScale / TRACE_VIEW;
  let body = "";
  if (side === "front") {
    body += `<g fill="${c.front}" transform="scale(${k}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})"><g transform="${role.g}">${role.d.map((d) => `<path d="${d}"/>`).join("")}</g></g>`;
    const L = layoutName(lib, label, spec);
    // SVG y points down: angle a in engine space is -a on screen.
    L.chars.forEach((ch, i) => {
      if (ch === " ") return;
      const a = L.angles[i];
      const x = L.radius * Math.cos((a * Math.PI) / 180), y = -L.radius * Math.sin((a * Math.PI) / 180);
      body += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" transform="rotate(${(-(a + 90)).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})" font-size="${(L.em * 0.98).toFixed(2)}" text-anchor="middle" fill="${c.front}" font-family="Dumbledor">${esc(ch)}</text>`;
    });
    const out = R - 0.4, w = spec.frameWidth;
    const ring = (o, i, col) => `<circle r="${((o + i) / 2).toFixed(2)}" fill="none" stroke="${col}" stroke-width="${(o - i).toFixed(2)}"/>`;
    if (spec.frame !== "none") body += ring(out, out - w, c.frame);
    if (spec.frame === "double") body += ring(out - w - 0.6, out - w - 0.6 - w * 0.6, c.frame);
    if (spec.frame === "clock") for (let h = 0; h < 12; h++) {
      const long = h % 3 === 0, a = (h / 12) * 360;
      body += `<rect x="${(out - w - (long ? 1.4 : 1.0)).toFixed(2)}" y="${(long ? -0.4 : -0.25)}" width="${long ? 1.4 : 1.0}" height="${long ? 0.8 : 0.5}" fill="${c.frame}" transform="rotate(${a})"/>`;
    }
    if (spec.frame === "beads") {
      const rb = out - w - 1.0, n = Math.round((2 * Math.PI * rb) / 2.2);
      for (let i = 0; i < n; i++) body += `<circle cx="${(rb * Math.cos((i / n) * 2 * Math.PI)).toFixed(2)}" cy="${(rb * Math.sin((i / n) * 2 * Math.PI)).toFixed(2)}" r="0.5" fill="${c.frame}"/>`;
    }
  } else {
    const back = { seal: "Seal", clock: "Clock", rings: "Rings", name: "Name", custom: "Custom" }[spec.back];
    if (spec.back === "seal" && lib.sealSvg) body += `<g fill="${c.back}" transform="scale(${spec.diameter / TRACE_VIEW}) translate(${-TRACE_VIEW / 2} ${-TRACE_VIEW / 2})">${lib.sealSvg.replace(/^[\s\S]*?<g /, "<g ").replace(/fill="#000000"/, "").replace(/<\/svg>\s*$/, "")}</g>`;
    else if (back) body += `<text y="1.5" text-anchor="middle" font-size="5" fill="${c.back}" font-family="Dumbledor">${esc(back === "Name" ? label.toUpperCase() : back.toUpperCase())}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - 0.5} ${-R - 0.5} ${spec.diameter + 1} ${spec.diameter + 1}" role="img" aria-label="${esc(label)} token"><circle r="${R}" fill="${c.base}"/>${body}</svg>`;
}

// ---------------------------------------------------------------- export

const slug = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

function stl(geom, spec, faceDown) {
  const g = geom.clone();
  if (faceDown) {
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
  const order = ["base", "front", "frame", "back"];
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
