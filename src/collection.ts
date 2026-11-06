// Your own collection, for Tesserae Faber, the generic creator. The app shows it the way it shows
// Clocktower:
//   types     → the fixed entries at the top of the sidebar ("All characters", "Grimoire"); a
//               type also says the tokens' shape (coins, cards like the info tokens, or
//               condition rings that go round a miniature's base)
//   groups    → the colours, and the sheet's filters and order (Clocktower's teams)
//   tokens    → each of one type and one group, with its linked tokens (the reminders)
//   sections  → the sidebar's headings, closed (come with the collection: "Editions") or open
//               (yours to add to: "Scripts"), each with its catalogs (lists of tokens)
// Each token is a character to the rest of the app (team = group, reminders = linked tokens),
// so designing and printing are Clocktower's own. A whole collection goes in and out as one
// JSON file ("midnight-mint/collection", see CollectionFile). Kept in this browser.
import type { Hex, Role, Team, TokenIcon } from "./types.ts";
import { gameIcon } from "./icons.ts";
import { BUILT_INS } from "./builtins.ts";

/** Which app this page is: Clocktower (/botc, once Midnight Mint), or Tesserae Faber, the generic creator (the rest). */
export const MODE: "botc" | "own" = /^\/botc(\/|$)/.test(location.pathname) ? "botc" : "own";
export const OWN = MODE === "own";
/** Which page of the creator this is: its front page (/), the collections (/colecciones) or one collection (/c/<id>). */
export const OWN_VIEW: "home" | "list" | "collection" = /^\/c\/[\w-]+/.test(location.pathname) ? "collection" : /^\/colecciones\/?$/.test(location.pathname) ? "list" : "home";
/** The collection this page shows (/c/<id>); none on the front page or the list. */
export const OWN_ID: string | null = location.pathname.match(/^\/c\/([\w-]+)/)?.[1] ?? null;
export const LIST_URL = "/colecciones";
/** The last collection opened, for the front page's "carry on" link. */
const LAST_KEY = "midnight-mint-own-last";
export const lastCollection = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };
export const rememberCollection = (id: string) => { try { localStorage.setItem(LAST_KEY, id); } catch { /* storage unavailable */ } };
/** Where a collection opens. */
export const collectionUrl = (id: string) => `/c/${id}`;

