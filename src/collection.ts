// Your own collection, for the generic creator at /crear: tokens you make yourself, in colour
// groups, with linked tokens (the generic reminders) and catalogs to sort them into. The app
// shows it the way it shows Clocktower: each token is a character (team = its group), each
// linked token a reminder, each catalog an edition. Kept in this browser; a whole collection
// goes in and out as one JSON file ("midnight-mint/collection", see COLLECTION_FORMAT).
import type { Hex, Role, Team, TokenIcon } from "./types.ts";
import { gameIcon } from "./icons.ts";

/** Which app this page is: Clocktower ("/"), or the generic creator ("/crear"). */
export const MODE: "botc" | "own" = /^\/crear(\/|$)/.test(location.pathname) ? "own" : "botc";
export const OWN = MODE === "own";

export interface OwnGroup { id: string; name: string; colour: Hex }
export interface OwnToken {
  id: string;
  name: string;
  group: string;
  /** Its icon, ready to draw ({id, g, body}): a game-icons.net icon (id "author/name") or an uploaded SVG. */
  icon: TokenIcon | null;
  /** Linked tokens' words: they come and go with it, like a character's reminders. */
  linked: string[];
}
export interface OwnCatalog { id: string; name: string; tokens: string[] }
export interface Collection { name: string; groups: OwnGroup[]; tokens: OwnToken[]; catalogs: OwnCatalog[] }

export const COLLECTION_FORMAT = "midnight-mint/collection";
const KEY = "midnight-mint-own-collection";

/** The colours a new group takes in turn: the team colours, which the print export knows. */
export const GROUP_COLOURS: Hex[] = ["#2f86e0", "#b3191e", "#8a3d9e", "#d4a72c", "#3f9651", "#c9a227", "#a7adb4", "#9a6a3a", "#ece9e2"];
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A first collection: two groups and an empty catalog, so there's somewhere to start. */
export const starterCollection = (): Collection => ({
  name: "Mi colección",
  groups: [{ id: "g1", name: "Grupo 1", colour: GROUP_COLOURS[0] }, { id: "g2", name: "Grupo 2", colour: GROUP_COLOURS[1] }],
  // one token to start from: the app always has something to show and design
  tokens: [{ id: "t1", name: "Mi primera ficha", group: "g1", icon: null, linked: [] }],
  catalogs: [{ id: "k1", name: "Mi primer catálogo", tokens: ["t1"] }],
});

export function loadCollection(): Collection {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) as string) as Collection | null;
    if (c && Array.isArray(c.groups) && Array.isArray(c.tokens) && Array.isArray(c.catalogs)) return c;
  } catch { /* storage unavailable or not ours */ }
  return starterCollection();
}
export function storeCollection(c: Collection) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable or full */ }
}

/** The app's character for a token of ours: its group is its team; its linked tokens, its reminders. */
export function tokenRole(c: Collection, t: OwnToken): Role {
  return {
    id: t.id, en: t.name, es: t.name, names: {}, fem: {},
    team: t.group as Team,   // a group of the collection, registered as a team by registerGroups
    edition: "own", editionName: c.name,
    reminders: { en: t.linked, es: t.linked },
    body: t.icon?.body ?? "", d: [], g: t.icon?.g ?? "",
    // credited like the library's icons, when it's from game-icons.net
    ...(t.icon?.source === "game-icons" ? { icon: t.icon.name, author: t.icon.author } : {}),
    // the engine caches shapes by this: a new icon for the same token gets drawn afresh
    iconKey: `${t.id}:${t.icon?.id ?? "none"}`,
  };
}
export const collectionRoles = (c: Collection) => c.tokens.map((t) => tokenRole(c, t));

// ------------------------------------------------------------ the JSON file

/** A name in a file: a text, or one per language. */
type Text = string | Record<string, string>;
const text = (v: unknown, lang = "es"): string => (typeof v === "string" ? v : v && typeof v === "object" ? (v as Record<string, string>)[lang] ?? (v as Record<string, string>).en ?? Object.values(v as Record<string, string>)[0] ?? "" : "");
interface FileToken { id: string; name: Text; group?: string; icon?: string | { svg: string }; linked?: { name: Text }[] | string[] }
interface FileCatalog { id: string; name: Text; all?: boolean; tokens?: string[] }
interface CollectionFile { format: string; version: number; name: Text; groups: { id: string; name: Text; colour: Hex }[]; tokens: FileToken[]; sections: { title?: Text; editable?: boolean; catalogs: FileCatalog[] }[] }

