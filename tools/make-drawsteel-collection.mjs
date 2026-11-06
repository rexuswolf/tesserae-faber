// Writes the Draw Steel collection that comes with the app (public/collections/drawsteel.json), its
// logo and the strip of tokens on its cover. A fan collection under the DRAW STEEL Creator License
// (https://mcdm.gg/DS-license): the game's terms and mechanics, game-icons.net icons, no MCDM art;
// what the app says about it (its card, its About, the "Powered by Draw Steel" mark) is code, src/builtins.ts.
//   node tools/make-drawsteel-collection.mjs
// Types: resources and conditions (coins); groups: one per class, the shared ones, the Director's and
// the conditions'; sections: Draw Steel (closed) and your encounters (open).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const GI = JSON.parse(fs.readFileSync(path.join(root, "node_modules/@iconify-json/game-icons/icons.json"), "utf8")).icons;
const INDEX = JSON.parse(fs.readFileSync(path.join(root, "public/game-icons.json"), "utf8"));   // "author/name"
const author = (name) => INDEX.find((x) => x.endsWith(`/${name}`))?.split("/")[0];
// placed as the app places game-icons.net icons (src/icons.ts: GI_PLACE)
const PLACE = "translate(28.063 19.134) scale(0.139518)";
const icon = (name) => {
  const body = GI[name]?.body; if (!body) throw new Error(`no icon ${name}`);
  return { icon: { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${PLACE}">${body.replace(/\s(fill)="[^"]*"/g, "")}</g></svg>` }, iconCredit: { name, author: author(name) } };
};

const CLASSES = [
  { id: "censor", name: "Censor", c: "#c0392b", res: ["wrath", { en: "Wrath", es: "Ira" }, "enrage"] },
  { id: "conduit", name: "Conduit", c: "#e0b33a", res: ["piety", { en: "Piety", es: "Piedad" }, "holy-symbol"] },
  { id: "elementalist", name: "Elementalist", c: "#e67e22", res: ["essence", { en: "Essence", es: "Esencia" }, "fire-ring"] },
  { id: "fury", name: "Fury", c: "#8e3b2e", res: ["ferocity", { en: "Ferocity", es: "Ferocidad" }, "wolf-howl"] },
  { id: "null", name: "Null", c: "#7f8c8d", res: ["discipline", { en: "Discipline", es: "Disciplina" }, "meditation"] },
  { id: "shadow", name: "Shadow", c: "#5b4b8a", res: ["insight", { en: "Insight", es: "Perspicacia" }, "cowled"] },
  { id: "tactician", name: "Tactician", c: "#2e86c1", res: ["focus", { en: "Focus", es: "Concentración" }, "rally-the-troops"] },
  { id: "talent", name: "Talent", c: "#16a085", res: ["clarity", { en: "Clarity", es: "Claridad" }, "third-eye"] },
  { id: "troubadour", name: "Troubadour", c: "#c2185b", res: ["drama", { en: "Drama", es: "Drama" }, "drama-masks"] },
];
const SHARED = [
  ["heroic", { en: "Heroic Resource", es: "Recurso heroico" }, "spark-spirit"],
  ["surge", { en: "Surge", es: "Impulso" }, "power-lightning"],
  ["victory", { en: "Victory", es: "Victoria" }, "laurel-crown"],
  ["recovery", { en: "Recovery", es: "Recuperación" }, "heart-plus"],
  ["hero-token", { en: "Hero Token", es: "Ficha de héroe" }, "round-star"],
];
const DURATIONS = [{ name: { en: "EoT", es: "Fin de turno" } }, { name: { en: "Save ends", es: "Salvación termina" } }];
const CONDITIONS = [
  ["bleeding", { en: "Bleeding", es: "Sangrando" }, "bleeding-wound"],
  ["dazed", { en: "Dazed", es: "Aturdido" }, "knocked-out-stars"],
  ["frightened", { en: "Frightened", es: "Asustado" }, "terror"],
  ["grabbed", { en: "Grabbed", es: "Agarrado" }, "grab"],
  ["prone", { en: "Prone", es: "Derribado" }, "falling"],
  ["restrained", { en: "Restrained", es: "Inmovilizado" }, "manacles"],
  ["slowed", { en: "Slowed", es: "Ralentizado" }, "snail"],
  ["taunted", { en: "Taunted", es: "Provocado" }, "shouting"],
  ["weakened", { en: "Weakened", es: "Debilitado" }, "broken-bone"],
];
const STATES = [
  ["winded", { en: "Winded", es: "Malherido" }, "half-heart"],
  ["dying", { en: "Dying", es: "Moribundo" }, "dead-head"],
];

const tok = (id, type, group, name, ic, linked = []) => ({ id, type, group, name, ...icon(ic), linked });
const tokens = [
  ...SHARED.map(([id, name, ic]) => tok(id, "resources", "shared", name, ic)),
  tok("malice", "resources", "director", { en: "Malice", es: "Malicia" }, "imp-laugh"),
  ...CLASSES.map((k) => tok(k.res[0], "resources", k.id, k.res[1], k.res[2])),
  ...CONDITIONS.map(([id, name, ic]) => tok(id, "conditions", "conditions", name, ic, DURATIONS)),
  ...STATES.map(([id, name, ic]) => tok(id, "conditions", "conditions", name, ic)),
];
const ids = (list) => list.map((x) => x[0]);
const collection = {
  format: "midnight-mint/collection", version: 1,
  name: "Draw Steel",
  theme: { accent: "#d4a017", background: "#16181b", surface: "#202328", text: "#e8e6e1", muted: "#a3a7ad", glow: "#2b2f36", font: "Bricolage Grotesque" },
  brand: { logo: "/collections/drawsteel-logo.svg" },
  loader: { text: { es: "Desenvainando…", en: "Drawing steel…" } },
  languages: ["en", "es"],
  types: [
    { id: "resources", name: { en: "Resources", es: "Recursos" }, title: { en: "All resources", es: "Todos los recursos" }, shape: "coin", icon: "two-coins" },
    { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, title: { en: "Conditions", es: "Condiciones" }, shape: "coin", icon: "bleeding-wound" },
  ],
  groups: [
    { id: "shared", name: { en: "Shared", es: "Compartidos" }, colour: "#d4a017" },
    { id: "director", name: { en: "Director", es: "Director" }, colour: "#7b2d8e" },
    ...CLASSES.map((k) => ({ id: k.id, name: k.name, colour: k.c })),
    { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, colour: "#b8bcc2" },
  ],
  tokens,
  sections: [
    { id: "drawsteel", title: "Draw Steel", open: false, catalogs: [
      { id: "shared", name: { en: "Shared resources", es: "Recursos compartidos" }, tokens: [...ids(SHARED), "malice"] },
      { id: "classes", name: { en: "Class resources", es: "Recursos de clase" }, tokens: CLASSES.map((k) => k.res[0]) },
      { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, tokens: [...ids(CONDITIONS), ...ids(STATES)] },
    ] },
    { id: "encounters", title: { en: "Encounters", es: "Encuentros" }, open: true, catalogs: [] },
  ],
};
const out = path.join(root, "public/collections/drawsteel.json");
fs.writeFileSync(out, JSON.stringify(collection));
console.log(`wrote ${out}: ${tokens.length} tokens`);

// its logo: crossed swords in a steel ring
const swords = GI["crossed-swords"].body.replace(/\s(fill)="[^"]*"/g, "");
fs.writeFileSync(path.join(root, "public/collections/drawsteel-logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Draw Steel</title>
<circle cx="50" cy="50" r="46" fill="#202328" stroke="#d4a017" stroke-width="5"/><g transform="translate(22 22) scale(${56 / 512})" fill="#e8e6e1">${swords}</g></svg>\n`);
// the cover's strip: a few of its tokens, overlapping (icons only: an <img> can't load the token font)
const strip = ["heroic", "wrath", "malice", "victory", "bleeding"].map((id) => tokens.find((t) => t.id === id));
const colour = (t) => collection.groups.find((g) => g.id === t.group).colour;
const coins = strip.map((t, i) => {
  const body = GI[t.iconCredit.name].body.replace(/\s(fill)="[^"]*"/g, "");
  const x = 46 + i * 74;
  return `<g transform="translate(${x} 46)"><circle r="42" fill="#16181b" stroke="${colour(t)}" stroke-width="4"/><circle r="36" fill="none" stroke="${colour(t)}" stroke-opacity=".35"/><g transform="translate(-24 -24) scale(${48 / 512})" fill="${colour(t)}">${body}</g></g>`;
}).join("");
fs.writeFileSync(path.join(root, "public/collections/drawsteel-preview.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 388 92" width="388" height="92">${coins}</svg>\n`);
console.log("wrote drawsteel-logo.svg, drawsteel-preview.svg");
