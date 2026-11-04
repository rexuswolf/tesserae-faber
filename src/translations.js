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
 */
export const VILLACUERVOS_URL = "https://villacuervos.es";

export const TRANSLATIONS = [
  { id: "en", lang: "en", name: "English" },
  { id: "es", lang: "es", name: "Español", pack: "rovortox", by: "Rovortox", fem: true },
  { id: "es-bumble3ee", lang: "es", name: "Español", pack: "bumble3ee", by: "Bumble3ee" },
  { id: "es-castelgard", lang: "es", name: "Español", pack: "castelgard", by: "Castelgard" },
  { id: "es-chiromyiforme", lang: "es", name: "Español", pack: "chiromyiforme", by: "Chiromyiforme" },
  { id: "es-pedro", lang: "es", name: "Español", pack: "pedro", by: "Pedro" },
  { id: "es-solrax", lang: "es", name: "Español", pack: "solrax", by: "Solrax" },
  { id: "ast", lang: "ast", name: "Asturianu", pack: "asturianu", by: null, fem: true },
  { id: "ca", lang: "ca", name: "Català", pack: "catala", by: null },
  { id: "ca-valencia", lang: "ca", name: "Valencià", pack: "valenciano", by: null },
  { id: "eu", lang: "eu", name: "Euskara", pack: "euskera", by: null },
  { id: "gl", lang: "gl", name: "Galego", pack: "galego", by: null },
  { id: "pt", lang: "pt", name: "Português", pack: "uriell", by: "uriell" },
];

export const translationById = (id) => TRANSLATIONS.find((x) => x.id === id) ?? TRANSLATIONS[0];

/** How a translation reads in a menu: "Español · Castelgard", "Català". */
export const translationLabel = (x) => (TRANSLATIONS.filter((y) => y.name === x.name).length > 1 && x.by ? `${x.name} · ${x.by}` : x.name);
