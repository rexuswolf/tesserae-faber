// Writes the Draw Steel collection that comes with the app (public/collections/drawsteel.json), its
// logo and the strip of tokens on its cover. A fan collection under the DRAW STEEL Creator License
// (https://mcdm.gg/DS-license): the game's terms and mechanics, game-icons.net icons, no MCDM art;
// what the app says about it (its card, its About, the "Powered by Draw Steel" mark) is code, src/builtins.ts.
//   node tools/make-drawsteel-collection.mjs
// Types: resources and conditions (coins), and condition rings (one per condition, to go round a
// miniature's base); two-state coins (their back the other state: Ready / Acted) are resources;
// groups: one per class, the shared ones, the Director's and the conditions';
// sections: Draw Steel (closed) and your encounters (open).
import fs from "node:fs";
import path from "node:path";
import { BUILT_INS } from "../src/builtins.ts";   // its theme and loading screen: one place
import { FILAMENTS } from "../src/engine/token-engine.ts";
import { ringDesigns } from "../src/shape-designs.ts";
const DS = BUILT_INS.find((b) => b.id === "drawsteel");

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

// group colours are filaments the printer has (src/collection.ts GROUP_COLOURS), so a plate can print them
const CLASSES = [
  { id: "censor", name: "Censor", c: "#b3191e", res: ["wrath", { en: "Wrath", es: "Ira" }, "enrage"] },
  { id: "conduit", name: "Conduit", c: "#c9a227", res: ["piety", { en: "Piety", es: "Piedad" }, "holy-symbol"] },
  { id: "elementalist", name: "Elementalist", c: "#9a6a3a", res: ["essence", { en: "Essence", es: "Esencia" }, "fire-ring"] },
  { id: "fury", name: "Fury", c: "#b3191e", res: ["ferocity", { en: "Ferocity", es: "Ferocidad" }, "wolf-howl"] },
  { id: "null", name: "Null", c: "#a7adb4", res: ["discipline", { en: "Discipline", es: "Disciplina" }, "meditation"] },
  { id: "shadow", name: "Shadow", c: "#8a3d9e", res: ["insight", { en: "Insight", es: "Perspicacia" }, "cowled"] },
  { id: "tactician", name: "Tactician", c: "#2f86e0", res: ["focus", { en: "Focus", es: "Concentración" }, "rally-the-troops"] },
  { id: "talent", name: "Talent", c: "#3f9651", res: ["clarity", { en: "Clarity", es: "Claridad" }, "third-eye"] },
  { id: "troubadour", name: "Troubadour", c: "#ece9e2", res: ["drama", { en: "Drama", es: "Drama" }, "drama-masks"] },
];
const SHARED = [
  ["heroic", { en: "Heroic Resource", es: "Recurso heroico" }, "spark-spirit"],
  ["surge", { en: "Surge", es: "Impulso" }, "power-lightning"],
  ["victory", { en: "Victory", es: "Victoria" }, "laurel-crown"],
  ["recovery", { en: "Recovery", es: "Recuperación" }, "heart-plus"],
  ["hero-token", { en: "Hero Token", es: "Ficha de héroe" }, "round-star"],
];
// Two-state coins: the front and, on the back, the other state (name and icon), for the turn's
// bookkeeping: side-by-side initiative (who has acted) and each creature's one triggered action.
const TWO_STATE = [
  ["ready", { en: "Ready", es: "Por actuar" }, "sprint", { en: "Acted", es: "Ya actuó" }, "sands-of-time"],
  ["triggered", { en: "Triggered Action", es: "Reacción" }, "lightning-trio", { en: "Triggered Action Used", es: "Reacción usada" }, "lightning-dissipation"],
];
const DURATIONS = [{ name: { en: "EoT", es: "Fin de turno" } }, { name: { en: "Save ends", es: "Salvación termina" } }];
// Each condition and state has a colour of its own (the token's, over its group's), its coin and its
// ring alike: filaments the printer has (src/collection.ts GROUP_COLOURS), as near as they go to what
// it is. There are fewer filaments than conditions, so a few share: Winded Bleeding's red (both
// wounds), Taunted gold (beside Dazed's yellow), Prone Grabbed's bronze (the ground).
const C = { red: "#b3191e", yellow: "#d4a72c", gold: "#c9a227", purple: "#8a3d9e", bronze: "#9a6a3a", silver: "#a7adb4", blue: "#2f86e0", green: "#3f9651", bone: "#ece9e2" };
const CONDITIONS = [
  ["bleeding", { en: "Bleeding", es: "Sangrando" }, "bleeding-wound", C.red],
  ["dazed", { en: "Dazed", es: "Aturdido" }, "knocked-out-stars", C.yellow],
  ["frightened", { en: "Frightened", es: "Asustado" }, "terror", C.purple],
  ["grabbed", { en: "Grabbed", es: "Agarrado" }, "grab", C.bronze],
  ["prone", { en: "Prone", es: "Derribado" }, "falling", C.bronze],
  ["restrained", { en: "Restrained", es: "Inmovilizado" }, "manacles", C.silver],
  ["slowed", { en: "Slowed", es: "Ralentizado" }, "snail", C.blue],
  ["taunted", { en: "Taunted", es: "Provocado" }, "shouting", C.gold],
  ["weakened", { en: "Weakened", es: "Debilitado" }, "broken-bone", C.green],
];
const STATES = [
  ["winded", { en: "Winded", es: "Malherido" }, "half-heart", C.red],
  ["dying", { en: "Dying", es: "Moribundo" }, "dead-head", C.bone],
];

