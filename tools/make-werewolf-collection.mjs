// Writes the Werewolves collection that comes with the app (public/collections/werewolf.json) and
// its logo; the strip of tokens on its cover is tools/make-crear-art.mjs. Tokens to play the classic
// party game (Mafia, Dimitry Davidoff 1986; its werewolves, Andrew Plotkin 1997, both public domain):
// the common roles by their plain names, none of a commercial edition's, and game-icons.net icons.
//   node tools/make-werewolf-collection.mjs
// Groups: the village (blue), the werewolves (red), the loners (purple) and the markers (gold): the
// Mayor, the Lovers, Protected, Dead and the Witch's two potions (two-sided: turned over when used).
// No Night / Day: the narrator says the phase aloud, with everyone's eyes shut. The icons were chosen in tools/werewolf-protos.
import fs from "node:fs";
import path from "node:path";
import { BUILT_INS } from "../src/builtins.ts";   // its theme, loading line and About: one place
import { FILAMENTS } from "../src/engine/token-engine.ts";
import { asLists } from "./collection-model.mjs";
const WW = BUILT_INS.find((b) => b.id === "werewolf");

const root = path.resolve(import.meta.dirname, "..");
const GI = JSON.parse(fs.readFileSync(path.join(root, "node_modules/@iconify-json/game-icons/icons.json"), "utf8")).icons;
const INDEX = JSON.parse(fs.readFileSync(path.join(root, "public/game-icons.json"), "utf8"));   // "author/name"
const author = (name) => INDEX.find((x) => x.endsWith(`/${name}`))?.split("/")[0];
// placed as the app places game-icons.net icons (src/icons.ts: GI_PLACE)
const PLACE = "translate(28.063 19.134) scale(0.139518)";
const bare = (name) => { const body = GI[name]?.body; if (!body) throw new Error(`no icon ${name}`); return body.replace(/\s(fill)="[^"]*"/g, ""); };
const icon = (name) => {
  if (!author(name)) throw new Error(`no author for ${name}`);
  return { icon: { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${PLACE}">${bare(name)}</g></svg>` }, iconCredit: { name, author: author(name) } };
};

// Colours are filaments the printer has (src/collection.ts GROUP_COLOURS), as Clocktower's teams:
// the village blue, the werewolves red, the loners purple, the markers gold.
const C = { blue: "#2f86e0", red: "#b3191e", purple: "#8a3d9e", gold: "#d4a72c" };
const tok = (id, group, name, ic, extra = {}) => ({ id, type: "fichas", group, name, ...icon(ic), linked: [], ...extra });
const flip = (name, ic) => ({ flip: { name, ...icon(ic) } });

const VILLAGE = [
  tok("aldeano", "aldea", { es: "Aldeano", en: "Villager" }, "farmer"),
  tok("vidente", "aldea", { es: "Vidente", en: "Seer" }, "crystal-ball"),
  tok("medico", "aldea", { es: "Médico", en: "Doctor" }, "caduceus"),
  tok("guardian", "aldea", { es: "Guardián", en: "Bodyguard" }, "checked-shield"),
  tok("bruja", "aldea", { es: "Bruja", en: "Witch" }, "cauldron"),
  tok("cazador", "aldea", { es: "Cazador", en: "Hunter" }, "crossbow"),
  tok("cupido", "aldea", { es: "Cupido", en: "Cupid" }, "cupidon-arrow"),
  tok("anciano", "aldea", { es: "Anciano", en: "Elder" }, "old-king"),
  tok("tonto", "aldea", { es: "Tonto del pueblo", en: "Village Idiot" }, "jester-hat"),
  tok("mason", "aldea", { es: "Masón", en: "Mason" }, "trowel"),
];
const WOLVES = [
  tok("lobo", "lobos", { es: "Hombre lobo", en: "Werewolf" }, "werewolf"),
  tok("alfa", "lobos", { es: "Lobo alfa", en: "Alpha Wolf" }, "wolf-head"),
  tok("lobezno", "lobos", { es: "Lobezno", en: "Wolf Cub" }, "paw"),
];
const LONERS = [tok("curtidor", "solos", { es: "Curtidor", en: "Tanner" }, "leather-vest")];
const MARKERS = [
  tok("alcalde", "marcas", { es: "Alcalde", en: "Mayor" }, "star-medal"),
  tok("enamorados", "marcas", { es: "Enamorados", en: "Lovers" }, "hearts"),
  tok("protegido", "marcas", { es: "Protegido", en: "Protected" }, "shield-reflect"),
  tok("muerto", "marcas", { es: "Muerto", en: "Dead" }, "tombstone"),
  // the Witch's: each turned over when she uses it
  tok("pocion-vida", "marcas", { es: "Poción de vida", en: "Healing potion" }, "health-potion", flip({ es: "Usada", en: "Used" }, "broken-bottle")),
  tok("pocion-muerte", "marcas", { es: "Poción de muerte", en: "Poison potion" }, "poison-bottle", flip({ es: "Usada", en: "Used" }, "broken-bottle")),
];
const tokens = [...VILLAGE, ...WOLVES, ...LONERS, ...MARKERS];
const ids = (list) => list.map((t) => t.id);

// The styles it comes with (src/collection.ts StyleDef); "team" is the token's group colour. Its own,
// then the app's (src/shape-designs.ts APP_DESIGNS), offered in every collection.
const moon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bare("moon")}</svg>`;
const styles = {
  coin: [
    // the default, as Clocktower's: black, the rim, the icon and the name in the side's colour; behind,
    // the moon in gold, the same on every coin (a role dealt face-down says nothing)
    { id: "luna", name: { es: "Luna llena", en: "Full moon" },
      help: { es: "Negra, con el aro, el icono y el nombre del color del bando; al reverso, la luna en oro, igual en todas: boca abajo, nadie sabe qué rol es.", en: "Black, with the rim, the icon and the name in the side's colour; on the back, the moon in gold, the same on all: face-down, nobody can tell the role." },
      spec: { style: "classic", frame: "rim", frameWidth: 0.8, frameInset: 0.8, back: "custom", customSvg: moon, depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
    // the same front, thinner and its back plain: the quickest
    { id: "basico", name: { es: "Básico", en: "Basic" },
      help: { es: "El frente de Luna llena, más fina (1,4 mm) y con el reverso liso: se imprime antes.", en: "Full moon's front, thinner (1.4 mm) and with a plain back: it prints sooner." },
      spec: { style: "classic", frame: "rim", frameWidth: 0.8, frameInset: 0.8, back: "none", height: 1.4, depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team" } } },
  ],
};
const collection = {
  format: "midnight-mint/collection", version: 1,
  name: WW.name,
  theme: WW.theme,
  brand: { logo: "/collections/werewolf-logo.svg" },
  loader: WW.loader,
  about: WW.about,
  languages: ["es", "en"],
  types: [{ id: "fichas", name: { es: "Fichas", en: "Tokens" }, title: { es: "Fichas", en: "Tokens" }, shape: "coin", icon: "werewolf" }],
  groups: [
    // each with an icon of its own (its filter on the sheet, its plates)
    { id: "aldea", name: { es: "La aldea", en: "Village" }, colour: C.blue, iconBody: bare("village") },
    { id: "lobos", name: { es: "Los lobos", en: "Werewolves" }, colour: C.red, iconBody: bare("werewolf") },
    { id: "solos", name: { es: "Por su cuenta", en: "Loners" }, colour: C.purple, iconBody: bare("leather-vest") },
    { id: "marcas", name: { es: "Marcadores", en: "Markers" }, colour: C.gold, iconBody: bare("star-medal") },
  ],
  tokens,
  sections: [
    { id: "hombres-lobo", title: { es: "Hombres lobo", en: "Werewolves" }, open: false, catalogs: [
      // the classic game: the first three roles there were, the Doctor, and the table's markers
      { id: "clasica", name: { es: "Partida clásica", en: "Classic game" }, tokens: ["aldeano", "lobo", "vidente", "medico", "alcalde", "muerto", "protegido"] },
      // every role and marker, to queue in one go
      { id: "completa", name: { es: "Todo", en: "Everything" }, tokens: [...ids(VILLAGE), ...ids(WOLVES), ...ids(LONERS), ...ids(MARKERS)] },
    ] },
    { id: "partidas", title: { es: "Partidas", en: "Games" }, open: true, catalogs: [] },
  ],
  styles,
};
const out = path.join(root, "public/collections/werewolf.json");
fs.writeFileSync(out, JSON.stringify(asLists(collection)));   // as the app keeps it: shapes on the tokens, the sections' catalogs as its own lists
console.log(`wrote ${out}: ${tokens.length} tokens (${VILLAGE.length} village, ${WOLVES.length} werewolves, ${LONERS.length} loner, ${MARKERS.length} markers)`);
if (WW.tokens !== tokens.length) console.warn(`src/builtins.ts says ${WW.tokens} tokens: make it ${tokens.length}`);

// its logo: a wolf howling at the moon, bone on the night, a gold ring
fs.writeFileSync(path.join(root, "public/collections/werewolf-logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>${WW.name.en}</title>
<circle cx="50" cy="50" r="46" fill="#16233a" stroke="#d4a72c" stroke-width="4"/><g transform="translate(19 19) scale(${62 / 512})" fill="#efe8dc">${bare("wolf-howl")}</g></svg>\n`);
console.log("wrote werewolf-logo.svg");
