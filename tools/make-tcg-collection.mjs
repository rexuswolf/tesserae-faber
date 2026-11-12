// Writes the TCG Counters collection that comes with the app (public/collections/tcg.json) and its logo.
// Counters for trading card games: Pokémon TCG, Magic: The Gathering, Disney Lorcana and Star Wars:
// Unlimited, a list each. Only what's printed on a counter (numbers, conditions, game terms) and
// game-icons.net icons: no logo, art or character of any of the games, and a generic name; each game is
// named only to say what its tokens are for. What the app says about it (its card, its About) is code,
// src/builtins.ts.
//   node tools/make-tcg-collection.mjs
// Types: counters (coins). Groups: damage, conditions, counters, markers. Each token in its own colour,
// as the games' own counters look (Pokémon's damage counters warm, Star Wars: Unlimited's red), painted:
// the coin in that colour, its words or number and icon in white (black on a light colour). A number is
// drawn large and alone; a two-sided token carries its other side on its back (one body, one colour).
import fs from "node:fs";
import path from "node:path";
import { BUILT_INS } from "../src/builtins.ts";   // its theme and loading screen: one place
import { asLists } from "./collection-model.mjs";
const TCG = BUILT_INS.find((b) => b.id === "tcg");

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

// filaments the printer has (src/bambu/plates.ts), so a plate can print them
const F = { black: "#1d1c21", blue: "#2f86e0", red: "#b3191e", purple: "#8a3d9e", yellow: "#d4a72c", green: "#3f9651", gold: "#c9a227", silver: "#a7adb4", white: "#ece9e2" };
const WHITE = "#ece9e2", BLACK = "#1d1c21";
const LIGHT = new Set([F.yellow, F.gold, F.silver, F.white]);

// The designs: the coin painted in the token's colour ("team"), its words and icon white; the "-oscura"
// ones black, for a light colour (hidden: a token is drawn in them, nobody picks them). Three layouts:
// the icon with the name round it, a number large and alone, the icon alone.
const painted = (ink, extra = {}) => ({ style: "classic", frame: "rim", frameWidth: 0.9, back: "none", depth: 0.4, colours: { base: "team", front: ink, frame: ink, back: ink }, ...extra });
const DESIGNS = [
  ["pintada", { es: "Pintada", en: "Painted" }, { es: "Del color de la ficha, con el icono, el nombre y el borde en blanco.", en: "In the token's colour, with the icon, the name and the rim in white." }, {}],
  ["numero", { es: "Número", en: "Number" }, { es: "Del color de la ficha, con su número grande en blanco.", en: "In the token's colour, with its number large, in white." }, { style: "text", textSize: 14 }],
  ["icono", { es: "Solo icono", en: "Icon only" }, { es: "Del color de la ficha, con el icono grande en blanco.", en: "In the token's colour, with the icon large, in white." }, { style: "solo" }],
];
const styles = {
  coin: DESIGNS.flatMap(([id, name, help, extra]) => [
    { id, name, help, spec: painted(WHITE, extra) },
    { id: `${id}-oscura`, name, help, spec: painted(BLACK, extra), hidden: true },
  ]),
};
const design = (kind, colour) => (LIGHT.has(colour) ? `${kind}-oscura` : kind);

// A token: [id, group, name, front text or null, icon or null, colour, layout, its other side?]
const tok = ({ id, group, name, text, ic, colour, kind = "pintada", flip }) => ({
  id, type: "counters", group, name, ...(text ? { text } : {}), ...(ic ? icon(ic) : {}), linked: [], colour, design: design(kind, colour),
  ...(flip ? { flip: { name: flip.name, ...(flip.ic ? icon(flip.ic) : {}) } } : {}),
});
const same = (s) => ({ en: s, es: s });
const damage = (game, n, colour, flip) => tok({ id: `${game}-damage-${n}`, group: "damage", name: { en: `Damage ${n}`, es: `Daño ${n}` }, text: same(`${n}`), colour, kind: "numero",
  ...(flip ? { flip: { name: same(flip) } } : {}) });

