// Icon markup from outside (an uploaded or imported SVG, a collection file, a shared script) is drawn
// as HTML in the previews, so only its shapes are kept: the elements below with their geometry,
// rebuilt and escaped. Anything else (scripts, images, event handlers, links, styles) is dropped.

const SHAPES = new Set(["g", "path", "circle", "ellipse", "rect", "polygon", "polyline", "line"]);
const ATTRS = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "points", "x1", "y1", "x2", "y2", "transform", "fill-rule", "clip-rule"]);
const TRANSFORM = /^(\s*(translate|scale|rotate|matrix|skewX|skewY)\(\s*[-+0-9.eE,\s]*\)\s*)*$/;
const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A transform attribute's value if it is only transform functions with numbers, else "". */
export const safeTransform = (v: unknown): string => (typeof v === "string" && v.length < 500 && TRANSFORM.test(v) ? v : "");

const memo = new Map<string, string>();
/** Icon markup with only its shapes and their geometry. */
export function safeIconMarkup(markup: string): string {
  const hit = memo.get(markup);
  if (hit !== undefined) return hit;
  let out: string;
  if (typeof DOMParser === "undefined") {
    // no DOM (a script run in node): its paths' outlines only
    out = [...markup.matchAll(/<path\b[^>]*\sd="([-+0-9.,eEa-zA-Z\s]+)"/g)].map((m) => `<path d="${m[1]}"/>`).join("");
  } else {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml");
    const walk = (el: Element): string => [...el.children].map((c) => {
      const tag = c.localName;
      if (!SHAPES.has(tag)) return "";
      const attrs = [...c.attributes].filter((a) => ATTRS.has(a.name) && (a.name !== "transform" || safeTransform(a.value)))
        .map((a) => ` ${a.name}="${escAttr(a.value)}"`).join("");
      return `<${tag}${attrs}>${walk(c)}</${tag}>`;
    }).join("");
    out = doc.querySelector("parsererror") ? "" : walk(doc.documentElement);
  }
  memo.set(markup, out);
  if (memo.size > 3000) memo.delete(memo.keys().next().value!);
  return out;
}
