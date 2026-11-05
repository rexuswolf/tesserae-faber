// Your own collection, for the generic creator at /crear. The app shows it the way it shows
// Clocktower:
//   types     → the fixed entries at the top of the sidebar ("All characters", "Grimoire"); a
//               type also says the tokens' shape (coins, or cards like the info tokens)
//   groups    → the colours, and the sheet's filters and order (Clocktower's teams)
//   tokens    → each of one type and one group, with its linked tokens (the reminders)
//   sections  → the sidebar's headings, closed (come with the collection: "Editions") or open
//               (yours to add to: "Scripts"), each with its catalogs (lists of tokens)
// Each token is a character to the rest of the app (team = group, reminders = linked tokens),
// so designing and printing are Clocktower's own. A whole collection goes in and out as one
// JSON file ("midnight-mint/collection", see CollectionFile). Kept in this browser.
import type { Hex, Role, Team, TokenIcon } from "./types.ts";
import { gameIcon } from "./icons.ts";

/** Which app this page is: Clocktower ("/"), or the generic creator ("/crear"). */
export const MODE: "botc" | "own" = /^\/crear(\/|$)/.test(location.pathname) ? "own" : "botc";
export const OWN = MODE === "own";

/** A name: one text, or one per token language ("en", "es", "es-castelgard"…). */
export type Names = string | Record<string, string>;
export interface OwnType { id: string; name: Names; title: Names; shape: "coin" | "card"; icon?: string }
export interface OwnGroup { id: string; name: Names; colour: Hex; icon?: string }
export interface OwnToken {
  id: string;
  type: string;
  group: string;
  name: Names;
  /** Feminine names, by language, where a language has them. */
  fem?: Record<string, string>;
  /** Its icon, ready to draw ({id, g, body}): a game-icons.net icon (id "author/name"), an uploaded or imported SVG. */
  icon: TokenIcon | null;
  /** Linked tokens' words: they come and go with it, like a character's reminders. */
  linked: Names[];
  /** It came with the collection and can't be changed (like Clocktower's info tokens). */
  fixed?: boolean;
}
export interface OwnCatalog { id: string; name: Names; tokens: string[] }
export interface OwnSection { id: string; title: Names; open: boolean; catalogs: OwnCatalog[] }
export interface Collection {
  name: Names;
  /** "botc": Clocktower's own look (velvet and brass), for its collection. */
  theme?: string;
  /** The token languages its names come in, when more than one. */
  languages?: string[];
  types: OwnType[];
  groups: OwnGroup[];
  tokens: OwnToken[];
  sections: OwnSection[];
}

export const COLLECTION_FORMAT = "midnight-mint/collection";
const KEY = "midnight-mint-own-collection";

/** The colours a new group takes in turn: the team colours, which the print export knows. */
export const GROUP_COLOURS: Hex[] = ["#2f86e0", "#b3191e", "#8a3d9e", "#d4a72c", "#3f9651", "#c9a227", "#a7adb4", "#9a6a3a", "#ece9e2"];
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A name in a language: its own, else English, else the first it has. */
export const nameIn = (n: Names | undefined, lang: string): string =>
  n == null ? "" : typeof n === "string" ? n : n[lang] ?? (lang.startsWith("es-") ? n.es : undefined) ?? n.en ?? Object.values(n)[0] ?? "";
/** A name with one language changed (a plain text stays plain). */
export const withName = (n: Names, lang: string, v: string): Names => (typeof n === "string" ? v : { ...n, [lang]: v });

/** A first collection: one type, two groups, an open section with one catalog and one token. */
export const starterCollection = (): Collection => ({
  name: "Mi colección",
  types: [{ id: "fichas", name: "Fichas", title: "Todas las fichas", shape: "coin", icon: "two-coins" }],
  groups: [{ id: "g1", name: "Grupo 1", colour: GROUP_COLOURS[0] }, { id: "g2", name: "Grupo 2", colour: GROUP_COLOURS[1] }],
  // one token to start from: the app always has something to show and design
  tokens: [{ id: "t1", type: "fichas", group: "g1", name: "Mi primera ficha", icon: null, linked: [] }],
  sections: [{ id: "s1", title: "Catálogos", open: true, catalogs: [{ id: "k1", name: "Mi primer catálogo", tokens: ["t1"] }] }],
});

/** A collection kept before types and sections: its catalogs become one open section. */
function upgrade(c: Collection & { catalogs?: OwnCatalog[] }): Collection {
  if (!c.types?.length) {
    c.types = starterCollection().types;
    for (const t of c.tokens) t.type ??= c.types[0].id;
  }
  if (!c.sections) { c.sections = [{ id: "s1", title: "Catálogos", open: true, catalogs: c.catalogs ?? [] }]; delete c.catalogs; }
  return c;
}
export function loadCollection(): Collection {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) as string);
    if (c && Array.isArray(c.groups) && Array.isArray(c.tokens) && c.tokens.length) return upgrade(c);
  } catch { /* storage unavailable or not ours */ }
  return starterCollection();
}
export function storeCollection(c: Collection) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable or full */ }
}

