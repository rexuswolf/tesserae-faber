// Writes Clocktower's whole library as a generic-creator collection (src/collection.ts):
// importing it at /crear should give the Clocktower app's catalog, the same.
//   node tools/make-botc-collection.mjs [out.json]      (default: out/botc-collection.json)
// Types: characters (coins, "All characters") and info tokens (cards, "Grimoire"); groups: the
// teams, with their colours and icons; sections: the editions (closed) and scripts (open).
// Icons go in as SVG, credited, so the file imports without fetching anything.
import fs from "node:fs";
import path from "node:path";
import { EDITIONS, TEAMS } from "../src/engine/token-engine.ts";
import { infoRoles } from "../src/info-tokens.ts";
import { TRANSLATIONS } from "../src/translations.ts";
import { TEAM_ICONS } from "../src/ui-icons.ts";

const root = path.resolve(import.meta.dirname, "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "out/botc-collection.json"));
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
