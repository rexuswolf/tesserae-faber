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
import { local, readJSON, writeJSON } from "./services.ts";
import type { CardBack, CardIcon, CardJoin, Hex, PatternSpec, Role, SpecInput, Team, TokenIcon, TokenShape } from "./types.ts";
import { gameIcon } from "./icons.ts";
import { safeIconMarkup, safeTransform } from "./engine/safe-svg.ts";
import { DEFAULT_SPEC, FILAMENTS, PATTERNS, CARD_ICONS, CARD_JOINS, CARD_ICON_MM } from "./engine/token-engine.ts";
import { BUILT_INS } from "./builtins.ts";
import { ringDesigns, cardDesigns, baseDesigns, APP_DESIGNS, appTwin } from "./shape-designs.ts";

/** Which app this page is: Clocktower (/botc, once Midnight Mint), or Tesserae Faber, the generic creator (the rest). */
export const MODE: "botc" | "own" = /^\/botc(\/|$)/.test(location.pathname) ? "botc" : "own";
export const OWN = MODE === "own";
/**
 * Which page of the creator this is: its front page (/), the collections (/colecciones), one
 * collection (/c/<id>), or the Taller (/taller), where the designs are made for every collection.
 */
export const OWN_VIEW: "home" | "list" | "collection" | "taller" = /^\/c\/[\w-]+/.test(location.pathname) ? "collection" : /^\/colecciones\/?$/.test(location.pathname) ? "list" : /^\/taller\/?$/.test(location.pathname) ? "taller" : "home";
/** The collection this page shows (/c/<id>); none on the front page or the list. */
export const OWN_ID: string | null = location.pathname.match(/^\/c\/([\w-]+)/)?.[1] ?? null;
export const LIST_URL = "/colecciones";
/** The Taller: your designs and the collections', by shape. It says where it was opened from (?from=/c/<id>, /botc), to go back there. */
export const TALLER_URL = "/taller";
export const tallerUrl = (from = location.pathname, extra: Record<string, string> = {}) => `${TALLER_URL}?${new URLSearchParams({ from, ...extra })}`;
/** The last collection opened, for the front page's "carry on" link. */
const LAST_KEY = "midnight-mint-own-last";
export const lastCollection = () => local.get(LAST_KEY);
export const rememberCollection = (id: string) => { local.set(LAST_KEY, id); };
/** Where a collection opens. */
export const collectionUrl = (id: string) => `/c/${id}`;

/** A name: one text, or one per token language ("en", "es", "es-castelgard"…). */
export type Names = string | Record<string, string>;
export const SHAPES: TokenShape[] = ["coin", "card", "ring", "base"];
export interface OwnType { id: string; name: Names; title: Names; shape: TokenShape; icon?: string }
export interface OwnGroup { id: string; name: Names; colour: Hex; icon?: string;
  /** Its own icon, as the paths of a 512-unit game-icons.net icon (for its filter and plate), when not one of the app's. */
  iconBody?: string }
/** An id from a file: letters, digits, _ and - (it goes into the page's attributes, and keys join ids with ":"). */
const okId = (v: unknown) => String(v).replace(/[^\w-]/g, "_").slice(0, 80) || "_";
/** A group's icon from a file: only path outlines, rebuilt (nothing else of the markup is kept: it's drawn as HTML). */
const okIconBody = (v: unknown) => typeof v === "string" && v.length < 60000
  ? [...v.matchAll(/<path\b[^>]*\sd="([-0-9.,a-zA-Z\s]+)"/g)].map((m) => `<path fill="currentColor" d="${m[1]}"/>`).join("") || undefined
  : undefined;
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
  /** Its other state, on its back (a coin's only): "Ready" on the front, "Acted" when turned over. */
  flip?: OwnFlip;
  /** It came with the collection and can't be changed (like Clocktower's info tokens). */
  fixed?: boolean;
  /** Its own colour, over its group's: what "the group's colour" is in its design (its linked tokens' and other state's too). */
  colour?: Hex;
}
/** A two-state token's other state: a name (in several languages, like the token's) and an icon (like the token's). */
export interface OwnFlip { name: Names; icon: TokenIcon | null }
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
/**
 * A style a collection comes with: a named look for one shape (any field left out is the default
 * one's), and a line about it. A collection's styles are where its tokens' styles start from: the
 * first of a shape is the one its tokens use, the rest can be added, and a style can be set back to one.
 */
