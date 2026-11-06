// Clocktower's starting styles, per shape: the designs the app offered as templates before styles
// came with each collection, under the same ids, so a style named after one keeps its name. Made for
// Blood on the Clocktower (the team colours, the edition's name on the back, the midnight clock).
// The Clocktower app (/botc) reads them from here; tools/make-botc-collection.mjs writes them into
// Clocktower's collection file, so a copy of it starts with them too.
import { FILAMENTS } from "./engine/token-engine.ts";
import type { StyleDef } from "./collection.ts";
import type { TokenShape } from "./types.ts";

const dark = { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } as const;
// The default: the edition's name (a homebrew's script) in gold on the back; gold on a dark coin
// needs two layers (0.4 mm) to cover it. Every design keeps the frame in the team colour, like the
// name, so a token's side reads the same whatever the design.
const EDITION = { style: "classic", frame: "rim", frameWidth: 0.8, back: "edition", depth: 0.4, colours: dark } as const;
// The thinnest token that holds up: one layer of colour on 1 mm of black (opaque, stiff at 45 mm),
// no back. 1.2 mm is also the thickness slider's floor.
const FAST = { style: "classic", height: 1.2, frame: "rim", frameWidth: 0.8, back: "none", depth: 0.2, colours: dark } as const;
const IVORY = { style: "classic", frame: "rim", frameWidth: 1.0, back: "guilloche", depth: 0.4, colours: { base: FILAMENTS.white, front: "team", frame: "team", back: FILAMENTS.bronze } } as const;
const LEGIBLE = { style: "window", textSize: 6, frame: "none", back: "none", depth: 0.4, colours: { base: FILAMENTS.white, front: "team", frame: "team", back: FILAMENTS.gold } } as const;

export const BOTC_STYLES: Record<TokenShape, StyleDef[]> = {
  coin: [
    { id: "edicion", name: { es: "Edición", en: "Edition" }, help: { es: "Negra con el color del equipo y el nombre de la edición en oro al reverso.", en: "Black with the team colour and the edition's name in gold on the back." }, spec: EDITION },
    { id: "rapida", name: { es: "Impresión rápida", en: "Fast print" }, help: { es: "Negra y color de equipo, sin reverso y lo más fina posible (1,2 mm). La más rápida.", en: "Black and team colour, no back and as thin as it gets (1.2 mm). The quickest." }, spec: FAST },
    // Night and Midnight are their frame and back designs: on a ring or a card (a line, no back) they'd be Edition.
    { id: "noche", name: { es: "Noche cerrada", en: "Pitch-black night" }, help: { es: "Negra, con las fases de la luna en el marco y una luna con estrellas en oro al reverso.", en: "Black, with the moon's phases round the rim and a moon with stars in gold on the back." },
      spec: { style: "classic", frame: "fases", frameWidth: 0.8, back: "eclipse", depth: 0.4, colours: dark } },
    // the gold midnight clock on the back is light on a dark coin: 0.4 mm covers it
    { id: "medianoche", name: { es: "Medianoche", en: "Midnight" }, help: { es: "Negra, con estrellas en el marco y el reloj de medianoche en oro al reverso.", en: "Black, with stars round the rim and the midnight clock in gold on the back." },
      spec: { style: "classic", frame: "firmamento", frameWidth: 0.8, back: "medianoche", depth: 0.4, colours: dark } },
    { id: "marfil", name: { es: "Moneda de marfil", en: "Ivory coin" }, help: { es: "Blanca, con el marco del color del equipo y el reverso grabado en bronce.", en: "White, with the frame in the team colour and an engraved bronze back." }, spec: IVORY },
    { id: "legible", name: { es: "Alta legibilidad", en: "High legibility" }, help: { es: "Ventana plana con letras grandes.", en: "Flat window with big letters." }, spec: LEGIBLE },
  ],
  ring: [
    { id: "edicion", name: { es: "Edición", en: "Edition" }, help: { es: "Negro, con el nombre y una línea fina en cada borde.", en: "Black, with the name and a fine line along each edge." }, spec: EDITION },
    { id: "rapida", name: { es: "Impresión rápida", en: "Fast print" }, help: { es: "Negro y lo más fino posible (1,2 mm). El más rápido.", en: "Black and as thin as it gets (1.2 mm). The quickest." }, spec: FAST },
    { id: "marfil", name: { es: "Marfil", en: "Ivory" }, help: { es: "Blanco, con el nombre y una línea fina en cada borde.", en: "White, with the name and a fine line along each edge." }, spec: IVORY },
    { id: "legible", name: { es: "Alta legibilidad", en: "High legibility" }, help: { es: "Blanco, sin líneas y con el nombre tan grande como cabe.", en: "White, no lines, and the name as large as it fits." }, spec: LEGIBLE },
  ],
  card: [
    { id: "edicion", name: { es: "Edición", en: "Edition" }, help: { es: "Negra, con la frase y una línea dentro del borde.", en: "Black, with the phrase and a line inside the edge." }, spec: EDITION },
    { id: "rapida", name: { es: "Impresión rápida", en: "Fast print" }, help: { es: "Negra y lo más fina posible (1,2 mm). La más rápida.", en: "Black and as thin as it gets (1.2 mm). The quickest." }, spec: FAST },
    { id: "marfil", name: { es: "Marfil", en: "Ivory" }, help: { es: "Blanca, con la frase y una línea dentro del borde.", en: "White, with the phrase and a line inside the edge." }, spec: IVORY },
    { id: "legible", name: { es: "Alta legibilidad", en: "High legibility" }, help: { es: "Blanca y sin marco.", en: "White, without a frame." }, spec: LEGIBLE },
  ],
};
