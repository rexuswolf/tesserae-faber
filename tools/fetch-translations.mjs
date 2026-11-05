// Adds the Villacuervos community translations to admin-data/roles_game_icons.json.
//
//   node tools/fetch-translations.mjs            # download the packs, then merge
//   node tools/fetch-translations.mjs --cached   # merge the copies in admin-data/villacuervos/
//
// For every translation in src/translations.ts each role gets:
//   names[id]      the name in that translation
//   fem[id]        the feminine name, only where the pack has one and it differs
//   reminders[id]  the reminder words, lined up with our English reminders (index by index)
// The Villacuervos packs keep some reminders in "global_reminders", leave some words in
// English and occasionally count them differently, so each reminder is matched by its
// English text; a gap is filled with the word the same pack uses elsewhere for that text,
// then with our Spanish (Spanish packs) or the English. The report lists what was filled.
// Then upload with: node tools/upload-library.mjs
import fs from "node:fs";
import { TRANSLATIONS } from "../src/translations.ts";

const API = "https://villacuervos.es/api/public";
const DIR = new URL("../admin-data/villacuervos/", import.meta.url);
const LIB = new URL("../admin-data/roles_game_icons.json", import.meta.url);
const cached = process.argv.includes("--cached");
fs.mkdirSync(DIR, { recursive: true });

async function get(path, file) {
  const at = new URL(file, DIR);
  if (cached && fs.existsSync(at)) return JSON.parse(fs.readFileSync(at, "utf8"));
  const res = await fetch(`${API}${path}`, { headers: { "User-Agent": "midnight-mint-library-builder" } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const data = await res.json();
  fs.writeFileSync(at, JSON.stringify(data, null, 1));
  return data;
}

const words = (s) => (s || "").split(",").map((w) => w.trim()).filter(Boolean);
const allReminders = (x) => [...words(x.reminders), ...words(x.global_reminders)];

const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
const vcRoles = await get("/roles/", "roles.json");
const vcByName = new Map(vcRoles.map((r) => [r.name, r]));
const missing = lib.filter((r) => !vcByName.has(r.en)).map((r) => r.en);
if (missing.length) throw new Error(`not in Villacuervos: ${missing.join(", ")}`);

for (const r of lib) {
  r.names = { en: r.en, es: r.es };
  r.fem = {};
  r.reminders = { en: r.reminders?.en || [], es: r.reminders?.es || [] };
}

const report = [];
for (const tr of TRANSLATIONS.filter((x) => x.pack)) {
  const pack = await get(`/translations/${tr.pack}/`, `${tr.pack}.json`);
  const fem = tr.fem ? await get(`/translations/${tr.pack}/?genre=female`, `${tr.pack}-female.json`) : [];
  const byKey = new Map(pack.map((x) => [x.role, x]));
  const femByKey = new Map(fem.map((x) => [x.role, x]));
  if (byKey.size !== vcRoles.length) throw new Error(`${tr.pack}: ${byKey.size} roles, expected ${vcRoles.length}`);

  // The pack's usual word for each English reminder, from roles where the lists line up.
  const usual = new Map();
  for (const v of vcRoles) {
    const en = allReminders(v), here = allReminders(byKey.get(v.key));
    if (en.length !== here.length) continue;
    en.forEach((w, i) => {
      if (here[i] === w) return;   // left in English
      const counts = usual.get(w) ?? new Map();
      counts.set(here[i], (counts.get(here[i]) ?? 0) + 1);
      usual.set(w, counts);
    });
  }
  const usualFor = (w) => [...(usual.get(w) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];

  let filled = 0;
  const filledWhere = new Set();
  for (const r of lib) {
    const v = vcByName.get(r.en), t = byKey.get(v.key);
    r.names[tr.id] = t.name;
    const f = femByKey.get(v.key)?.name;
    if (f && f !== t.name) r.fem[tr.id] = f;
    if (tr.id === "es") continue;   // our Spanish reminders are already the cleaned Rovortox ones

    const en = allReminders(v), here = allReminders(t), lined = en.length === here.length;
    const used = new Set();
    r.reminders[tr.id] = r.reminders.en.map((w, i) => {
      const j = en.findIndex((x, k) => x === w && !used.has(k));
      if (j >= 0) used.add(j);
      const direct = lined && j >= 0 ? here[j] : null;
      if (direct && direct !== w) return direct;
      const fill = usualFor(w) ?? (tr.lang === "es" ? r.reminders.es[i] : null) ?? direct ?? w;
      filled++; filledWhere.add(r.en);
      return fill;
    });
  }
  report.push(`${tr.id.padEnd(17)} ${tr.pack.padEnd(14)} names ${lib.length} · feminine ${lib.filter((r) => r.fem[tr.id]).length} · reminders filled ${filled} (${[...filledWhere].slice(0, 6).join(", ")}${filledWhere.size > 6 ? "…" : ""})`);
}

fs.writeFileSync(LIB, JSON.stringify(lib));
console.log(report.join("\n"));
console.log(`\nwrote ${lib.length} roles to admin-data/roles_game_icons.json`);