export interface StyleDef { id: string; name: Names; help?: Names; spec: SpecInput;
  /** Kept only so what chose it before prints the same ("c:<id>"): not offered (Draw Steel's old Legible). */
  hidden?: boolean }
export type CollectionStyles = Partial<Record<TokenShape, StyleDef[]>>;
/**
 * The coin style a collection starts with when it says none: black, the name, icon and frame in
 * the group's colour, the collection's name in gold on the back (what every token looked like
 * before collections had styles). Its id is that look's old template's ("edicion"), so the style a
 * token already had from it is this one.
 */
const BASIC: StyleDef = {
  id: "edicion", name: { es: "Básico", en: "Basic" }, help: { es: "Negra, con el color del grupo y el nombre de la colección en oro al reverso.", en: "Black, with the group colour and the collection's name in gold on the back." },
  spec: { style: "classic", frame: "rim", frameWidth: 0.8, back: "edition", depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } },
};
/**
 * The styles a collection starts with when it says none (Básico), per shape: the coin above; for
 * rings and cards, the app's that fit any group (src/shape-designs.ts), as its default. The rest
 * of the app's designs are offered in every collection anyway (appDesigns); a "c:<id>" kept when
 * Básico listed them all is the app's of that id, the same.
 */
export const basicStyles = (): Record<TokenShape, StyleDef[]> => ({
  coin: [structuredClone(BASIC)],
  ring: ringDesigns("aro-color"),
  card: cardDesigns("contraste"),
  base: baseDesigns("bandeja-color"),
});
/**
 * A collection kept with the basic coin style for its rings and cards too (as every new one was
 * made before rings and cards had designs of their own) has today's basic ones for them instead.
 */
function upgradeBasicStyles(styles: CollectionStyles | undefined) {
  const old = JSON.stringify(BASIC);
  for (const sh of ["ring", "card"] as const) if (styles?.[sh]?.length === 1 && JSON.stringify(styles[sh]![0]) === old) styles[sh] = basicStyles()[sh];
}
/**
 * A collection's styles for a shape: its own, else the basic one. The first is its default. Every
 * one of them is what "c:<id>" means in it, hidden ones and the app's it lists too; an id it hasn't
 * is the app's (appDesigns).
 */
export const stylesOf = (c: { styles?: CollectionStyles }, shape: TokenShape): StyleDef[] => (c.styles?.[shape]?.length ? c.styles[shape] : basicStyles()[shape]);
/** The ones it offers as its own: not hidden, and not one of the app's (those are offered as the app's). */
export const ownStylesOf = (c: { styles?: CollectionStyles }, shape: TokenShape): StyleDef[] => stylesOf(c, shape).filter((d) => !d.hidden && !appTwin(shape, d));
/**
 * The app's designs (Tesserae Faber's), offered in every collection after its own: "a:<id>".
 * Functional looks (Fast print, High legibility, the rings' and cards'…) that were collections' once.
 */
export const appDesigns = (shape: TokenShape): StyleDef[] => APP_DESIGNS[shape];
/** Every style "c:<id>" can be in a collection: its own (stylesOf), then the app's under an id it hasn't. */
export const knownStylesOf = (c: { styles?: CollectionStyles }, shape: TokenShape): StyleDef[] => {
  const own = stylesOf(c, shape);
  return [...own, ...APP_DESIGNS[shape].filter((a) => !own.some((d) => d.id === a.id))];
};

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
  /** The styles it comes with, per shape (StyleDef); without them, the basic one. */
  styles?: CollectionStyles;
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
export interface BuiltInEntry { id: string; file?: string; name: Names; logo?: string; accent?: string; tokens: number; text?: Names;
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
/** Only the styles a built-in collection comes with (for the Taller), without reading its tokens. */
export async function builtInStyles(id: string): Promise<CollectionStyles | undefined> {
  const entry = builtIn(id);
  if (!entry?.file) return undefined;
  try { const res = await fetch(entry.file); return res.ok ? readStyles((await res.json())?.styles) : undefined; } catch { return undefined; }
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
  styles: basicStyles(),
});

