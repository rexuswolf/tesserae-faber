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
    preview: { es: "/collections/botc-preview.svg", en: "/collections/botc-preview-en.svg" },   // tools/make-crear-art.mjs
    href: "/botc",   // it opens as Midnight Mint, the Clocktower app
    facts: { es: `${botc.characters} personajes · ${botc.reminders} recordatorios · ${botc.languages} idiomas`, en: `${botc.characters} characters · ${botc.reminders} reminders · ${botc.languages} languages` },
    text: { es: "Todas las ediciones, el Grimorio y tus guiones.", en: "Every edition, the Grimoire and your scripts." },
    ccc: true,   // Community Created Content: its mark in About
    about: {
      text: {
        es: `Todas las ediciones de Blood on the Clocktower: personajes con sus recordatorios, las fichas de información del Grimorio y tus guiones del Script Tool.\n\n[Blood on the Clocktower](https://bloodontheclocktower.com), sus personajes y sus reglas son de The Pandemonium Institute; esta colección no es oficial ni está respaldada por ellos. Los nombres y recordatorios traducidos vienen de [Villacuervos](${VILLACUERVOS_URL}).`,
        en: `Every Blood on the Clocktower edition: characters with their reminders, the Grimoire's info tokens and your Script Tool scripts.\n\n[Blood on the Clocktower](https://bloodontheclocktower.com), its characters and its rules belong to The Pandemonium Institute; this collection is unofficial and not endorsed by them. Translated names and reminders come from [Villacuervos](${VILLACUERVOS_URL}).`,
      },
    },
  },
  {
    // the hidden-role game of Secret Hitler (Goat, Wolf & Cabbage, CC BY-NC-SA 4.0), rethemed to
    // the Roman Senate: the theme and every name on the tokens are ours; its attribution below,
    // and this adaptation under the same licence (non-commercial)
    id: "senado",
    name: { es: "Secret Caesar", en: "Secret Caesar" },
    logo: "/collections/senado-logo.svg",
    accent: "#d4a72c",
    tokens: 11,
    preview: { es: "/collections/senado-preview.svg", en: "/collections/senado-preview-en.svg" },   // tools/make-crear-art.mjs
    file: "/collections/senado.json",   // tools/make-senado-collection.mjs
    cover: "radial-gradient(120% 140% at 0% 0%, #5c1d15 0%, #2e110d 55%, #160a08 100%)",
    theme: { accent: "#d4a72c", background: "#1b0c0a", surface: "#2a1411", text: "#f3e8dc", muted: "#c4a99c", glow: "#7a1e16", font: "Marcellus" },
    loader: { text: { es: "Convocando al Senado…", en: "Convening the Senate…" } },
    facts: { es: "3 bandos · 2 cargos de dos caras · el voto · 3 tumultos · 2 leyes · 2 idiomas", en: "3 sides · 2 two-sided offices · the vote · 3 unrest · 2 laws · 2 languages" },
    text: { es: "Un juego de roles ocultos en el Senado de Roma: bandos, Cónsul y Tribuno, Placet / Non placet, Tumultos y las leyes.", en: "A hidden-role game in the Roman Senate: sides, Consul and Tribune, Placet / Non placet, Unrest and the laws." },
    about: {
      text: {
        es: "Fichas para jugar a un juego de roles ocultos en el Senado de Roma. La mayoría son Republicanos y no saben quién es quién; los Conspiradores se conocen entre ellos; el Aspirante a César, su líder, se esconde. El Cónsul nombra a un Tribuno y todos votan a la vez (Placet / Non placet); si sale adelante, entre los dos aprueban una ley; con tres gobiernos fallidos estallan los Tumultos y se aprueba la ley de arriba del mazo. Al acabar su mandato, el Cónsul y el Tribuno se dan la vuelta (Excónsul, Extribuno). Ganan los Republicanos con 5 Leyes de la República o ejecutando al Aspirante a César; los Conspiradores, con 6 Decretos del Tirano o si el Aspirante a César es nombrado Tribuno con 3 decretos ya aprobados. El mazo: 6 Leyes y 11 Decretos, en tarjetas.\n\nBasado en [Secret Hitler](https://www.secrethitler.com), de Goat, Wolf & Cabbage (Max Temkin, Mike Boxleiter y Tommy Maranges), con licencia [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Esta adaptación, con la temática del Senado de Roma y nombres propios, se comparte con la misma licencia y sin fines comerciales. No es oficial ni está afiliada a Goat, Wolf & Cabbage ni respaldada por ellos. Iconos de [game-icons.net](https://game-icons.net) (CC BY 3.0).",
        en: "Tokens to play a hidden-role game in the Roman Senate. Most players are Republicans and don't know who is who; the Conspirators know each other; the Aspiring Caesar, their leader, stays hidden. The Consul names a Tribune and everyone votes at once (Placet / Non placet); if it passes, the two of them enact a law; three failed governments spark Unrest and the top law of the deck passes. When their term ends, the Consul and the Tribune turn over (Ex-Consul, Ex-Tribune). The Republicans win with 5 Laws of the Republic or by executing the Aspiring Caesar; the Conspirators, with 6 Tyrant's Decrees, or if the Aspiring Caesar is named Tribune once 3 decrees have passed. The deck: 6 Laws and 11 Decrees, as cards.\n\nBased on [Secret Hitler](https://www.secrethitler.com) by Goat, Wolf & Cabbage (Max Temkin, Mike Boxleiter and Tommy Maranges), licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). This adaptation, rethemed to the Roman Senate with names of its own, is shared under the same licence, for non-commercial use. It is unofficial, and not affiliated with or endorsed by Goat, Wolf & Cabbage. Icons from [game-icons.net](https://game-icons.net) (CC BY 3.0).",
      },
    },
  },
  {
    // the classic party game (Mafia, Dimitry Davidoff; its werewolves, Andrew Plotkin: public
    // domain): its common roles by their plain names, none of a commercial edition's, nor its name
    id: "werewolf",
    name: { es: "Hombres lobo", en: "Werewolves" },
    logo: "/collections/werewolf-logo.svg",
    accent: "#d4a72c",
    tokens: 20,
    preview: { es: "/collections/werewolf-preview.svg", en: "/collections/werewolf-preview-en.svg" },   // tools/make-crear-art.mjs
    file: "/collections/werewolf.json",   // tools/make-werewolf-collection.mjs
    cover: "radial-gradient(120% 140% at 0% 0%, #1f3352 0%, #121b2b 55%, #0a0e16 100%)",
    theme: { accent: "#d4a72c", background: "#0d121b", surface: "#172030", text: "#ebe7df", muted: "#a3acbb", glow: "#22385a", font: "Marcellus" },
    loader: { text: { es: "Cae la noche…", en: "Night falls…" } },
    facts: { es: "10 de la aldea · 3 lobos · 1 por su cuenta · 6 marcadores · 2 idiomas", en: "10 village · 3 werewolves · 1 loner · 6 markers · 2 languages" },
    text: { es: "El clásico de los hombres lobo: la aldea, los lobos, el Curtidor y los marcadores de la mesa, con las pociones de la Bruja.", en: "The classic werewolf game: the village, the werewolves, the Tanner and the table's markers, the Witch's potions among them." },
    about: {
      text: {
        es: "Fichas para jugar al clásico de los hombres lobo. Cada noche los lobos, que se conocen entre ellos, devoran a un aldeano; cada día la aldea discute y ahorca a quien cree que es un lobo. Gana la aldea si acaba con todos los lobos; los lobos, si llegan a ser tantos como los aldeanos.\n\nLa aldea: Aldeano, Vidente, Médico, Guardián, Bruja, Cazador, Cupido, Anciano, Tonto del pueblo y Masón. Los lobos: Hombre lobo, Lobo alfa y Lobezno. Por su cuenta, el Curtidor, que gana si lo ahorcan. Y los marcadores de la mesa: Alcalde, Enamorados, Protegido, Muerto y las dos pociones de la Bruja, que se dan la vuelta al usarlas.\n\nEl juego es de dominio público: Mafia, de Dimitry Davidoff (1986), y su versión con hombres lobo, de Andrew Plotkin (1997). Esta colección no es oficial ni está afiliada a ninguna de sus ediciones comerciales. Iconos de [game-icons.net](https://game-icons.net) (CC BY 3.0).",
        en: "Tokens to play the classic werewolf game. Each night the werewolves, who know each other, devour a villager; each day the village argues and hangs whoever they think is a werewolf. The village wins when every werewolf is gone; the werewolves, once they're as many as the villagers.\n\nThe village: Villager, Seer, Doctor, Bodyguard, Witch, Hunter, Cupid, Elder, Village Idiot and Mason. The werewolves: Werewolf, Alpha Wolf and Wolf Cub. On their own, the Tanner, who wins if hanged. And the table's markers: Mayor, Lovers, Protected, Dead and the Witch's two potions, turned over when used.\n\nThe game is in the public domain: Mafia, by Dimitry Davidoff (1986), and its werewolf version, by Andrew Plotkin (1997). This collection is unofficial and not affiliated with any of its commercial editions. Icons from [game-icons.net](https://game-icons.net) (CC BY 3.0).",
      },
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
    preview: { es: "/collections/srd5e-preview.svg", en: "/collections/srd5e-preview-en.svg" },   // tools/make-crear-art.mjs
    file: "/collections/srd5e.json",   // tools/make-srd5e-collection.mjs
    cover: "radial-gradient(120% 140% at 0% 0%, #4a2a22 0%, #2a1c18 55%, #150f0d 100%)",
    theme: { accent: "#c9463d", background: "#17110f", surface: "#231a17", text: "#efe6da", muted: "#b2a294", glow: "#3a1f1a", font: "Gloock" },
    loader: { text: { es: "Tirando iniciativa…", en: "Rolling initiative…" } },
    facts: { es: "15 condiciones · 9 marcadores · 8 efectos de conjuro · 18 aros · 2 idiomas", en: "15 conditions · 9 markers · 8 spell effects · 18 rings · 2 languages" },
    text: { es: "Condiciones, Concentración, Inspiración heroica, Ventaja, Reacción, efectos de conjuro y aros de condición, para la quinta edición.", en: "Conditions, Concentration, Heroic Inspiration, Advantage, Reaction, spell effects and condition rings, for the fifth edition." },
    about: {
      text: {
        es: "Fichas para juegos de rol de fantasía compatibles con la quinta edición del SRD: las quince condiciones (con su duración como fichas asociadas, y los niveles de Agotamiento), Concentración, Inspiración heroica, Ensangrentado, Muerto, Esconderse, Esquivar y Volando, dos fichas de dos caras (Reacción / Reacción usada, Ventaja / Desventaja: se les da la vuelta), efectos de conjuro que ayudan (Bendecir, Acelerar, Escudo de la fe, Santuario) y que estorban (Perdición, Ralentizar, Marca del cazador, Fuego feérico), y un aro por condición para ponerlo en la peana de la miniatura.\n\nLos nombres de las condiciones, las reglas y los conjuros vienen del [System Reference Document 5.2](https://www.dndbeyond.com/srd); los iconos, de [game-icons.net](https://game-icons.net). Esta colección no es oficial ni está afiliada a Wizards of the Coast ni respaldada por ella.\n\nThis work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
        en: "Tokens for fantasy roleplaying games compatible with the fifth edition SRD: the fifteen conditions (with their duration as linked tokens, and Exhaustion's levels), Concentration, Heroic Inspiration, Bloodied, Dead, Hidden, Dodging and Flying, two two-sided tokens (Reaction / Reaction Used, Advantage / Disadvantage: turn them over), spell effects that help (Bless, Haste, Shield of Faith, Sanctuary) and that hinder (Bane, Slow, Hunter's Mark, Faerie Fire), and a ring per condition to slip over a miniature's base.\n\nThe names of the conditions, rules and spells come from the [System Reference Document 5.2](https://www.dndbeyond.com/srd); the icons, from [game-icons.net](https://game-icons.net). This collection is unofficial, and not affiliated with or endorsed by Wizards of the Coast.\n\nThis work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
      },
    },
  },
  {
    id: "drawsteel",
    name: "Draw Steel",
    logo: "/collections/drawsteel-logo.svg",
    accent: "#d4a017",
    tokens: 39,
    preview: { es: "/collections/drawsteel-preview.svg", en: "/collections/drawsteel-preview-en.svg" },   // tools/make-crear-art.mjs
    file: "/collections/drawsteel.json",   // tools/make-drawsteel-collection.mjs
    cover: "radial-gradient(120% 140% at 0% 0%, #3a3f47 0%, #23262b 55%, #141619 100%)",
    theme: { accent: "#d4a017", background: "#16181b", surface: "#202328", text: "#e8e6e1", muted: "#a3a7ad", glow: "#2b2f36", font: "Bricolage Grotesque" },
    loader: { text: { es: "Desenvainando…", en: "Drawing steel…" } },
    facts: { es: "15 recursos · 2 fichas de dos caras · 11 condiciones · 11 aros · 2 idiomas", en: "15 resources · 2 two-sided tokens · 11 conditions · 11 rings · 2 languages" },
    text: { es: "Recursos heroicos, Malicia, Victorias, fichas de turno de dos caras, condiciones y aros de condición.", en: "Heroic resources, Malice, Victories, two-sided turn tokens, conditions and condition rings." },
    about: {
      text: {
        es: "Fichas para jugar a Draw Steel: el recurso heroico de cada clase (y uno genérico), Impulso, Victorias, Recuperaciones, fichas de héroe, la Malicia del Director, dos fichas de dos caras para llevar el turno (Por actuar / Ya actuó, Reacción / Reacción usada: se les da la vuelta) y las condiciones, con su duración como fichas asociadas, y un aro por condición para ponerlo en la peana de la miniatura.\n\nUna colección hecha por fans: los nombres de las mecánicas son de Draw Steel; los iconos, de [game-icons.net](https://game-icons.net). No lleva arte de MCDM.\n\n[Draw Steel Creator License](https://www.mcdmproductions.com/draw-steel-creator-license)",
        en: "Tokens to play Draw Steel: each class's heroic resource (and a generic one), Surges, Victories, Recoveries, Hero Tokens, the Director's Malice, two two-sided tokens to keep track of the turn (Ready / Acted, Triggered Action / Used: turn them over) and the conditions, with their duration as linked tokens, and a ring per condition to slip over a miniature's base.\n\nA fan-made collection: the mechanics' names are Draw Steel's; the icons, [game-icons.net](https://game-icons.net)'s. It carries no MCDM art.\n\n[Draw Steel Creator License](https://www.mcdmproductions.com/draw-steel-creator-license)",
      },
    },
    // the licence's compatibility mark, and its notice word for word (it must appear where the product is shown)
    mark: {
      src: "/collections/powered-by-draw-steel.png", alt: "Powered by Draw Steel", invert: true,
      notice: "Tesserae Faber is an independent product published under the DRAW STEEL Creator License and is not affiliated with MCDM Productions, LLC. DRAW STEEL © 2026 MCDM Productions, LLC.",
    },
  },
];
