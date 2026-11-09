// A collection the generators write (types and sections, as they're made) as the app keeps them now:
// each token with its shape (its type's), the closed sections' catalogs as the collection's own
// lists (fixed), and no types nor sections. The open sections were empty (yours, to fill): they go,
// since your lists are yours wherever. A type showed what a list or a shape shows already.
//   import { asLists } from "./collection-model.mjs";
//   node tools/collection-model.mjs public/collections/<id>.json   (converts the file in place)
import fs from "node:fs";

export function asLists(c) {
  const shapeOf = new Map((c.types ?? []).map((t) => [t.id, t.shape ?? "coin"]));
  const tokens = c.tokens.map(({ type, ...t }) => ({ ...t, shape: t.shape ?? shapeOf.get(type) ?? "coin" }));
  const catalogs = c.catalogs ?? (c.sections ?? []).filter((s) => !s.open).flatMap((s) => s.catalogs.map((k) => ({ ...k, fixed: true })));
  const { types: _types, sections: _sections, ...rest } = c;
  // the tokens where they were, among the other fields: the file reads as it did
  const out = {};
  for (const [k, v] of Object.entries(rest)) {
    out[k] = k === "tokens" ? tokens : v;
    if (k === "tokens") out.catalogs = catalogs;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of process.argv.slice(2)) {
    const raw = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, JSON.stringify(asLists(JSON.parse(raw))) + (raw.endsWith("\n") ? "\n" : ""));
    console.log("lists:", file);
  }
}