/** A collection kept before types and sections: its catalogs become one open section. */
function upgrade(c: Collection & { catalogs?: OwnCatalog[] }): Collection {
  if (!c.types?.length) {
    c.types = starterCollection().types;
    for (const t of c.tokens) t.type ??= c.types[0].id;
  }
  if (!c.sections) { c.sections = [{ id: "s1", title: "Catálogos", open: true, catalogs: c.catalogs ?? [] }]; delete c.catalogs; }
  upgradeBasicStyles(c.styles);
  return c;
}
export function listCollections(): CollectionEntry[] {
  migrateSingle();
  const l = readJSON<unknown>(LIST_KEY, null);
  return Array.isArray(l) ? l as CollectionEntry[] : [];
}
function storeList(list: CollectionEntry[]) { writeJSON(LIST_KEY, list); }

export function loadCollection(id = OWN_ID): Collection | null {
  if (!id) return null;
  migrateSingle();
  try {
    const c = readJSON<Collection | null>(keyOf(id), null);
    if (c && Array.isArray(c.groups) && Array.isArray(c.tokens) && c.tokens.length) return upgrade(c);
  } catch { /* not ours */ }
  return null;
}
/** Keeps a collection, and its card in the list. Returns false when the browser's storage is full. */
export function storeCollection(c: Collection, id = OWN_ID): boolean {
  if (!id || builtIn(id)) return false;   // the app's own collections are read-only: make a copy to change one
  if (!writeJSON(keyOf(id), c)) return false;
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
  for (const k of local.keys()) if (k.startsWith(`midnight-mint-own-${id}-`)) local.remove(k);
  storeList(listCollections().filter((x) => x.id !== id));
}
/** The creator kept one collection before it kept several: that one becomes the first of the list. */
function migrateSingle() {
  const old = local.get("midnight-mint-own-collection");
  if (!old || local.get(LIST_KEY)) return;
  const id = "c1";
  local.set(keyOf(id), old);
  for (const k of ["picks", "style", "overrides", "designs", "view"]) {
    const v = local.get(`midnight-mint-own-${k}`);
    if (v != null) local.set(`midnight-mint-own-${id}-${k}`, v);
    local.remove(`midnight-mint-own-${k}`);
  }
  local.remove("midnight-mint-own-collection");
  const c = readJSON<Partial<Collection> | null>(keyOf(id), null);
  writeJSON(LIST_KEY, [{ id, name: c?.name ? nameIn(c.name, "es") : "", tokens: c?.tokens?.length ?? 0, updated: Date.now() }]);
}

/** Every catalog, with its section. */
export const catalogsOf = (c: Collection) => c.sections.flatMap((s) => s.catalogs.map((k) => ({ k, s })));
/** A token in a closed section's catalog came with the collection: it can't be changed. */
export const isLocked = (c: Collection, id: string) => !!c.tokens.find((t) => t.id === id)?.fixed || c.sections.some((s) => !s.open && s.catalogs.some((k) => k.tokens.includes(id)));

/** The app's character for a token of ours: its group is its team; its linked tokens, its reminders. */
/** A name as a character has it: English, Spanish and one per language. */
const namesOf = (n: Names) => (typeof n === "string" ? { en: n, es: n } : n);
/** An icon's credit, when it's from game-icons.net. */
const creditOf = (icon: TokenIcon | null) => (icon?.source === "game-icons" ? { icon: icon.name, author: icon.author } : {});

