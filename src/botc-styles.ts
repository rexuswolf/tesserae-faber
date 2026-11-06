// Clocktower's own designs, per shape: its look (the edition's name on the back, the night, the
// midnight clock), made for Blood on the Clocktower. Its functional ones (Fast print, Ivory, High
// legibility, and the rings' and cards') are the app's now (src/shape-designs.ts APP_DESIGNS),
// under the same ids: a "c:rapida" kept before is the app's Fast print, the same. Its rings and cards
// default to the app's Colour ring and Gold trim, listed here (first) only as its default.
// The Clocktower app (/botc) reads them from here; tools/make-botc-collection.mjs writes them into
// Clocktower's collection file, so a copy of it starts with them too.
import { FILAMENTS } from "./engine/token-engine.ts";
import type { StyleDef } from "./collection.ts";
import { ringDesigns, cardDesigns } from "./shape-designs.ts";
import type { TokenShape } from "./types.ts";

const dark = { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } as const;
// The default: the edition's name (a homebrew's script) in gold on the back; gold on a dark coin
// needs two layers (0.4 mm) to cover it. Every design keeps the frame in the team colour, like the
// name, so a token's side reads the same whatever the design.
const EDITION = { style: "classic", frame: "rim", frameWidth: 0.8, back: "edition", depth: 0.4, colours: dark } as const;

export const BOTC_STYLES: Record<TokenShape, StyleDef[]> = {
  coin: [
    { id: "edicion", name: { es: "Edición", en: "Edition" }, help: { es: "Negra con el color del equipo y el nombre de la edición en oro al reverso.", en: "Black with the team colour and the edition's name in gold on the back." }, spec: EDITION },
    { id: "noche", name: { es: "Noche cerrada", en: "Pitch-black night" }, help: { es: "Negra, con las fases de la luna en el marco y una luna con estrellas en oro al reverso.", en: "Black, with the moon's phases round the rim and a moon with stars in gold on the back." },
      spec: { style: "classic", frame: "fases", frameWidth: 0.8, back: "eclipse", depth: 0.4, colours: dark } },
    // the gold midnight clock on the back is light on a dark coin: 0.4 mm covers it
    { id: "medianoche", name: { es: "Medianoche", en: "Midnight" }, help: { es: "Negra, con estrellas en el marco y el reloj de medianoche en oro al reverso.", en: "Black, with stars round the rim and the midnight clock in gold on the back." },
      spec: { style: "classic", frame: "firmamento", frameWidth: 0.8, back: "medianoche", depth: 0.4, colours: dark } },
  ],
  // rings and cards: none of its own; its default the app's (Clocktower's cards are all of one group,
  // gold: Gold trim, like the grimoire's)
  ring: ringDesigns("aro-color"),
  card: cardDesigns("filete"),
};
