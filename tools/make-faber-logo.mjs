// Writes Tesserae Faber's logo (the generic app at /crear) as SVG files in public/:
//   tesserae-faber.svg       the tessera: a hexagonal token, side on top, with a border of tiles
//                            and the workshop's mark, T·F (64 px and up)
//   tesserae-faber-small.svg the same token for small sizes: an ochre rim and TF (around 32 px)
//   tesserae-faber-icon.svg  the browser tab: the token with the little bone hexagon at its heart
//   node tools/make-faber-logo.mjs
// The design is tools/faber-protos/ (where it was chosen). The letters are drawn as outlines,
// so the files need no font.
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(import.meta.dirname, "../public");
const C = { red: "#a8392c", ochre: "#c9963a", bone: "#ece3d0", mortar: "#3b3632" };
const f2 = (n) => +n.toFixed(2);
const P = (cx, cy, r, deg) => { const a = (deg * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
/** A hexagon's points; rot 0 puts a side on top. */
const hex = (cx, cy, r, rot = 0) => Array.from({ length: 6 }, (_, i) => P(cx, cy, r, rot + i * 60).map(f2).join(",")).join(" ");

// T and F in inscription capitals, outlined (cap height 15.6, set either side of the centre)
const T = "M35.6 42.8H47.4V45.6H46.9Q46.6 44.4 45.2 44.4H42.5V57.3Q42.5 58 44 58.2V58.6H39V58.2Q40.5 58 40.5 57.3V44.4H37.8Q36.4 44.4 36.1 45.6H35.6Z";
const F = "M53.4 42.8H63.8V45.6H63.3Q63 44.4 61.6 44.4H56.6V50H60Q61 50 61.2 49.2H61.6V52.4H61.2Q61 51.6 60 51.6H56.6V57.3Q56.6 58 58.1 58.2V58.6H53.4V58.2Q54.6 58 54.6 57.3V44.1Q54.6 43.4 53.4 43.2Z";

function tessera() {
  // radii (centre to vertex); the band between parallel sides is Δr·cos30°, as wide at a corner as along a side
  const c = 50, rim = 46, fillet = 42.4, bandOut = 41, bandMid = 35.3, bandIn = 29.6, field = 28.2;
  const halfBand = ((bandOut - bandIn) / 2) * Math.cos(Math.PI / 6), grout = 1.8, tile = 5, cornerR = Math.min(3.1, halfBand - grout), tiles = 4;
  const first = cornerR + grout + tile / 2, last = bandMid - first, step = (last - first) / (tiles - 1);
  const parts = [];
  for (let side = 0; side < 6; side++) {
    const [ax, ay] = P(c, c, bandMid, side * 60), [bx, by] = P(c, c, bandMid, (side + 1) * 60);
    const ux = (bx - ax) / bandMid, uy = (by - ay) / bandMid, along = f2((Math.atan2(uy, ux) * 180) / Math.PI);
    parts.push(`<polygon points="${hex(ax, ay, cornerR)}" fill="${C.ochre}"/>`);
    for (let i = 0; i < tiles; i++) {
      const d = first + step * i, x = f2(ax + ux * d), y = f2(ay + uy * d);
      parts.push(`<rect x="${f2(x - tile / 2)}" y="${f2(y - tile / 2)}" width="${tile}" height="${tile}" rx=".7" fill="${C.bone}" transform="rotate(${along} ${x} ${y})"/>`);
    }
  }
  return svg(`<polygon points="${hex(c, c, rim)}" fill="${C.red}" stroke="${C.red}" stroke-width="3.4" stroke-linejoin="round"/>
  <polygon points="${hex(c, c, fillet)}" fill="${C.bone}"/>
  <polygon points="${hex(c, c, bandOut)}" fill="${C.mortar}"/>
  ${parts.join("\n  ")}
  <polygon points="${hex(c, c, bandIn)}" fill="${C.bone}"/>
  <polygon points="${hex(c, c, field)}" fill="${C.red}"/>
  <path d="${T}" fill="${C.bone}"/><path d="${F}" fill="${C.bone}"/>
  <polygon points="${hex(50, 50.6, 2.42)}" fill="${C.bone}"/>`);
}
/** For small sizes: the token with an ochre rim, and TF (larger) or just the stop (the tab). */
function small(withLetters) {
  const inner = withLetters
    ? `<g transform="translate(50 50.7) scale(1.75) translate(-49.7 -50.7)"><path d="${T}" fill="${C.bone}" transform="translate(2.6 0)"/><path d="${F}" fill="${C.bone}" transform="translate(-2.6 0)"/></g>`
    : `<polygon points="${hex(50, 50, 15)}" fill="${C.bone}"/>`;
  return svg(`<polygon points="${hex(50, 50, 44)}" fill="${C.ochre}" stroke="${C.ochre}" stroke-width="8" stroke-linejoin="round"/>
  <polygon points="${hex(50, 50, 36)}" fill="${C.red}" stroke="${C.red}" stroke-width="4" stroke-linejoin="round"/>
  ${inner}`);
}
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <title>Tesserae Faber</title>\n  ${body}\n</svg>\n`;

for (const [file, content] of [["tesserae-faber.svg", tessera()], ["tesserae-faber-small.svg", small(true)], ["tesserae-faber-icon.svg", small(false)]]) {
  fs.writeFileSync(path.join(out, file), content);
  console.log(`wrote public/${file}`);
}
