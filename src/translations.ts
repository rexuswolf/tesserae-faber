/**
 * The languages the tokens can be printed in: English (the game's own text), the
 * community translations published by Villacuervos (https://villacuervos.es), each
 * credited to the people who made it, and The Pandemonium Institute's official ones
 * (translation.botc.app), credited to TPI. The app's interface languages are separate
 * (LANGUAGES in i18n.ts).
 *
 * id: the key used in the library (role.names[id], role.reminders[id], role.fem[id]).
 * pack: the Villacuervos translation pack (tools/fetch-translations.mjs reads it).
 * lang: the language, for grouping the menu and for text that only exists in es/en.
 * version: for a language with several translations, the name each one goes by on Villacuervos.
 * tpi: the official translation's language code on translation.botc.app (tools/fetch-translations.mjs reads it).
 * by: who made the translation, as Villacuervos credits it.
 * flag: a round flag in public/flags/ (circle-flags, or drawn in its style when it has none).
 */
export const VILLACUERVOS_URL = "https://villacuervos.es";
/** Where the official translations are made (credited wherever one is shown). */
export const TPI_TRANSLATIONS_URL = "https://translation.botc.app/projects/botc-app/";

/** A language the tokens can be printed in (see above for each field). */
export interface Translation {
  id: string;
  lang: string;
  name: string;
  flag: string;
  pack?: string;
  tpi?: string;
  version?: string;
  by?: string;
  /** The pack has feminine names. */
  fem?: boolean;
}

export const TRANSLATIONS: Translation[] = [
  { id: "en", lang: "en", name: "English", flag: "/flags/en.svg" },
  { id: "es", lang: "es", name: "Español", pack: "rovortox", version: "Rovortox", by: "Roberto", fem: true, flag: "/flags/es.svg" },
  { id: "es-bumble3ee", lang: "es", name: "Español", pack: "bumble3ee", version: "Bumble3ee", by: "Roberto", flag: "/flags/es.svg" },
  { id: "es-castelgard", lang: "es", name: "Español", pack: "castelgard", version: "Castelgard", by: "Castelgard", flag: "/flags/es.svg" },
  { id: "es-chiromyiforme", lang: "es", name: "Español", pack: "chiromyiforme", version: "Chiromyiforme", by: "Chiromyiforme", flag: "/flags/es.svg" },
  { id: "es-pedro", lang: "es", name: "Español", pack: "pedro", version: "Pedro", by: "Pedro", flag: "/flags/es.svg" },
  { id: "es-solrax", lang: "es", name: "Español", pack: "solrax", version: "Solrax", by: "Carlos", flag: "/flags/es.svg" },
  { id: "es-mx", lang: "es", name: "Español", tpi: "es_MX", version: "México", flag: "/flags/es-mx.svg" },
  { id: "ast", lang: "ast", name: "Asturianu", pack: "asturianu", by: "Hugo", fem: true, flag: "/flags/ast.svg" },
  { id: "ca", lang: "ca", name: "Català", pack: "catala", version: "Ren", by: "Ren", flag: "/flags/ca.svg" },
  { id: "ca-tpi", lang: "ca", name: "Català", tpi: "ca", version: "Oficial", flag: "/flags/ca.svg" },
  { id: "ca-valencia", lang: "ca", name: "Valencià", pack: "valenciano", by: "Carlos", flag: "/flags/ca-valencia.svg" },
  { id: "eu", lang: "eu", name: "Euskara", pack: "euskera", by: "JUMA", flag: "/flags/eu.svg" },
  { id: "gl", lang: "gl", name: "Galego", pack: "galego", version: "Dumis", by: "Dumis", flag: "/flags/gl.svg" },
  { id: "gl-tpi", lang: "gl", name: "Galego", tpi: "gl", version: "Oficial", flag: "/flags/gl.svg" },
  { id: "pt", lang: "pt", name: "Português", pack: "uriell", version: "uriell", by: "uriell", flag: "/flags/pt.svg" },
  { id: "pt-tpi", lang: "pt", name: "Português", tpi: "pt_PT", version: "Oficial", flag: "/flags/pt.svg" },
  // The official translations, in their own words, alphabetically
  { id: "da", lang: "da", name: "Dansk", tpi: "da", flag: "/flags/da.svg" },
  { id: "de", lang: "de", name: "Deutsch", tpi: "de", flag: "/flags/de.svg" },
  { id: "fr", lang: "fr", name: "Français", tpi: "fr", flag: "/flags/fr.svg" },
  { id: "it", lang: "it", name: "Italiano", tpi: "it", flag: "/flags/it.svg" },
  { id: "hu", lang: "hu", name: "Magyar", tpi: "hu", flag: "/flags/hu.svg" },
  { id: "nl", lang: "nl", name: "Nederlands", tpi: "nl", flag: "/flags/nl.svg" },
  { id: "nb", lang: "nb", name: "Norsk bokmål", tpi: "nb_NO", flag: "/flags/nb.svg" },
  { id: "pl", lang: "pl", name: "Polski", tpi: "pl", flag: "/flags/pl.svg" },
  { id: "sk", lang: "sk", name: "Slovenčina", tpi: "sk", flag: "/flags/sk.svg" },
  { id: "sl", lang: "sl", name: "Slovenščina", tpi: "sl", flag: "/flags/sl.svg" },
  { id: "sr", lang: "sr", name: "Srpski", tpi: "sr", flag: "/flags/sr.svg" },
  { id: "fi", lang: "fi", name: "Suomi", tpi: "fi", flag: "/flags/fi.svg" },
  { id: "sv", lang: "sv", name: "Svenska", tpi: "sv", flag: "/flags/sv.svg" },
  { id: "vi", lang: "vi", name: "Tiếng Việt", tpi: "vi", flag: "/flags/vi.svg" },
  { id: "ru", lang: "ru", name: "Русский", tpi: "ru", flag: "/flags/ru.svg" },
  { id: "uk", lang: "uk", name: "Українська", tpi: "uk", flag: "/flags/uk.svg" },
];

export const translationById = (id: string | null) => TRANSLATIONS.find((x) => x.id === id) ?? TRANSLATIONS[0];

/** How a translation reads in a menu: "Español · Castelgard", "Català". */
export const translationLabel = (x: Translation) => (x.version ? `${x.name} · ${x.version}` : x.name);

/**
 * The translations grouped by language, in list order: a language with several
 * versions (Spanish today) becomes one group whose `items` are its versions.
 */
export function translationGroups() {
  const out: { name: string; flag: string; items: Translation[] }[] = [];
  for (const x of TRANSLATIONS) {
    let g = out.find((l) => l.name === x.name);
    if (!g) out.push(g = { name: x.name, flag: x.flag, items: [] });
    g.items.push(x);
  }
  return out;
}