/** Every catalog, with its section. */
export const catalogsOf = (c: Collection) => c.sections.flatMap((s) => s.catalogs.map((k) => ({ k, s })));
/** A token in a closed section's catalog came with the collection: it can't be changed. */
export const isLocked = (c: Collection, id: string) => !!c.tokens.find((t) => t.id === id)?.fixed || c.sections.some((s) => !s.open && s.catalogs.some((k) => k.tokens.includes(id)));

/** The app's character for a token of ours: its group is its team; its linked tokens, its reminders. */
export function tokenRole(c: Collection, t: OwnToken, lang = "es"): Role {
  const names = typeof t.name === "string" ? { en: t.name, es: t.name } : t.name;
  const langs = new Set(["en", "es", ...Object.keys(names), ...t.linked.flatMap((l) => (typeof l === "string" ? [] : Object.keys(l)))]);
  const type = c.types.find((x) => x.id === t.type);
  // the Edition back: the first closed catalog it's in ("Trouble Brewing"), else the collection's name
  const home = c.sections.find((s) => !s.open && s.catalogs.some((k) => k.tokens.includes(t.id)))?.catalogs.find((k) => k.tokens.includes(t.id));
  return {
    id: t.id, en: nameIn(names, "en"), es: nameIn(names, "es"), names: Object.fromEntries([...langs].map((l) => [l, nameIn(names, l)])), fem: t.fem ?? {},
    team: t.group as Team,   // a group of the collection, registered as a team (main.ts, applyGroups)
    edition: "own", editionName: nameIn(home?.name ?? c.name, lang),
    reminders: Object.fromEntries([...langs].map((l) => [l, t.linked.map((n) => nameIn(n, l))])),
    body: t.icon?.body ?? "", d: [], g: t.icon?.g ?? "",
    ...(type?.shape === "card" ? { kind: "info" as const } : {}),
    // credited like the library's icons, when it's from game-icons.net
    ...(t.icon?.source === "game-icons" ? { icon: t.icon.name, author: t.icon.author } : {}),
    // the engine caches shapes by this: a new icon for the same token gets drawn afresh
    iconKey: `${t.id}:${t.icon?.id ?? "none"}`,
  };
}
export const collectionRoles = (c: Collection, lang?: string) => c.tokens.map((t) => tokenRole(c, t, lang));

// ------------------------------------------------------------ the JSON file

interface FileToken extends Omit<OwnToken, "icon" | "linked"> { icon?: string | { svg: string }; iconCredit?: { name?: string; author?: string }; linked?: ({ name: Names } | string)[] }
export interface CollectionFile extends Omit<Collection, "tokens"> { format: string; version: number; tokens: FileToken[] }

const isGameIcon = (s: string) => /^[\w-]+\/[\w-]+$/.test(s);
const svgOf = (icon: TokenIcon) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${icon.g}">${icon.body}</g></svg>`;

/** The collection as a file: game-icons.net icons by name, the rest as SVG. */
export function collectionFile(c: Collection): CollectionFile {
  return {
    format: COLLECTION_FORMAT, version: 1, ...c,
    tokens: c.tokens.map(({ icon, linked, ...t }) => ({
      ...t,
      ...(icon ? { icon: icon.source === "game-icons" && isGameIcon(icon.id) ? icon.id : { svg: svgOf(icon) } } : {}),
      // an icon kept as SVG still says where it's from, for the credits
      ...(icon?.author && !isGameIcon(icon.id) ? { iconCredit: { name: icon.name, author: icon.author } } : {}),
      linked: linked.map((name) => ({ name })),
    })),
  };
}

const okName = (n: unknown): n is Names => typeof n === "string" || (!!n && typeof n === "object" && Object.values(n).every((v) => typeof v === "string"));
/**
 * A collection from a file. Its icons are fetched (game-icons.net) or read (SVG) now, so the
 * collection draws without the network afterwards. Throws "not-collection" for other JSON.
 */