export function tokenRole(c: Collection, t: OwnToken, lang = "es"): Role {
  const names = namesOf(t.name);
  const langs = new Set(["en", "es", ...Object.keys(names), ...t.linked.flatMap((l) => (typeof l === "string" ? [] : Object.keys(l)))]);
  const type = c.types.find((x) => x.id === t.type);
  // the Edition back: the first closed catalog it's in ("Trouble Brewing"), else the collection's name
  const home = c.sections.find((s) => !s.open && s.catalogs.some((k) => k.tokens.includes(t.id)))?.catalogs.find((k) => k.tokens.includes(t.id));
  return {
    id: t.id, en: nameIn(names, "en"), es: nameIn(names, "es"), names: Object.fromEntries([...langs].map((l) => [l, nameIn(names, l)])), fem: t.fem ?? {},
    team: t.group as Team,   // a group of the collection, registered as a team (main.ts, applyGroups)
    ...(t.colour ? { colour: t.colour } : {}),
    edition: "own", editionName: nameIn(home?.name ?? c.name, lang), collectionName: nameIn(c.name, lang),
    reminders: Object.fromEntries([...langs].map((l) => [l, t.linked.map((n) => nameIn(n, l))])),
    body: t.icon?.body ?? "", d: [], g: t.icon?.g ?? "",
    ...(type?.shape === "card" ? { kind: "info" as const } : type?.shape === "ring" ? { kind: "ring" as const } : type?.shape === "base" ? { kind: "base" as const } : {}),
    // credited like the library's icons, when it's from game-icons.net
    ...creditOf(t.icon),
    // the engine caches shapes by this: a new icon for the same token gets drawn afresh
    iconKey: `${t.id}:${t.icon?.id ?? "none"}`,
    ...(t.flip ? { flip: flipRole(t.id, t.flip) } : {}),
  };
}
/** A token's other state as the engine draws it (the engine leaves it out for shapes without one). */
function flipRole(id: string, f: OwnFlip): NonNullable<Role["flip"]> {
  const names = namesOf(f.name);
  return {
    en: nameIn(names, "en"), es: nameIn(names, "es"), names: Object.fromEntries(Object.keys({ en: 1, es: 1, ...names }).map((l) => [l, nameIn(names, l)])),
    body: f.icon?.body ?? "", g: f.icon?.g ?? "", ...creditOf(f.icon), iconKey: `${id}~flip:${f.icon?.id ?? "none"}`,
  };
}
export const collectionRoles = (c: Collection, lang?: string) => c.tokens.map((t) => tokenRole(c, t, lang));

// ------------------------------------------------------------ the JSON file

/** An icon in the file: a game-icons.net icon by "author/name", or SVG (with its credit, when it came from game-icons.net). */
interface FileIcon { icon?: string | { svg: string }; iconCredit?: { name?: string; author?: string }; iconSvg?: string }
/** A token in the file; its other state is written like the token's own name and icon. */
interface FileToken extends Omit<OwnToken, "icon" | "linked" | "flip">, FileIcon { linked?: ({ name: Names } | string)[]; flip?: { name: Names } & FileIcon }
export interface CollectionFile extends Omit<Collection, "tokens"> { format: string; version: number; tokens: FileToken[] }

const isGameIcon = (s: string) => /^[\w-]+\/[\w-]+$/.test(s);
const svgOf = (icon: TokenIcon) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.559055 127.559055"><g transform="${icon.g}">${icon.body}</g></svg>`;

/** An icon as the file has it: a game-icons.net icon by name, the rest as SVG. */
const fileIcon = (icon: TokenIcon | null): FileIcon => ({
  ...(icon ? icon.source === "game-icons" && isGameIcon(icon.id) ? { icon: icon.id, iconSvg: svgOf(icon) } : { icon: { svg: svgOf(icon) } } : {}),
  // an icon kept as SVG still says where it's from, for the credits
  ...(icon?.author && !isGameIcon(icon.id) ? { iconCredit: { name: icon.name, author: icon.author } } : {}),
});
/** The collection as a file (its styles as they are): game-icons.net icons by name, the rest as SVG. */
export function collectionFile(c: Collection): CollectionFile {
  return {
    format: COLLECTION_FORMAT, version: 1, ...c,
    tokens: c.tokens.map(({ icon, linked, flip, ...t }) => ({
      ...t,
      ...fileIcon(icon),
      linked: linked.map((name) => ({ name })),
      ...(flip ? { flip: { name: flip.name, ...fileIcon(flip.icon) } } : {}),
    })),
  };
}

