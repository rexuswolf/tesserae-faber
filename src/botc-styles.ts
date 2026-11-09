// Clocktower's own designs, per shape: its look (the edition's name on the back, the night, the
// midnight clock), made for Blood on the Clocktower. Its functional ones (Fast print, Ivory, High
// legibility, and the rings' and cards') are the app's now (src/shape-designs.ts APP_DESIGNS),
// under the same ids: a "c:rapida" kept before is the app's Fast print, the same. Its rings and cards
// default to the app's Colour ring and Gold trim, listed here (first) only as its default.
// The Clocktower app (/botc) reads them from here; tools/make-botc-collection.mjs writes them into
// Clocktower's collection file, so a copy of it starts with them too.
import { FILAMENTS } from "./engine/token-engine.ts";
import type { StyleDef } from "./collection.ts";
import { ringDesigns, cardDesigns, baseDesigns } from "./shape-designs.ts";
import type { TokenShape } from "./types.ts";

const dark = { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } as const;
// The default: the edition's name (a homebrew's script) in gold on the back; gold on a dark coin
// needs two layers (0.4 mm) to cover it. Every design keeps the frame in the team colour, like the
// name, so a token reads the same whatever the design.
// Every one's frame starts 0.8 mm in from the coin's edge (frameInset): the frame's colour no longer
// shows on the coin's side, which is all the base's (black).
const INSET = 0.8;
// The back is the same on every token, the midnight clock without its border: turned over, a token
// says neither its edition (people mix them) nor its team.
const EDITION = { style: "classic", frame: "rim", frameWidth: 0.8, frameInset: INSET, back: "reloj", backFace: { frame: "none" }, depth: 0.4, colours: dark } as const;   // the back without the front's rim

export const BOTC_STYLES: Record<TokenShape, StyleDef[]> = {
  // Edition, the one offered: the others are hidden (no longer offered), kept so a token already
  // in one of them still draws as it did
  coin: [
    { id: "edicion", name: { es: "Medianoche", en: "Midnight" }, help: { es: "Negra con el aro y el nombre del color del bando; al reverso, el reloj de medianoche en oro, igual en todas: dada la vuelta, no dice su edición ni su bando.", en: "Black with its rim and name in the team colour; on the back, the midnight clock in gold, the same on all: turned over, it says neither its edition nor its team." }, spec: EDITION },
    { id: "noche", hidden: true, name: { es: "Noche cerrada", en: "Pitch-black night" }, help: { es: "Negra, con las fases de la luna en el marco y una luna con estrellas en oro al reverso.", en: "Black, with the moon's phases round the rim and a moon with stars in gold on the back." },
      spec: { style: "classic", frame: "fases", frameWidth: 0.8, frameInset: INSET, back: "eclipse", depth: 0.4, colours: dark } },
    // the gold midnight clock on the back is light on a dark coin: 0.4 mm covers it
    { id: "medianoche", hidden: true, name: { es: "Medianoche", en: "Midnight" }, help: { es: "Negra, con estrellas en el marco y el reloj de medianoche en oro al reverso.", en: "Black, with stars round the rim and the midnight clock in gold on the back." },
      spec: { style: "classic", frame: "firmamento", frameWidth: 0.8, frameInset: INSET, back: "medianoche", depth: 0.4, colours: dark } },
    // harlequin rhombi behind everything: fine lines in the team colour (with the frame) on the
    // front, a gold checkerboard behind the medallion on the back; no filament of their own
    { id: "arlequin", hidden: true, name: { es: "Arlequín de medianoche", en: "Midnight Harlequin" }, help: { es: "Negra, con una rejilla fina de rombos del color del equipo detrás del icono y el nombre, y un damero de rombos en oro alrededor de un medallón con la luna y la edición al reverso.", en: "Black, with a fine harlequin grid in the team colour behind the icon and the name, and a gold harlequin checkerboard round a medallion with the moon and the edition on the back." },
      spec: { style: "classic", frame: "rim", frameWidth: 0.6, frameInset: INSET, back: "medallon", depth: 0.4, colours: dark,
        frontPattern: { id: "rombos-lineas", scale: 5.1, line: 0.6, halo: 0.8, colour: "frame" },
        backPattern: { id: "damero-rombos", scale: 4.2, line: 0.7, halo: 0.8 } } },
  ],
  // rings and cards: none of its own; its default the app's (Clocktower's cards are all of one group,
  // gold: Gold trim, like the grimoire's)
  ring: ringDesigns("aro-color"),
  card: cardDesigns("filete"),
  base: baseDesigns("bandeja-color"),
};
