// Tesserae: the app's material, after its mark. Small stones set in grout: the floor under the list, the band of
// tesserae round a picked token (hexagons at its corners, as round the logo). The material is the app's, the colours
// each collection's: these images are drawn from the theme's own (its text, accent and background) whenever it
// changes, and handed to the stylesheet as --band-on and --floor.

type Rgb = [number, number, number];
const BLACK: Rgb = [0, 0, 0];

const rgb = (c: string): Rgb | null => {
  const m = /^#?([0-9a-f]{6})/i.exec(c.trim());
  return m ? [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16)) as Rgb : null;
};
const mix = (a: Rgb, b: Rgb, t: number) => "#" + a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("");
const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const hexagon = (cx: number, cy: number, r: number, fill: string) =>
  `<polygon points="${[0, 60, 120, 180, 240, 300].map((a) => `${(cx + r * Math.cos(a * Math.PI / 180)).toFixed(2)},${(cy + r * Math.sin(a * Math.PI / 180)).toFixed(2)}`).join(" ")}" fill="${fill}"/>`;

/** A 32×32 nine-slice for border-image: an 8px band, two tesserae per edge in two tones, a hexagon in each corner. */
export function band(a: string, b: string, corner: string) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">`;
  [8.5, 16.5].forEach((x, k) => {
    for (const [rx, ry] of [[x, 1.5], [x, 24.5], [1.5, x], [24.5, x]]) s += `<rect x="${rx}" y="${ry}" width="6.2" height="6.2" rx=".8" fill="${k ? b : a}"/>`;
  });
  for (const [cx, cy] of [[4, 4], [28, 4], [4, 28], [28, 28]]) s += hexagon(cx!, cy!, 3.6, corner);
  return url(s + "</svg>");
}

/** The floor: 12px stones a shade off the background, in darker grout; five tones so it doesn't read as a grid. */
export function floor(bg: Rgb, text: Rgb) {
  const tones = [0.025, 0.04, 0.015, 0.05, 0.03];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="${mix(bg, BLACK, 0.22)}"/>`;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    s += `<rect x="${i * 12 + 0.6}" y="${j * 12 + 0.6}" width="10.8" height="10.8" rx="1.2" fill="${mix(bg, text, tones[(i * 3 + j * 2) % 5]!)}"/>`;
  }
  return url(s + "</svg>");
}

let painted = "";
/** Draws the material in the page's current colours (the collection's theme, or Clocktower's velvet). */
export function paintTesserae(root = document.documentElement) {
  const cs = getComputedStyle(root);
  const accent = rgb(cs.getPropertyValue("--brass")), text = rgb(cs.getPropertyValue("--bone")), bg = rgb(cs.getPropertyValue("--velvet-deep"));
  // the stylesheet not in yet (the first frame of a dev load): try again on the next
  if (!accent || !text || !bg) { requestAnimationFrame(() => paintTesserae(root)); return; }
  const key = [accent, text, bg].join();
  if (key === painted) return;
  painted = key;
  // the band in the accent let down into the background, its corners the accent itself: it marks, it doesn't glare
  root.style.setProperty("--band-on", band(mix(accent, bg, 0.3), mix(accent, bg, 0.5), mix(accent, BLACK, 0)));
  root.style.setProperty("--floor", floor(bg, text));
}