/**
 * A style's look from a file: only the fields a token's spec has, each of the kind the default's is
 * (a colour a hex or "team"); anything else is dropped, so a file can't hand the engine nonsense.
 */
function readSpec(v: unknown): SpecInput | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, unknown> = {}, d = DEFAULT_SPEC as unknown as Record<string, unknown>;
  for (const [k, x] of Object.entries(v)) {
    if (k === "colours") {
      if (!x || typeof x !== "object") continue;
      const c = Object.fromEntries(Object.entries(x).filter(([ck, cv]) => (ck in DEFAULT_SPEC.colours || ck === "backBase") && (cv === "team" || isHex(cv))));
      if (Object.keys(c).length) out.colours = c;
    } else if (k === "relief") {
      if (!x || typeof x !== "object" || Array.isArray(x)) continue;
      const r = Object.fromEntries(Object.entries(x).filter(([rk, rv]) => ["text", "frame", "icon"].includes(rk) && typeof rv === "boolean"));
      if (Object.keys(r).length) out[k] = r;
    } else if (k === "backFace") {
      const f = readSpec(x) as Record<string, unknown> | null;
      if (f) { delete f.backFace; out[k] = f; }
    }
    else if (k === "customSvg") { if (typeof x === "string" && x.length < 300000) out[k] = x; }
    else if (k === "frontPattern" || k === "backPattern") { const p = readPattern(x); if (p) out[k] = p; }
    else if (k === "backText") { if (x === "collection") out[k] = x; }
    else if (k === "edge") { if (x === "smooth" || x === "reeded" || x === "segmented") out[k] = x; }
    else if (k === "reliefBevel") { if (typeof x === "number" && x >= 0 && x <= 0.4) out[k] = x; }
    else if (k === "cardIcon") { if (CARD_ICONS.includes(x as CardIcon)) out[k] = x; }
    else if (k === "cardJoin") { if (CARD_JOINS.includes(x as CardJoin)) out[k] = x; }
    else if (k === "cardIconSize") { if (typeof x === "number" && x >= CARD_ICON_MM.min && x <= CARD_ICON_MM.max) out[k] = x; }
    else if (k === "cardBack") { const b = readCardBack(x); if (b) out[k] = b; }
    else if (k in d && k !== "lang" && typeof x === typeof d[k]) out[k] = x;
  }
  return out as SpecInput;
}
/**
 * A card's back from a file (CardBack): on or off, its phrase, its icon (only its shapes, as any
 * icon from outside: safe-svg.ts), its layout, frame and colours; anything else is dropped.
 */
