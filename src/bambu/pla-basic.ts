// Bambu Lab's PLA Basic, its solid colours: their codes, colours and names, as Bambu Studio has them
// (resources/profiles/BBL/filament/filaments_color_codes.json, "fila_type": "PLA Basic"), in order of
// hue, the greys last. Offered for a category's colour and a token's own after the app's filaments
// (FILAMENT_SLOTS, what the Bambu project prints as they are); one of these prints in the nearest of those.
import type { Hex } from "../types.ts";

export interface BambuColour { code: string; hex: Hex; name: { en: string; es: string } }
export const PLA_BASIC: BambuColour[] = [
  { code: "10200", hex: "#c12e1f", name: { en: "Red", es: "Rojo" } },
  { code: "10800", hex: "#9d432c", name: { en: "Brown", es: "Marrón" } },
  { code: "10201", hex: "#f7e6de", name: { en: "Beige", es: "Beis" } },
  { code: "10300", hex: "#ff6a13", name: { en: "Orange", es: "Naranja" } },
  { code: "10802", hex: "#6f5034", name: { en: "Cocoa Brown", es: "Marrón cacao" } },
  { code: "10301", hex: "#ff9016", name: { en: "Pumpkin Orange", es: "Naranja calabaza" } },
  { code: "10401", hex: "#e4bd68", name: { en: "Gold", es: "Dorado" } },
  { code: "10402", hex: "#fec600", name: { en: "Sunflower Yellow", es: "Amarillo girasol" } },
  { code: "10801", hex: "#847d48", name: { en: "Bronze", es: "Bronce" } },
  { code: "10400", hex: "#f4ee2a", name: { en: "Yellow", es: "Amarillo" } },
  { code: "10503", hex: "#becf00", name: { en: "Bright Green", es: "Verde brillante" } },
  { code: "10502", hex: "#3f8e43", name: { en: "Mistletoe Green", es: "Verde muérdago" } },
  { code: "10501", hex: "#00ae42", name: { en: "Bambu Green", es: "Verde bambú" } },
  { code: "10605", hex: "#00b1b7", name: { en: "Turquoise", es: "Turquesa" } },
  { code: "10603", hex: "#0086d6", name: { en: "Cyan", es: "Cian" } },
  { code: "10604", hex: "#0056b8", name: { en: "Cobalt Blue", es: "Azul cobalto" } },
  { code: "10601", hex: "#0a2989", name: { en: "Blue", es: "Azul" } },
  { code: "10700", hex: "#5e43b7", name: { en: "Purple", es: "Púrpura" } },
  { code: "10701", hex: "#482960", name: { en: "Indigo Purple", es: "Púrpura índigo" } },
  { code: "10202", hex: "#ec008c", name: { en: "Magenta", es: "Magenta" } },
  { code: "10204", hex: "#f5547c", name: { en: "Hot Pink", es: "Rosa fucsia" } },
  { code: "10203", hex: "#f55a74", name: { en: "Pink", es: "Rosa" } },
  { code: "10205", hex: "#9d2235", name: { en: "Maroon Red", es: "Rojo granate" } },
  { code: "10100", hex: "#ffffff", name: { en: "Jade White", es: "Blanco jade" } },
  { code: "10104", hex: "#d1d3d5", name: { en: "Light Gray", es: "Gris claro" } },
  { code: "10102", hex: "#a6a9aa", name: { en: "Silver", es: "Plateado" } },
  { code: "10103", hex: "#8e9089", name: { en: "Gray", es: "Gris" } },
  { code: "10602", hex: "#5b6579", name: { en: "Blue Gray", es: "Gris azulado" } },
  { code: "10105", hex: "#545454", name: { en: "Dark Gray", es: "Gris oscuro" } },
  { code: "10101", hex: "#000000", name: { en: "Black", es: "Negro" } },
];
