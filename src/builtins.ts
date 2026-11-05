/**
 * The collections that come with the app. What they say about themselves (their card on the
 * collections page, their About, their mark) is code, here; their tokens are data (Clocktower's
 * characters: the library in Firestore).
 */
import type { BuiltInEntry } from "./collection.ts";

const VILLACUERVOS_URL = "https://villacuervos.es";

export const BUILT_INS: BuiltInEntry[] = [
  {
    id: "botc",
    name: "Blood on the Clocktower",
    logo: "/logo-mark.svg",
    accent: "#c9a227",
    tokens: 191,
    preview: "/collections/botc-preview.svg",   // tools/make-crear-art.mjs
    href: "/botc",   // it opens as Midnight Mint, the Clocktower app
    file: "/collections/botc.json",   // the same, as a collection file: to start one of your own from
    facts: { es: "181 personajes · 215 recordatorios · 13 idiomas", en: "181 characters · 215 reminders · 13 languages" },
    text: { es: "Todas las ediciones, el Grimorio y tus guiones.", en: "Every edition, the Grimoire and your scripts." },
    ccc: true,   // Community Created Content: its mark in About
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
  },
];
