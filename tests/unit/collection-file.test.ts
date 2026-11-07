import { describe, expect, it, vi } from "vitest";
import { collectionFile, readCollectionFile, readTokenList, starterCollection, COLLECTION_FORMAT } from "../../src/collection.ts";
import type { Collection } from "../../src/collection.ts";

const file = (over: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(collectionFile(starterCollection()))), ...over });
const svg = (body: string, g = "translate(0 0) scale(1)") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${g}">${body}</g></svg>`;

describe("a collection file", () => {
  it("reads back the collection it was written from", async () => {
    const c = starterCollection();
    expect(await readCollectionFile(JSON.parse(JSON.stringify(collectionFile(c))))).toEqual(c);
  });
  it("is refused when it isn't a collection", async () => {
    for (const d of [null, [], { format: "other" }, { format: COLLECTION_FORMAT, tokens: [] }]) await expect(readCollectionFile(d)).rejects.toThrow("not-collection");
  });
  it("keeps only safe ids, the first of a repeated one, and references to what exists", async () => {
    const c = await readCollectionFile(file({
      groups: [{ id: 'g"1><x', name: "A", colour: "#112233" }, { id: 'g"1><x', name: "dup", colour: "#445566" }],
      tokens: [
        { id: "a:b c", type: "nope", group: 'g"1><x', name: "One", linked: [] },
        { id: "a:b c", name: "Repeated", linked: [] },
        { id: "t2", name: { en: "Two", es: "Dos" }, linked: ["x", 5] },
      ],
      sections: [{ id: "s 1", open: true, catalogs: [{ id: "k", name: "K", tokens: ["a:b c", "ghost"] }] }],
    }));
    expect(c.groups.map((g) => g.id)).toEqual(["g_1__x"]);
    expect(c.tokens.map((t) => [t.id, t.type, t.group])).toEqual([["a_b_c", "fichas", "g_1__x"], ["t2", "fichas", "g_1__x"]]);
    expect(c.tokens[1].linked).toEqual(["x"]);
    expect(c.sections[0]).toMatchObject({ id: "s_1", catalogs: [{ tokens: ["a_b_c"] }] });
  });
  it("drops what a design can't have", async () => {
    const c = await readCollectionFile(file({
      styles: { coin: [{ id: "d", name: "D", spec: {
        diameter: 40, lang: "xx", nonsense: 1, depth: "deep",
        colours: { base: "#ffffff", front: "team", frame: "red", backBase: "#1d1c21", nonsense: "#000000" },
        relief: { text: true, icon: "yes", evil: true },
        backFace: { frame: "rim", backFace: { frame: "x" } },
        edge: "spiky", reliefBevel: 2,
      } }] },
      languages: ["en", "es-ES", "../x", "EN"],
    }));
    expect(c.styles!.coin![0].spec).toEqual({ diameter: 40, colours: { base: "#ffffff", front: "team", backBase: "#1d1c21" }, relief: { text: true }, backFace: { frame: "rim" } });
    expect(c.languages).toEqual(["en"]);
  });
  it("keeps a card design's icon place and back of its own, checked, through a round trip", async () => {
    const back = { on: true, text: "El Senado", name: "collection", cardIcon: "left", cardJoin: "together", cardIconSize: 30, frame: "laurel", frameWidth: 0.6,
      icon: { id: "lorc/laurel-crown", source: "game-icons", name: "laurel-crown", author: "lorc", g: "translate(1 2) scale(0.5)", body: '<path d="M0 0h9v9z"></path>' },
      colours: { text: "#c9a227", frame: "team" } };
    const card = { frame: "laurel", cardIcon: "left", cardJoin: "spread", cardIconSize: 30, cardBack: back, colours: { base: "#1d1c21", backBase: "#1d1c21" } };
    const c = await readCollectionFile(file({ styles: { card: [{ id: "ley", name: "Ley", spec: card }] } }));
    expect(c.styles!.card![0].spec).toEqual(card);
    expect(await readCollectionFile(JSON.parse(JSON.stringify(collectionFile(c))))).toEqual(c);
    // and nothing it can't have: a place or join it doesn't know, a size out of range, an icon's script, a colour that isn't one
    const odd = await readCollectionFile(file({ styles: { card: [{ id: "x", name: "X", spec: {
      cardIcon: "middle", cardJoin: "apart", cardIconSize: 400,
      cardBack: { on: "yes", text: 5, name: "other", cardIcon: "top", frameWidth: 9, evil: 1, icon: { id: "i", g: "url(x)", body: '<path d="M1 1z" onclick="evil()"/><script>x</script>' }, colours: { text: "red", frame: "#ffffff" } },
    } }] } }));
    expect(odd.styles!.card![0].spec).toEqual({ cardBack: { on: false, icon: { id: "i", g: "", body: '<path d="M1 1z"></path>' }, colours: { frame: "#ffffff" } } });
  });
  it("keeps an icon's shapes only", async () => {
    const c = await readCollectionFile(file({
      tokens: [{ id: "t1", name: "x", linked: [], icon: { svg: svg('<path d="M0 0h9v9z" onclick="evil()"/><script>alert(1)</script>') }, iconCredit: { name: 7, author: "someone" } }],
    }));
    expect(c.tokens[0].icon).toMatchObject({ source: "game-icons", author: "someone", body: '<path d="M0 0h9v9z"></path>' });
    expect(c.tokens[0].icon).not.toHaveProperty("name");
  });
  it("reads a game-icons.net icon from its drawing, without the network", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const c = await readCollectionFile(file({ tokens: [{ id: "t1", name: "x", linked: [], icon: "lorc/crossed-swords", iconSvg: svg('<path d="M1 1z"/>', "translate(1 2)") }] }));
    expect(c.tokens[0].icon).toEqual({ id: "lorc/crossed-swords", source: "game-icons", author: "lorc", name: "crossed-swords", g: "translate(1 2)", body: '<path d="M1 1z"></path>' });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe("readTokenList", () => {
  const c: Collection = { ...starterCollection(), tokens: [
    { id: "t1", type: "fichas", group: "g1", name: { es: "Lavandera", en: "Washerwoman" }, icon: null, linked: [] },
    { id: "t2", type: "fichas", group: "g1", name: "Diablillo", icon: null, linked: [], flip: { name: "Imp", icon: null } },
  ] };
  it("matches a Script Tool script by id or name, ignoring case and accents", () => {
    expect(readTokenList(c, JSON.stringify([{ id: "_meta", name: "Mine" }, "washerwoman", { id: "IMP" }, "nobody"]))).toEqual({ name: "Mine", ids: ["t1", "t2"], missing: ["nobody"] });
  });
  it("reads names one per line", () => expect(readTokenList(c, "Lavandera\ndiablillo\n").ids).toEqual(["t1", "t2"]));
});
