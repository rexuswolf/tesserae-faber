// Writes Clocktower's whole library as a generic-creator collection (src/collection.ts):
// importing it at /crear should give the Clocktower app's catalog, the same.
//   node tools/make-botc-collection.mjs [out.json]
// Without an argument it writes the app's own copy, public/collections/botc.json, and its entry in
// public/collections/index.json (the collections that come with the app, listed apart at /crear).
// Types: characters (coins, "All characters") and info tokens (cards, "Grimoire"); groups: the
// teams, with their colours and icons; sections: the editions (closed) and scripts (open).
// Icons go in as SVG, credited, so the file imports without fetching anything.
import fs from "node:fs";
import path from "node:path";
import { EDITIONS, TEAMS } from "../src/engine/token-engine.ts";
import { infoRoles } from "../src/info-tokens.ts";
import { TRANSLATIONS, VILLACUERVOS_URL } from "../src/translations.ts";
import { TEAM_ICONS } from "../src/ui-icons.ts";

const root = path.resolve(import.meta.dirname, "..");
const builtIn = !process.argv[2];
const out = path.resolve(process.argv[2] ?? path.join(root, "public/collections/botc.json"));
const roleId = (en) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");   // as firebase.ts
const roles = JSON.parse(fs.readFileSync(path.join(root, "admin-data/roles_game_icons.json"), "utf8")).map((r) => ({ id: roleId(r.en), ...r }));
const EDITION_ORDER = ["tb", "bmr", "snv", "carousel", "fabled", "loric"];
const TEAM_ORDER = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric", "info"];

const svg = (r) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${r.g}">${r.body ?? (r.d ?? []).map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
/** Reminder i of a character in every language that has it. */
const linked = (r) => (r.reminders?.en ?? []).map((_, i) => Object.fromEntries(Object.entries(r.reminders).filter(([, l]) => l?.[i]).map(([lang, l]) => [lang, l[i]])));

const tokens = [
  ...roles.map((r) => ({
    id: r.id, type: "characters", group: r.team, name: r.names ?? { en: r.en, es: r.es },
    ...(r.fem && Object.keys(r.fem).length ? { fem: r.fem } : {}),
    icon: { svg: svg(r) }, ...(r.author ? { iconCredit: { name: r.icon, author: r.author } } : {}),
    linked: linked(r).map((name) => ({ name })),
  })),
  ...infoRoles().map((r) => ({ id: r.id, type: "info", group: "info", name: { en: r.en, es: r.es, ...r.names }, fixed: true, linked: [] })),
];
const collection = {
  format: "midnight-mint/collection", version: 1,
  name: "Blood on the Clocktower", theme: "botc",
  brand: { logo: "/logo-mark.svg" },   // Midnight Mint's clock: the collection keeps its own mark
  // what Clocktower's own app says: on its loading screen (with the Community Created Content mark) and in About
  loader: {
    text: { es: "Abriendo el grimorio…", en: "Opening the grimoire…" },
    footer: {
      es: "Herramienta gratuita hecha por la comunidad para imprimir tus propios tokens de personaje. No está afiliada ni respaldada por The Pandemonium Institute.",
      en: "A free, community-made tool for printing your own character tokens. Not affiliated with or endorsed by The Pandemonium Institute.",
    },
    ccc: true,
  },
  about: {
    text: {
      es: "Todas las ediciones de Blood on the Clocktower: personajes con sus recordatorios, las fichas de información del Grimorio y tus guiones del Script Tool.",
      en: "Every Blood on the Clocktower edition: characters with their reminders, the Grimoire's info tokens and your Script Tool scripts.",
    },
    credits: {
      es: "Blood on the Clocktower, sus personajes y sus reglas son de The Pandemonium Institute; esta colección no es oficial ni está respaldada por ellos. Los nombres y recordatorios traducidos vienen de Villacuervos.",
      en: "Blood on the Clocktower, its characters and its rules belong to The Pandemonium Institute; this collection is unofficial and not endorsed by them. Translated names and reminders come from Villacuervos.",
    },
    links: [{ label: "Blood on the Clocktower", url: "https://bloodontheclocktower.com" }, { label: "Villacuervos", url: VILLACUERVOS_URL }],
  },
  languages: TRANSLATIONS.map((x) => x.id),
  types: [
    { id: "characters", name: { en: "Characters", es: "Personajes" }, title: { en: "All characters", es: "Todos los personajes" }, shape: "coin", icon: "two-coins" },
    { id: "info", name: { en: "Info tokens", es: "Fichas de información" }, title: EDITIONS.grimoire.name, shape: "card", icon: "id-card" },
  ],
  groups: TEAM_ORDER.map((id) => ({ id, name: TEAMS[id].label, colour: TEAMS[id].colour, icon: TEAM_ICONS[id] })),
  tokens,
  sections: [
    { id: "editions", title: { en: "Editions", es: "Ediciones" }, open: false,
      catalogs: EDITION_ORDER.map((e) => ({ id: e, name: EDITIONS[e].name, tokens: roles.filter((r) => r.edition === e).map((r) => r.id) })) },
    { id: "scripts", title: { en: "Scripts", es: "Guiones" }, open: true, catalogs: [] },
  ],
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(collection));
console.log(`wrote ${out}: ${tokens.length} tokens, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
if (builtIn) {
  const indexFile = path.join(root, "public/collections/index.json");
  let index = [];
  try { index = JSON.parse(fs.readFileSync(indexFile, "utf8")); } catch { /* a first one */ }
  const reminders = tokens.reduce((n, t) => n + (t.linked?.length ?? 0), 0);
  const entry = { id: "botc", file: "/collections/botc.json", name: "Blood on the Clocktower", logo: "/logo-mark.svg", accent: "#c9a227", tokens: tokens.length,
    preview: "/collections/botc-preview.svg",   // tools/make-crear-art.mjs
    facts: { es: `${roles.length} personajes · ${reminders} recordatorios · ${TRANSLATIONS.length} idiomas`, en: `${roles.length} characters · ${reminders} reminders · ${TRANSLATIONS.length} languages` },
    text: { es: "Todas las ediciones, el Grimorio y tus guiones.", en: "Every edition, the Grimoire and your scripts." } };
  index = [entry, ...index.filter((x) => x.id !== entry.id)];
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n");
  console.log(`wrote ${indexFile}`);
}
