// Writes the 5e Fantasy collection that comes with the app (public/collections/srd5e.json) and its
// logo; the strip of tokens on its cover is tools/make-crear-art.mjs. Only what the System Reference
// Document 5.2 holds (Wizards of the Coast, CC BY 4.0: its attribution is in the collection's About,
// src/builtins.ts): its conditions, rules terms and spell names; game-icons.net icons; no trademark,
// logo or art of the publisher's.
//   node tools/make-srd5e-collection.mjs
// Types: conditions (coins), table markers and spell effects (coins), and condition rings (one per
// condition, and Concentrating, Bloodied and Hidden, to go round a miniature's base); two-state coins
// (their back the other state: Reaction / Reaction used, Advantage / Disadvantage) are markers;
// groups: the conditions', the table's, combat's, the spells that help and the spells that hinder;
// sections: 5e Fantasy (closed) and your encounters (open).
import fs from "node:fs";
import path from "node:path";
import { BUILT_INS } from "../src/builtins.ts";   // its theme and loading screen: one place
import { FILAMENTS } from "../src/engine/token-engine.ts";
import { ringDesigns } from "../src/shape-designs.ts";
const SRD = BUILT_INS.find((b) => b.id === "srd5e");

const root = path.resolve(import.meta.dirname, "..");
const GI = JSON.parse(fs.readFileSync(path.join(root, "node_modules/@iconify-json/game-icons/icons.json"), "utf8")).icons;
const INDEX = JSON.parse(fs.readFileSync(path.join(root, "public/game-icons.json"), "utf8"));   // "author/name"
const author = (name) => INDEX.find((x) => x.endsWith(`/${name}`))?.split("/")[0];
// placed as the app places game-icons.net icons (src/icons.ts: GI_PLACE)
const PLACE = "translate(28.063 19.134) scale(0.139518)";
const icon = (name) => {
  const body = GI[name]?.body; if (!body) throw new Error(`no icon ${name}`);
  if (!author(name)) throw new Error(`no author for ${name}`);
  return { icon: { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${PLACE}">${body.replace(/\s(fill)="[^"]*"/g, "")}</g></svg>` }, iconCredit: { name, author: author(name) } };
};

// Colours are filaments the printer has (src/collection.ts GROUP_COLOURS), so a plate can print them.
// Each condition has a colour of its own (its coin's and its ring's), as near as they go to what it
// is; there are fewer filaments than conditions, so some share: the senses silver (Blinded,
// Deafened) and Invisible bone; the body held bronze (Grappled, Prone, Restrained); the mind's
// red and purple (Charmed, Frightened); out of the fight yellow and blue (Stunned, Incapacitated;
// Paralyzed, Unconscious); Petrified the stone's silver, Poisoned green, Exhaustion gold.
const C = { red: "#b3191e", yellow: "#d4a72c", gold: "#c9a227", purple: "#8a3d9e", bronze: "#9a6a3a", silver: "#a7adb4", blue: "#2f86e0", green: "#3f9651", bone: "#ece9e2" };
// the SRD's fifteen conditions; the Spanish, the established 5e terms
const CONDITIONS = [
  ["blinded", { en: "Blinded", es: "Cegado" }, "blindfold", C.silver],
  ["charmed", { en: "Charmed", es: "Hechizado" }, "smitten", C.red],
  ["deafened", { en: "Deafened", es: "Ensordecido" }, "hearing-disabled", C.silver],
  ["exhaustion", { en: "Exhaustion", es: "Agotamiento" }, "tired-eye", C.gold],
  ["frightened", { en: "Frightened", es: "Asustado" }, "terror", C.purple],
  ["grappled", { en: "Grappled", es: "Agarrado" }, "grab", C.bronze],
  ["incapacitated", { en: "Incapacitated", es: "Incapacitado" }, "knockout", C.yellow],
  ["invisible", { en: "Invisible", es: "Invisible" }, "invisible", C.bone],
  ["paralyzed", { en: "Paralyzed", es: "Paralizado" }, "frozen-body", C.blue],
  ["petrified", { en: "Petrified", es: "Petrificado" }, "stone-bust", C.silver],
  ["poisoned", { en: "Poisoned", es: "Envenenado" }, "poison-bottle", C.green],
  ["prone", { en: "Prone", es: "Derribado" }, "falling", C.bronze],
  ["restrained", { en: "Restrained", es: "Apresado" }, "spider-web", C.bronze],
  ["stunned", { en: "Stunned", es: "Aturdido" }, "knocked-out-stars", C.yellow],
  ["unconscious", { en: "Unconscious", es: "Inconsciente" }, "night-sleep", C.blue],
];
// How long a condition lasts, as linked tokens beside it; Exhaustion's, its level instead (1 to 6)
const DURATIONS = [{ name: { en: "End of turn", es: "Fin de turno" } }, { name: { en: "Save ends", es: "Hasta salvar" } }, { name: { en: "1 minute", es: "1 minuto" } }];
const LEVELS = [1, 2, 3, 4, 5, 6].map((n) => ({ name: { en: `Level ${n}`, es: `Nivel ${n}` } }));
// a spell held by Concentration: its linked token, to set beside the caster
const CONCENTRATING = [{ name: { en: "Concentration", es: "Concentración" } }];
// Markers for the table: what a creature has or keeps track of
const TABLE = [
  ["inspiration", { en: "Heroic Inspiration", es: "Inspiración heroica" }, "inspiration"],
  ["concentration", { en: "Concentration", es: "Concentración" }, "concentration-orb"],
];
// Two-state coins: the front and, on the back, the other state (name and icon)
const TWO_STATE = [
  ["reaction", { en: "Reaction", es: "Reacción" }, "lightning-trio", { en: "Reaction Used", es: "Reacción usada" }, "lightning-dissipation"],
  ["advantage", { en: "Advantage", es: "Ventaja" }, "dice-twenty-faces-twenty", { en: "Disadvantage", es: "Desventaja" }, "dice-twenty-faces-one"],
];
// in the fight: each with its colour, over the group's red
const COMBAT = [
  ["bloodied", { en: "Bloodied", es: "Malherido" }, "bleeding-heart", C.red],
  ["dead", { en: "Dead", es: "Muerto" }, "dead-head", C.bone],
  ["hidden", { en: "Hidden", es: "Escondido" }, "cowled", C.purple],
  ["dodging", { en: "Dodging", es: "Esquivando" }, "dodging", C.blue],
  ["flying", { en: "Flying", es: "Volando" }, "feathered-wing", C.bone],
];
// spells' effects on a creature: the ones that help (green) and the ones that hinder (purple)
const BOONS = [
  ["bless", { en: "Bless", es: "Bendición" }, "holy-symbol"],
  ["haste", { en: "Haste", es: "Acelerar" }, "wingfoot"],
  ["shield-of-faith", { en: "Shield of Faith", es: "Escudo de fe" }, "templar-shield"],
  ["sanctuary", { en: "Sanctuary", es: "Santuario" }, "angel-wings"],
];
const BANES = [
  ["bane", { en: "Bane", es: "Perdición" }, "cursed-star"],
  ["slow", { en: "Slow", es: "Ralentizar" }, "snail"],
  ["hunters-mark", { en: "Hunter's Mark", es: "Marca del cazador" }, "hunter-eyes"],
  ["faerie-fire", { en: "Faerie Fire", es: "Fuego feérico" }, "sparkles"],
];
// the rings carry only their name, all the way round: the conditions, and what's kept on a creature for long
const RINGS = [...CONDITIONS, ["concentration", TABLE[1][1], , C.yellow], COMBAT[0], COMBAT[2]];

const tok = (id, type, group, name, ic, linked = []) => ({ id, type, group, name, ...icon(ic), linked });
const tokens = [
  ...CONDITIONS.map(([id, name, ic, colour]) => ({ ...tok(id, "conditions", "conditions", name, ic, id === "exhaustion" ? LEVELS : DURATIONS), colour })),
  ...TABLE.map(([id, name, ic]) => tok(id, "markers", "table", name, ic)),
  ...TWO_STATE.map(([id, name, ic, other, otherIcon]) => ({ ...tok(id, "markers", "table", name, ic), flip: { name: other, ...icon(otherIcon) } })),
  ...COMBAT.map(([id, name, ic, colour]) => ({ ...tok(id, "markers", "combat", name, ic), colour })),
  ...BOONS.map(([id, name, ic]) => tok(id, "spells", "boons", name, ic, CONCENTRATING)),
  ...BANES.map(([id, name, ic]) => tok(id, "spells", "banes", name, ic, CONCENTRATING)),
  ...RINGS.map(([id, name, , colour]) => ({ id: `ring-${id}`, type: "rings", group: "conditions", name, linked: [], colour })),
];
const ids = (list) => list.map((x) => x[0]);

// The styles it comes with (src/collection.ts StyleDef), per shape; "team" is the token's group
// colour. Its own three, then the app's (src/shape-designs.ts APP_DESIGNS), offered in every collection.
const styles = {
  coin: [
    // the default: black, the group colour, a small shield and the collection's name in gold on the back
    { id: "mazmorra", name: { es: "Mazmorra", en: "Dungeon" },
      help: { es: "Negra, con el nombre, el icono y el borde del color del grupo; al reverso, un escudete y «Fantasía 5e» en oro.", en: "Black, with the name, icon and rim in the group colour; on the back, a small shield and «5e Fantasy» in gold." },
      spec: { style: "classic", frame: "rim", frameWidth: 0.8, back: "escudete", backText: "collection", depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
    // runes round the rim in the group colour; a silver medallion on the back
    { id: "runas", name: { es: "Runas", en: "Runes" },
      help: { es: "Negra, con un anillo de runas del color del grupo alrededor del icono y el nombre; al reverso, un medallón de plata.", en: "Black, with a ring of runes in the group colour round the icon and the name; on the back, a silver medallion." },
      spec: { style: "classic", frame: "runas", frameWidth: 0.8, back: "medallon", backText: "collection", depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.silver } } },
    // a struck gold piece: icon, milled frame and name raised and bevelled in the gold, a reeded
    // edge; on the back the shield and the collection's name in black
    { id: "pieza-de-oro", name: { es: "Pieza de oro", en: "Gold piece" },
      help: { es: "De oro, con el icono y el nombre en relieve biselado, el marco acuñado en relieve y el canto estriado; al reverso, el escudo y «Fantasía 5e» en negro.", en: "Gold, with the icon and the name in bevelled relief, the milled frame raised and a reeded edge; on the back, the shield and «5e Fantasy» in black." },
      spec: { style: "classic", frame: "acunado", frameWidth: 0.8, back: "escudo", backText: "collection", depth: 0.4, relief: { text: true, frame: true, icon: true }, reliefHeight: 0.8, reliefBevel: 0.3, edge: "reeded", colours: { base: FILAMENTS.gold, front: FILAMENTS.gold, frame: FILAMENTS.gold, back: FILAMENTS.black } } },
  ],
  // rings: the app's High relief its default (it reads from the side, next to the miniature), the
  // rest the app's; no cards: a copy with some gets Basic's
  ring: ringDesigns("relieve-alto"),
};
const collection = {
  format: "midnight-mint/collection", version: 1,
  name: { es: "Fantasía 5e", en: "5e Fantasy" },
  theme: SRD.theme,
  brand: { logo: "/collections/srd5e-logo.svg" },
  loader: SRD.loader,
  about: SRD.about,
  languages: ["en", "es"],
  types: [
    { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, title: { en: "Conditions", es: "Condiciones" }, shape: "coin", icon: "terror" },
    { id: "markers", name: { en: "Markers", es: "Marcadores" }, title: { en: "All markers", es: "Todos los marcadores" }, shape: "coin", icon: "two-coins" },
    { id: "spells", name: { en: "Spell effects", es: "Efectos de conjuro" }, title: { en: "Spell effects", es: "Efectos de conjuro" }, shape: "coin", icon: "spell-book" },
    { id: "rings", name: { en: "Condition rings", es: "Aros de condición" }, title: { en: "Condition rings", es: "Aros de condición" }, shape: "ring", icon: "ring" },
  ],
  groups: [
    // each with an icon of its own (its filter on the sheet, its plates)
    { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, colour: C.silver, iconBody: GI["terror"].body },
    { id: "table", name: { en: "At the table", es: "En la mesa" }, colour: C.yellow, iconBody: GI["dice-twenty-faces-twenty"].body },
    { id: "combat", name: { en: "Combat", es: "Combate" }, colour: C.red, iconBody: GI["crossed-swords"].body },
    { id: "boons", name: { en: "Boons", es: "Beneficios" }, colour: C.green, iconBody: GI["holy-symbol"].body },
    { id: "banes", name: { en: "Banes", es: "Perjuicios" }, colour: C.purple, iconBody: GI["cursed-star"].body },
  ],
  tokens,
  sections: [
    { id: "srd5e", title: { en: "5e Fantasy", es: "Fantasía 5e" }, open: false, catalogs: [
      { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, tokens: ids(CONDITIONS) },
      { id: "table", name: { en: "Table markers", es: "Marcadores de mesa" }, tokens: [...ids(TABLE), ...ids(COMBAT)] },
      { id: "two-sided", name: { en: "Two-sided tokens", es: "Fichas de dos caras" }, tokens: ids(TWO_STATE) },
      { id: "spells", name: { en: "Spell effects", es: "Efectos de conjuro" }, tokens: [...ids(BOONS), ...ids(BANES)] },
      { id: "rings", name: { en: "Condition rings", es: "Aros de condición" }, tokens: ids(RINGS).map((id) => `ring-${id}`) },
    ] },
    { id: "encounters", title: { en: "Encounters", es: "Encuentros" }, open: true, catalogs: [] },
  ],
  styles,
};
const out = path.join(root, "public/collections/srd5e.json");
fs.writeFileSync(out, JSON.stringify(collection));
const count = (t) => tokens.filter((x) => x.type === t).length;
console.log(`wrote ${out}: ${tokens.length} tokens (${count("conditions")} conditions, ${count("markers")} markers, ${count("spells")} spell effects, ${count("rings")} rings)`);

// its logo: a twenty-sided die in an ember ring
const die = GI["dice-twenty-faces-twenty"].body.replace(/\s(fill)="[^"]*"/g, "");
fs.writeFileSync(path.join(root, "public/collections/srd5e-logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>5e Fantasy</title>
<circle cx="50" cy="50" r="46" fill="#231a17" stroke="#c9463d" stroke-width="5"/><g transform="translate(22 22) scale(${56 / 512})" fill="#efe6da">${die}</g></svg>\n`);
console.log("wrote srd5e-logo.svg");
