import { describe, expect, it } from "vitest";
import { safeIconMarkup, safeTransform } from "../../src/engine/safe-svg.ts";

describe("safeIconMarkup", () => {
  it("keeps shapes and their geometry", () => {
    const out = safeIconMarkup('<g transform="translate(1 2)"><path d="M0 0h9v9z" fill-rule="evenodd"/><circle cx="1" cy="2" r="3"/></g>');
    expect(out).toContain('<path d="M0 0h9v9z" fill-rule="evenodd">');
    expect(out).toContain('<circle cx="1" cy="2" r="3">');
    expect(out).toContain('transform="translate(1 2)"');
  });
  it("drops scripts, images, foreign content, handlers and styles", () => {
    const out = safeIconMarkup('<path d="M0 0z" onclick="x()" style="a"/><script>alert(1)</script><image href="x" onerror="alert(1)"/><foreignObject><div onclick="y"/></foreignObject><a href="javascript:z"><path d="M1 1z"/></a>');
    expect(out).not.toMatch(/script|image|foreignObject|onclick|onerror|style|href|javascript/i);
    expect(out).toContain('d="M0 0z"');
  });
  it("drops a transform that isn't only numbers", () => {
    expect(safeIconMarkup('<g transform="url(javascript:x)"><path d="M0 0z"/></g>')).not.toContain("transform");
  });
  it("escapes attribute values", () => {
    expect(safeIconMarkup('<path d="M0 0&quot;&gt;&lt;script&gt;"/>')).not.toMatch(/"><script/);
  });
});

describe("safeTransform", () => {
  it("accepts transform functions with numbers", () => expect(safeTransform("translate(1, -2) scale(.5) rotate(45 1 1)")).toBe("translate(1, -2) scale(.5) rotate(45 1 1)"));
  it("refuses anything else", () => {
    for (const v of ["url(x)", "translate(1)x", 5, null, "a".repeat(600)]) expect(safeTransform(v)).toBe("");
  });
});