function readCardBack(v: unknown): CardBack | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const x = v as Record<string, unknown>, out: CardBack = { on: x.on === true };
  if (typeof x.text === "string") out.text = x.text.slice(0, 120);
  if (x.name === "collection") out.name = "collection";
  const ic = x.icon as Record<string, unknown> | null | undefined;
  if (ic && typeof ic === "object" && typeof ic.id === "string" && typeof ic.body === "string" && ic.body.length < 300000) {
    const body = safeIconMarkup(ic.body), str = (k: string) => (typeof ic[k] === "string" ? { [k]: (ic[k] as string).slice(0, 200) } : {});
    if (body) out.icon = { id: ic.id.slice(0, 200), ...str("source"), ...str("name"), ...str("author"), g: safeTransform(ic.g), body };
  }
  if (CARD_ICONS.includes(x.cardIcon as CardIcon)) out.cardIcon = x.cardIcon as CardIcon;
  if (CARD_JOINS.includes(x.cardJoin as CardJoin)) out.cardJoin = x.cardJoin as CardJoin;
  if (typeof x.cardIconSize === "number" && x.cardIconSize >= CARD_ICON_MM.min && x.cardIconSize <= CARD_ICON_MM.max) out.cardIconSize = x.cardIconSize;
  if (typeof x.frame === "string" && x.frame.length < 40) out.frame = x.frame;
  if (typeof x.frameWidth === "number" && x.frameWidth >= 0.4 && x.frameWidth <= 2) out.frameWidth = x.frameWidth;
  const c = x.colours as Record<string, unknown> | undefined;
  if (c && typeof c === "object") {
    const colours = Object.fromEntries(["text", "frame"].filter((k) => c[k] === "team" || isHex(c[k])).map((k) => [k, c[k]]));
    if (Object.keys(colours).length) out.colours = colours;
  }
  return out;
}
/** A background pattern from a file (PatternSpec): a known pattern, its numbers and its colour. */
function readPattern(v: unknown): PatternSpec | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const x = v as Record<string, unknown>;
  if (!PATTERNS.some((p) => p.id === x.id)) return null;
  const num = (k: string) => (typeof x[k] === "number" && Number.isFinite(x[k]) ? { [k]: x[k] } : {});
  const colour = typeof x.colour === "string" && (["frame", "front", "back", "team"].includes(x.colour) || isHex(x.colour)) ? { colour: x.colour } : {};
  return { id: x.id as PatternSpec["id"], ...num("scale"), ...num("line"), ...num("halo"), ...colour } as PatternSpec;
}
/** A collection's styles from a file: per shape, each with an id, a name and a look; none, nothing. */
function readStyles(v: unknown): CollectionStyles | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: CollectionStyles = {};
  for (const sh of SHAPES) {
    const list = (v as Record<string, unknown>)[sh];
    if (!Array.isArray(list)) continue;
    const defs = list.flatMap((x): StyleDef[] => {
      const spec = x && typeof x === "object" && x.id && okName(x.name) ? readSpec(x.spec) : null;
      return spec ? [{ id: String(x.id), name: x.name, ...(okName(x.help) ? { help: x.help } : {}), spec, ...(x.hidden === true ? { hidden: true } : {}) }] : [];
    }).filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i);
    if (defs.length) out[sh] = defs;
  }
  return Object.keys(out).length ? out : undefined;
}

const okName = (n: unknown): n is Names => typeof n === "string" || (!!n && typeof n === "object" && Object.values(n).every((v) => typeof v === "string"));
/**
 * A collection from a file. Its icons are fetched (game-icons.net) or read (SVG) now, so the
 * collection draws without the network afterwards. Throws "not-collection" for other JSON.
 */