export async function readCollectionFile(data: unknown, onProgress: (done: number, total: number) => void = () => {}): Promise<Collection> {
  const f = data as Partial<CollectionFile> | null;
  if (!f || f.format !== COLLECTION_FORMAT || !Array.isArray(f.tokens) || !Array.isArray(f.groups)) throw new Error("not-collection");
  const types: OwnType[] = (f.types ?? []).filter((x) => x?.id).map((x) => ({ id: String(x.id), name: okName(x.name) ? x.name : String(x.id), title: okName(x.title) ? x.title : okName(x.name) ? x.name : String(x.id), shape: x.shape === "card" ? "card" : "coin", ...(x.icon ? { icon: String(x.icon) } : {}) }));
  if (!types.length) types.push(...starterCollection().types);
  const groups: OwnGroup[] = f.groups.filter((g) => g?.id).map((g, i) => ({ id: String(g.id), name: okName(g.name) ? g.name : `Grupo ${i + 1}`, colour: /^#[0-9a-f]{6}$/i.test(g.colour) ? g.colour : GROUP_COLOURS[i % GROUP_COLOURS.length], ...(g.icon ? { icon: String(g.icon) } : {}) }));
  if (!groups.length) groups.push({ id: "g1", name: "Grupo 1", colour: GROUP_COLOURS[0] });
  const knownGroup = new Set(groups.map((g) => g.id)), knownType = new Set(types.map((x) => x.id));
  let done = 0;
  const tokens: OwnToken[] = [];
  for (const t of f.tokens) {
    if (!t?.id || !okName(t.name)) continue;
    let icon: TokenIcon | null = null;
    try {
      if (typeof t.icon === "string" && isGameIcon(t.icon)) icon = { ...(await gameIcon(t.icon)), id: t.icon };
      else if (t.icon && typeof t.icon === "object" && typeof t.icon.svg === "string") {
        const m = t.icon.svg.match(/<g transform="([^"]*)">([\s\S]*)<\/g>\s*<\/svg>\s*$/);
        const credit = t.iconCredit;
        if (m) icon = { id: `svg:${t.id}`, source: credit?.author ? "game-icons" : "upload", g: m[1], body: m[2], ...(credit ?? {}) };
      }
    } catch { /* an icon that won't load: the token stays, without it */ }
    tokens.push({
      id: String(t.id), type: knownType.has(String(t.type)) ? String(t.type) : types[0].id, group: knownGroup.has(String(t.group)) ? String(t.group) : groups[0].id,
      name: t.name, ...(t.fem && typeof t.fem === "object" ? { fem: t.fem } : {}), ...(t.fixed ? { fixed: true } : {}), icon,
      linked: (t.linked ?? []).map((l) => (typeof l === "string" ? l : l?.name)).filter(okName),
    });
    if (++done % 20 === 0 || done === f.tokens.length) onProgress(done, f.tokens.length);
  }
  const ids = new Set(tokens.map((t) => t.id));
  const sections: OwnSection[] = (f.sections ?? []).filter(Boolean).map((s, i) => ({
    id: String(s.id ?? `s${i + 1}`), title: okName(s.title) ? s.title : "Catálogos", open: !!s.open,
    catalogs: (s.catalogs ?? []).filter((k) => k?.id).map((k) => ({ id: String(k.id), name: okName(k.name) ? k.name : "Catálogo", tokens: (k.tokens ?? []).map(String).filter((id) => ids.has(id)) })),
  }));
  if (!sections.some((s) => s.open)) sections.push({ id: "mine", title: "Catálogos", open: true, catalogs: [] });
  return {
    name: okName(f.name) ? f.name : "Mi colección", ...(f.theme ? { theme: String(f.theme) } : {}),
    ...(Array.isArray(f.languages) ? { languages: f.languages.map(String) } : {}),
    types, groups, tokens, sections,
  };
}

/**
 * A list of tokens to make a catalog of: a JSON list of ids (a Clocktower Script Tool script:
 * strings, or objects with an "id", its "_meta" entry naming it), or names one per line.
 * Matched against the tokens' ids and names in any language, ignoring case and accents.
 */
export function readTokenList(c: Collection, text: string): { name: string | null; ids: string[]; missing: string[] } {
  const key = (s: unknown) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");
  const index = new Map<string, string>();
  for (const t of c.tokens) {
    index.set(key(t.id), t.id);
    for (const n of typeof t.name === "string" ? [t.name] : Object.values(t.name)) index.set(key(n), t.id);
  }
  let entries: string[] = [], name: string | null = null;
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("not a list");
    for (const e of data) {
      if (e && typeof e === "object" && (e as { id?: string }).id === "_meta") { name = String((e as { name?: string }).name ?? "") || null; continue; }
      entries.push(typeof e === "string" ? e : String((e as { id?: string; name?: string })?.id ?? (e as { name?: string })?.name ?? ""));
    }
  } catch { entries = text.split("\n").map((l) => l.trim()).filter(Boolean); }
  const ids: string[] = [], missing: string[] = [];
  for (const e of entries) { const id = index.get(key(e)); if (id) { if (!ids.includes(id)) ids.push(id); } else if (e) missing.push(e); }
  return { name, ids, missing };
}
