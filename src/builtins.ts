/**
 * The collections that come with the app. What they say about themselves (their card on the
 * collections page, their About, their mark) is code, here; their tokens are data (Clocktower's
 * characters: the library in Firestore).
 */
import type { BuiltInEntry } from "./collection.ts";
import { FACTS } from "./builtins-facts.ts";   // counted by tools/make-botc-collection.mjs

const VILLACUERVOS_URL = "https://villacuervos.es";
const botc = FACTS.botc;

export const BUILT_INS: BuiltInEntry[] = [
  {
    id: "botc",
    name: "Blood on the Clocktower",
    logo: "/logo-mark.svg",
    accent: "#c9a227",
    tokens: botc.tokens,
    preview: "/collections/botc-preview.svg",   // tools/make-crear-art.mjs
    href: "/botc",   // it opens as Midnight Mint, the Clocktower app
    file: "/collections/botc.json",   // the same, as a collection file: to start one of your own from
    facts: { es: `${botc.characters} personajes · ${botc.reminders} recordatorios · ${botc.languages} idiomas`, en: `${botc.characters} characters · ${botc.reminders} reminders · ${botc.languages} languages` },
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
  {
    id: "drawsteel",
    name: "Draw Steel",
    logo: "/collections/drawsteel-logo.svg",
    accent: "#d4a017",
    tokens: 26,
    preview: "/collections/drawsteel-preview.svg",   // tools/make-drawsteel-collection.mjs
    file: "/collections/drawsteel.json",   // tools/make-drawsteel-collection.mjs
    cover: "radial-gradient(120% 140% at 0% 0%, #3a3f47 0%, #23262b 55%, #141619 100%)",
    facts: { es: "15 recursos · 11 condiciones · 2 idiomas", en: "15 resources · 11 conditions · 2 languages" },
    text: { es: "Recursos heroicos, Malicia, Victorias y condiciones.", en: "Heroic resources, Malice, Victories and conditions." },
    about: {
      text: {
        es: "Fichas para jugar a Draw Steel: el recurso heroico de cada clase (y uno genérico), Impulso, Victorias, Recuperaciones, fichas de héroe, la Malicia del Director y las condiciones, con su duración como fichas asociadas.",
        en: "Tokens to play Draw Steel: each class's heroic resource (and a generic one), Surges, Victories, Recoveries, Hero Tokens, the Director's Malice and the conditions, with their duration as linked tokens.",
      },
      credits: {
        es: "Una colección hecha por fans: los nombres de las mecánicas son de Draw Steel; los iconos, de game-icons.net. No lleva arte de MCDM.",
        en: "A fan-made collection: the mechanics' names are Draw Steel's; the icons, game-icons.net's. It carries no MCDM art.",
      },
      links: [{ label: "Draw Steel Creator License", url: "https://www.mcdmproductions.com/draw-steel-creator-license" }],
    },
    // the licence's compatibility mark, and its notice word for word (it must appear where the product is shown)
    mark: {
      src: "/collections/powered-by-draw-steel.png", alt: "Powered by Draw Steel", invert: true,
      notice: "Tesserae Faber is an independent product published under the DRAW STEEL Creator License and is not affiliated with MCDM Productions, LLC. DRAW STEEL © 2026 MCDM Productions, LLC.",
    },
  },
];
