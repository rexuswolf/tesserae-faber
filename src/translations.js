/**
 * The languages the tokens can be printed in: English (the game's own text) and the
 * community translations published by Villacuervos (https://villacuervos.es), each
 * credited to the people who made it. The app's interface languages are separate
 * (LANGUAGES in i18n.js).
 *
 * id: the key used in the library (role.names[id], role.reminders[id], role.fem[id]).
 * pack: the Villacuervos translation pack (tools/fetch-translations.mjs reads it).
 * lang: the language, for grouping the menu and for text that only exists in es/en.
 * by: who made the translation, or null when the pack doesn't say.
 * flag: a round flag in public/flags/ (circle-flags, or drawn in its style when it has none).
 */
export const VILLACUERVOS_URL = "https://villacuervos.es";

export const TRANSLATIONS = [
  { id: "en", lang: "en", name: "English", flag: "/flags/en.svg" },
  { id: "es", lang: "es", name: "Español", pack: "rovortox", by: "Rovortox", fem: true, flag: "/flags/es.svg" },
  { id: "es-bumble3ee", lang: "es", name: "Español", pack: "bumble3ee", by: "Bumble3ee", flag: "/flags/es.svg" },
  { id: "es-castelgard", lang: "es", name: "Español", pack: "castelgard", by: "Castelgard", flag: "/flags/es.svg" },
  { id: "es-chiromyiforme", lang: "es", name: "Español", pack: "chiromyiforme", by: "Chiromyiforme", flag: "/flags/es.svg" },
  { id: "es-pedro", lang: "es", name: "Español", pack: "pedro", by: "Pedro", flag: "/flags/es.svg" },
  { id: "es-solrax", lang: "es", name: "Español", pack: "solrax", by: "Solrax", flag: "/flags/es.svg" },
  { id: "ast", lang: "ast", name: "Asturianu", pack: "asturianu", by: null, fem: true, flag: "/flags/ast.svg" },
  { id: "ca", lang: "ca", name: "Català", pack: "catala", by: null, flag: "/flags/ca.svg" },
  { id: "ca-valencia", lang: "ca", name: "Valencià", pack: "valenciano", by: null, flag: "/flags/ca-valencia.svg" },
  { id: "eu", lang: "eu", name: "Euskara", pack: "euskera", by: null, flag: "/flags/eu.svg" },
  { id: "gl", lang: "gl", name: "Galego", pack: "galego", by: null, flag: "/flags/gl.svg" },
  { id: "pt", lang: "pt", name: "Português", pack: "uriell", by: "uriell", flag: "/flags/pt.svg" },
];

export const translationById = (id) => TRANSLATIONS.find((x) => x.id === id) ?? TRANSLATIONS[0];

/** How a translation reads in a menu: "Español · Castelgard", "Català". */
export const translationLabel = (x) => (TRANSLATIONS.filter((y) => y.name === x.name).length > 1 && x.by ? `${x.name} · ${x.by}` : x.name);

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