const isGameIcon = (s: string) => /^[\w-]+\/[\w-]+$/.test(s);
const svgOf = (icon: TokenIcon) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${icon.g}">${icon.body}</g></svg>`;

/** The collection as a file: game-icons.net icons by name, the rest as SVG. */
export function collectionFile(c: Collection): CollectionFile {
  return {
    format: COLLECTION_FORMAT, version: 1, name: c.name,
    groups: c.groups.map((g) => ({ id: g.id, name: g.name, colour: g.colour })),
    tokens: c.tokens.map((t) => ({
      id: t.id, name: t.name, group: t.group,
      ...(t.icon ? { icon: t.icon.source === "game-icons" && isGameIcon(t.icon.id) ? t.icon.id : { svg: svgOf(t.icon) } } : {}),
      linked: t.linked.map((name) => ({ name })),
    })),
    sections: [
      { catalogs: [{ id: "all", name: "Todas las fichas", all: true }] },
      { title: "Catálogos", editable: true, catalogs: c.catalogs.map((k) => ({ id: k.id, name: k.name, tokens: k.tokens })) },
    ],
  };
}

/**
 * A collection from a file. Its icons are fetched (game-icons.net) or read (SVG) now, so the
 * collection draws without the network afterwards. Throws "not-collection" for other JSON.
 */
export async function readCollectionFile(data: unknown, onProgress: (done: number, total: number) => void = () => {}): Promise<Collection> {
  const f = data as Partial<CollectionFile> | null;
  if (!f || f.format !== COLLECTION_FORMAT || !Array.isArray(f.tokens) || !Array.isArray(f.groups)) throw new Error("not-collection");
  const groups: OwnGroup[] = f.groups.filter((g) => g && g.id).map((g, i) => ({ id: String(g.id), name: text(g.name) || `Grupo ${i + 1}`, colour: /^#[0-9a-f]{6}$/i.test(g.colour) ? g.colour : GROUP_COLOURS[i % GROUP_COLOURS.length] }));
  if (!groups.length) groups.push({ id: "g1", name: "Grupo 1", colour: GROUP_COLOURS[0] });
  const known = new Set(groups.map((g) => g.id));
  let done = 0;
  const tokens: OwnToken[] = [];
  for (const t of f.tokens) {
    if (!t || !t.id) continue;
    let icon: TokenIcon | null = null;
    try {
      if (typeof t.icon === "string" && isGameIcon(t.icon)) icon = { ...(await gameIcon(t.icon)), id: t.icon };
      else if (t.icon && typeof t.icon === "object" && typeof t.icon.svg === "string") {
        const m = t.icon.svg.match(/<g transform="([^"]*)">([\s\S]*)<\/g>\s*<\/svg>\s*$/);
        if (m) icon = { id: `svg:${t.id}`, source: "upload", g: m[1], body: m[2] };
      }
    } catch { /* an icon that won't load: the token stays, without it */ }
    tokens.push({
      id: String(t.id), name: text(t.name) || String(t.id), group: known.has(String(t.group)) ? String(t.group) : groups[0].id, icon,
      linked: (t.linked ?? []).map((l) => (typeof l === "string" ? l : text(l?.name))).filter(Boolean),
    });
    onProgress(++done, f.tokens.length);
  }
  const ids = new Set(tokens.map((t) => t.id));
  const catalogs: OwnCatalog[] = (f.sections ?? []).flatMap((s) => s.catalogs ?? []).filter((k) => k && !k.all)
    .map((k) => ({ id: String(k.id), name: text(k.name) || "Catálogo", tokens: (k.tokens ?? []).map(String).filter((id) => ids.has(id)) }));
  return { name: text(f.name) || "Mi colección", groups, tokens, catalogs: catalogs.length ? catalogs : [{ id: "k1", name: "Catálogo", tokens: [] }] };
}
