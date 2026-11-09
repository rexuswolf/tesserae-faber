// A token's own icon, in place of its character's: an uploaded SVG, an icon from
// game-icons.net (CC BY 3.0, credited in the app), or one a script brings. Stored with the
// token as {id, source, name, author?, url?, g, body}: `body` is SVG markup and `g` the
// transform that places it in the engine's icon square (ICON_VIEW units), like the library's
// icons. `url` is the picture a script linked, kept so the script can be exported as it came.
import { ICON_VIEW, iconShapeCount } from "./engine/token-engine.ts";
import { safeIconMarkup } from "./engine/safe-svg.ts";
import type { TokenIcon } from "./types.ts";
import type { ScriptJsonEntry } from "./scripts.ts";

const RAW = "https://raw.githubusercontent.com/game-icons/icons/master/";
// game-icons.net icons are 512 units square; the library's are placed this way.
const GI_SCALE = 0.139518;
// Every library icon sits in the same box: 512 units at GI_SCALE, at translate(28.063 19.134),
// raised above the centre to clear the name. Traced pictures are centred in it at 93%, the
// share of the box the library's icons fill (Tinker's wrench and a traced copy then overlap).
const BOX = 512 * GI_SCALE, BOX_X = 28.063, BOX_Y = 19.134, TRACED_FILL = 0.93;
/** Where a game-icons.net icon goes: exactly where the library's (also game-icons.net) sit. */
export const GI_PLACE = `translate(${BOX_X} ${BOX_Y}) scale(${GI_SCALE})`;
/**
 * Icons picked from game-icons.net used to be centred on the coin, a little below the library's.
 * Returns the icon moved to the library's place, or the same icon when it isn't one of those.
 */
export function placeGameIcon(icon: TokenIcon): TokenIcon {
  return icon?.source === "game-icons" && icon.g === `translate(${((ICON_VIEW - BOX) / 2).toFixed(3)} ${((ICON_VIEW - BOX) / 2).toFixed(3)}) scale(${GI_SCALE})`
    ? { ...icon, g: GI_PLACE } : icon;
}

/** A short stable id for an icon's markup (FNV-1a), so the engine caches it once. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** The drawable markup of an SVG file: its shapes, without styling that would recolour them. */
function cleanMarkup(svg: Element) {
  // game-icons.net files open with a square black background: not part of the icon
  for (const el of svg.querySelectorAll("path")) if ((el.getAttribute("d") || "").replace(/\s+/g, "") === "M00h512v512H0z") el.remove();
  // only its shapes and their geometry, rebuilt (no styling, scripts, images or handlers)
  return safeIconMarkup(svg.innerHTML);
}

/**
 * An icon from an SVG file's text. It's fitted into the icon square with a small margin.
 * Throws if it isn't an SVG, or has nothing filled to print (strokes only, an embedded image).
 */
export function iconFromSvg(text: string, meta: { source?: string; name?: string; author?: string } = {}): TokenIcon {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("not-svg");
  let [x, y, w, h] = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) { x = 0; y = 0; w = parseFloat(svg.getAttribute("width") as string) || 512; h = parseFloat(svg.getAttribute("height") as string) || 512; }
  const body = cleanMarkup(svg);
  // An icon we exported (already in the icon square) comes back as it was; anything else is
  // fitted into the square with a small margin.
  const ours = !x && !y && Math.abs(w - ICON_VIEW) < 0.01 && Math.abs(h - ICON_VIEW) < 0.01;
  const k = ours ? 1 : (ICON_VIEW * 0.9) / Math.max(w, h);
  const g = ours ? "translate(0 0) scale(1)" : `translate(${((ICON_VIEW - w * k) / 2 - x * k).toFixed(3)} ${((ICON_VIEW - h * k) / 2 - y * k).toFixed(3)}) scale(${k.toFixed(6)})`;
  const icon = { id: hash(body), source: meta.source || "upload", name: meta.name || "", ...(meta.author ? { author: meta.author } : {}), g, body };
  if (!iconShapeCount(icon)) throw new Error("no-shapes");
  return icon;
}

/** A game-icons.net icon ("author/name"), fetched from its repository, placed like the library's. */
export async function gameIcon(path: string): Promise<TokenIcon> {
  const res = await fetch(`${RAW}${path}.svg`);
  if (!res.ok) throw new Error("not-found");
  const [author, name] = path.split("/");
  const icon = iconFromSvg(await res.text(), { source: "game-icons", name, author });
  return { ...icon, g: GI_PLACE };
}
export const gameIconPreview = (path: string) => `${RAW}${path}.svg`;