/** A name: one text, or one per token language ("en", "es", "es-castelgard"…). */
export type Names = string | Record<string, string>;
export type TokenShape = "coin" | "card" | "ring";
export const SHAPES: TokenShape[] = ["coin", "card", "ring"];
export interface OwnType { id: string; name: Names; title: Names; shape: TokenShape; icon?: string }
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
/** Does it carry the Community Created Content mark? (Kept before it had its own field: on its loading screen.) */
export const hasCcc = (c: { ccc?: boolean; loader?: { ccc?: boolean } }) => !!(c.ccc || c.loader?.ccc);
/** A collection's colours: the app's surfaces, text and accent (see THEMES for ready ones). */
export interface OwnTheme { accent: Hex; background: Hex; surface: Hex; text: Hex; muted: Hex; glow?: Hex; font?: string }
/** What the collection says about itself, at the top of "About". */
export interface OwnAbout { text?: Names; credits?: Names; links?: { label: Names; url: string }[] }
/** Its mark: a logo (an image as a data: URI, an https address, or one of the app's own files) and a name to show beside it instead of the collection's. */
export interface OwnBrand { logo?: string; title?: Names }
/** A logo a collection may carry: an uploaded image, or one on the web. */
export const okLogo = (v: unknown): v is string => typeof v === "string" && (/^data:image\/(svg\+xml|png|webp|jpeg)[;,]/.test(v) || /^https:\/\//.test(v) || /^\/[\w./-]+\.(svg|png|webp)$/.test(v)) && v.length < 400000;
/** The app's own mark (Tesserae Faber), for collections without one: in full, small (around 32 px) and for the tab. */
export const APP_LOGO = "/tesserae-faber.svg", APP_LOGO_SMALL = "/tesserae-faber-small.svg", APP_ICON = "/tesserae-faber-icon.svg";
export const APP_NAME = "Tesserae Faber";
/** Its loading screen: the line it shows, and whether it carries the Community Created Content mark. */
export interface OwnLoader { text?: Names; footer?: Names; ccc?: boolean }
export interface Collection {
  name: Names;
  /** "botc" (Clocktower's velvet and brass), a ready theme's id (THEMES), or colours of its own. */
  theme?: string | OwnTheme;
  about?: OwnAbout;
  loader?: OwnLoader;
  /** It's Blood on the Clocktower content: About carries the Community Created Content mark. */
  ccc?: boolean;
  brand?: OwnBrand;
  /** The token languages its names come in, when more than one. */
  languages?: string[];
  types: OwnType[];
  groups: OwnGroup[];
  tokens: OwnToken[];
  sections: OwnSection[];
}

export const COLLECTION_FORMAT = "midnight-mint/collection";

/** Ready themes. "botc" is Clocktower's own, drawn by the stylesheet itself; "graphite" is the creator's default. */
export const THEMES: Record<string, OwnTheme | null> = {
  // the app's own: basalt and bone, ochre for the accent, a red glow (the logo's colours)
  faber: { accent: "#c9963a", background: "#1c1a18", surface: "#26221f", text: "#ece3d0", muted: "#b5aa94", glow: "#3a2420", font: "Marcellus" },
  graphite: { accent: "#4fd1c5", background: "#111317", surface: "#1b1f24", text: "#e8eaed", muted: "#98a1ab", glow: "#1d2a2c" },
  botc: null,
  forest: { accent: "#7bc47f", background: "#0f1511", surface: "#18211b", text: "#e6efe7", muted: "#97a89b", glow: "#1e2f22" },
  ocean: { accent: "#6aa7ff", background: "#0d1320", surface: "#151d2e", text: "#e6ecf7", muted: "#93a0b8", glow: "#1a2742" },
  ember: { accent: "#ff8a5c", background: "#160f0d", surface: "#211714", text: "#f3e9e4", muted: "#b29c93", glow: "#33201a" },
};
/** The fonts a theme can use for headings (the page loads these). */
export const THEME_FONTS = ["Marcellus", "Bricolage Grotesque", "Gloock", "Instrument Sans"];
const isHex = (v: unknown): v is Hex => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
/** A theme from a file: a known id, or colours that are all valid. */
export function readTheme(v: unknown): string | OwnTheme | undefined {
  if (typeof v === "string") return v in THEMES ? v : undefined;
  const o = v as Partial<OwnTheme> | null;
  if (!o || ![o.accent, o.background, o.surface, o.text, o.muted].every(isHex)) return undefined;
  return { accent: o.accent!, background: o.background!, surface: o.surface!, text: o.text!, muted: o.muted!, ...(isHex(o.glow) ? { glow: o.glow } : {}), ...(o.font && THEME_FONTS.includes(o.font) ? { font: o.font } : {}) };
}
// Each collection is kept on its own ("midnight-mint-own-<id>-collection"), with its own queue,
// style and designs beside it (main.ts's keys); the list of them, for the front page and /colecciones, apart.
const LIST_KEY = "midnight-mint-own-collections";
const keyOf = (id: string) => `midnight-mint-own-${id}-collection`;
/** A collection that comes with the app (src/builtins.ts): what it says about itself is code. */
export interface BuiltInEntry { id: string; file?: string; name: string; logo?: string; accent?: string; tokens: number; text?: Names;
  /** A picture of some of its tokens, for its cover; and what it holds, in a line. */
  preview?: string; facts?: Names;
  /** Where it opens when it has an app of its own (Clocktower: /botc, Midnight Mint), instead of /c/<id>. */
  href?: string;
  /** Its About, and whether it carries the Community Created Content mark. */
  about?: OwnAbout; ccc?: boolean;
  /** A licence's mark it carries, on its cover and in About, with the notice that goes with it ("Powered by Draw Steel"). */
  mark?: { src: string; alt: string; notice: Names; invert?: boolean };
  /** Its cover's background (CSS), when not Clocktower's velvet. */
  cover?: string;
  /** Its colours and loading line, known before its file is read (the loading screen wears them). */
  theme?: OwnTheme; loader?: OwnLoader }
/** Where a collection opens: its own app's address for one that has it, else /c/<id>. */
export const openUrl = (id: string, built: { id: string; href?: string }[]) => built.find((b) => b.id === id)?.href ?? collectionUrl(id);
export const builtInCollections = (): Promise<BuiltInEntry[]> => Promise.resolve(BUILT_INS);
/** One of them, by id. */
export const builtIn = (id: string) => BUILT_INS.find((b) => b.id === id);
/** A built-in collection, read from the app's own file each time: it isn't kept, and it can't be changed. */
export async function readBuiltIn(id: string): Promise<Collection | null> {
  const entry = builtIn(id);
  if (!entry?.file) return null;
  try { const res = await fetch(entry.file); return res.ok ? await readCollectionFile(await res.json()) : null; } catch { return null; }
}
/** A copy of a built-in collection, as one of yours to change: its new id. */
export async function copyBuiltIn(id: string, name: string): Promise<string | null> {
  const c = await readBuiltIn(id);
  // yours: every section open, so its tokens (and its catalogs) can be changed
  return c ? addCollection({ ...c, name, sections: c.sections.map((x) => ({ ...x, open: true })) }) : null;
}
/** A collection in the list: enough to show its card without reading it all. */
export interface CollectionEntry { id: string; name: string; logo?: string; accent?: string; tokens: number; updated: number }

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
export function listCollections(): CollectionEntry[] {
  migrateSingle();
  try { const l = JSON.parse(localStorage.getItem(LIST_KEY) as string); if (Array.isArray(l)) return l; } catch { /* none */ }
  return [];
}
function storeList(list: CollectionEntry[]) { try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } }

