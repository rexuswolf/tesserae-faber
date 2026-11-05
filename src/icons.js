// A token's own icon, in place of its character's: an uploaded SVG, an icon from
// game-icons.net (CC BY 3.0, credited in the app), or one a script brings. Stored with the
// token as {id, source, name, author?, g, body}: `body` is SVG markup and `g` the transform
// that places it in the engine's icon square (ICON_VIEW units), like the library's icons.
import { ICON_VIEW, iconShapeCount } from "./engine/token-engine.js";

const RAW = "https://raw.githubusercontent.com/game-icons/icons/master/";
// game-icons.net icons are 512 units square; the library's are placed this way.
const GI_SCALE = 0.139518, GI_OFFSET = (ICON_VIEW - 512 * GI_SCALE) / 2;

/** A short stable id for an icon's markup (FNV-1a), so the engine caches it once. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** The drawable markup of an SVG file: its shapes, without styling that would recolour them. */
function cleanMarkup(svg) {
  // game-icons.net files open with a square black background: not part of the icon
  for (const el of svg.querySelectorAll("path")) if ((el.getAttribute("d") || "").replace(/\s+/g, "") === "M00h512v512H0z") el.remove();
  return svg.innerHTML
    .replace(/\sxmlns(:\w+)?="[^"]*"/g, "")
    .replace(/<\?xml[^>]*>|<!--[\s\S]*?-->|<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>|<metadata[\s\S]*?<\/metadata>|<style[\s\S]*?<\/style>/g, "")
    .replace(/\s(fill|fill-opacity|stroke|stroke-width|style|class)="[^"]*"/g, "");
}

/**
 * An icon from an SVG file's text. It's fitted into the icon square with a small margin.
 * Throws if it isn't an SVG, or has nothing filled to print (strokes only, an embedded image).
 */
export function iconFromSvg(text, meta = {}) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("not-svg");
  let [x, y, w, h] = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) { x = 0; y = 0; w = parseFloat(svg.getAttribute("width")) || 512; h = parseFloat(svg.getAttribute("height")) || 512; }
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
export async function gameIcon(path) {
  const res = await fetch(`${RAW}${path}.svg`);
  if (!res.ok) throw new Error("not-found");
  const [author, name] = path.split("/");
  const icon = iconFromSvg(await res.text(), { source: "game-icons", name, author });
  return { ...icon, g: `translate(${GI_OFFSET.toFixed(3)} ${GI_OFFSET.toFixed(3)}) scale(${GI_SCALE})` };
}
export const gameIconPreview = (path) => `${RAW}${path}.svg`;

let index = null;
/** game-icons.net's icons whose name has every word of `query` (English), best matches first. */
export async function searchGameIcons(query, limit = 60) {
  index ??= await (await fetch("/game-icons.json")).json();
  const words = query.toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const name = (p) => p.slice(p.indexOf("/") + 1);
  const hits = index.filter((p) => words.every((w) => name(p).includes(w)));
  const score = (p) => (name(p) === words.join("-") ? 0 : name(p).startsWith(words[0]) ? 1 : 2) + name(p).length / 100;
  return hits.sort((a, b) => score(a) - score(b)).slice(0, limit);
}

/**
 * The icon a script entry brings: our "icon": "author/name" (game-icons.net), or the Script
 * Tool's "image" (a URL or list of URLs) when it's an SVG, linked or inline (data:). Images
 * that aren't SVG can't be printed in 3D and are skipped. Returns null when there's none.
 */
export async function scriptEntryIcon(entry) {
  if (typeof entry?.icon === "string" && /^[\w-]+\/[\w-]+$/.test(entry.icon)) return gameIcon(entry.icon);
  const images = [].concat(entry?.image ?? []).filter((u) => typeof u === "string");
  for (const url of images) {
    if (url.startsWith("data:image/svg+xml")) {
      const [, meta, data] = url.match(/^data:image\/svg\+xml([^,]*),(.*)$/s) ?? [];
      return iconFromSvg(meta?.includes("base64") ? atob(data) : decodeURIComponent(data), { source: "script", name: entry.name || entry.id });
    }
    if (/\.svg(\?|#|$)/i.test(url)) {
      const res = await fetch(url);
      if (res.ok) return iconFromSvg(await res.text(), { source: "script", name: entry.name || entry.id });
    }
  }
  return null;
}

/** A token's icon as a Script Tool entry's fields, for exporting a script with it. */
export function iconForScript(icon) {
  if (icon.source === "game-icons") return { icon: `${icon.author}/${icon.name}` };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_VIEW.toFixed(3)} ${ICON_VIEW.toFixed(3)}"><g transform="${icon.g}">${icon.body}</g></svg>`;
  return { image: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` };
}