let index: Promise<string[]> | null = null;
/** game-icons.net's icons whose name has every word of `query` (English), best matches first. */
export async function searchGameIcons(query: string, limit = 60): Promise<string[]> {
  // fetched once; a failure (offline) is thrown, and the next search tries again
  index ??= fetch("/game-icons.json").then((r) => { if (!r.ok) throw new Error("index"); return r.json() as Promise<string[]>; })
    .catch((err) => { index = null; throw err; });
  const [all, { ICON_WORDS_ES: es }] = await Promise.all([index, import("./icon-words-es.ts")]);
  // accents dropped ("poción" is "pocion"); a Spanish word looks for its English ones too, and a
  // plural for its singular's ("lobos": "lobo", "wolf")
  const plain = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const phrase = es[plain.replace(/[\s,]+/g, "_")];
  const words = phrase ? [plain.replace(/[\s,]+/g, "-")] : plain.split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const sing = (w: string) => [w.replace(/es$/, ""), w.replace(/s$/, "")].find((x) => x !== w && es[x]);
  const alts = words.map((w) => [w, ...(phrase ?? es[w] ?? es[sing(w) ?? ""] ?? [])]);
  const name = (p: string) => p.slice(p.indexOf("/") + 1);
  const hits = all.filter((p) => alts.every((ws) => ws.some((w) => name(p).includes(w))));
  const first = alts[0];
  const score = (p: string) => (first.includes(name(p)) ? 0 : first.some((w) => name(p).startsWith(w)) ? 1 : 2) + name(p).length / 100;
  return hits.sort((a, b) => score(a) - score(b)).slice(0, limit);
}

/** "author/name" from a game-icons.net link (the site or its repository), or null. */
function gameIconPath(url: string) {
  const m = url.match(/^https?:\/\/(?:www\.)?game-icons\.net\/(?:icons\/[^/]+\/[^/]+\/)?1x1\/([\w-]+)\/([\w-]+)\.(?:svg|png|html)$/i)
    || url.match(/^https?:\/\/raw\.githubusercontent\.com\/game-icons\/icons\/master\/([\w-]+)\/([\w-]+)\.svg$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * How pictures are traced, as a number stored with each traced icon. Raise it when tracing
 * changes, and icons traced the old way are traced again (2: near-white details became gaps;
 * 3: only an icon over 90% near-white keeps its whole shape, so outlined drawings keep their lines;
 * 4: a drop shadow, grey and see-through, isn't part of the icon;
 * 5: a texture's light specks stay icon, and the shape's edges are smoothed).
 */
export const TRACE_VERSION = 5;
/** True for an icon traced from a picture before the current way of tracing. */
export const tracedBefore = (icon: TokenIcon | null | undefined) => !!icon?.url && icon.source === "script" && !/\.svg(\?|#|$)/i.test(icon.url) && !icon.url.startsWith("data:") && (icon.traced ?? 1) < TRACE_VERSION;

/** A drop shadow's pixel: grey (no colour) and see-through. An icon's own colours are opaque. */
const shadowPx = (r: number, g: number, b: number, a: number) => a < 250 && Math.max(r, g, b) - Math.min(r, g, b) < 25;
/** Near-white patches smaller than `min` pixels (a texture's highlights) stay part of the icon. */
function keepSpecks(kind: Uint8Array, W: number, H: number, min: number) {
  const seen = new Uint8Array(W * H), stack: number[] = [], patch: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (kind[start] !== 2 || seen[start]) continue;
    patch.length = 0; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const j = stack.pop()!; patch.push(j);
      const x = j % W;
      for (const n of [x + 1 < W ? j + 1 : -1, x > 0 ? j - 1 : -1, j + W < W * H ? j + W : -1, j - W]) {
        if (n >= 0 && !seen[n] && kind[n] === 2) { seen[n] = 1; stack.push(n); }
      }
    }
    if (patch.length < min) for (const j of patch) kind[j] = 1;
  }
}
/** Smooths a 0/1 mask: each pixel takes what most of its (2r+1)² neighbours are (rough edges, specks). */
function smoothMask(on: Uint8Array, W: number, H: number, r: number) {
  const I = new Uint32Array((W + 1) * (H + 1));   // running sums, so each window is four reads
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += on[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xa = Math.max(0, x - r), xb = Math.min(W, x + r + 1), ya = Math.max(0, y - r), yb = Math.min(H, y + r + 1);
    const sum = I[yb * (W + 1) + xb] - I[ya * (W + 1) + xb] - I[yb * (W + 1) + xa] + I[ya * (W + 1) + xa];
    on[y * W + x] = sum * 2 > (xb - xa) * (yb - ya) ? 1 : 0;
  }
}
/** Near-white: light and nearly grey (cream, white), not a light colour like yellow or sky blue. */
const nearWhite = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 60;

/**
 * A picture (PNG, JPEG, WebP…) traced into an icon: its opaque pixels become shapes, placed
 * like the library's icons. Details drawn in white or cream on top of the icon (a page's lines,
 * an outline, a drawing's white fill) become gaps, but a texture's light specks don't; a grey
 * see-through drop shadow is left out, and the shape's edges are smoothed, as they'd be in a one-colour print; unless
 * nearly all the icon is that light (over 90%), when it's a white icon and keeps its whole shape. The host must allow reading it
 * (CORS). Throws when it can't be read, or when it's opaque edge to edge (a photo or a square
 * image: no shape to find).
 */
async function tracedIcon(url: string, name: string): Promise<TokenIcon> {
  const img = new Image();
  img.crossOrigin = "anonymous"; img.src = url;
  await img.decode();
  const S = 512, k = S / Math.max(img.naturalWidth, img.naturalHeight);
  const cv = Object.assign(document.createElement("canvas"), { width: S, height: S });
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0, img.naturalWidth * k, img.naturalHeight * k);
  const { data } = cx.getImageData(0, 0, S, S);   // throws when the host doesn't allow it
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k), on = new Uint8Array(W * H);
  let opaque = 0, light = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * S + x) * 4;
    if (data[i + 3] <= 128 || shadowPx(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
    opaque++;
    if (nearWhite(data[i], data[i + 1], data[i + 2])) light++;
  }
  const cutLight = light < opaque * 0.9;   // otherwise it's a white icon: keep it whole
  // each pixel: 0 not icon, 1 icon, 2 near-white (a gap, unless it's only a speck)
  const kind = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * S + x) * 4;
    if (data[i + 3] <= 128 || shadowPx(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
    kind[y * W + x] = cutLight && nearWhite(data[i], data[i + 1], data[i + 2]) ? 2 : 1;
  }
  keepSpecks(kind, W, H, 60);
  for (let j = 0; j < W * H; j++) on[j] = kind[j] === 1 ? 1 : 0;
  smoothMask(on, W, H, 2);
  let x0 = W, y0 = H, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on[y * W + x]) continue;
    count++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!count || opaque > W * H * 0.97) throw new Error("no-shapes");
  const P = 2, w = x1 - x0 + 1 + 2 * P, h = y1 - y0 + 1 + 2 * P, mask = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + x0 - P, sy = y + y0 - P, o = (y * w + x) * 4;
    const v = sx >= 0 && sy >= 0 && sx < W && sy < H && on[sy * W + sx] ? 0 : 255;
    mask.data[o] = mask.data[o + 1] = mask.data[o + 2] = v; mask.data[o + 3] = 255;
  }
  const { default: tracer } = await import("imagetracerjs");
  const svg = tracer.imagedataToSVG(mask, {
    numberofcolors: 2, colorsampling: 0, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }],
    ltres: 0.5, qtres: 0.5, pathomit: 16, blurradius: 0, roundcoords: 2, viewbox: true, desc: false, linefilter: true,
  });
  // the dark layer is the icon; the light one is the background
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  for (const p of doc.querySelectorAll("path")) if (!/rgb\(0,\s*0,\s*0\)/.test(p.getAttribute("fill") || "")) p.remove();
  const icon = iconFromSvg(new XMLSerializer().serializeToString(doc), { source: "script", name });
  // fit the shapes (not the margin traced around them) into the library's box
  const cw = w - 2 * P, ch = h - 2 * P, s = (BOX * TRACED_FILL) / Math.max(cw, ch);
  const g = `translate(${(BOX_X + (BOX - cw * s) / 2 - P * s).toFixed(3)} ${(BOX_Y + (BOX - ch * s) / 2 - P * s).toFixed(3)}) scale(${s.toFixed(6)})`;
  return { ...icon, g, url, traced: TRACE_VERSION };
}

