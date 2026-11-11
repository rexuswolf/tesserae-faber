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
import { local, readJSON, writeJSON , botcUnlocked} from "./services.ts";
import type { CardBack, CardIcon, CardJoin, Hex, PatternSpec, Role, SpecInput, Team, TokenContent, TokenIcon, TokenShape } from "./types.ts";
import { gameIcon } from "./icons.ts";
import { safeIconMarkup, safeTransform } from "./engine/safe-svg.ts";
import { DEFAULT_SPEC, FILAMENTS, PATTERNS, CARD_ICONS, CARD_JOINS, CARD_ICON_MM, BACK_ORNAMENTS, ILLUSTRATIONS } from "./engine/token-engine.ts";
import { BUILT_INS } from "./builtins.ts";
import { ringDesigns, cardDesigns, baseDesigns, pieceDesigns, APP_DESIGNS, appTwin } from "./shape-designs.ts";

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
export const SHAPES: TokenShape[] = ["coin", "card", "ring", "base", "piece"];
/** What a collection calls its categories (groups), lists (catalogs) and linked tokens, where not the app's words: singular, plural, and in Spanish whether it's feminine. */
export interface OwnWord { one: Names; many: Names; fem?: boolean }
export interface OwnWords { group?: OwnWord; list?: OwnWord; linked?: OwnWord }
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
  /** What it is printed as: a coin, a card, a condition ring or a tabbed base. */
  shape: TokenShape;
  /** Its category (a group): one each, and its colour. */
  group: string;
  name: Names;
  /** What its front says, when it isn't its name (the name is how it's found in your lists). */
  text?: Names;
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
  /** What it carries (icon and name, icon only, name only), whatever its design; unset, as the design has it. */
  content?: TokenContent;
  /** The collection's design it's drawn in unless you choose another (one of its shape's, by id); unset, its shape's first. */
  design?: string;
}
/** A two-state token's other state: a name (in several languages, like the token's) and an icon (like the token's). */
export interface OwnFlip { name: Names; icon: TokenIcon | null }
/** A list of tokens (a token can be in several): the collection's own (fixed: it came with it, like Clocktower's editions) or yours. */
export interface OwnCatalog { id: string; name: Names; tokens: string[]; fixed?: boolean }
/** Does it carry the Community Created Content mark? (Kept before it had its own field: on its loading screen.) */
export const hasCcc = (c: { ccc?: boolean; loader?: { ccc?: boolean } }) => !!(c.ccc || c.loader?.ccc);
/** A collection's colours: the app's surfaces, text and accent (see THEMES for ready ones). */
export interface OwnTheme { accent: Hex; background: Hex; surface: Hex; text: Hex; muted: Hex; glow?: Hex; font?: string }
/** What the collection says about itself, at the top of "About": one block of Markdown (src/markdown.ts), what it is, its credits and its links. */
export interface OwnAbout { text?: Names }
/**
 * An About as it's kept now, from one as it may come (a file or a browser from before): its credits
 * and its links were apart, and follow its text now, the links as Markdown on a line of their own.
 * Nothing in it: none.
 */
export function foldAbout(a: unknown): OwnAbout | undefined {
  if (!a || typeof a !== "object") return undefined;
  const { text, credits, links } = a as { text?: unknown; credits?: unknown; links?: unknown };
  const okLinks = (Array.isArray(links) ? links : []).filter((l): l is { label: Names; url: string } => !!l && okName(l.label) && /^https?:\/\/\S+$/.test(String(l.url)));
  const parts = [okName(text) ? text : undefined, okName(credits) ? credits : undefined].filter((n): n is Names => n != null);
  const langs = [...new Set([...parts, ...okLinks.map((l) => l.label)].flatMap((n) => (typeof n === "string" ? [] : Object.keys(n))))];
  const one = (lang: string) => [...parts.map((n) => nameIn(n, lang).trim()), okLinks.map((l) => `[${nameIn(l.label, lang)}](${l.url})`).join(" · ")].filter(Boolean).join("\n\n");
  const folded: Names = langs.length ? Object.fromEntries(langs.map((l) => [l, one(l)])) : one("");
  return (typeof folded === "string" ? folded : Object.values(folded).join("")).trim() ? { text: folded } : undefined;
}
/** Its mark: a logo (an image as a data: URI, an https address, or one of the app's own files). Beside it, the collection's name. */
export interface OwnBrand { logo?: string }
/**
 * A name its mark had (shown beside its logo instead of its own, until there was only one): its name
 * now, since that's the one it was seen by.
 */
