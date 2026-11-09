import { describe, expect, it } from "vitest";
import { markdown, inline } from "../../src/markdown.ts";
import { foldAbout, readCollectionFile, collectionFile, starterCollection } from "../../src/collection.ts";

const a = (url: string, text = url) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;

describe("a collection's About, in Markdown", () => {
  it("is paragraphs apart by a blank line, a line break kept inside one", () => {
    expect(markdown("One\nline two\n\n\nTwo")).toBe("<p>One<br>line two</p><p>Two</p>");
    expect(markdown("  \n\n")).toBe("");
  });
  it("has links, written or bare, to http(s) addresses only", () => {
    expect(inline("Based on [Secret Hitler](https://www.secrethitler.com), licensed")).toBe(`Based on ${a("https://www.secrethitler.com", "Secret Hitler")}, licensed`);
    expect(inline("available at https://www.dndbeyond.com/srd. The")).toBe(`available at ${a("https://www.dndbeyond.com/srd")}. The`);
    expect(inline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
    expect(inline('[x](https://e.com/"onmouseover=1)')).not.toMatch(/href="[^"]*"[^>]*onmouseover/);
  });
  it("has bold, italics, ## headings and lists", () => {
    expect(inline("**Gold** and *silver*, not snake_case_words")).toBe("<strong>Gold</strong> and <em>silver</em>, not snake_case_words");
    expect(markdown("## Credits\n\n- one\n- [two](https://t.co)\n  more")).toBe(`<h4>Credits</h4><ul><li>one</li><li>${a("https://t.co", "two")} more</li></ul>`);
    expect(markdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });
  it("brings no HTML in: everything else is text", () => {
    const html = markdown('<script>alert(1)</script> <img src=x onerror=alert(1)> & "q"\n\n![i](https://e.com/i.png)');
    expect(html).not.toMatch(/<(script|img)/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; &quot;q&quot;");
  });
});

describe("an About as it was (its credits and links apart)", () => {
  it("has them in its text now, each language its own, the links as Markdown", () => {
    expect(foldAbout({
      text: { es: "Qué es.", en: "What it is." },
      credits: { es: "Créditos.", en: "Credits." },
      links: [{ label: "Web", url: "https://e.com" }, { label: "Bad", url: "javascript:x" }],
    })).toEqual({ text: { es: "Qué es.\n\nCréditos.\n\n[Web](https://e.com)", en: "What it is.\n\nCredits.\n\n[Web](https://e.com)" } });
    expect(foldAbout({ text: "Plain", links: [] })).toEqual({ text: "Plain" });
    expect(foldAbout({ text: "", credits: "", links: [] })).toBeUndefined();
    expect(foldAbout({ text: { es: "Ya." } })).toEqual({ text: { es: "Ya." } });
  });
});

describe("the name beside its logo, as it was", () => {
  it("is its name now: the one it was seen by", async () => {
    const f = { ...JSON.parse(JSON.stringify(collectionFile(starterCollection()))), name: "Long name", brand: { title: { es: "Corto", en: "Short" } } };
    const c = await readCollectionFile(f);
    expect(c.name).toEqual({ es: "Corto", en: "Short" });
    expect(c.brand).toEqual({});
    const blank = await readCollectionFile({ ...f, brand: { title: "  " } });
    expect(blank.name).toBe("Long name");
  });
});