const GAMES = [
  { id: "pokemon", name: "Pokémon TCG", tokens: [
    damage("pokemon", 10, F.yellow), damage("pokemon", 50, F.red), damage("pokemon", 100, F.black),
    tok({ id: "pokemon-poisoned", group: "conditions", name: { en: "Poisoned", es: "Envenenado" }, ic: "poison-bottle", colour: F.purple }),
    tok({ id: "pokemon-burned", group: "conditions", name: { en: "Burned", es: "Quemado" }, ic: "flame", colour: F.red }),
    tok({ id: "pokemon-asleep", group: "conditions", name: { en: "Asleep", es: "Dormido" }, ic: "night-sleep", colour: F.blue }),
    tok({ id: "pokemon-paralyzed", group: "conditions", name: { en: "Paralyzed", es: "Paralizado" }, ic: "electric", colour: F.yellow }),
    tok({ id: "pokemon-confused", group: "conditions", name: { en: "Confused", es: "Confundido" }, ic: "knocked-out-stars", colour: F.green }),
    tok({ id: "pokemon-vstar", group: "markers", name: same("VSTAR"), ic: "polar-star", colour: F.gold, flip: { name: { en: "VSTAR used", es: "VSTAR usado" }, ic: "falling-star" } }),
    tok({ id: "coin-flip", group: "markers", name: { en: "Heads / Tails", es: "Cara / Cruz" }, ic: "sun", colour: F.gold, kind: "icono", flip: { name: { en: "Tails", es: "Cruz" }, ic: "moon" } }),
  ] },
  { id: "magic", name: "Magic: The Gathering", tokens: [
    tok({ id: "magic-plus", group: "counters", name: { en: "+1/+1 counter", es: "Contador +1/+1" }, text: same("+1/+1"), colour: F.green, kind: "numero" }),
    tok({ id: "magic-minus", group: "counters", name: { en: "−1/−1 counter", es: "Contador −1/−1" }, text: same("−1/−1"), colour: F.black, kind: "numero" }),
  ] },
  { id: "lorcana", name: "Disney Lorcana", tokens: [
    damage("lorcana", 1, F.red), damage("lorcana", 3, F.red), damage("lorcana", 5, F.red),
    tok({ id: "lorcana-lore-1", group: "counters", name: { en: "Lore 1", es: "Leyenda 1" }, text: same("1"), colour: F.purple, kind: "numero" }),
    tok({ id: "lorcana-lore-5", group: "counters", name: { en: "Lore 5", es: "Leyenda 5" }, text: same("5"), colour: F.purple, kind: "numero" }),
  ] },
  { id: "swu", name: "Star Wars: Unlimited", tokens: [
    damage("swu", 1, F.red, "3"), damage("swu", 5, F.red, "10"),
    tok({ id: "swu-shield", group: "markers", name: { en: "Shield", es: "Escudo" }, ic: "energy-shield", colour: F.blue }),
    tok({ id: "swu-experience", group: "counters", name: { en: "Experience", es: "Experiencia" }, ic: "upgrade", colour: F.yellow }),
    tok({ id: "swu-initiative", group: "markers", name: { en: "Initiative", es: "Iniciativa" }, ic: "light-sabers", colour: F.black, flip: { name: { en: "Initiative taken", es: "Iniciativa tomada" }, ic: "light-sabers" } }),
    tok({ id: "swu-force", group: "markers", name: { en: "The Force", es: "La Fuerza" }, ic: "magic-swirl", colour: F.blue }),
  ] },
];
// a two-sided damage counter is found by both its numbers ("Damage 1 / 3"), and the coin flip's front says Heads
for (const t of GAMES.flatMap((g) => g.tokens)) {
  if (t.flip && t.group === "damage") t.name = { en: `${t.name.en} / ${t.flip.name.en}`, es: `${t.name.es} / ${t.flip.name.es}` };
  if (t.id === "coin-flip") t.text = { en: "Heads", es: "Cara" };
}
const tokens = GAMES.flatMap((g) => g.tokens);

const collection = {
  format: "midnight-mint/collection", version: 1,
  name: TCG.name,
  theme: TCG.theme,
  brand: { logo: "/collections/tcg-logo.svg" },
  loader: TCG.loader,
  languages: ["en", "es"],
  types: [{ id: "counters", name: { en: "Counters", es: "Contadores" }, title: { en: "All counters", es: "Todos los contadores" }, shape: "coin", icon: "two-coins" }],
  groups: [
    { id: "damage", name: { en: "Damage", es: "Daño" }, colour: F.red, iconBody: GI["bleeding-wound"].body },
    { id: "conditions", name: { en: "Conditions", es: "Condiciones" }, colour: F.purple, iconBody: GI["poison-bottle"].body },
    { id: "counters", name: { en: "Counters", es: "Contadores" }, colour: F.green, iconBody: GI["upgrade"].body },
    { id: "markers", name: { en: "Markers", es: "Marcadores" }, colour: F.gold, iconBody: GI["round-star"].body },
  ],
  tokens,
  sections: [
    { id: "games", title: { en: "Games", es: "Juegos" }, open: false, catalogs: GAMES.map((g) => ({ id: g.id, name: g.name, tokens: g.tokens.map((t) => t.id) })) },
    { id: "decks", title: { en: "Your decks", es: "Tus mazos" }, open: true, catalogs: [] },
  ],
  styles,
};
const out = path.join(root, "public/collections/tcg.json");
fs.writeFileSync(out, JSON.stringify(asLists(collection)));   // as the app keeps it: shapes on the tokens, the sections' catalogs as its own lists
console.log(`wrote ${out}: ${tokens.length} tokens`);

// its logo: a stack of counters in the collection's gold
const coins = GI["two-coins"].body.replace(/\s(fill)="[^"]*"/g, "");
fs.writeFileSync(path.join(root, "public/collections/tcg-logo.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>TCG Counters</title>
<circle cx="50" cy="50" r="46" fill="#1c1a24" stroke="#d4a72c" stroke-width="5"/><g transform="translate(22 22) scale(${56 / 512})" fill="#ece6dc">${coins}</g></svg>\n`);
console.log("wrote tcg-logo.svg");
