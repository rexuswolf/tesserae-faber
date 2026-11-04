// The grimoire's info tokens: the phrases the Storyteller shows a player, printed as cards
// (see CARD in engine/token-engine.js). English is the game's wording; the Spanish is ours,
// in the app's terms. Token languages without their own text use English.
import { TRANSLATIONS } from "./translations.js";

export const INFO_TOKENS = [
  { id: "isdemon", en: "This is the Demon", es: "Este es el Demonio" },
  { id: "isminion", en: "These are your Minions", es: "Estos son tus Esbirros" },
  { id: "notinplay", en: "These characters are not in play", es: "Estos personajes no están en juego" },
  { id: "youare", en: "You are", es: "Tú eres" },
  { id: "playeris", en: "This player is", es: "Este jugador es" },
  { id: "selectedyou", en: "This character selected you", es: "Este personaje te ha elegido" },
  { id: "useability", en: "Use your ability?", es: "¿Usas tu habilidad?" },
  { id: "makechoice", en: "Make a choice", es: "Haz tu elección" },
  { id: "nominatetoday", en: "Did you nominate today?", es: "¿Has nominado hoy?" },
  { id: "votetoday", en: "Did you vote today?", es: "¿Has votado hoy?" },
];

/** The info tokens as roles of their own edition ("grimoire") and team ("info"). */
export function infoRoles() {
  const spanish = TRANSLATIONS.filter((x) => x.lang === "es").map((x) => x.id);
  return INFO_TOKENS.map((it) => ({
    id: `info_${it.id}`, kind: "info", team: "info", edition: "grimoire",
    en: it.en, es: it.es, names: Object.fromEntries(spanish.map((id) => [id, it.es])), reminders: {},
  }));
}