const tok = (id, type, group, name, ic, linked = []) => ({ id, type, group, name, ...icon(ic), linked });
const tokens = [
  ...SHARED.map(([id, name, ic]) => tok(id, "resources", "shared", name, ic)),
  tok("malice", "resources", "director", { en: "Malice", es: "Malicia" }, "imp-laugh"),
  ...TWO_STATE.map(([id, name, ic, other, otherIcon]) => ({ ...tok(id, "resources", "shared", name, ic), flip: { name: other, ...icon(otherIcon) } })),
  ...CLASSES.map((k) => tok(k.res[0], "resources", k.id, k.res[1], k.res[2])),
  ...CONDITIONS.map(([id, name, ic, colour]) => ({ ...tok(id, "conditions", "conditions", name, ic, DURATIONS), colour })),
  ...STATES.map(([id, name, ic, colour]) => ({ ...tok(id, "conditions", "conditions", name, ic), colour })),
  // the rings carry only their name, all the way round: no icon; each in its condition's colour
  ...[...CONDITIONS, ...STATES].map(([id, name, , colour]) => ({ id: `ring-${id}`, type: "rings", group: "conditions", name, linked: [], colour })),
];
const ids = (list) => list.map((x) => x[0]);

// The styles it comes with (src/collection.ts StyleDef), per shape; "team" is the token's group colour.
// The first is what its tokens looked like before collections had styles, under that look's old id
// ("edicion"), so whoever printed them gets the same.
const STEEL = { style: "classic", frame: "rim", frameWidth: 0.8, back: "edition", depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } };
const styles = {
  coin: [
    { id: "edicion", name: { es: "Acero", en: "Steel" }, help: { es: "Negra, con el nombre, el icono y el borde del color del grupo, y el catálogo en oro al reverso.", en: "Black, with the name, icon and rim in the group colour, and the catalog in gold on the back." }, spec: STEEL },
    // raised letters: on white the group colour reads by its edge too, even a pale one
    { id: "pergamino", name: { es: "Pergamino", en: "Parchment" }, help: { es: "Blanca, con las letras en relieve del color del grupo y el catálogo en negro al reverso.", en: "White, with raised letters in the group colour and the catalog in black on the back." },
      spec: { style: "classic", frame: "rim", frameWidth: 1.0, back: "edition", depth: 0.4, relief: { text: true, frame: false, icon: false }, reliefHeight: 0.6, colours: { base: FILAMENTS.white, front: "team", frame: "team", back: FILAMENTS.black } } },
    // the window: the icon on the group colour, the name large below, for the far end of the table
    { id: "legible", name: { es: "Legible", en: "Legible" }, help: { es: "Ventana del color del grupo con el icono y el nombre grande debajo.", en: "A window in the group colour with the icon, and the name large below." },
      spec: { style: "window", textSize: 6, frame: "none", back: "edition", depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  ],
  // rings: the designs made for them (src/shape-designs.ts), High relief first (it reads from the
  // side, next to the miniature); no cards: Draw Steel has none, a copy with some gets Basic's
  ring: ringDesigns("relieve-alto", "filos", "aro-color", "rapida"),
};
const collection = {
  format: "midnight-mint/collection", version: 1,
  name: "Draw Steel",
  theme: DS.theme,
  brand: { logo: "/collections/drawsteel-logo.svg" },
  loader: DS.loader,
  languages: ["en", "es"],
  types: [
    { id: "resources", name: { en: "Resources", es: "Recursos" }, title: { en: "All resources", es: "Todos los recursos" }, shape: "coin", icon: "two-coins" },
    { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, title: { en: "Conditions", es: "Condiciones" }, shape: "coin", icon: "bleeding-wound" },
    { id: "rings", name: { en: "Condition rings", es: "Aros de condición" }, title: { en: "Condition rings", es: "Aros de condición" }, shape: "ring", icon: "ring" },
  ],
  groups: [
    // each with an icon of its own (its filter on the sheet, its plates): the class's resource, and so on
    { id: "shared", name: { en: "Shared", es: "Compartidos" }, colour: "#d4a72c", iconBody: GI["spark-spirit"].body },
    { id: "director", name: { en: "Director", es: "Director" }, colour: "#8a3d9e", iconBody: GI["imp-laugh"].body },
    ...CLASSES.map((k) => ({ id: k.id, name: k.name, colour: k.c, iconBody: GI[k.res[2]].body })),
    { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, colour: "#a7adb4", iconBody: GI["bleeding-wound"].body },
  ],
  tokens,
  sections: [
    { id: "drawsteel", title: "Draw Steel", open: false, catalogs: [
      { id: "shared", name: { en: "Shared resources", es: "Recursos compartidos" }, tokens: [...ids(SHARED), "malice"] },
      { id: "classes", name: { en: "Class resources", es: "Recursos de clase" }, tokens: CLASSES.map((k) => k.res[0]) },
      { id: "two-sided", name: { en: "Two-sided tokens", es: "Fichas de dos caras" }, tokens: ids(TWO_STATE) },
      { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, tokens: [...ids(CONDITIONS), ...ids(STATES)] },
      { id: "rings", name: { en: "Condition rings", es: "Aros de condición" }, tokens: [...ids(CONDITIONS), ...ids(STATES)].map((id) => `ring-${id}`) },
    ] },
    { id: "encounters", title: { en: "Encounters", es: "Encuentros" }, open: true, catalogs: [] },
  ],
  styles,
};
const out = path.join(root, "public/collections/drawsteel.json");
fs.writeFileSync(out, JSON.stringify(collection));
console.log(`wrote ${out}: ${tokens.length} tokens`);

// its logo: crossed swords in a steel ring
const swords = GI["crossed-swords"].body.replace(/\s(fill)="[^"]*"/g, "");
fs.writeFileSync(path.join(root, "public/collections/drawsteel-logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Draw Steel</title>
<circle cx="50" cy="50" r="46" fill="#202328" stroke="#d4a017" stroke-width="5"/><g transform="translate(22 22) scale(${56 / 512})" fill="#e8e6e1">${swords}</g></svg>\n`);
// the cover's strip, with the tokens' names: tools/make-crear-art.mjs (drawn by the app's engine)
console.log("wrote drawsteel-logo.svg");