/**
 * The icon a script entry brings, from its "image" (a link or a list of them, as the Script
 * Tool has it): a game-icons.net link loads that icon; an SVG (linked or inline) is used as
 * it is; any other picture is traced. Our older "icon": "author/name" still works. Returns
 * null when there's none, or none that can be read.
 */
export async function scriptEntryIcon(entry: ScriptJsonEntry | null | undefined): Promise<TokenIcon | null> {
  if (typeof entry?.icon === "string" && /^[\w-]+\/[\w-]+$/.test(entry.icon)) return gameIcon(entry.icon);
  const name = entry?.name || entry?.id || "";
  for (const url of ([] as unknown[]).concat(entry?.image ?? []).filter((u): u is string => typeof u === "string" && !!u)) {
    try {
      const gi = gameIconPath(url);
      if (gi) return { ...(await gameIcon(gi)), url };
      if (url.startsWith("data:image/svg+xml")) {
        const [, meta, data] = url.match(/^data:image\/svg\+xml([^,]*),(.*)$/s) ?? [];
        return iconFromSvg(meta?.includes("base64") ? atob(data as string) : decodeURIComponent(data as string), { source: "script", name });
      }
      if (/\.svg(\?|#|$)/i.test(url)) {
        const res = await fetch(url);
        if (res.ok) return { ...iconFromSvg(await res.text(), { source: "script", name }), url };
        continue;
      }
      return await tracedIcon(url, name);
    } catch { /* not readable or nothing to print: try the next picture */ }
  }
  return null;
}

/**
 * A token's icon as a script entry's "image": the link it came from, a game-icons.net link
 * (black on transparent, so other tools can show it too), or the SVG inline.
 */
export function iconForScript(icon: TokenIcon): { image: string } {
  if (icon.url) return { image: icon.url };
  if (icon.source === "game-icons") return { image: `https://game-icons.net/icons/000000/transparent/1x1/${icon.author}/${icon.name}.svg` };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_VIEW.toFixed(3)} ${ICON_VIEW.toFixed(3)}"><g transform="${icon.g}">${icon.body}</g></svg>`;
  return { image: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` };
}