export async function readCollectionFile(data: unknown, onProgress: (done: number, total: number) => void = () => {}): Promise<Collection> {
  const f = data as Partial<CollectionFile> | null;
  if (!f || f.format !== COLLECTION_FORMAT || !Array.isArray(f.tokens) || !Array.isArray(f.groups)) throw new Error("not-collection");
  const firstOf = <T extends { id: string }>(list: T[]) => { const seen = new Set<string>(); return list.filter((x) => !seen.has(x.id) && !!seen.add(x.id)); };
  const types: OwnType[] = firstOf((f.types ?? []).filter((x) => x?.id).map((x) => ({ id: okId(x.id), name: okName(x.name) ? x.name : String(x.id), title: okName(x.title) ? x.title : okName(x.name) ? x.name : String(x.id), shape: SHAPES.includes(x.shape) ? x.shape : "coin", ...(x.icon ? { icon: String(x.icon) } : {}) })));
  if (!types.length) types.push(...starterCollection().types);
  const groups: OwnGroup[] = firstOf(f.groups.filter((g) => g?.id).map((g, i) => ({ id: okId(g.id), name: okName(g.name) ? g.name : `Grupo ${i + 1}`, colour: /^#[0-9a-f]{6}$/i.test(g.colour) ? g.colour : GROUP_COLOURS[i % GROUP_COLOURS.length], ...(g.icon ? { icon: String(g.icon) } : {}), ...(okIconBody(g.iconBody) ? { iconBody: okIconBody(g.iconBody) } : {}) })));
  if (!groups.length) groups.push({ id: "g1", name: "Grupo 1", colour: GROUP_COLOURS[0] });
  const knownGroup = new Set(groups.map((g) => g.id)), knownType = new Set(types.map((x) => x.id));
  let done = 0;
  const tokens: OwnToken[] = [];
  /** An icon from the file: fetched (game-icons.net) or read (SVG); null if it won't load. */
  const readIcon = async (x: FileIcon, id: string): Promise<TokenIcon | null> => {
    try {
      if (typeof x.icon === "string" && isGameIcon(x.icon)) {
        // its drawing, when the file has it; else fetched from game-icons.net
        const m = typeof x.iconSvg === "string" ? x.iconSvg.match(/<g transform="([^"]*)">([\s\S]*)<\/g>\s*<\/svg>\s*$/) : null;
        const body = m ? safeIconMarkup(m[2]) : "";
        if (m && body) { const [author, name] = x.icon.split("/"); return { id: x.icon, source: "game-icons", name, author, g: safeTransform(m[1]) || "translate(0 0) scale(1)", body }; }
        return { ...(await gameIcon(x.icon)), id: x.icon };
      }
      if (x.icon && typeof x.icon === "object" && typeof x.icon.svg === "string") {
        const m = x.icon.svg.match(/<g transform="([^"]*)">([\s\S]*)<\/g>\s*<\/svg>\s*$/);
        const credit = x.iconCredit && typeof x.iconCredit === "object" ? x.iconCredit : null;
        const body = m ? safeIconMarkup(m[2]) : "";
        if (m && body) return { id, source: credit?.author ? "game-icons" : "upload", g: safeTransform(m[1]) || "translate(0 0) scale(1)", body,
          ...(typeof credit?.name === "string" ? { name: credit.name.slice(0, 120) } : {}), ...(typeof credit?.author === "string" ? { author: credit.author.slice(0, 120) } : {}) };
      }
    } catch { /* an icon that won't load: the token stays, without it */ }
    return null;
  };
  for (const t of f.tokens) {
    if (!t?.id || !okName(t.name) || tokens.some((x) => x.id === okId(t.id))) continue;
    const icon = await readIcon(t, `svg:${okId(t.id)}`);
    const flip = t.flip && typeof t.flip === "object" && okName(t.flip.name) ? { name: t.flip.name, icon: await readIcon(t.flip, `svg:${okId(t.id)}~flip`) } : null;
    tokens.push({
      id: okId(t.id), type: knownType.has(okId(t.type)) ? okId(t.type) : types[0].id, group: knownGroup.has(okId(t.group)) ? okId(t.group) : groups[0].id,
      name: t.name, ...(t.fem && typeof t.fem === "object" ? { fem: t.fem } : {}), ...(t.fixed ? { fixed: true } : {}), icon,
      linked: (t.linked ?? []).map((l) => (typeof l === "string" ? l : l?.name)).filter(okName),
      ...(flip ? { flip } : {}),
      ...(isHex(t.colour) ? { colour: t.colour } : {}),
    });
    if (++done % 20 === 0 || done === f.tokens.length) onProgress(done, f.tokens.length);
  }
  const ids = new Set(tokens.map((t) => t.id));
  const sections: OwnSection[] = (f.sections ?? []).filter(Boolean).map((s, i) => ({
    id: okId(s.id ?? `s${i + 1}`), title: okName(s.title) ? s.title : "Catálogos", open: !!s.open,
    catalogs: (s.catalogs ?? []).filter((k) => k?.id).map((k) => ({ id: okId(k.id), name: okName(k.name) ? k.name : "Catálogo", tokens: (k.tokens ?? []).map(okId).filter((id) => ids.has(id)) })),
  }));
  if (!sections.some((s) => s.open)) sections.push({ id: "mine", title: "Catálogos", open: true, catalogs: [] });
  const styles = readStyles(f.styles);
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
    ...(Array.isArray(f.languages) ? { languages: f.languages.map(String).filter((l) => /^[a-z]{2,3}(-[a-z0-9]+)*$/.test(l)) } : {}),
    types, groups, tokens, sections,
    ...(styles ? { styles } : {}),
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
    // a two-state token by either of its names
    for (const name of [t.name, ...(t.flip ? [t.flip.name] : [])]) for (const n of typeof name === "string" ? [name] : Object.values(name)) index.set(key(n), t.id);
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
