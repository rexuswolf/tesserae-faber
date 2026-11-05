/**
 * Scripts: your own groups of characters, kept in this browser and shared as links.
 *
 * A script is { id, name, ids, labels, added }:
 *   ids     the characters, as Script Tool ids ("washerwoman", "fortuneteller"), in order.
 *           Ids the library doesn't know (homebrew) are kept, so nothing is lost.
 *   labels  names for those ids when the imported JSON gave them ({ id: "Name" }).
 *   custom  true when the imported JSON gave official characters names or icons of their own.
 *   homebrew  the characters the script defines itself: [{ id, name, team, ability, reminders,
 *           def (the entry as it came), icon? (traced or loaded from its "image"), noIcon? }].
 *
 * A link carries the script in its fragment, which never reaches the server:
 *   https://midnight-mint.web.app/#s=Mi%20pueblo~washerwoman.librarian.imp
 * The name, "~", then the ids joined by ".". Each part is percent-encoded, with "~" and "."
 * escaped too, so a name or id can hold any character.
 */
const KEY = "midnight-mint-scripts";

/** A Script Tool id from an id or a name: lower case, no accents, letters and digits only. */
export const idKey = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");

export function loadScripts() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.filter((s) => s && typeof s.id === "string" && Array.isArray(s.ids)) : [];
  } catch { return []; }
}
export function storeScripts(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

/** Adds a script, or returns the one already saved with the same name and characters. */
export function saveScript(list, { name, ids, labels = {}, custom, homebrew }) {
  const same = list.find((s) => s.name === name && s.ids.join() === ids.join());
  if (same) return { list, script: same };
  const script = { id: crypto.randomUUID().slice(0, 8), name, ids, labels, ...(custom === undefined ? {} : { custom }), ...(homebrew?.length ? { homebrew } : {}), added: Date.now() };
  return { list: [...list, script], script };
}

const enc = (s) => encodeURIComponent(s).replace(/[~.!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export const scriptLink = (script, base) => `${base}#s=${enc(script.name)}~${script.ids.map(enc).join(".")}`;

/** Reads a link's fragment ("#s=…"); null when it isn't a script. */
export function readLink(hash) {
  const m = /^#s=([^~]*)~(.+)$/.exec(hash || "");
  if (!m) return null;
  try {
    const ids = [...new Set(m[2].split(".").filter(Boolean).map((x) => idKey(decodeURIComponent(x))))].filter(Boolean);
    return ids.length ? { name: decodeURIComponent(m[1]), ids } : null;
  } catch { return null; }
}

/** The script in the Script Tool's JSON format, to download or import elsewhere. */
export const scriptJson = (script) => JSON.stringify([{ id: "_meta", name: script.name }, ...script.ids], null, 2);
