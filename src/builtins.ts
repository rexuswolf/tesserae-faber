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
    tokens: 39,
    preview: "/collections/drawsteel-preview.svg",   // tools/make-drawsteel-collection.mjs
    file: "/collections/drawsteel.json",   // tools/make-drawsteel-collection.mjs
    cover: "radial-gradient(120% 140% at 0% 0%, #3a3f47 0%, #23262b 55%, #141619 100%)",
    theme: { accent: "#d4a017", background: "#16181b", surface: "#202328", text: "#e8e6e1", muted: "#a3a7ad", glow: "#2b2f36", font: "Bricolage Grotesque" },
    loader: { text: { es: "Desenvainando…", en: "Drawing steel…" } },
    facts: { es: "15 recursos · 2 fichas de dos caras · 11 condiciones · 11 aros · 2 idiomas", en: "15 resources · 2 two-sided tokens · 11 conditions · 11 rings · 2 languages" },
    text: { es: "Recursos heroicos, Malicia, Victorias, fichas de turno de dos caras, condiciones y aros de condición.", en: "Heroic resources, Malice, Victories, two-sided turn tokens, conditions and condition rings." },
    about: {
      text: {
        es: "Fichas para jugar a Draw Steel: el recurso heroico de cada clase (y uno genérico), Impulso, Victorias, Recuperaciones, fichas de héroe, la Malicia del Director, dos fichas de dos caras para llevar el turno (Por actuar / Ya actuó, Reacción / Reacción usada: se les da la vuelta) y las condiciones, con su duración como fichas asociadas, y un aro por condición para ponerlo en la peana de la miniatura.",
        en: "Tokens to play Draw Steel: each class's heroic resource (and a generic one), Surges, Victories, Recoveries, Hero Tokens, the Director's Malice, two two-sided tokens to keep track of the turn (Ready / Acted, Triggered Action / Used: turn them over) and the conditions, with their duration as linked tokens, and a ring per condition to slip over a miniature's base.",
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
  {
    // only what the System Reference Document 5.2 holds (CC BY 4.0, its attribution word for word
    // below); no trademark, logo or art of the publisher's, in its name or anywhere
    id: "srd5e",
    name: { es: "Fantasía 5e", en: "5e Fantasy" },
    logo: "/collections/srd5e-logo.svg",
    accent: "#c9463d",
    tokens: 50,
    preview: "/collections/srd5e-preview.svg",   // tools/make-crear-art.mjs
    file: "/collections/srd5e.json",   // tools/make-srd5e-collection.mjs
    cover: "radial-gradient(120% 140% at 0% 0%, #4a2a22 0%, #2a1c18 55%, #150f0d 100%)",
    theme: { accent: "#c9463d", background: "#17110f", surface: "#231a17", text: "#efe6da", muted: "#b2a294", glow: "#3a1f1a", font: "Gloock" },
    loader: { text: { es: "Tirando iniciativa…", en: "Rolling initiative…" } },
    facts: { es: "15 condiciones · 9 marcadores · 8 efectos de conjuro · 18 aros · 2 idiomas", en: "15 conditions · 9 markers · 8 spell effects · 18 rings · 2 languages" },
    text: { es: "Condiciones, Concentración, Inspiración heroica, Ventaja, Reacción, efectos de conjuro y aros de condición, para la quinta edición.", en: "Conditions, Concentration, Heroic Inspiration, Advantage, Reaction, spell effects and condition rings, for the fifth edition." },
    about: {
      text: {
        es: "Fichas para juegos de rol de fantasía compatibles con la quinta edición del SRD: las quince condiciones (con su duración como fichas asociadas, y los niveles de Agotamiento), Concentración, Inspiración heroica, Malherido, Muerto, Escondido, Esquivando y Volando, dos fichas de dos caras (Reacción / Reacción usada, Ventaja / Desventaja: se les da la vuelta), efectos de conjuro que ayudan (Bendición, Acelerar, Escudo de fe, Santuario) y que estorban (Perdición, Ralentizar, Marca del cazador, Fuego feérico), y un aro por condición para ponerlo en la peana de la miniatura.",
        en: "Tokens for fantasy roleplaying games compatible with the fifth edition SRD: the fifteen conditions (with their duration as linked tokens, and Exhaustion's levels), Concentration, Heroic Inspiration, Bloodied, Dead, Hidden, Dodging and Flying, two two-sided tokens (Reaction / Reaction Used, Advantage / Disadvantage: turn them over), spell effects that help (Bless, Haste, Shield of Faith, Sanctuary) and that hinder (Bane, Slow, Hunter's Mark, Faerie Fire), and a ring per condition to slip over a miniature's base.",
      },
      credits: {
        es: "Los nombres de las condiciones, las reglas y los conjuros vienen del System Reference Document 5.2; los iconos, de game-icons.net. Esta colección no es oficial ni está afiliada a Wizards of the Coast ni respaldada por ella. This work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
        en: "The names of the conditions, rules and spells come from the System Reference Document 5.2; the icons, from game-icons.net. This collection is unofficial, and not affiliated with or endorsed by Wizards of the Coast. This work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
      },
      links: [{ label: "System Reference Document 5.2", url: "https://www.dndbeyond.com/srd" }, { label: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/legalcode" }],
    },
  },
];