const brandName = (brand: unknown): Names | undefined => {
  const n = (brand as { title?: unknown } | undefined)?.title;
  return okName(n) && (typeof n === "string" ? n : Object.values(n).join("")).trim() ? n : undefined;
};
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
 * the group's colour, the back plain. Its id is the old template's ("edicion", which had the
 * collection's name in gold on the back), so the style a token already had from it is this one.
 */
const BASIC: StyleDef = {
  id: "edicion", name: { es: "Básico", en: "Basic" }, help: { es: "Negra, con el color del grupo y el reverso liso.", en: "Black, with the group colour and a plain back." },
  spec: { style: "classic", frame: "rim", frameWidth: 0.8, back: "none", depth: 0.4, colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } },
};
/** Básico as it was, with the collection's name in gold on the back: a collection kept with it gets today's. */
const BASIC_WAS: StyleDef = {
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
  piece: pieceDesigns("pieza-silueta"),
});
/**
 * A collection kept with the basic coin style for its rings and cards too (as every new one was
 * made before rings and cards had designs of their own) has today's basic ones for them instead.
 */
function upgradeBasicStyles(styles: CollectionStyles | undefined) {
  const olds = [JSON.stringify(BASIC), JSON.stringify(BASIC_WAS)];
  for (const sh of ["ring", "card"] as const) if (styles?.[sh]?.length === 1 && olds.includes(JSON.stringify(styles[sh]![0]))) styles[sh] = basicStyles()[sh];
  // Básico's back is plain now: a collection's copy of it as it was, too
  if (styles?.coin) styles.coin = styles.coin.map((d) => (JSON.stringify(d) === olds[1] ? structuredClone(BASIC) : d));
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
  /** Its categories: one per token, and its colour. */
  groups: OwnGroup[];
  tokens: OwnToken[];
  /** Its lists: the collection's own first (fixed), then yours. */
  catalogs: OwnCatalog[];
  /** Its own words for the app's (Clocktower: Bando, Guiones, Recordatorios). */
  words?: OwnWords;
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
/** A theme's colours as the stylesheet's tier-1 tokens (style.css: the rest are worked out from these). */
export const THEME_VARS = ["--theme-background", "--theme-surface", "--theme-panel", "--theme-accent", "--theme-text", "--theme-muted", "--theme-glow", "--theme-font-display"] as const;
export function themeVars(c: OwnTheme): Record<(typeof THEME_VARS)[number], string | undefined> {
  return {
    "--theme-background": c.background, "--theme-surface": c.surface, "--theme-panel": c.surface, "--theme-accent": c.accent,
    "--theme-text": c.text, "--theme-muted": c.muted, "--theme-glow": c.glow ?? c.surface,
    "--theme-font-display": c.font ? `"${c.font}", sans-serif` : undefined,
  };
}
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
/**
 * Your lists in one of the app's own collections (it isn't kept, it's read from its file): kept
 * apart, beside it, like Clocktower's scripts.
 */
const myListsKey = (id: string) => `midnight-mint-own-${id}-lists`;
export function loadMyLists(id: string): OwnCatalog[] {
  const l = readJSON<unknown>(myListsKey(id), []);
  return (Array.isArray(l) ? l : []).filter((k): k is OwnCatalog => !!k && typeof k.id === "string" && okName(k.name) && Array.isArray(k.tokens)).map(({ fixed: _, ...k }) => k);
}
export const storeMyLists = (id: string, lists: OwnCatalog[]) => writeJSON(myListsKey(id), lists.filter((k) => !k.fixed));
/** A collection that comes with the app (src/builtins.ts): what it says about itself is code. */
export interface BuiltInEntry { id: string; file?: string; name: Names; logo?: string; accent?: string; tokens: number; text?: Names;
  /** A picture of some of its tokens, for its cover, one per language (their names drawn in it); and what it holds, in a line. */
  preview?: Names; facts?: Names;
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
/** The collections that come with the app; Clocktower only where its key has been given (services.ts). */
export const builtInCollections = (): Promise<BuiltInEntry[]> => Promise.resolve(BUILT_INS.filter((b) => b.id !== "botc" || botcUnlocked()));
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
  // yours: its lists too, to change (and the ones you'd made in it)
  return c ? addCollection({ ...c, name, catalogs: [...c.catalogs, ...loadMyLists(id)].map(({ fixed: _, ...k }) => k) }) : null;
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

/** What a first collection's names say, in the interface's language (Spanish or English). */
const STARTER = {
  es: { name: "Mi colección", group: "Categoría", token: "Mi primer componente" },
  en: { name: "My collection", group: "Category", token: "My first component" },
};
/** The first collection's token, as it came (nobody named it, gave it an icon or anything else): a placeholder to drop once there are real ones. */
export const isUntouchedStarter = (tk: OwnToken) =>
  tk.id === "t1" && !tk.icon && !tk.linked.length && !tk.flip && !tk.colour && !tk.content && Object.values(STARTER).some((s) => nameIn(tk.name, "es") === s.token || nameIn(tk.name, "en") === s.token);
/** A first collection: one category, one token, and no lists yet. */
export const starterCollection = (lang = "es"): Collection => {
  const s = lang === "es" ? STARTER.es : STARTER.en;
  return {
    name: s.name,
    // one category, unseen until there are more
    groups: [{ id: "g1", name: `${s.group} 1`, colour: GROUP_COLOURS[0] }],
    // one token to start from: the app always has something to show and design
    tokens: [{ id: "t1", shape: "coin", group: "g1", name: s.token, icon: null, linked: [] }],
    catalogs: [],
    styles: basicStyles(),
  };
};

/** A type, as a collection had them (an entry in the sidebar with a shape), and a section of catalogs (closed: the collection's own). */
interface OldType { id: string; name?: Names; title?: Names; shape?: TokenShape }
interface OldSection { open?: boolean; catalogs?: OwnCatalog[] }
/**
 * A collection as it is now from one with types and sections: a token's shape is its type's, a
 * closed section's catalogs are its fixed lists and an open one's yours, and a type is a list of
 * its own unless something else shows the same tokens already (a list, a shape, everything).
 */
export function dropTypes(c: { tokens: (OwnToken & { type?: string })[]; types?: OldType[]; sections?: OldSection[]; catalogs?: OwnCatalog[] }) {
  const types = Array.isArray(c.types) ? c.types : [];
  const typeOf = new Map(c.tokens.map((t) => [t.id, t.type]));
  for (const t of c.tokens) {
    if (!SHAPES.includes(t.shape)) t.shape = types.find((x) => x.id === t.type)?.shape ?? "coin";
    delete t.type;
  }
  if (Array.isArray(c.sections)) c.catalogs = c.sections.flatMap((sec) => (sec.catalogs ?? []).map((k) => ({ ...k, ...(sec.open ? {} : { fixed: true }) })));
  c.catalogs ??= [];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const all = c.tokens.map((t) => t.id), byShape = (sh: TokenShape) => c.tokens.filter((t) => t.shape === sh).map((t) => t.id);
  const shown = (ids: string[]) => !ids.length || same(ids, all) || SHAPES.some((sh) => same(ids, byShape(sh))) || c.catalogs!.some((k) => same(ids, k.tokens));
  const fromTypes: OwnCatalog[] = types.flatMap((ty) => {
    const ids = c.tokens.filter((t) => typeOf.get(t.id) === ty.id).map((t) => t.id);
    return shown(ids) ? [] : [{ id: `type-${ty.id}`, name: ty.title ?? ty.name ?? ty.id, tokens: ids }];
  });
  c.catalogs = [...c.catalogs.filter((k) => k.fixed), ...fromTypes, ...c.catalogs.filter((k) => !k.fixed)];   // the collection's own first
  delete c.types; delete c.sections;
}

/** A collection kept before: its types and sections (dropTypes), and older ways still. */
function upgrade(c: Collection & { types?: OldType[]; sections?: OldSection[] }): Collection {
  if (c.types || c.sections) dropTypes(c);
  c.catalogs ??= [];
  upgradeBasicStyles(c.styles);
  if (c.about) { const about = foldAbout(c.about); if (about) c.about = about; else delete c.about; }   // its credits and links: in its text now
  if (c.brand && "title" in c.brand) { const n = brandName(c.brand); if (n) c.name = n; delete (c.brand as { title?: unknown }).title; }   // the name beside its logo: its name now
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
/** A token in one of the collection's own (fixed) lists came with it: it can't be changed. */
export const isLocked = (c: Collection, id: string) => !!c.tokens.find((t) => t.id === id)?.fixed || c.catalogs.some((k) => k.fixed && k.tokens.includes(id));

/** The app's character for a token of ours: its group is its team; its linked tokens, its reminders. */
/** A name as a character has it: English, Spanish and one per language. */
const namesOf = (n: Names) => (typeof n === "string" ? { en: n, es: n } : n);
/** An icon's credit, when it's from game-icons.net. */
const creditOf = (icon: TokenIcon | null) => (icon?.source === "game-icons" ? { icon: icon.name, author: icon.author } : {});

/** Whether a token's text says nothing (emptied, in every language); none written, it says its name. */
export const emptyText = (t: OwnToken) => t.text != null && !Object.values(namesOf(t.text)).some((v) => v.trim());
/** What a coin of yours prints: what it carries, less what it lacks (an icon, a text). */
export function coinContent(t: OwnToken): TokenContent | undefined {
  const c = t.content ?? "both", icon = !!t.icon, text = !emptyText(t);
  if (c === "none" || (!icon && !text)) return "none";
  if (c === "both") return !icon ? "text" : !text ? "icon" : t.content;
  if (c === "icon" && !icon) return "text";
  if (c === "text" && !text) return "icon";
  return t.content;
}
export function tokenRole(c: Collection, t: OwnToken, lang = "es"): Role {
  // what it prints: its text (empty: nothing), else its name; its name names it in your lists (listNames) when they differ
  const names = namesOf(t.text ?? t.name), own = namesOf(t.name);
  const langs = new Set(["en", "es", ...Object.keys(names), ...Object.keys(own), ...t.linked.flatMap((l) => (typeof l === "string" ? [] : Object.keys(l)))]);
  const type = { shape: t.shape };
  // the Edition back: the first of the collection's own lists it's in ("Trouble Brewing"), else the collection's name
  const home = c.catalogs.find((k) => k.fixed && k.tokens.includes(t.id));
  // a coin carries what it has: without an icon, its text alone; without a text, its icon alone; without either, nothing
  // a piece always carries its icon (its outline and what's on it are its design's), whatever it carried as another shape
  const content = type?.shape === "coin" ? coinContent(t) : type?.shape === "piece" ? undefined : t.content === "icon" && !t.icon && type?.shape !== "base" ? "text" : t.content;
  const icon = content === "text" || content === "none" ? null : t.icon;   // only its name, or nothing: its icon kept for later, not drawn
  return {
    id: t.id, en: nameIn(names, "en"), es: nameIn(names, "es"), names: Object.fromEntries([...langs].map((l) => [l, nameIn(names, l)])), fem: t.fem ?? {},
    ...(t.text != null ? { listNames: Object.fromEntries([...langs].map((l) => [l, nameIn(own, l)])) } : {}),
    team: t.group as Team,   // a group of the collection, registered as a team (main.ts, applyGroups)
    ...(t.colour ? { colour: t.colour } : {}),
    ...(t.design ? { design: t.design } : {}),
    edition: "own", editionName: nameIn(home?.name ?? c.name, lang), collectionName: nameIn(c.name, lang),
    reminders: Object.fromEntries([...langs].map((l) => [l, t.linked.map((n) => nameIn(n, l))])),
    body: icon?.body ?? "", d: [], g: icon?.g ?? "",
    ...(type?.shape === "card" ? { kind: "info" as const } : type?.shape === "ring" ? { kind: "ring" as const } : type?.shape === "base" ? { kind: "base" as const } : type?.shape === "piece" ? { kind: "piece" as const } : {}),
    // credited like the library's icons, when it's from game-icons.net
    ...creditOf(icon),
    // the engine caches shapes by this: a new icon for the same token gets drawn afresh
    iconKey: `${t.id}:${icon?.id ?? "none"}`,
    ...(content ? { content } : {}),
    ...((content === "text" || content === "none") && t.icon ? { keptIcon: { id: t.icon.id, g: t.icon.g, body: t.icon.body } } : {}),
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
      const c = Object.fromEntries(Object.entries(x).filter(([ck, cv]) => (ck in DEFAULT_SPEC.colours || ck === "backBase" || ck === "icon") && (cv === "team" || isHex(cv))));
      if (Object.keys(c).length) out.colours = c;
    } else if (k === "relief") {
      if (!x || typeof x !== "object" || Array.isArray(x)) continue;
      const r = Object.fromEntries(Object.entries(x).filter(([rk, rv]) => ["text", "frame", "icon"].includes(rk) && typeof rv === "boolean"));
      if (Object.keys(r).length) out[k] = r;
    } else if (k === "backFace") {
      const f = readSpec(x) as Record<string, unknown> | null, b = x as Record<string, unknown>;
      // what a one-state token's back says and shows (BackFace): not a spec's own fields
      if (f && ["edition", "phrase", "none"].includes(b.say as string)) f.say = b.say;
      if (f && typeof b.phrase === "string") f.phrase = b.phrase.slice(0, 60);
      if (f && (["none", "custom"].includes(b.art as string) || BACK_ORNAMENTS.includes(b.art as string))) f.art = b.art;
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
  if (!PATTERNS.some((p) => p.id === x.id) && !ILLUSTRATIONS.includes(x.id as PatternSpec["id"])) return null;
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
/** A collection's own words from a file: each a singular and a plural (and whether it's feminine); anything else, the app's. */
function readWords(v: unknown): OwnWords | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: OwnWords = {};
  for (const k of ["group", "list", "linked"] as const) {
    const w = (v as Record<string, Partial<OwnWord> | undefined>)[k];
    if (w && okName(w.one) && okName(w.many)) out[k] = { one: w.one, many: w.many, ...(w.fem === true ? { fem: true } : w.fem === false ? { fem: false } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}
/**
 * A collection from a file. Its icons are fetched (game-icons.net) or read (SVG) now, so the
 * collection draws without the network afterwards. Throws "not-collection" for other JSON.
 */
export async function readCollectionFile(data: unknown, onProgress: (done: number, total: number) => void = () => {}): Promise<Collection> {
  const f = data as Partial<CollectionFile> | null;
  if (!f || f.format !== COLLECTION_FORMAT || !Array.isArray(f.tokens) || !Array.isArray(f.groups)) throw new Error("not-collection");
  const firstOf = <T extends { id: string }>(list: T[]) => { const seen = new Set<string>(); return list.filter((x) => !seen.has(x.id) && !!seen.add(x.id)); };
  const old = f as unknown as { types?: OldType[]; sections?: (OldSection & { catalogs?: unknown[] })[] };   // types and sections, as files had them
  const types: OldType[] = firstOf((Array.isArray(old.types) ? old.types : []).filter((x) => x?.id).map((x) => ({ id: okId(x.id), ...(okName(x.name) ? { name: x.name } : {}), ...(okName(x.title) ? { title: x.title } : {}), shape: SHAPES.includes(x.shape!) ? x.shape : "coin" })));
  const groups: OwnGroup[] = firstOf(f.groups.filter((g) => g?.id).map((g, i) => ({ id: okId(g.id), name: okName(g.name) ? g.name : `Grupo ${i + 1}`, colour: /^#[0-9a-f]{6}$/i.test(g.colour) ? g.colour : GROUP_COLOURS[i % GROUP_COLOURS.length], ...(g.icon ? { icon: String(g.icon) } : {}), ...(okIconBody(g.iconBody) ? { iconBody: okIconBody(g.iconBody) } : {}) })));
  if (!groups.length) groups.push({ id: "g1", name: "Grupo 1", colour: GROUP_COLOURS[0] });
  const knownGroup = new Set(groups.map((g) => g.id)), knownType = new Set(types.map((x) => x.id));
  const fileTokens = f.tokens as (FileToken & { type?: string })[];
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
  for (const t of fileTokens) {
    if (!t?.id || !okName(t.name) || tokens.some((x) => x.id === okId(t.id))) continue;
    const icon = await readIcon(t, `svg:${okId(t.id)}`);
    const flip = t.flip && typeof t.flip === "object" && okName(t.flip.name) ? { name: t.flip.name, icon: await readIcon(t.flip, `svg:${okId(t.id)}~flip`) } : null;
    tokens.push({
      // its shape; a file with types: its type's (dropTypes, below)
      id: okId(t.id), shape: (SHAPES.includes(t.shape) ? t.shape : undefined) as TokenShape, ...(t.type != null && knownType.has(okId(t.type)) ? { type: okId(t.type) } : {}), group: knownGroup.has(okId(t.group)) ? okId(t.group) : groups[0].id,
      name: t.name, ...(okName(t.text) ? { text: t.text } : {}), ...(t.fem && typeof t.fem === "object" ? { fem: t.fem } : {}), ...(t.fixed ? { fixed: true } : {}), icon,
      linked: (t.linked ?? []).map((l) => (typeof l === "string" ? l : l?.name)).filter(okName),
      ...(flip ? { flip } : {}),
      ...(isHex(t.colour) ? { colour: t.colour } : {}),
      ...(typeof t.design === "string" && t.design ? { design: okId(t.design) } : {}),
      ...(t.content === "both" || t.content === "icon" || t.content === "text" || t.content === "none" ? { content: t.content } : {}),
    });
    if (++done % 20 === 0 || done === f.tokens.length) onProgress(done, f.tokens.length);
  }
  const ids = new Set(tokens.map((t) => t.id));
  /** A list from the file: its tokens that are in it. */
  const readList = (k: unknown, fixed: boolean): OwnCatalog[] => {
    const x = k as Partial<OwnCatalog> | null;
    return x?.id ? [{ id: okId(x.id), name: okName(x.name) ? x.name : "Lista", tokens: (Array.isArray(x.tokens) ? x.tokens : []).map(okId).filter((id) => ids.has(id)), ...(fixed ? { fixed: true } : {}) }] : [];
  };
  // its lists; a file with sections: their catalogs, a closed section's the collection's own
  const catalogs = firstOf(Array.isArray(old.sections) ? old.sections.filter(Boolean).flatMap((sec) => (sec.catalogs ?? []).flatMap((k) => readList(k, !sec.open)))
    : (Array.isArray(f.catalogs) ? f.catalogs : []).flatMap((k) => readList(k, !!k?.fixed)));
  const shaped = { tokens: tokens as (OwnToken & { type?: string })[], types, catalogs };
  dropTypes(shaped);   // a type a list of its own, where nothing else shows its tokens
  const styles = readStyles(f.styles);
  return {
    name: brandName(f.brand) ?? (okName(f.name) ? f.name : "Mi colección"),
    ...(f.ccc || f.loader?.ccc ? { ccc: true } : {}),
    ...(readTheme(f.theme) ? { theme: readTheme(f.theme) } : {}),
    ...(foldAbout(f.about) ? { about: foldAbout(f.about) } : {}),
    ...(f.brand && typeof f.brand === "object" ? { brand: { ...(okLogo(f.brand.logo) ? { logo: f.brand.logo } : {}),  } } : {}),
    ...(f.loader && typeof f.loader === "object" ? { loader: { ...(okName(f.loader.text) ? { text: f.loader.text } : {}), ...(okName(f.loader.footer) ? { footer: f.loader.footer } : {}), ...(f.loader.ccc ? { ccc: true } : {}) } } : {}),
    ...(Array.isArray(f.languages) ? { languages: f.languages.map(String).filter((l) => /^[a-z]{2,3}(-[a-z0-9]+)*$/.test(l)) } : {}),
    groups, tokens, catalogs: shaped.catalogs, ...(readWords(f.words) ? { words: readWords(f.words) } : {}),
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
