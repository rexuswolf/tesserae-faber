// The designs made for condition rings and cards (tools/shape-design-protos/ shows them all), one
// place for every collection that offers them: Básico (src/collection.ts), Clocktower
// (src/botc-styles.ts) and Draw Steel (tools/make-drawsteel-collection.mjs) each list the ones that
// suit it, its default first. "team" is the token's group colour. A ring's letters are as tall as
// its band allows (ringBand); a card prints flush, face-down.
import { FILAMENTS } from "./engine/token-engine.ts";
import type { StyleDef } from "./collection.ts";

const { black, white, gold } = FILAMENTS;

/** Ring designs, by id. Exprés keeps the id of the old "Fast print" (rapida): what it was chosen for, the quickest. */
export const RING_DESIGNS = {
  "aro-color": {
    id: "aro-color", name: { es: "Aro de color", en: "Colour ring" },
    help: { es: "El aro entero del color del grupo y el nombre en negro, sin líneas: el color se ve de lejos y de lado.", en: "The whole ring in the group colour and the name in black, no lines: the colour shows from afar and from the side." },
    spec: { frame: "none", textSize: 4, height: 2, depth: 0.4, colours: { base: "team", front: black, frame: black } },
  },
  "relieve-alto": {
    id: "relieve-alto", name: { es: "Relieve alto", en: "High relief" },
    help: { es: "Negro, sin líneas, con el nombre tan grande como cabe y en relieve de 0,8 mm: se lee de lado, a ras de mesa.", en: "Black, no lines, the name as large as it fits and raised 0.8 mm: it reads from the side, at table height." },
    spec: { frame: "none", textSize: 4.6, height: 2, depth: 0.4, relief: { text: true, frame: false, icon: false }, reliefHeight: 0.8, colours: { base: black, front: "team", frame: "team" } },
  },
  filos: {
    id: "filos", name: { es: "Filos marcados", en: "Bold edges" },
    help: { es: "Negro, el nombre en blanco y una línea gruesa del color del grupo en cada borde, en relieve: el color enmarca el aro y se nota al tacto.", en: "Black, the name in white and a thick raised line in the group colour along each edge: the colour frames the ring, and you can feel it." },
    spec: { frame: "rim", frameWidth: 1.5, textSize: 3.2, height: 2, depth: 0.4, relief: { text: false, frame: true, icon: false }, reliefHeight: 0.4, colours: { base: black, front: white, frame: "team" } },
  },
  rapida: {
    id: "rapida", name: { es: "Exprés", en: "Express" },
    help: { es: "Negro con el nombre del color del grupo, sin líneas, plano y de 1,2 mm: dos filamentos, el más rápido.", en: "Black with the name in the group colour, no lines, flat and 1.2 mm thick: two filaments, the quickest." },
    spec: { frame: "none", textSize: 4, height: 1.2, depth: 0.4, colours: { base: black, front: "team", frame: "team" } },
  },
} satisfies Record<string, StyleDef>;

/** Card designs, by id. Exprés keeps the id of the old "Fast print" (rapida). */
export const CARD_DESIGNS = {
  pergamino: {
    id: "pergamino", name: { es: "Pergamino", en: "Parchment" },
    help: { es: "Blanca, la frase en negro y un marco ancho del color del grupo: se lee de lejos, y el color se ve igual.", en: "White, the phrase in black and a wide frame in the group colour: it reads from afar, and so does the colour." },
    spec: { frame: "rim", frameWidth: 2, height: 2, depth: 0.4, colours: { base: white, front: black, frame: "team" } },
  },
  placa: {
    id: "placa", name: { es: "Placa de color", en: "Colour plate" },
    help: { es: "La tarjeta entera del color del grupo, con la frase y una línea fina en negro: el grupo se ve de un vistazo.", en: "The whole card in the group colour, with the phrase and a fine line in black: the group shows at a glance." },
    spec: { frame: "rim", frameWidth: 0.6, height: 2, depth: 0.4, colours: { base: "team", front: black, frame: black } },
  },
  filete: {
    id: "filete", name: { es: "Filete de oro", en: "Gold trim" },
    help: { es: "Negra, la frase en blanco y un marco de oro, de grimorio: la misma sea cual sea el grupo.", en: "Black, the phrase in white and a gold frame, like a grimoire's: the same whatever the group." },
    spec: { frame: "rim", frameWidth: 1.2, height: 2, depth: 0.4, colours: { base: black, front: white, frame: gold } },
  },
  contraste: {
    id: "contraste", name: { es: "Contraste", en: "Contrast" },
    help: { es: "Negra, la frase en blanco y una línea fina del color del grupo: la frase, lo más legible; el grupo, en el marco.", en: "Black, the phrase in white and a fine line in the group colour: the phrase as legible as it gets, the group in the frame." },
    spec: { frame: "rim", frameWidth: 0.6, height: 2, depth: 0.4, colours: { base: black, front: white, frame: "team" } },
  },
  rapida: {
    id: "rapida", name: { es: "Exprés", en: "Express" },
    help: { es: "Negra con la frase del color del grupo, sin marco y de 1,2 mm: la más rápida.", en: "Black with the phrase in the group colour, no frame and 1.2 mm thick: the quickest." },
    spec: { frame: "none", height: 1.2, depth: 0.4, colours: { base: black, front: "team", frame: "team" } },
  },
  esquinas: {
    id: "esquinas", name: { es: "Esquineras", en: "Corners" },
    help: { es: "Negra, la frase del color del grupo y, en lugar de un marco entero, una escuadra en cada esquina: como las cartas antiguas.", en: "Black, the phrase in the group colour and, instead of a whole frame, a bracket at each corner: like old playing cards." },
    spec: { frame: "corners", frameWidth: 1.2, height: 2, depth: 0.4, colours: { base: black, front: "team", frame: "team" } },
  },
} satisfies Record<string, StyleDef>;

/** Designs in the order given (the first, a collection's default), each a copy. */
export const ringDesigns = (...ids: (keyof typeof RING_DESIGNS)[]): StyleDef[] => ids.map((id) => structuredClone(RING_DESIGNS[id]) as StyleDef);
export const cardDesigns = (...ids: (keyof typeof CARD_DESIGNS)[]): StyleDef[] => ids.map((id) => structuredClone(CARD_DESIGNS[id]) as StyleDef);
