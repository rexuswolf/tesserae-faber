// A little Markdown, for what a collection says about itself (its About): paragraphs, ## headings,
// lists, **bold**, *italics*, [links](https://…) and bare https addresses. Nothing else is read:
// every other character is escaped, so a collection from someone else's file can't bring HTML,
// scripts or images in, and a link goes only to an http(s) address.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);
const link = (url: string, html: string) => `<a href="${esc(url)}" target="_blank" rel="noopener">${html}</a>`;

/** **bold**, *italics* (or _italics_, not inside a word): the text between, escaped. */
function emphasis(s: string): string {
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|(?<![\p{L}\p{N}])_(?!\s)(.+?)_(?![\p{L}\p{N}])/gu;
  let out = "", at = 0;
  for (const m of s.matchAll(re)) {
    out += esc(s.slice(at, m.index));
    out += m[1] != null ? `<strong>${emphasis(m[1])}</strong>` : `<em>${emphasis(m[2] ?? m[3])}</em>`;
    at = m.index + m[0].length;
  }
  return out + esc(s.slice(at));
}

/** A line's words: [text](https://…), a bare https address (its last stop or bracket left out), and emphasis between them. */
export function inline(s: string): string {
  const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;
  let out = "", at = 0;
  for (const m of s.matchAll(re)) {
    out += emphasis(s.slice(at, m.index));
    out += m[1] != null ? link(m[2], emphasis(m[1])) : link(m[3], esc(m[3]));
    at = m.index + m[0].length;
  }
  return out + emphasis(s.slice(at));
}

const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** The text as HTML: blocks apart by a blank line; in a paragraph, a line break is kept. */
export function markdown(text: string): string {
  return text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/).map((block) => block.replace(/^\n+|\n+$/g, "")).filter((b) => b.trim()).map((block) => {
    const lines = block.split("\n");
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
    if (h && lines.length === 1) return `<h4>${inline(h[2].replace(/\s+#+\s*$/, ""))}</h4>`;
    if (lines.every((l) => ITEM.test(l) || /^\s{2,}\S/.test(l))) {
      const tag = /^\s*\d/.test(lines[0]) ? "ol" : "ul", items: string[] = [];
      for (const l of lines) if (ITEM.test(l)) items.push(l.replace(ITEM, "")); else items[items.length - 1] += " " + l.trim();
      return `<${tag}>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</${tag}>`;
    }
    return `<p>${lines.map((l) => inline(l.trim())).join("<br>")}</p>`;
  }).join("");
}
