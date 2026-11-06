// The app's own designs (Tesserae Faber's): the functional ones, offered in every collection beside
// its own (src/collection.ts appDesigns), per shape. Referred to as "a:<id>". Each keeps the id it
// had in the collections it came from (Clocktower's coins and the rings and cards every collection
// offered; Draw Steel's Parchment), so a "c:<id>" kept before, where the collection no longer has
// that id, is this design: it prints the same. tools/shape-design-protos/ shows the rings and cards.
// A collection whose default for a shape is one of these lists it first, the same (appTwin).
// "team" is the token's group colour. A ring's letters are as tall as its band allows (ringBand); a
// card prints flush, face-down.
import { FILAMENTS } from "./engine/token-engine.ts";
import type { StyleDef } from "./collection.ts";
import type { TokenShape } from "./types.ts";

const { black, white, gold, bronze } = FILAMENTS;

/** Coin designs, by id: Clocktower's functional ones (their specs, unchanged) and Draw Steel's Parchment. */
export const COIN_DESIGNS = {
  // the thinnest token that holds up: one layer of colour on 1 mm of black (opaque, stiff at 45 mm), no back
  rapida: {
    id: "rapida", name: { es: "Impresión rápida", en: "Fast print" },
    help: { es: "Negra y del color del grupo, sin reverso y lo más fina posible (1,2 mm): la más rápida.", en: "Black and the group colour, no back and as thin as it gets (1.2 mm): the quickest." },
    spec: { style: "classic", height: 1.2, frame: "rim", frameWidth: 0.8, back: "none", depth: 0.2, colours: { base: black, front: "team", frame: "team", back: gold } },
  },
  legible: {
    id: "legible", name: { es: "Alta legibilidad", en: "High legibility" },
    help: { es: "Blanca, una ventana plana con letras grandes del color del grupo, sin reverso: se lee desde el otro lado de la mesa.", en: "White, a flat window with big letters in the group colour, no back: it reads from across the table." },
    spec: { style: "window", textSize: 6, frame: "none", back: "none", depth: 0.4, colours: { base: white, front: "team", frame: "team", back: gold } },
  },
  marfil: {
    id: "marfil", name: { es: "Marfil", en: "Ivory" },
    help: { es: "Blanca, con el marco del color del grupo y el reverso grabado en bronce.", en: "White, with the frame in the group colour and an engraved bronze back." },
    spec: { style: "classic", frame: "rim", frameWidth: 1.0, back: "guilloche", depth: 0.4, colours: { base: white, front: "team", frame: "team", back: bronze } },
  },
  // raised letters: on white the group colour reads by its edge too, even a pale one
  pergamino: {
    id: "pergamino", name: { es: "Pergamino", en: "Parchment" },
    help: { es: "Blanca, con las letras en relieve del color del grupo y el nombre de la colección en negro al reverso.", en: "White, with raised letters in the group colour and the collection's name in black on the back." },
    spec: { style: "classic", frame: "rim", frameWidth: 1.0, back: "edition", depth: 0.4, relief: { text: true, frame: false, icon: false }, reliefHeight: 0.6, colours: { base: white, front: "team", frame: "team", back: black } },
  },
} satisfies Record<string, StyleDef>;

/** Ring designs, by id (the app's: Aro de color, Relieve alto, Filos marcados, Exprés). Exprés keeps the id of the old "Fast print" (rapida): what it was chosen for, the quickest. */
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

/** Card designs, by id (the app's). Exprés keeps the id of the old "Fast print" (rapida). */
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
    help: { es: "Negra, la frase en blanco y un marco de oro, como un libro antiguo: la misma sea cual sea el grupo.", en: "Black, the phrase in white and a gold frame, like an old book's: the same whatever the group." },
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

/** The app's designs, per shape, in the order they're offered. */
export const APP_DESIGNS: Record<TokenShape, StyleDef[]> = {
  coin: Object.values(COIN_DESIGNS).map((d) => structuredClone(d) as StyleDef),
  ring: ringDesigns("aro-color", "relieve-alto", "filos", "rapida"),
  card: cardDesigns("contraste", "placa", "pergamino", "filete", "esquinas", "rapida"),
};
/** A look as text that doesn't depend on the order its fields were written in. */
const specKey = (v: unknown): string => (v && typeof v === "object" && !Array.isArray(v)
  ? `{${Object.keys(v).sort().map((k) => `${k}:${specKey((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));
/**
 * The app's design a collection's style is: the app's of the same id with the same look. A
 * collection lists it as the app's (Clocktower's rings default to Colour ring, a copy kept with the
 * old lists has Fast print…); a reference to it ("c:<id>") is the app's ("a:<id>").
 */
export const appTwin = (shape: TokenShape, d: StyleDef): StyleDef | undefined =>
  APP_DESIGNS[shape].find((x) => x.id === d.id && specKey(x.spec) === specKey(d.spec));
