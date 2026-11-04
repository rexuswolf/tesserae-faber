/**
 * The languages the tokens can be printed in: English (the game's own text) and the
 * community translations published by Villacuervos (https://villacuervos.es), each
 * credited to the people who made it. The app's interface languages are separate
 * (LANGUAGES in i18n.js).
 *
 * id: the key used in the library (role.names[id], role.reminders[id], role.fem[id]).
 * pack: the Villacuervos translation pack (tools/fetch-translations.mjs reads it).
 * lang: the language, for grouping the menu and for text that only exists in es/en.
 * version: for a language with several translations, the name each one goes by on Villacuervos.
 * by: who made the translation, as Villacuervos credits it.
 * flag: a round flag in public/flags/ (circle-flags, or drawn in its style when it has none).
 */
export const VILLACUERVOS_URL = "https://villacuervos.es";

export const TRANSLATIONS = [
  { id: "en", lang: "en", name: "English", flag: "/flags/en.svg" },
  { id: "es", lang: "es", name: "Español", pack: "rovortox", version: "Rovortox", by: "Roberto", fem: true, flag: "/flags/es.svg" },
  { id: "es-bumble3ee", lang: "es", name: "Español", pack: "bumble3ee", version: "Bumble3ee", by: "Roberto", flag: "/flags/es.svg" },
  { id: "es-castelgard", lang: "es", name: "Español", pack: "castelgard", version: "Castelgard", by: "Castelgard", flag: "/flags/es.svg" },
  { id: "es-chiromyiforme", lang: "es", name: "Español", pack: "chiromyiforme", version: "Chiromyiforme", by: "Chiromyiforme", flag: "/flags/es.svg" },
  { id: "es-pedro", lang: "es", name: "Español", pack: "pedro", version: "Pedro", by: "Pedro", flag: "/flags/es.svg" },
  { id: "es-solrax", lang: "es", name: "Español", pack: "solrax", version: "Solrax", by: "Carlos", flag: "/flags/es.svg" },
  { id: "ast", lang: "ast", name: "Asturianu", pack: "asturianu", by: "Hugo", fem: true, flag: "/flags/ast.svg" },
  { id: "ca", lang: "ca", name: "Català", pack: "catala", by: "Ren", flag: "/flags/ca.svg" },
  { id: "ca-valencia", lang: "ca", name: "Valencià", pack: "valenciano", by: "Carlos", flag: "/flags/ca-valencia.svg" },
  { id: "eu", lang: "eu", name: "Euskara", pack: "euskera", by: "JUMA", flag: "/flags/eu.svg" },
  { id: "gl", lang: "gl", name: "Galego", pack: "galego", by: "Dumis", flag: "/flags/gl.svg" },
  { id: "pt", lang: "pt", name: "Português", pack: "uriell", by: "uriell", flag: "/flags/pt.svg" },
];

export const translationById = (id) => TRANSLATIONS.find((x) => x.id === id) ?? TRANSLATIONS[0];

/** How a translation reads in a menu: "Español · Castelgard", "Català". */
export const translationLabel = (x) => (x.version ? `${x.name} · ${x.version}` : x.name);

/**
 * The translations grouped by language, in list order: a language with several
 * versions (Spanish today) becomes one group whose `items` are its versions.
 */
export function translationGroups() {
  const out = [];
  for (const x of TRANSLATIONS) {
    let g = out.find((l) => l.name === x.name);
    if (!g) out.push(g = { name: x.name, flag: x.flag, items: [] });
    g.items.push(x);
  }
  return out;
}