export function loadCollection(id = OWN_ID): Collection | null {
  if (!id) return null;
  migrateSingle();
  try {
    const c = JSON.parse(localStorage.getItem(keyOf(id)) as string);
    if (c && Array.isArray(c.groups) && Array.isArray(c.tokens) && c.tokens.length) return upgrade(c);
  } catch { /* storage unavailable or not ours */ }
  return null;
}
/** Keeps a collection, and its card in the list. Returns false when the browser's storage is full. */
export function storeCollection(c: Collection, id = OWN_ID): boolean {
  if (!id || builtIn(id)) return false;   // the app's own collections are read-only: make a copy to change one
  try { localStorage.setItem(keyOf(id), JSON.stringify(c)); } catch { return false; }
  const theme = typeof c.theme === "object" ? c.theme : THEMES[c.theme ?? "faber"];
  const entry: CollectionEntry = { id, name: nameIn(c.name, "es"), ...(c.brand?.logo ? { logo: c.brand.logo } : {}), accent: theme?.accent ?? "#c9a227", tokens: c.tokens.length, updated: Date.now() };
  storeList([entry, ...listCollections().filter((x) => x.id !== id)]);
  return true;
}
/** A new collection in the list (a fresh one, or one read from a file); returns its id. */
export function addCollection(c: Collection): string | null {
  const id = newId("c");
  return storeCollection(c, id) ? id : null;
}
/** Takes a collection out, with its queue, style and designs. */
export function deleteCollection(id: string) {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(`midnight-mint-own-${id}-`)) localStorage.removeItem(k); } catch { /* none */ }
  storeList(listCollections().filter((x) => x.id !== id));
}
/** The creator kept one collection before it kept several: that one becomes the first of the list. */
function migrateSingle() {
  try {
    const old = localStorage.getItem("midnight-mint-own-collection");
    if (!old || localStorage.getItem(LIST_KEY)) return;
    const id = "c1";
    localStorage.setItem(keyOf(id), old);
    for (const k of ["picks", "style", "overrides", "designs", "view"]) {
      const v = localStorage.getItem(`midnight-mint-own-${k}`);
      if (v != null) localStorage.setItem(`midnight-mint-own-${id}-${k}`, v);
      localStorage.removeItem(`midnight-mint-own-${k}`);
    }
    localStorage.removeItem("midnight-mint-own-collection");
    const c = JSON.parse(old);
    localStorage.setItem(LIST_KEY, JSON.stringify([{ id, name: nameIn(c.name, "es"), tokens: c.tokens?.length ?? 0, updated: Date.now() }]));
  } catch { /* storage unavailable */ }
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
    ...(type?.shape === "card" ? { kind: "info" as const } : type?.shape === "ring" ? { kind: "ring" as const } : {}),
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
  const types: OwnType[] = (f.types ?? []).filter((x) => x?.id).map((x) => ({ id: String(x.id), name: okName(x.name) ? x.name : String(x.id), title: okName(x.title) ? x.title : okName(x.name) ? x.name : String(x.id), shape: SHAPES.includes(x.shape) ? x.shape : "coin", ...(x.icon ? { icon: String(x.icon) } : {}) }));
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
    name: okName(f.name) ? f.name : "Mi colección",
    ...(f.ccc || f.loader?.ccc ? { ccc: true } : {}),
    ...(readTheme(f.theme) ? { theme: readTheme(f.theme) } : {}),
    ...(f.about && typeof f.about === "object" ? { about: {
      ...(okName(f.about.text) ? { text: f.about.text } : {}), ...(okName(f.about.credits) ? { credits: f.about.credits } : {}),
      ...(Array.isArray(f.about.links) ? { links: f.about.links.filter((l) => l && okName(l.label) && /^https?:\/\//.test(String(l.url))).map((l) => ({ label: l.label, url: String(l.url) })) } : {}),
    } } : {}),
    ...(f.brand && typeof f.brand === "object" ? { brand: { ...(okLogo(f.brand.logo) ? { logo: f.brand.logo } : {}), ...(okName(f.brand.title) ? { title: f.brand.title } : {}) } } : {}),
    ...(f.loader && typeof f.loader === "object" ? { loader: { ...(okName(f.loader.text) ? { text: f.loader.text } : {}), ...(okName(f.loader.footer) ? { footer: f.loader.footer } : {}), ...(f.loader.ccc ? { ccc: true } : {}) } } : {}),
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
