import { handingOver } from "./handoff.ts";   // first: a browser arriving from midnight-mint.web.app brings its keepings
import {
  loadLibrary, buildToken, geometryVolume, magnetLayout, MAGNET_SIZES, tokenSvg, roleName, saveFile, reminderSpec, layoutName, nameLetterHeight, SMALL_LETTERS_MM,
  TEAMS, EDITIONS, FRAME_STYLES, BACK_STYLES, TOKEN_STYLES, FILAMENTS, DEFAULT_SPEC, CARD, isCard, ringSize, ringBand, RING_BASES, RING_SEPARATORS,
  SHAPE_FEATURES, shapeOf, shapeSpec, flipFace, FACE_FIELDS, backFaceOf, partColours,
  normalizeSpec, reliefOf, hasRelief, PATTERNS, patternDefaults, patternFilled, patternFixed, PATTERN_MIN,
} from "./engine/token-engine.ts";
/** The face parts that can be raised, in the order a back that matches the front lists them. */
const RELIEF_PARTS: ReliefPart[] = ["text", "frame", "icon"];
/** Each layout's name size (mm): the arcs' run along the edge, the window's has the lower half. */
const LAYOUT_TEXT: Record<TokenStyle, number> = { classic: DEFAULT_SPEC.textSize, window: 6, solo: DEFAULT_SPEC.textSize, double: DEFAULT_SPEC.textSize };
import { infoRoles } from "./info-tokens.ts";
import {
  onUser, signIn, signOutUser, isAdmin, loadRoles, uploadRoles, listAccountDesigns, deleteAccountDesign,
} from "./firebase.ts";
import { planPlates, FILAMENT_SLOTS, PRINTERS, printerOf, NOZZLES, nozzleOf } from "./bambu/plates.ts";
import { colourIssues, LIGHT_DEPTH } from "./colour-checks.ts";
import { iconFromSvg, gameIcon, gameIconPreview, searchGameIcons, scriptEntryIcon, iconForScript, placeGameIcon, tracedBefore } from "./icons.ts";
import { plateFeatures } from "./bambu/estimate.ts";
import { PAGE, layoutCoins, backX } from "./pdf/layout.ts";
import { t, tIn, uiLang, setUiLang, LANGUAGES } from "./i18n.ts";
import { TRANSLATIONS, VILLACUERVOS_URL } from "./translations.ts";
import { uiIcon, UI_ICONS, TEAM_ICONS, SHAPE_ICONS } from "./ui-icons.ts";
import { BOTC_STYLES } from "./botc-styles.ts";
import { OWN, OWN_ID, OWN_VIEW, LIST_URL, tallerUrl, builtInStyles, basicStyles, lastCollection, rememberCollection, collectionUrl, openUrl, listCollections, addCollection, deleteCollection, starterCollection, builtInCollections, MODE, loadCollection, storeCollection, collectionRoles, collectionFile, readCollectionFile, readTokenList, SHAPES, tokenRole as ownRole, readBuiltIn, copyBuiltIn, GROUP_COLOURS, newId, nameIn, withName, catalogsOf, isLocked, THEMES, THEME_FONTS, okLogo, hasCcc, builtIn, APP_LOGO, APP_LOGO_SMALL, APP_ICON, APP_NAME, stylesOf, ownStylesOf, appDesigns, knownStylesOf } from "./collection.ts";
import { appTwin } from "./shape-designs.ts";
import type { StyleDef, CollectionStyles, Collection, OwnToken, OwnCatalog, OwnSection, OwnTheme, CollectionEntry } from "./collection.ts";
import { loadScripts, storeScripts, saveScript, scriptLink, readLink, scriptJson, idKey as scriptKey } from "./scripts.ts";
import type { HomebrewEntry, NewScript, Script, ScriptJsonEntry } from "./scripts.ts";
import type { Translation } from "./translations.ts";
import type { InlayPart } from "./colour-checks.ts";
import type { Vars } from "./i18n.ts";
import type { PaperSize, SheetSlot } from "./pdf/layout.ts";
import type { Viewer, ViewKind } from "./engine/viewer.ts";
import type { User } from "firebase/auth";
import type {
  BackFace, BackMode, ColourRef, Hex, Library, MagnetLayout, PartName, PatternSpec, PlanToken, PlateItem, PlatePlan, QueueEntry, ReliefPart, Role, SpecColours,
  LookChanges, MyDesign, SpecInput, Style, Team, Token, TokenIcon, TokenOverride, TokenShape, TokenSpec, TokenStyle, Volumes,
} from "./types.ts";

/** The first element matching `s`: the app's own markup, so it's there. */
const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => [...el.querySelectorAll<T>(s)];
/** The element matching `sel` that an event happened in, if any. */
const hit = (e: Event, sel: string) => (e.target as Element).closest<HTMLElement>(sel);
/** The input (or textarea) an event happened on. */
const input = (e: Event) => e.target as HTMLInputElement;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
const fold = (s: string) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
/** A spec seen as fields by name: a collection's style and the reset buttons set them one by one. */
type Fields = Record<string, unknown>;

/** The sliders: each field's decimals and unit. */
type RangeKey = "diameter" | "height" | "depth" | "reliefHeight" | "iconScale" | "textSize" | "spacing" | "maxArc" | "frameWidth";
const RANGES: Record<RangeKey, [number, string]> = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], reliefHeight: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"] };
const MAX_SVG = 300000;
// The source code. Its links (sidebar footer and credits) stay hidden while the repository
// is private, so nobody lands on GitHub's 404: set REPO_PUBLIC to true once it is published.
const REPO_URL = "https://github.com/rexuswolf/tesserae-faber";
const REPO_PUBLIC = false;
const QUEUE_KEY = "midnight-mint-queue";   // the old print queue, read once to carry it over
// Tesserae Faber keeps each collection's own queue, style and designs, apart from Clocktower's.
const KEYS = OWN ? `midnight-mint-own-${OWN_ID ?? "none"}-` : "midnight-mint-";   // each collection its own
const PICK_KEY = `${KEYS}picks`;
// Your designs, one library for every collection (and Clocktower); this collection's default design
// per shape, where it isn't its own; and what each token has of its own (its text, icon, design and
// changes to it). See loadDesigns.
const MY_DESIGNS_KEY = "tesserae-styles";
const DEFAULTS_KEY = `${KEYS}design-defaults`;
const OVERRIDES2_KEY = `${KEYS}design-tokens`;
// Before designs were yours: each collection's styles and its tokens' own (49eeec0). Before styles:
// the set's design per type (the coin's under the key the single design had), each token's own
// whole design, and the designs saved in this browser. Read once, to make the designs.
const STYLES_KEY = `${KEYS}styles`;
const TOKENS_KEY = `${KEYS}tokens`;
const STYLE_KEY = `${KEYS}style`;
const STYLE_KEYS: Record<TokenShape, string> = { coin: STYLE_KEY, ring: `${KEYS}style-ring`, card: `${KEYS}style-card` };
const OVERRIDES_KEY = `${KEYS}overrides`;
const DESIGNS_KEY = `${KEYS}designs`;
const TOKEN_LANG_KEY = "midnight-mint-token-lang";
const VIEW_KEY = `${KEYS}view`;   // the sheet you were on (all, an edition or a script) and its team filter
const EDITION_ORDER = ["tb", "bmr", "snv", "carousel", "fabled", "loric", "grimoire"];
document.documentElement.dataset.mode = MODE;   // the generic creator's own colours (style.css)
if (!OWN) { document.title = "Midnight Mint"; rememberCollection("botc"); }   // and it's where the front page's "carry on" leads   // Clocktower keeps its name (the page's own title is Tesserae Faber's)
const TEAM_ORDER: Team[] = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric", "info"];
const TEAM_PLURAL: Record<string, Record<string, string>> = {
  es: { townsfolk: "Aldeanos", outsider: "Forasteros", minion: "Esbirros", demon: "Demonios", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos", info: "Fichas de información" },
  en: { townsfolk: "Townsfolk", outsider: "Outsiders", minion: "Minions", demon: "Demons", traveller: "Travellers", fabled: "Fabled", loric: "Loric", info: "Info tokens" },
};
const PLATE_GROUP: Record<Team, string> = { townsfolk: "good", outsider: "good", minion: "evil", demon: "evil", traveller: "traveller", fabled: "fabled", loric: "loric", info: "info" };
const PLATE_LABEL: Record<string, Record<string, string>> = {
  es: { good: "Aldeanos y forasteros", evil: "Esbirros y demonios", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos", info: "Fichas de información" },
  en: { good: "Townsfolk & outsiders", evil: "Minions & demons", traveller: "Travellers", fabled: "Fabled", loric: "Loric", info: "Info tokens" },
};

/** The token the workshop shows: its key, its character and, for a reminder, which one. */
interface Selection { key: string; role: Role; reminder: number | null }
/** A design saved in this browser before styles (one per character): it became a style of its type. */
interface SavedDesign { id: string; roleId: string; text: string | null; fem: boolean; spec: TokenSpec; title: string; updatedAt: number; shape?: TokenShape }
/** The workshop's tabs: level 1, the token's parts ("body" is the coin, ring or card itself); level 2, a face's. */
type Part = "front" | "back" | "body" | "magnet";
type FaceTab = "layout" | "text" | "icon" | "frame" | "pattern";
type Side = "front" | "back";

/** A token being made (own collections): a draft of it, the shape chosen, its catalogs. */
interface Creating { draft: OwnToken; shape: TokenShape; cats: string[] }

const state: {
  user: User | null; lib: Library | null;
  edition: string; team: string; sel: Selection | null;
  /** The open part of each type, and the open tab of each face. */
  part: Record<TokenShape, Part>; faceTab: Record<Side, FaceTab>;
  /** A part asked to be raised while the other face has raised parts: the question is shown. */
  reliefAsk: { side: Side; part: ReliefPart } | null;
  /** The 3D view's side ("back" shows the strip's coins from behind too). */
  view: string;
  /** What each token has of its own (see loadDesigns). */
  overrides: Map<string, TokenOverride>;
  /** A line under the design for a moment: what just happened to it ("Back to its default"). */
  flash: string;
  /** The token whose content is open (its panel), and the one being made. */
  editing: string | null; creating: Creating | null;
  /** A closed collection's token: what it says is open in the design step. */
  saysOpen: boolean;
  step: number; pick: Map<string, number>;
  /** The characters the sheet shows, and the token the workshop built. */
  shown?: Role[]; token?: Token;
} = {
  user: null, lib: null,
  edition: "all", team: "all",   // the sheet opens on every character
  sel: null,              // { key, role, reminder: index | null }
  part: { coin: "front", ring: "front", card: "front" }, faceTab: { front: "text", back: "layout" },
  reliefAsk: null, view: "angle",
  overrides: new Map(),   // read by loadDesigns once the tokens are known
  flash: "",
  editing: null, creating: null, saysOpen: false,
  step: 1,
  pick: new Map(),         // token key ("c:imp", "r:imp:0") -> copies
};
/** The collection this page shows (Tesserae Faber); empty, and unused, in Clocktower. */
let coll: Collection = (OWN && loadCollection()) || { name: "", types: [], groups: [], tokens: [], sections: [] };
/** The collection open is one of the app's own (Clocktower at /botc, or one at /c/<id>): read-only, with "Make a copy" instead. */
const BUILT = OWN ? (OWN_ID ? builtIn(OWN_ID) : undefined) : builtIn("botc");
const READONLY = OWN && !!BUILT;
if (BUILT) document.documentElement.dataset.builtin = BUILT.id;   // its menu offers a copy
if (READONLY) document.documentElement.dataset.readonly = "";   // no editing (Clocktower at /botc keeps its scripts)
// its name, logo, colours and loading line from the start: the loading screen shows them while its file is read
if (READONLY && BUILT) coll = { ...coll, name: BUILT.name, ...(BUILT.theme ? { theme: BUILT.theme } : {}), ...(BUILT.logo ? { brand: { logo: BUILT.logo } } : {}), ...(BUILT.loader ? { loader: BUILT.loader } : {}) };
if (OWN && OWN_ID) { applyOwnTheme(); applyOwnBrand(); keepGateLook(); }   // before the loading screen shows: it wears the collection's colours and mark too
/**
 * The loading screen as this collection wears it (colours, logo, name, line), kept for the next
 * visit: index.html shows it before the app's code has even loaded (it can take a moment, fetched
 * fresh from the network), instead of a screen that knows nothing of the collection.
 */
function keepGateLook() {
  try {
    const root = document.documentElement, vars: Record<string, string> = {};
    for (const k of ["--velvet", "--velvet-mid", "--velvet-deep", "--brass", "--bone", "--dust", "--seam", "--glow", "--display"]) { const v = root.style.getPropertyValue(k); if (v) vars[k] = v; }
    const logo = coll.brand?.logo && coll.brand.logo.length < 30000 ? coll.brand.logo : APP_LOGO;   // a big uploaded logo isn't worth keeping twice
    const lang = uiLang();
    localStorage.setItem(`midnight-mint-gate:${location.pathname}`, JSON.stringify({
      theme: root.dataset.theme ?? "", vars, logo,
      name: nameIn(coll.brand?.title, lang) || nameIn(coll.name, lang),
      title: coll.loader?.text ? nameIn(coll.loader.text, lang) : t("gate.opening"),
      footer: coll.loader?.footer ? nameIn(coll.loader.footer, lang) : "",
    }));
  } catch { /* storage unavailable or full: the next visit shows the plain screen */ }
}

// After a deploy, a page opened earlier may ask for code files that no longer
// exist (their names change with each version). Reload once to get the new ones.
//
// The service worker (vite.config.js) keeps the app's files. When a new version takes over, a page that
// holds nothing of yours mid-way (the front page, the list of collections) reloads into it at once; a
// collection, where you may be designing, offers to reload instead.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const hadOne = !!navigator.serviceWorker.controller;   // the first install brings nothing new
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadOne) return;
    if (OWN && OWN_VIEW !== "collection") { location.reload(); return; }
    const b = document.createElement("button");
    b.type = "button"; b.className = "update-note"; b.textContent = t("app.updated");
    b.onclick = () => location.reload();
    document.body.append(b);
  });
}
window.addEventListener("vite:preloadError", (e) => {
  if (sessionStorage.getItem("mm-reloaded")) return;   // don't loop if it really is broken
  e.preventDefault();
  sessionStorage.setItem("mm-reloaded", "1");
  location.reload();
});
setTimeout(() => sessionStorage.removeItem("mm-reloaded"), 10000);

// The 3D preview loads on its own (WebGL and camera controls), so the sheet doesn't wait for
// it. Until it's ready, calls are remembered and replayed: the latest token, view and X-ray.
/** The calls the app makes to the preview, with their arguments. */
type ViewerCalls = { setToken: [Token]; setXray: [boolean]; setView: [ViewKind] };
let viewer: Viewer | null = null;
const viewerWaiting: { [M in keyof ViewerCalls]?: ViewerCalls[M] } = {};
const view3d = <M extends keyof ViewerCalls>(method: M, ...args: ViewerCalls[M]) => {
  if (viewer) (viewer[method] as (...a: ViewerCalls[M]) => void)(...args); else viewerWaiting[method] = args;
};
function loadViewer() {
  import("./engine/viewer.ts").then(({ createViewer }) => {
    viewer = createViewer($<HTMLCanvasElement>("#view"));
    view3d("setView", "angle");
    for (const m of ["setToken", "setXray", "setView"] as const) if (viewerWaiting[m]) (viewer[m] as (...a: unknown[]) => void)(...viewerWaiting[m]);
  }).catch((err) => console.error("3D preview failed to load", err));
}

/** The mark each ring separator pill shows before its name. */
const SEPARATOR_MARKS: Record<string, string> = { dot: "• ", diamond: "◆ ", star: "★ ", none: "" };
/** Filament colours offered for the coin, frame and back (all of them print on the A1). */
const COLOUR_CHOICES = ["Black", "White", "Gold", "Silver", "Bronze", "Blue", "Red", "Purple", "Yellow", "Green"]
  .map((name) => ({ id: name.toLowerCase(), hex: FILAMENT_SLOTS.find((f) => f.name === name)!.hex }));
let gateState: (() => GateConfig) | null = null;

/**
 * The designs the collection comes with, per shape (its styles, in its file): read-only, the first
 * of a shape the one its tokens use unless you choose another. Clocktower's are its own; a
 * collection's come in its file, else Basic. What "c:<id>" means (hidden ones too); the ones it
 * offers as its own are collDesigns, the app's (appDesigns) are offered after them in every one.
 */
const startingStyles = (shape: TokenShape): StyleDef[] => (OWN ? stylesOf(coll, shape) : BOTC_STYLES[shape]);
const collDesigns = (shape: TokenShape): StyleDef[] => ownStylesOf({ styles: OWN ? coll.styles : BOTC_STYLES }, shape);
/** Every style "c:<id>" can be here: the collection's, then the app's under the ids it hasn't (the ones that were collections' once). */
const knownStyles = (shape: TokenShape): StyleDef[] => knownStylesOf({ styles: OWN ? coll.styles : BOTC_STYLES }, shape);
/**
 * One of them by id. The templates every collection was offered before were Clocktower's styles,
 * under the same ids (now its own and the app's): a style named after one keeps that one's name.
 */
const startingStyle = (shape: TokenShape, id: string | undefined): StyleDef | undefined =>
  id == null ? undefined : knownStyles(shape).find((d) => d.id === id) ?? BOTC_STYLES[shape].find((d) => d.id === id);
const defName = (d: StyleDef) => nameIn(d.name, uiLang());
/** Comparing an old spec with a collection's style leaves these alone: the magnet is chosen in its own tab, a ring's base is the miniatures'. */
const STYLE_KEEPS = new Set(["lang", "customSvg", "magnet", "magnetSize", "ringBase"]);
/** A collection's style as a whole spec (what it leaves out, the default's), named after it. */
const defSpec = (d: StyleDef): TokenSpec => {
  const spec = structuredClone(d.spec);
  return { ...structuredClone(DEFAULT_SPEC), ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, preset: d.id } as TokenSpec;
};

/**
 * The set's design per type, as kept before styles. The coin's is the one the set had before designs
 * were kept per type; a ring's and a card's, when none was kept, a copy of it (what they printed
 * from, as their shape prints it).
 */
function legacySpecs(): Record<TokenShape, TokenSpec> {
  // without one kept, the collection's first coin style (what the set's design was by default: Edition)
  const coin = upgradeSpec(loadJSON<TokenSpec | null>(STYLE_KEY, null)) || defSpec(startingStyles("coin")[0]);
  const specs = { coin } as Record<TokenShape, TokenSpec>;
  for (const shape of ["ring", "card"] as const) specs[shape] = upgradeSpec(loadJSON<TokenSpec | null>(STYLE_KEYS[shape], null)) ?? structuredClone(coin);
  return specs;
}
function loadJSON<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) as string) ?? fallback; } catch { return fallback; } }
function storeJSON(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
/** A saved design as the app now has it: an old window's "relief" finish becomes its icon raised. */
function upgradeSpec<T extends TokenSpec | null | undefined>(spec: T): T {   // a declaration: the state above uses it before this line runs
  return (spec && typeof spec === "object" ? normalizeSpec(spec) : spec) as T;
}

// ------------------------------------------------------------ looks, field by field
//
// A token's own changes are kept field by field over its design, so whatever else the design
// becomes still reaches it.

/** Spec fields that aren't the look: the language and icon are the token's; the rest only notes. */
const NOT_LOOK = new Set(["lang", "icon", "preset", "fromPreset", "windowFinish", "windowDepth", "colours"]);
/** A spec with every field, to compare two of them field by field. */
const filled = (s: SpecInput): TokenSpec => ({ ...DEFAULT_SPEC, ...s, colours: { ...DEFAULT_SPEC.colours, ...s.colours } }) as TokenSpec;
/** The same value, whatever order its keys were written in. */
function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)])) : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
/** The look fields where two specs differ: "frame", "backFace", "colours.front"… */
function lookDiff(a: SpecInput, b: SpecInput): string[] {
  const fa = filled(a) as unknown as Fields, fb = filled(b) as unknown as Fields, out: string[] = [];
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) if (!NOT_LOOK.has(k) && !sameValue(fa[k], fb[k])) out.push(k);
  const ca = fa.colours as Fields, cb = fb.colours as Fields;
  for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)])) if (ca[k] !== cb[k]) out.push(`colours.${k}`);
  return out;
}
/** Two looks that are the same, field by field. */
const sameLook = (a: SpecInput, b: SpecInput) => !lookDiff(a, b).length;
/**
 * What of a look prints on a shape: its fields filled in, but for what the shape hasn't
 * (SHAPE_FEATURES: a coin's ring base and mark between names; a ring's or card's magnet and back)
 * and what doesn't show (a magnet's size without a magnet, an uploaded back that isn't the back,
 * a back face's own look while the back is a design, how high relief stands with none raised).
 * Styles took such fields from the style they were made over (the magnet, the ring base, an
 * uploaded back: STYLE_KEEPS), so a collection's style kept that way differs from it only there.
 */
function printedLook(shape: TokenShape, spec: SpecInput): Fields {
  const f = SHAPE_FEATURES[shape], u = normalizeSpec(spec), s = filled(u) as unknown as Fields, c = { ...(s.colours as Fields) };
  for (const k of NOT_LOOK) delete s[k];
  if (!f.ringBase) delete s.ringBase;
  if (!f.separator) delete s.separator;
  if (!f.magnet) { delete s.magnet; delete s.magnetSize; } else if (s.magnet === "none") delete s.magnetSize;
  if (!f.back) { delete s.back; delete s.backMode; delete s.backFace; delete s.customSvg; delete c.back; }
  else {
    if (s.back !== "custom") delete s.customSvg;
    if (s.backMode !== "match" && s.backMode !== "own") delete s.backFace;
  }
  const raised: string[] = f.relief, relief = Object.fromEntries(Object.entries(reliefOf(u)).filter(([k]) => raised.includes(k)));
  s.relief = relief;
  const backRaised = (s.backMode === "match" || s.backMode === "own") && hasRelief(s.backFace as SpecInput | undefined);
  if (!Object.values(relief).some(Boolean) && !backRaised) delete s.reliefHeight;
  s.colours = c;
  return s;
}
/** Two looks that print the same on a shape (printedLook). */
const samePrint = (shape: TokenShape, a: SpecInput, b: SpecInput) => sameValue(printedLook(shape, a), printedLook(shape, b));
/**
 * One design in place of another changes nothing printed: they print the same, and so do the
 * tokens' own changes over each (a token's own back made an uploaded one, say, shows the design's).
 */
const printsAs = (shape: TokenShape, a: TokenSpec, b: TokenSpec, looks: LookChanges[]) =>
  samePrint(shape, a, b) && looks.every((l) => samePrint(shape, applyLook(a, l), applyLook(b, l)));
/** A look field of a spec ("frame", "colours.base"). */
const fieldOf = (s: SpecInput, f: string): unknown => (f.startsWith("colours.") ? (s.colours as Fields | undefined)?.[f.slice(8)] : (s as Fields)[f]);
/** Sets a look field on a spec; nothing (or null, but for the uploaded back) takes it out, so the default holds. */
function setField(s: TokenSpec, f: string, v: unknown) {
  if (f.startsWith("colours.")) { s.colours = { ...s.colours, [f.slice(8)]: v as ColourRef }; return; }
  if (v === undefined || (v === null && f !== "customSvg")) delete (s as unknown as Fields)[f];
  else (s as unknown as Fields)[f] = structuredClone(v);
}
/** A token's changes with one more field (null: the token hasn't the field its design has). */
function withLookField(look: LookChanges, f: string, v: unknown): LookChanges {
  if (f.startsWith("colours.")) return { ...look, colours: { ...look.colours, [f.slice(8)]: v as ColourRef } };
  return { ...look, [f]: v === undefined ? null : structuredClone(v) };
}
/** A token's changes without a field. */
function withoutLookField(look: LookChanges, f: string): LookChanges {
  const next = structuredClone(look);
  if (f.startsWith("colours.")) { if (next.colours) { delete next.colours[f.slice(8) as keyof SpecColours]; if (!Object.keys(next.colours).length) delete next.colours; } }
  else delete (next as Fields)[f];
  return next;
}
/** The fields a token's changes set. */
const lookFields = (look: LookChanges | undefined) => !look ? [] : [...Object.keys(look).filter((k) => k !== "colours"), ...Object.keys(look.colours ?? {}).map((c) => `colours.${c}`)];
/** A design's look with a token's changes over it. */
function applyLook(spec: TokenSpec, look: LookChanges | undefined): TokenSpec {
  if (!look) return spec;
  const s = structuredClone(spec);
  for (const f of lookFields(look)) setField(s, f, fieldOf(look as SpecInput, f));
  return s;
}
/** A token's changes as they differ from its design: those the design has anyway go. */
function prunedLook(spec: TokenSpec, look: LookChanges): LookChanges | undefined {
  const mine = filled(applyLook(spec, look)), theirs = filled(spec);
  let next = look;
  for (const f of lookFields(look)) if (sameValue(fieldOf(mine, f), fieldOf(theirs, f))) next = withoutLookField(next, f);
  return lookFields(next).length ? next : undefined;
}
/** A whole spec as changes over a design: what a token's own design was before styles. */
function lookFrom(style: TokenSpec, spec: TokenSpec): LookChanges {
  let look: LookChanges = {};
  for (const f of lookDiff(style, spec)) look = withLookField(look, f, fieldOf(spec, f));
  return look;
}

// ------------------------------------------------------------ designs
//
// A design is a named look for one shape (Edition, Steel, Fine ring…): everything a token's spec
// says but its content (its name, icon, other state, linked tokens, printed text). There are two
// kinds. The collection's own, which it comes with (startingStyles), can't be changed. Yours are made
// in the Taller and kept once in this browser for every collection and Clocktower (MY_DESIGNS_KEY):
// a colour that is the group's stays "team", so any of them fits any collection.
//
// Each collection gives each shape a default design: its own first, unless another was chosen for
// the whole collection (in Pick: DEFAULTS_KEY). A token uses its shape's default (a linked token,
// its character's design), or a design chosen for it; and it may have changes of its own over it,
// field by field. Those two are its overrides (OVERRIDES2_KEY, with its own text, icon…). A design
// is referred to as "c:<id>" (the collection's), "a:<id>" (the app's, offered in every collection)
// or "u:<id>" (yours). A "c:<id>" kept before the functional designs became the app's still means
// what it did: the collection's style of that id when it has it (a hidden one too: Draw Steel's old
// Legible), else the app's of that id (they kept their ids: Fast print, Parchment, the rings'…).
// One that is the app's (an id the collection hasn't, or a style of its that's the app's, appTwin)
// reads as "a:<id>": refOf, defaultRef and the rest give that, so the menus mark it.

/** A design as the menus and the editor see it, whichever kind it is. */
interface DesignEntry { ref: string; name: string; spec: TokenSpec; mine: boolean; help?: string }
/** Your designs, per shape: one library for every collection. */
let myDesigns: Record<TokenShape, MyDesign[]> = { coin: [], ring: [], card: [] };
/** The collection's default design per shape, where it isn't its own first one. */
let defaults: Partial<Record<TokenShape, string>> = {};
const collSpecs = new Map<string, TokenSpec>();
function collEntry(shape: TokenShape, d: StyleDef, ref = `c:${d.id}`): DesignEntry {
  const k = `${shape}:${ref}`;
  let spec = collSpecs.get(k);
  if (!spec) collSpecs.set(k, spec = defSpec(d));   // made once: tokens' looks are drawn from it often
  return { ref, name: defName(d), spec, mine: false, ...(d.help ? { help: nameIn(d.help, uiLang()) } : {}) };
}
const myEntry = (d: MyDesign): DesignEntry => ({ ref: `u:${d.id}`, name: d.name, spec: d.spec, mine: true });
/** A design by its reference; none when it's gone (one of yours deleted). Its ref is how it reads now ("c:" the app's: "a:"). */
function designOf(shape: TokenShape, ref: string | undefined): DesignEntry | undefined {
  if (ref?.startsWith("u:")) { const d = myDesigns[shape].find((x) => x.id === ref.slice(2)); return d && myEntry(d); }
  if (ref?.startsWith("a:")) { const d = appDesigns(shape).find((x) => x.id === ref.slice(2)); return d && collEntry(shape, d, ref); }
  if (ref?.startsWith("c:")) {
    const id = ref.slice(2), d = startingStyles(shape).find((x) => x.id === id);
    return d && !appTwin(shape, d) ? collEntry(shape, d) : designOf(shape, `a:${id}`);
  }
  return undefined;
}
/** The collection's own default for a shape: its first design ("Original design"). */
const originalRef = (shape: TokenShape) => designOf(shape, `c:${startingStyles(shape)[0].id}`)!.ref;
/** The collection's default for a shape: the one chosen for it, while it's there, else its own first. */
const defaultRef = (shape: TokenShape) => designOf(shape, defaults[shape])?.ref ?? originalRef(shape);
/** The design a token has by default: its shape's default; a linked token's, its character's. */
function inheritedRef(key: string, shape: TokenShape) {
  const char = key.startsWith("r:") ? state.overrides.get(`c:${roleIdOf(key)}`)?.style : undefined;
  return designOf(shape, char)?.ref ?? defaultRef(shape);
}
/** The design a token uses: one chosen for it, else the one it has by default. */
function refOf(key: string, shape = shapeOf(tokenRole(key))): string {
  if (TALLER) return taller.ref;
  return designOf(shape, state.overrides.get(key)?.style)?.ref ?? inheritedRef(key, shape);
}
const designFor = (key: string, shape = shapeOf(tokenRole(key))) => designOf(shape, refOf(key, shape))!;
/** A token's look: its design's, with its own changes. */
const lookOf = (key: string): TokenSpec => applyLook(designFor(key).spec, state.overrides.get(key)?.look);
/** The token has changes of its own to its design's look. */
const ownChanged = (key: string) => !!state.overrides.get(key)?.look;
/** The token has a design of its own or changes to it: an override of the collection's default. */
const designOverridden = (key: string) => { const o = state.overrides.get(key); return !!o?.look || (!!o?.style && !!designOf(shapeOf(tokenRole(key)), o.style)); };
/** Every token of a shape (characters and their linked tokens), the one being made apart. */
function tokensOf(shape: TokenShape): string[] {
  return state.lib!.roles.filter((r) => shapeOf(r) === shape && r.id !== state.creating?.draft.id)
    .flatMap((r) => [charKey(r), ...remindersOf(r).map((_, i) => remKey(r, i))]);
}
/** The shapes the collection's tokens come in, in the shapes' order. */
const shapesHere = () => SHAPES.filter((sh) => state.lib!.roles.some((r) => shapeOf(r) === sh && r.id !== state.creating?.draft.id));
function readMyDesigns(): Record<TokenShape, MyDesign[]> {
  const kept = loadJSON<Partial<Record<TokenShape, MyDesign[]>> | null>(MY_DESIGNS_KEY, null);
  const ok = (d: MyDesign | null) => !!d && typeof d.id === "string" && typeof d.name === "string" && !!d.spec && typeof d.spec === "object";
  return Object.fromEntries(SHAPES.map((sh) => [sh, Array.isArray(kept?.[sh]) ? kept[sh]!.filter(ok).map((d) => ({ ...d, spec: upgradeSpec(d.spec) })) : []])) as Record<TokenShape, MyDesign[]>;
}
function storeMyDesigns() { storeJSON(MY_DESIGNS_KEY, myDesigns); }
function storeDefaults() { storeJSON(DEFAULTS_KEY, defaults); }
function storeOverrides() { storeJSON(OVERRIDES2_KEY, Object.fromEntries(state.overrides)); }
/** A name not yet among your designs of a shape: "Ivory", else "Ivory 2". */
function uniqueDesignName(shape: TokenShape, base: string, but?: MyDesign) {
  const taken = new Set(myDesigns[shape].filter((x) => x !== but).map((x) => x.name));
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
  return name;
}

/**
 * Your designs, the collection's defaults and each token's overrides, once the tokens are known (a
 * token's shape is its character's). Kept since designs were yours: read as they are. Else made,
 * once, from what was kept before, printing exactly as it did:
 *  - a collection's styles (49eeec0, or made from what was kept before them: keptStyles) each
 *    become a design: one of the collection's when it prints as one (adoptStyle), else one of yours (a copy
 *    already there is the same one; a name one of yours or the collection's already has gets the
 *    collection's after it);
 *  - each shape's default is what its first style became;
 *  - a token that used another style chooses what that one became, and keeps its own changes.
 * The old keys are left as they were.
 */
function loadDesigns() {
  myDesigns = readMyDesigns();
  const place = (v: TokenOverride): TokenOverride => ({ ...v, ...(v.icon ? { icon: placeGameIcon(v.icon) } : {}) });
  const kept = loadJSON<Record<string, TokenOverride> | null>(OVERRIDES2_KEY, null);
  if (kept) {
    defaults = loadJSON<Partial<Record<TokenShape, string>>>(DEFAULTS_KEY, {});
    state.overrides = new Map(Object.entries(kept).filter(([, v]) => v).map(([k, v]) => [k, place(v)]));
    return;
  }
  defaults = {}; state.overrides = new Map();
  const old = keptStyles(place);
  if (old) fromStyles(old.styles, old.overrides);
  storeMyDesigns(); storeDefaults(); storeOverrides();
}
/**
 * What a collection kept before designs were yours: its styles per shape and each token's own, as
 * 49eeec0 kept them; or made from what was kept before styles (each type's set design its shape's
 * first style, named after the collection's style it is; a token's own whole design its changes
 * over that, its text, feminine name and icon its content; each saved design a style of its type).
 * Nothing kept: a first visit.
 */
function keptStyles(place: (v: TokenOverride) => TokenOverride): { styles: Record<TokenShape, Style[]>; overrides: Map<string, TokenOverride> } | null {
  const kept = loadJSON<Record<TokenShape, Style[]> | null>(STYLES_KEY, null);
  if (kept && SHAPES.every((sh) => Array.isArray(kept[sh]) && kept[sh].length)) {
    return {
      styles: Object.fromEntries(SHAPES.map((sh) => [sh, kept[sh].map((x) => ({ ...x, spec: upgradeSpec(x.spec) }))])) as Record<TokenShape, Style[]>,
      overrides: new Map(Object.entries(loadJSON<Record<string, TokenOverride>>(TOKENS_KEY, {})).filter(([, v]) => v).map(([k, v]) => [k, place(v)])),
    };
  }
  let before = false;
  try { before = [...Object.values(STYLE_KEYS), OVERRIDES_KEY, DESIGNS_KEY].some((k) => localStorage.getItem(k) != null); } catch { /* storage unavailable */ }
  if (!before) return null;
  const specs = legacySpecs(), styles = {} as Record<TokenShape, Style[]>, overrides = new Map<string, TokenOverride>();
  for (const sh of SHAPES) {
    const { def, modified } = startedFrom(specs[sh], sh);
    styles[sh] = [{ id: `${sh}-1`, ...(def && !modified ? { tpl: def.id } : {}), spec: specs[sh] }];
  }
  for (const [k, v] of Object.entries(loadJSON<Record<string, TokenOverride>>(OVERRIDES_KEY, {}))) {
    if (!v) continue;
    const { spec, ...own } = place(v);
    if (spec) {
      const role = roleById(roleIdOf(k)), look = lookFrom(styles[role ? shapeOf(role) : "coin"][0].spec, upgradeSpec(spec));
      if (lookFields(look).length) own.look = look;
    }
    if (Object.keys(own).length) overrides.set(k, own);
  }
  for (const d of loadJSON<SavedDesign[]>(DESIGNS_KEY, []).filter((d) => d && d.roleId && d.spec)) {
    const role = roleById(d.roleId), shape = d.shape ?? (role ? shapeOf(role) : "coin");
    const { lang: _lang, ...spec } = upgradeSpec(d.spec);
    styles[shape].push({ id: newId("s"), name: d.title, spec: spec as TokenSpec });
  }
  return { styles, overrides };
}
/** The collection's name, after a design of yours that came from it whose name was taken. */
const collLabel = () => (OWN ? nameIn(coll.brand?.title, uiLang()) || nameIn(coll.name, uiLang()) : "Clocktower");
/** A collection's styles and its tokens' own, as designs, defaults and overrides (see loadDesigns). */
function fromStyles(styles: Record<TokenShape, Style[]>, overrides: Map<string, TokenOverride>) {
  const looks = [...overrides.values()].flatMap((v) => (v.look ? [v.look] : []));
  const refs = Object.fromEntries(SHAPES.map((sh) => [sh, new Map(styles[sh].map((st) => [st.id, adoptStyle(sh, st, looks)]))])) as Record<TokenShape, Map<string, string>>;
  for (const sh of SHAPES) { const first = refs[sh].get(styles[sh][0].id)!; if (designOf(sh, first)?.ref !== originalRef(sh)) defaults[sh] = first; }
  for (const [k, v] of overrides) {
    const own = { ...v }, role = roleById(roleIdOf(k));
    if (own.style != null) {
      // a style that's gone was its shape's first
      const shape = role ? shapeOf(role) : SHAPES.find((sh) => refs[sh].has(own.style!)) ?? "coin";
      own.style = refs[shape].get(own.style) ?? refs[shape].get(styles[shape][0].id);
    }
    state.overrides.set(k, own);
  }
  // a design chosen that the token has by default anyway isn't one of its own (characters first: their linked tokens take theirs)
  for (const k of [...state.overrides.keys()].sort((a, b) => Number(a.startsWith("r:")) - Number(b.startsWith("r:")))) {
    const own = state.overrides.get(k)!, role = roleById(roleIdOf(k));
    if (own.style && (!role || designOf(shapeOf(role), own.style)?.ref === inheritedRef(k, shapeOf(role)))) delete own.style;
    if (!Object.keys(own).length) state.overrides.delete(k);
  }
}
/**
 * A style kept by a collection, as a design: what it is (one of the collection's, unchanged), or one
 * of yours. Unchanged is as it prints, with the tokens' own changes over it (printsAs): a style made
 * from one of the collection's kept the magnet, ring base and uploaded back of the style it was made
 * over, which a coin with no magnet or ring doesn't print.
 */
function adoptStyle(shape: TokenShape, st: Style, looks: LookChanges[]): string {
  if (!st.name) {
    const list = knownStyles(shape), same = (x: StyleDef) => printsAs(shape, st.spec, defSpec(x), looks);
    const d = list.find((x) => x.id === st.tpl && same(x)) ?? list.find(same);
    if (d) return `c:${d.id}`;
  }
  const twin = myDesigns[shape].find((x) => printsAs(shape, st.spec, x.spec, looks));
  if (twin) return `u:${twin.id}`;
  const { lang: _lang, icon: _icon, ...spec } = structuredClone(st.spec);
  const base = styleName(st, shape), theirs = startingStyles(shape).map(defName);
  const name = uniqueDesignName(shape, myDesigns[shape].some((x) => x.name === base) || theirs.includes(base) ? `${base} (${collLabel()})` : base);
  const from = startingStyle(shape, st.spec.preset ?? st.spec.fromPreset ?? st.tpl);
  const d: MyDesign = { id: newId("d"), name, spec: spec as TokenSpec, ...(from ? { from: { name: defName(from), spec: defSpec(from) } } : {}) };
  myDesigns[shape].push(d);
  return `u:${d.id}`;
}
/** A style's name as it was shown: its own, else that of the collection's style it is, else "My style". */
const styleName = (st: Style, shape: TokenShape) => {
  const d = st.name ? undefined : startingStyle(shape, st.tpl);
  return st.name || (d ? defName(d) : t("style.mine"));
};

/** Set once tidyMyDesigns has gone through your designs. */
const TIDIED_KEY = "tesserae-styles-tidied-2";
/**
 * Once, for designs made from styles before adoptStyle compared them as they print: one of yours
 * that prints as one of a collection's own (Edition (Clocktower), Steel (Draw Steel)…) is that one
 * again wherever a collection that has it uses it, as its default or a token's design; a collection
 * that hasn't it keeps yours. One of yours that prints as one of a collection's and nothing uses any
 * more goes. Nothing prints differently (printsAs, with each collection's tokens' own changes).
 * Every collection kept in this browser, and Clocktower; done for good once each one's designs were
 * known (a collection that comes with the app, read from its file).
 */
async function tidyMyDesigns() {
  try { if (localStorage.getItem(TIDIED_KEY)) return; } catch { return; }
  const mine = readMyDesigns();
  const prefixes = new Set<string>();
  try { for (const k of Object.keys(localStorage)) { const m = k.match(/^(midnight-mint-.*)design-(?:defaults|tokens)$/); if (m) prefixes.add(m[1]); } } catch { return; }
  // each collection's own designs, per shape
  let known = true;
  const theirs = new Map<string, Record<TokenShape, StyleDef[]>>();
  for (const p of prefixes) {
    const id = p.match(/^midnight-mint-own-(.+)-$/)?.[1];
    if (p === "midnight-mint-") { theirs.set(p, Object.fromEntries(SHAPES.map((sh) => [sh, knownStylesOf({ styles: BOTC_STYLES }, sh)])) as Record<TokenShape, StyleDef[]>); continue; }
    if (!id) continue;
    let styles: CollectionStyles | undefined;
    if (builtIn(id)) { styles = await builtInStyles(id); if (!styles) { known = false; continue; } }
    else { const c = loadCollection(id); if (!c) continue; styles = c.styles; }
    theirs.set(p, Object.fromEntries(SHAPES.map((sh) => [sh, knownStylesOf({ styles }, sh)])) as Record<TokenShape, StyleDef[]>);
  }
  const shapeOfMine = (ref: string | undefined) => (ref?.startsWith("u:") ? SHAPES.find((sh) => mine[sh].some((d) => d.id === ref.slice(2))) : undefined);
  const specOfMine = (sh: TokenShape, ref: string) => mine[sh].find((d) => d.id === ref.slice(2))!.spec;
  for (const [p, ship] of theirs) {
    const defs = loadJSON<Partial<Record<TokenShape, string>>>(`${p}design-defaults`, {});
    const own = loadJSON<Record<string, TokenOverride>>(`${p}design-tokens`, {});
    const looks = Object.values(own).flatMap((o) => (o?.look ? [o.look] : []));
    // what one of yours is here: the collection's that prints the same, if it has one
    const asTheirs = (ref: string | undefined): string | undefined => {
      const sh = shapeOfMine(ref);
      const d = sh && ship[sh].find((x) => printsAs(sh, specOfMine(sh, ref!), defSpec(x), looks));
      return d ? `c:${d.id}` : undefined;
    };
    let changed = false;
    for (const sh of SHAPES) {
      const to = shapeOfMine(defs[sh]) === sh ? asTheirs(defs[sh]) : undefined;
      if (!to) continue;
      if (to === `c:${ship[sh][0].id}`) delete defs[sh]; else defs[sh] = to;   // its own first is the default anyway
      changed = true;
    }
    // a token's: and a design chosen that the token has by default anyway isn't one of its own
    // (characters first: their linked tokens take theirs)
    const valid = (sh: TokenShape, ref: string | undefined) => !!ref && (ref.startsWith("c:") ? ship[sh].some((x) => `c:${x.id}` === ref) : mine[sh].some((d) => `u:${d.id}` === ref));
    const byDefault = (k: string, sh: TokenShape) => {
      const char = k.startsWith("r:") ? own[`c:${roleIdOf(k)}`]?.style : undefined;
      return valid(sh, char) ? char! : valid(sh, defs[sh]) ? defs[sh]! : `c:${ship[sh][0].id}`;
    };
    for (const k of Object.keys(own).sort((a, b) => Number(a.startsWith("r:")) - Number(b.startsWith("r:")))) {
      const o = own[k], sh = shapeOfMine(o?.style), to = asTheirs(o?.style);
      if (!sh || !to) continue;
      o.style = to;
      if (to === byDefault(k, sh)) { delete o.style; if (!Object.keys(o).length) delete own[k]; }
      changed = true;
    }
    if (changed) { storeJSON(`${p}design-defaults`, defs); storeJSON(`${p}design-tokens`, own); }
  }
  // yours that print as one of a collection's, and nothing uses any more, go
  const used = new Set<string>();
  for (const p of prefixes) {
    for (const r of Object.values(loadJSON<Record<string, string>>(`${p}design-defaults`, {}))) used.add(r);
    for (const o of Object.values(loadJSON<Record<string, TokenOverride>>(`${p}design-tokens`, {}))) if (o?.style) used.add(o.style);
  }
  const all = [BOTC_STYLES, basicStyles(), Object.fromEntries(SHAPES.map((sh) => [sh, appDesigns(sh)])) as Record<TokenShape, StyleDef[]>, ...theirs.values()];
  let gone = false;
  for (const sh of SHAPES) {
    const keep = mine[sh].filter((d) => used.has(`u:${d.id}`) || !all.some((s) => s[sh].some((x) => printsAs(sh, d.spec, defSpec(x), []))));
    if (keep.length !== mine[sh].length) { mine[sh] = keep; gone = true; }
  }
  // then every copy left, as asked: one of yours that prints as a collection's own, or is named after
  // one with its collection's name after it ("Parchment (Draw Steel)"), goes even where it's used;
  // what used it takes its collection's default (or the token its design by default)
  const shipped = new Set(all.flatMap((st) => SHAPES.flatMap((sh) => (st[sh] ?? []).flatMap((x) => (typeof x.name === "string" ? [x.name] : Object.values(x.name ?? {}))))));
  const isCopy = (sh: TokenShape, d: MyDesign) => all.some((st) => (st[sh] ?? []).some((x) => printsAs(sh, d.spec, defSpec(x), [])))
    || (() => { const m = d.name.match(/^(.*) \(([^()]+)\)$/); return !!m && shipped.has(m[1]); })();
  const dropped = new Set<string>();
  for (const sh of SHAPES) {
    const keep = mine[sh].filter((d) => !isCopy(sh, d) || (dropped.add(`u:${d.id}`), false));
    if (keep.length !== mine[sh].length) { mine[sh] = keep; gone = true; }
  }
  if (dropped.size) for (const p of prefixes) {
    const defs = loadJSON<Partial<Record<TokenShape, string>>>(`${p}design-defaults`, {});
    const own = loadJSON<Record<string, TokenOverride>>(`${p}design-tokens`, {});
    for (const sh of SHAPES) if (defs[sh] && dropped.has(defs[sh]!)) delete defs[sh];
    for (const k of Object.keys(own)) { const o = own[k]; if (o?.style && dropped.has(o.style)) { delete o.style; if (!Object.keys(o).length) delete own[k]; } }
    storeJSON(`${p}design-defaults`, defs); storeJSON(`${p}design-tokens`, own);
  }
  if (gone) storeJSON(MY_DESIGNS_KEY, mine);
  if (known) storeJSON(TIDIED_KEY, 1);
}

// ------------------------------------------------------------ tokens: keys, text, style

const charKey = (role: Role) => `c:${role.id}`;
const remKey = (role: Role, i: number) => `r:${role.id}:${i}`;
/** Characters by team, then alphabetically by the name the token shows. */
// The token language is a translation id ("es-bumble3ee"); collation needs its language ("es").
const collators = new Map<string, Intl.Collator>();
const collator = (lang = langById(tokenLang()).lang) => collators.get(lang) ?? collators.set(lang, new Intl.Collator(lang, { sensitivity: "base" })).get(lang)!;
const byName = (a: Role, b: Role) => collator().compare(textFor(charKey(a), a, null), textFor(charKey(b), b, null));
const byTeamName = (a: Role, b: Role) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || byName(a, b);
/** Token keys in sheet order: team, name, the character before its reminders. */
const sortKeys = (keys: Iterable<string>) => [...keys].sort((a, b) => byTeamName(tokenRole(a), tokenRole(b)) || (tokenRem(a) ?? -1) - (tokenRem(b) ?? -1));
const remindersOf = (role: Role, lang = tokenLang()): string[] => role.reminders?.[lang] || role.reminders?.en || [];
/** The character's name in the token language, in its feminine form when the token asks for it. */
const charName = (role: Role, key = charKey(role), lang = tokenLang()) =>
  (state.overrides.get(key)?.fem && role.fem?.[lang]) || roleName(role, lang);

/** A character's own icon (on its token; its reminders share it), or undefined. */
const ownIcon = (roleId: string) => state.overrides.get(`c:${roleId}`)?.icon;
const roleIdOf = (key: string) => key.split(":")[1];
/** The design a token uses: its style's look with its own changes; reminders get the reminder layout. */
function specFor(key: string, isReminder: boolean): TokenSpec {
  const base = lookOf(key);
  const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours }, lang: tokenLang(), icon: ownIcon(roleIdOf(key)) };
  return isReminder ? reminderSpec(spec) : spec;
}
/**
 * A token as the catalog has it, for step 1 (Pick): the default design with the character's
 * own name and icon. Its style and own changes show in the queue and step 2.
 */
const catalogSpec = (isReminder: boolean): TokenSpec => (isReminder ? reminderSpec({ ...DEFAULT_SPEC, lang: tokenLang() }) : { ...DEFAULT_SPEC, lang: tokenLang() });
const catalogText = (role: Role, reminder: number | null) => (reminder != null ? remindersOf(role)[reminder] : roleName(role, tokenLang()));
/** The text printed on a token. */
function textFor(key: string, role: Role, reminder: number | null): string {
  const own = state.overrides.get(key)?.text;
  if (own != null && own !== "") return own;
  return reminder != null ? remindersOf(role)[reminder] : charName(role, key);
}
const filamentName = (slot: number) => t(`filament.${FILAMENT_SLOTS[slot].name}`);

// ------------------------------------------------------------ language

const CHEVRON = '<svg class="chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg class="check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The gate's language menu: the current flag, opening a list of every language. */
function renderLangMenus() {
  const cur = uiLanguage();
  for (const menu of $$("[data-lang-menu]")) {
    menu.innerHTML = `<summary aria-label="${esc(t("lang.group"))}: ${esc(cur.name)}" title="${esc(t("lang.group"))}">
      <img src="${cur.flag}" alt="" width="22" height="22"><span>${cur.code.toUpperCase()}</span>${CHEVRON}</summary>
      <ul class="lang-list" aria-label="${esc(t("lang.group"))}">${LANGUAGES.map((l) => `<li><button type="button" data-lang="${l.code}" lang="${l.code}" aria-current="${l.code === cur.code}">
        <img src="${l.flag}" alt="" width="22" height="22"><span>${esc(l.name)}</span>${l.code === cur.code ? CHECK : ""}</button></li>`).join("")}</ul>`;
  }
}
const uiLanguage = (code = uiLang()) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
function setLang(lang: string) {
  setUiLang(lang);
  renderLangMenus();
  renderLangButtons();
  if ($("#app").dataset.step === "taller") {   // the Taller has no sheet or spine: its own page, redrawn in the language
    if (!taller.from) $("#tallerBack b").textContent = t("own.homeTitle");
    document.title = `${t("taller.title")} · ${APP_NAME}`;
    buildChoices(); renderTaller();
  }
  else if (state.lib) { buildChoices(); renderAll(); renderQueue(); if ($<HTMLDialogElement>("#scriptInvite").open) renderInvite(); }
  else if (OWN && !$("#ownHome").hidden) void renderOwnHome();   // the collections page draws its covers in the language
  else if (gateState) gate(gateState());
  if ($<HTMLDialogElement>("#tlangDialog").open) drawLangDialog();
}
// Holding a token down on the sheet (a phone has no pointing) turns it over while held, to see its back
// or its other state; letting go turns it back, and that touch doesn't pick it.
let peek: { el: HTMLElement; timer: number; shown: boolean; x: number; y: number } | null = null;
/** The token a hold turns over: the row's own (anywhere on the row but its linked tokens and buttons). */
function peekTarget(target: EventTarget | null): HTMLElement | null {
  const el = target as Element | null;
  if (!el?.closest || el.closest(".rems, [data-turn], .cp, .own-pen")) return null;
  const row = el.closest("#rows .row");
  return row?.querySelector<HTMLElement>(":scope > .tok-w.backed, :scope > .tok-w.two") ?? null;
}
const PEEK_HINT_KEY = "tesserae-peek-hint-row";
function endPeek() {
  if (!peek) return;
  clearTimeout(peek.timer); peek.el.classList.remove("peeking");
  if (!peek.shown) peek = null;
}
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const w = peekTarget(e.target);
  if (!w) return;
  endPeek(); peek = null;
  peek = { el: w, shown: false, x: e.clientX, y: e.clientY, timer: window.setTimeout(() => {
    if (!peek) return;
    peek.shown = true; w.classList.add("peeking");
    navigator.vibrate?.(8);
  }, 380) };
}, { passive: true });
for (const ev of ["pointerup", "pointercancel"]) document.addEventListener(ev, endPeek);
// moving the finger (a scroll) before the hold lands isn't a hold
document.addEventListener("pointermove", (e) => { if (peek && !peek.shown && Math.hypot(e.clientX - peek.x, e.clientY - peek.y) > 10) { clearTimeout(peek.timer); peek = null; } }, { passive: true });
// the click that ends a hold isn't a pick
document.addEventListener("click", (e) => { if (peek?.shown) { e.stopPropagation(); e.preventDefault(); peek = null; } }, true);
document.addEventListener("contextmenu", (e) => { if (peekTarget(e.target)) e.preventDefault(); });
/** Once, on a touch screen with tokens that have a back on the sheet: how to see it. */
function peekHint() {
  if (!matchMedia("(hover: none)").matches || !$(".tok-w.backed, .tok-w.two")) return;
  try { if (localStorage.getItem(PEEK_HINT_KEY)) return; localStorage.setItem(PEEK_HINT_KEY, "1"); } catch { return; }
  toast(t("sheet.peekHint"));
}
// The ⇄ on a two-state token on the sheet turns it over (on a phone, where nothing hovers); it doesn't pick it.
document.addEventListener("click", (e) => {
  const b = hit(e, "[data-turn]"); if (!b) return;
  e.stopPropagation(); b.closest(".tok-w")?.classList.toggle("turned");
}, true);
document.addEventListener("click", (e) => {
  const pick = hit(e, "[data-lang-menu] [data-lang]");
  if (pick) { pick.closest("details")!.open = false; setLang(pick.dataset.lang!); return; }
  // Clicking anywhere else closes an open language menu.
  for (const m of $$<HTMLDetailsElement>("[data-lang-menu][open]")) if (!m.contains(e.target as Node)) m.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const m of $$<HTMLDetailsElement>("[data-lang-menu][open]")) { m.open = false; m.querySelector("summary")!.focus(); }
});

// ------------------------------------------------------------ token language

// The language printed on the tokens, apart from the interface language. Saved as "same" (follow the
// interface) or a translation's id; nothing saved is "same", which prints what the app always did for
// someone who never chose (Spanish → Rovortox's translation, English → English). A choice saved
// before "same" existed is a translation's id, so it stays as it was.
const SAME = "same";
function tokenLangChoice(): string {
  try { return localStorage.getItem(TOKEN_LANG_KEY) || SAME; } catch { return SAME; }
}
/**
 * "Same as the interface" in this collection: its first language in the interface's (Clocktower's
 * Spanish is Rovortox's, the first of its versions), or the collection's first when it has none.
 */
function sameAsInterface(): Translation {
  const ok = langOptions();
  return ok.find((x) => x.lang === uiLang()) ?? ok[0];
}
/** The token language in use: the one chosen when this collection has it, else "same as the interface". */
function tokenLang(): string {
  const choice = tokenLangChoice();
  return choice !== SAME && langOptions().some((x) => x.id === choice) ? choice : sameAsInterface().id;
}
/** What a choice in the dialog ("same" or an id) prints in. */
const resolveLang = (choice: string) => (choice === SAME ? sameAsInterface() : langById(choice));
/**
 * The languages the tokens can be printed in. Clocktower: every translation (Villacuervos's). A
 * collection of Tesserae Faber: only the ones its names come in; their translators only when it's
 * Clocktower content (a copy of it), where those translations came from.
 */
function langOptions(): Translation[] {
  if (!OWN) return TRANSLATIONS;
  const langs = coll.languages?.length ? coll.languages : ["es", "en"];
  const out = langs.map((id) => TRANSLATIONS.find((x) => x.id === id) ?? TRANSLATIONS.find((x) => x.lang === id) ?? { id, lang: id, name: id.toUpperCase(), flag: "/flags/en.svg" })
    .map((x) => (hasCcc(coll) ? x : { id: x.id, lang: x.lang, name: x.name, flag: x.flag }));
  return out.length ? out : [TRANSLATIONS[0]];
}
/**
 * Whether this page has a token language to choose: Clocktower, and a collection whose names come in
 * more than one. The front page and the collections page have no tokens, so only the interface.
 */
const hasTokenLangs = () => !OWN || (OWN_VIEW === "collection" && (coll.languages?.length ?? 0) > 1);
function langById(id: string | null) { const ok = langOptions(); return ok.find((x) => x.id === id) ?? ok[0]; }
function langGroups() {
  const out: { name: string; flag: string; items: Translation[] }[] = [];
  for (const x of langOptions()) { let g = out.find((l) => l.name === x.name); if (!g) out.push(g = { name: x.name, flag: x.flag, items: [] }); g.items.push(x); }
  return out;
}
/** The menu label for a translation: "Español · Rovortox" when its language has several. */
function isGrouped(x: Translation) { return langGroups().find((g) => g.name === x.name)!.items.length > 1; }
function tlName(x: Translation) { return x.version ? `${x.name} · ${x.version}` : x.name; }
function tlCredit(x: Translation) { return x.pack ? (x.by ? t("tlang.by", { by: x.by }) : t("tlang.community")) : t(OWN ? "tlang.collection" : "tlang.official"); }
/** What "Same as the interface" prints in now ("Now, English: this collection isn't in Español" when it can't follow). */
function sameNote() {
  const x = sameAsInterface();
  return x.lang === uiLang() ? t("tlang.sameNow", { name: tlName(x) }) : t("tlang.sameNone", { name: tlName(x), ui: uiLanguage().name });
}

/**
 * The language button at the top right (and on the front and collections pages): the tokens' flag,
 * with the interface's as a small badge when the two differ, and "Tokens in English" beside it on a
 * wide screen. Where there are no tokens to print, only the interface's flag.
 */
function renderLangButtons() {
  const ui = uiLanguage(), tokens = hasTokenLangs(), cur = langById(tokenLang());
  const badge = tokens && cur.lang !== ui.code;
  const tip = tokens ? t("lang.tip", { ui: ui.name, tok: tlName(cur) }) : t("lang.tipUi", { ui: ui.name });
  for (const btn of $$("[data-lang-open]")) {
    btn.classList.toggle("only-ui", !tokens);
    btn.innerHTML = `<span class="lb-flags"><img src="${tokens ? cur.flag : ui.flag}" alt="">${badge ? `<img class="lb-badge" src="${ui.flag}" alt="">` : ""}</span>`
      + (tokens ? `<span class="lb-text"><small>${esc(t("tlang.label"))}</small><b>${esc(tlName(cur))}</b></span>` : "");
    btn.title = tip; btn.setAttribute("aria-label", tip);
  }
}
function setTokenLang(choice: string) {
  try { localStorage.setItem(TOKEN_LANG_KEY, choice); } catch { /* no storage */ }
  renderLangButtons();
  if (state.lib) { renderAll(); renderQueue(); if ($<HTMLDialogElement>("#scriptInvite").open) renderInvite(); }
}

// The Language dialog, two tabs. Interface: a pick applies at once (the whole app and this dialog redraw
// in it); the right side shows a little of the app in the language pointed at. Tokens: languages on the
// left (one with several versions folds open), and on the right the selected character, its reminders
// and a few of the characters on screen, drawn in their styles in whichever language is picked or
// pointed at; applied with "Print in …". The tab last used opens again, the interface the first time.
// Where there are no tokens, only the interface, without tabs.
const tl = { pick: SAME, open: new Set<string>(), tab: "ui" as "ui" | "tok" };
function openLangDialog() {
  drawer(false);
  tl.pick = tokenLangChoice();
  tl.open = new Set(tl.pick === SAME ? [] : [langById(tl.pick).name]);
  if (!hasTokenLangs()) tl.tab = "ui";
  drawLangDialog();
  $<HTMLDialogElement>("#tlangDialog").showModal();
  const sel = $("#tlangList [aria-selected=true]");
  sel?.scrollIntoView({ block: "nearest" }); sel?.focus();
}
function drawLangDialog() {
  const tokens = hasTokenLangs(), ui = uiLanguage(), onTok = tokens && tl.tab === "tok";
  $("#tlangIntro").textContent = t(tokens ? "lang.intro" : "lang.note");
  const tabs = $("#tlangTabs");
  tabs.hidden = !tokens;
  tabs.innerHTML = tokens ? ([["ui", ui.flag, t("lang.tabUi")], ["tok", resolveLang(tl.pick).flag, t("lang.tabTokens")]] as const)
    .map(([id, flag, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${tl.tab === id}"><img src="${flag}" alt="">${esc(label)}</button>`).join("") : "";
  $("#tlangList").setAttribute("aria-label", t(onTok ? "lang.tabTokens" : "lang.tabUi"));
  if (onTok) drawTokenList(); else drawUiList();
  for (const [id, show] of [["#tlangCancel", onTok], ["#tlangUse", onTok], ["#tlangClose", !onTok]] as const) $(id).hidden = !show;
  if (onTok) $("#tlangUse").textContent = t("tlang.use", { name: tlName(resolveLang(tl.pick)) });
}
function drawUiList() {
  $("#tlangList").innerHTML = LANGUAGES.map((l) => `<button class="tl-item" type="button" role="option" aria-selected="${l.code === uiLang()}" data-ui="${l.code}" lang="${l.code}">
    <img src="${l.flag}" alt=""><b>${esc(l.name)}</b>${l.code === uiLang() ? '<i class="dot"></i>' : ""}</button>`).join("");
  drawUiStage(uiLang());
}
/** A little of the app (the steps, a sidebar entry, a title, the sidebar's foot) in an interface language. */
function drawUiStage(code: string) {
  const l = uiLanguage(code), s = (key: string) => esc(tIn(l.code, key));
  const title = OWN && OWN_VIEW !== "collection" ? s("own.homeTitle") : s("library.all");
  $("#tlangStage").innerHTML = `<img class="flag-bg" src="${l.flag}" alt="">
    <div class="ui-mini" lang="${l.code}" aria-hidden="true">
      <div class="um-steps"><b><i>1</i>${s("flow.step1")}</b><span><i>2</i>${s("flow.step2")}</span><span><i>3</i>${s("flow.step3")}</span></div>
      <div class="um-body"><div class="um-side"><span class="on">${s("library.all")}</span><small>${s("spine.editions")}</small><span class="um-foot">${s("guide.open")}<br>${s("about.link")}</span></div>
        <div class="um-main">${title}</div></div>
    </div>
    <div class="tl-card"><img src="${l.flag}" alt=""><span><b lang="${l.code}">${esc(l.name)}</b><small lang="${l.code}">${s("lang.note")}</small></span></div>`;
}
function drawTokenList() {
  const item = (x: Translation, label: string | undefined, sub: string) => `<button class="tl-item" type="button" role="option" aria-selected="${x.id === tl.pick}" data-id="${x.id}">
    ${isGrouped(x) ? "" : `<img src="${x.flag}" alt="">`}<b>${esc(label)}</b><small>${esc(sub)}</small>${x.id === tl.pick ? '<i class="dot"></i>' : ""}</button>`;
  const same = sameAsInterface();
  $("#tlangList").innerHTML = `<button class="tl-item tl-same" type="button" role="option" aria-selected="${tl.pick === SAME}" data-id="${SAME}">
      <span class="tl-both"><img src="${uiLanguage().flag}" alt=""><img src="${same.flag}" alt=""></span><b>${esc(t("tlang.same"))}</b><small>${esc(sameNote())}</small>${tl.pick === SAME ? '<i class="dot"></i>' : ""}</button>`
    + langGroups().map((g) => {
      if (g.items.length === 1) return item(g.items[0], g.name, tlCredit(g.items[0]));
      const open = tl.open.has(g.name), here = g.items.find((x) => x.id === tl.pick);
      return `<div class="tl-group" data-current="${!!here}">
      <button class="tl-item" type="button" aria-expanded="${open}" data-group="${esc(g.name)}"><img src="${g.flag}" alt="">
        <b>${esc(g.name)}</b><small>${esc(t("tlang.versions", { n: g.items.length }))}${here ? ` · ${esc(here.version)}` : ""}</small>${CHEVRON}</button>
      ${open ? `<div class="tl-versions" role="group" aria-label="${esc(g.name)}">${g.items.map((x) => item(x, x.version, tlCredit(x))).join("")}</div>` : ""}</div>`;
    }).join("");
  drawTokenLangStage(resolveLang(tl.pick).id);
}
function drawTokenLangStage(id: string) {
  if (!state.lib || !state.sel) return;
  const x = langById(id), hero = state.sel!.role;
  const pic = (role: Role, reminder: number | null = null) => {
    const key = reminder == null ? charKey(role) : remKey(role, reminder);
    const spec = { ...specFor(key, reminder != null), lang: id };
    const text = reminder == null ? charName(role, key, id) : remindersOf(role, id)[reminder];
    return { svg: tokenSvg(state.lib!, role, spec, { text }), text };
  };
  const others = (state.shown || []).filter((r) => r !== hero).slice(0, 3);
  const strip = [...remindersOf(hero, id).slice(0, 4 - Math.min(3, others.length)).map((_, i) => pic(hero, i)), ...others.map((r) => pic(r))];
  $("#tlangStage").innerHTML = `<img class="flag-bg" src="${x.flag}" alt="">
    <div class="tl-hero">${pic(hero).svg}</div>
    <div class="tl-strip">${strip.map((p) => `<span>${p.svg}${esc(p.text)}</span>`).join("")}</div>
    <div class="tl-card"><img src="${x.flag}" alt=""><span><b>${esc(tlName(x))}</b>
      <small>${esc(tlCredit(x))}${x.pack ? ` · <a href="${VILLACUERVOS_URL}" target="_blank" rel="noopener">Villacuervos</a>` : ""}${x.fem ? ` · ${esc(t("credits.feminine"))}` : ""}</small></span></div>`;
}
/** The stage for a list item: an interface language, a token language, or a group (its version in use, or its first). */
function previewItem(el: HTMLElement) {
  if (el.dataset.ui) return drawUiStage(el.dataset.ui);
  if (el.dataset.id) return drawTokenLangStage(resolveLang(el.dataset.id).id);
  const grp = langGroups().find((x) => x.name === el.dataset.group);
  if (grp) drawTokenLangStage((grp.items.find((x) => x.id === tl.pick) ?? grp.items[0]).id);
}
const previewCurrent = () => (tl.tab === "tok" && hasTokenLangs() ? drawTokenLangStage(resolveLang(tl.pick).id) : drawUiStage(uiLang()));
document.addEventListener("click", (e) => { if (hit(e, "[data-lang-open]")) openLangDialog(); });
$("#tlangTabs").onclick = (e) => {
  const tab = hit(e, "[data-tab]"); if (!tab) return;
  tl.tab = tab.dataset.tab as "ui" | "tok"; drawLangDialog();
  $(`#tlangTabs [data-tab="${tl.tab}"]`).focus();
};
$("#tlangList").onclick = (e) => {
  const u = hit(e, "[data-ui]"), g = hit(e, "[data-group]"), b = hit(e, "[data-id]");
  if (u) { setLang(u.dataset.ui!); $(`#tlangList [data-ui="${CSS.escape(uiLang())}"]`).focus(); return; }
  if (g) { const n = g.dataset.group!; tl.open.has(n) ? tl.open.delete(n) : tl.open.add(n); drawLangDialog(); $(`#tlangList [data-group="${CSS.escape(n)}"]`).focus(); return; }
  if (b) { tl.pick = b.dataset.id!; drawLangDialog(); $(`#tlangList [data-id="${CSS.escape(tl.pick)}"]`).focus(); }
};
// Pointing at a language previews it without choosing.
$("#tlangList").addEventListener("pointerover", (e) => { const el = hit(e, ".tl-item"); if (el) previewItem(el); });
$("#tlangList").addEventListener("pointerleave", previewCurrent);
$("#tlangList").addEventListener("keydown", (e) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const items = $$("#tlangList .tl-item"), i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
  items[next].focus();
  previewItem(items[next]);
});
$("#tlangCancel").onclick = $("#tlangClose").onclick = () => $<HTMLDialogElement>("#tlangDialog").close();
$("#tlangUse").onclick = () => { $<HTMLDialogElement>("#tlangDialog").close(); if (tl.pick !== tokenLangChoice()) setTokenLang(tl.pick); };
$("#tlangDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });   // backdrop
setLang(uiLang());
/** A click outside a dialog's box (on its backdrop) closes it; one on its own margin, inside, doesn't. */
function closeOnBackdrop(dlg: HTMLDialogElement) {
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
}
closeOnBackdrop($<HTMLDialogElement>("#credits"));

// ------------------------------------------------------------ gate

/** What the gate (the screen before the app) says, and the buttons it offers. */
interface GateAction { label: string; run: () => unknown }
interface GateConfig { title: string; text?: string; action?: GateAction; secondary?: GateAction }

function gate(cfg: GateConfig | (() => GateConfig)) {
  const { title, text = "", action, secondary } = typeof cfg === "function" ? cfg() : cfg;
  $("#app").hidden = true;
  $("#gate").hidden = false;
  $("#gateTitle").textContent = title;
  $("#gateText").textContent = text;
  // The language switch only matters once there's something to read or do.
  $(".gate-langs").hidden = !action && !secondary;
  for (const [el, c] of [[$("#gateAction"), action], [$("#gateSecondary"), secondary]] as [HTMLButtonElement, GateAction | undefined][]) {
    el.hidden = !c;
    if (c) { el.textContent = c.label; el.onclick = c.run; el.disabled = false; }
  }
}
function showGate(make: () => GateConfig) { gateState = make; gate(make()); }

// Anyone can use the app without signing in. Only the admin signs in (to upload the
// library); the sign-in button shows when the page is opened with ?admin.
const ADMIN_ENTRY = new URLSearchParams(location.search).has("admin");
const adminSignIn = () => signIn().catch((e) => { if (e.code !== "auth/popup-closed-by-user") $("#gateText").textContent = t("gate.signInFailed", { message: e.message }); });

async function boot() {
  if (handingOver) return;   // handoff.ts is writing what came from the old address, then reloads: start nothing yet
  showGate(() => ({ title: OWN && coll.loader?.text ? nameIn(coll.loader.text, uiLang()) : t("gate.opening") }));
  if (OWN) {   // the collection's own line under the loading screen, and the community mark only if it asks for it
    $(".gate-card .ccc").hidden = !hasCcc(coll) && !coll.loader?.footer;   // the community-made line; the mark itself is in About
    if (coll.loader?.footer) $("#gateCcc").textContent = nameIn(coll.loader.footer, uiLang());
  }
  try {
    // a collection with an app of its own (Clocktower): there, at its one address
    if (OWN && OWN_ID) { const own = (await builtInCollections()).find((b) => b.id === OWN_ID && b.href); if (own) { location.replace(own.href! + location.hash); return; } }
    // a collection that comes with the app: read from its file, every time (it isn't kept here)
    if (READONLY) { const c = await readBuiltIn(OWN_ID!); if (c) { coll = c; applyOwnTheme(); applyOwnBrand(); } }
    await tidyMyDesigns().catch((err) => console.error("tidyMyDesigns", err));   // once: your designs that are a collection's own, that one again (never in the way of opening)
    if (TALLER) { await openTaller(); return; }   // the Taller: designs, for every collection
    if (OWN && OWN_VIEW === "home") { renderOwnLanding(); return; }   // the front page
    if (OWN && (!OWN_ID || !coll.tokens.length)) { renderOwnHome(); return; }   // the list (or a collection that isn't there)
    if (OWN) rememberCollection(OWN_ID!);
    if (OWN) {   // your own collection: no library to fetch
      applyGroups();
      state.lib = await loadLibrary(collectionRoles(coll, uiLang()));
      gateState = null;
      startApp();
      return;
    }
    const roles = await loadRoles();
    const broken = !roles.length ? "empty" : roles.some((r) => !r.body) ? "oldLibrary" : null;
    if (broken) return libraryGate(broken);
    state.lib = await loadLibrary(roles);
    state.lib!.roles.push(...infoRoles());   // the grimoire's info tokens: cards, an edition of their own
    syncHomebrew();                          // your scripts' own characters
    gateState = null;
    startApp();
  } catch (err) {
    showGate(() => ({ title: t("gate.error.title"), text: t("gate.error.text", { message: (err as Error).message }), action: { label: t("gate.reload"), run: () => location.reload() } }));
  }
}
/** The library is missing or out of date: the admin can fix it, everyone else waits. */
function libraryGate(kind: string) {
  showGate(() => (isAdmin(state.user)
    ? { title: t(`gate.${kind}.title`), text: t(`gate.${kind}.text`), action: { label: t("gate.empty.open"), run: openAdmin }, secondary: { label: t("gate.signOut"), run: signOutUser } }
    : ADMIN_ENTRY
      ? { title: t("gate.settingUp.title"), text: t("gate.settingUp.text"), action: { label: t("gate.signIn"), run: adminSignIn } }
      : { title: t("gate.settingUp.title"), text: t("gate.settingUp.text") }));
}

let firstAuth = true;
onUser(async (user) => {
  state.user = user;
  if (user && !isAdmin(user)) {
    // An account from when the app needed sign-in: bring its saved designs into this browser, then sign out.
    await importAccountDesigns(user).catch(() => {});
    signOutUser();
    return;
  }
  if (firstAuth) { firstAuth = false; boot(); return; }
  if (state.lib) renderAccount();
  else boot();
});

// ------------------------------------------------------------ app

let started = false;
function startApp() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  renderAccount();
  if (!started) {
    started = true;
    loadViewer();
    wire();
  }
  const first = state.lib!.roles.find((r) => r.en === "Fortune Teller") || state.lib!.roles[0];
  if (OWN) syncOwnChrome();
  if (!state.sel) state.sel = { key: charKey(first), role: first, reminder: null };
  // back where you were: the same view and team filter, if it still exists
  const view = loadJSON<{ edition?: string; team?: unknown }>(VIEW_KEY, {});
  const known = (ed: string | undefined) => ed === "all" || (ed?.startsWith("k:") ? !!catalogOf(ed) : ed?.startsWith("t:") ? !!typeOfView(ed) : ed?.startsWith("s:") ? !!scriptOf(ed) : state.lib!.roles.some((r) => r.edition === ed));
  state.edition = known(view.edition) ? view.edition! : "all";
  state.team = typeof view.team === "string" ? view.team : "all";
  buildChoices();
  loadDesigns();
  state.pick = loadPicks();
  persistPicks();
  renderAll();
  goStep(1);
  // back from the Taller: where it was opened from (the design step, on the same token)
  const back = takeReturn();
  if (back?.step === 2 && state.pick.size) { if (back.sel && isPicked(back.sel)) selectToken(back.sel); goStep(2); }
  if (!OWN) { openSharedScript(); resumeHomebrew(); }
  if (!guide.wired) { guide.wired = true; wireGuide(); }
}

/** The account corner: the admin's menu when signed in, a sign-in button only on ?admin. */
function renderAccount() {
  const admin = isAdmin(state.user);
  $(".me").hidden = !admin;
  $("#adminSignIn").hidden = admin || !ADMIN_ENTRY;
  if (admin) { $<HTMLImageElement>("#avatar").src = state.user!.photoURL || ""; $("#meEmail").textContent = state.user!.email; }
}

function renderAll() { renderSpine(); renderSheet(); renderWorkshop(); }

// ------------------------------------------------------------ spine

/** Every official character, in every edition: the "All characters" view. */
const allCharacters = () => state.lib!.roles.filter((r) => !isCard(r) && r.kind !== "homebrew");
function renderSpine() {
  if (OWN) return renderOwnSpine();
  const lang = uiLang();
  // above the editions: every character, and the grimoire's info tokens
  const all = allCharacters(), info = state.lib!.roles.filter((r) => r.edition === "grimoire");
  const entry = (ed: string, icon: string, name: string, sub: string, roles: Role[]) => `<button class="ed" type="button" data-ed="${ed}" aria-current="${state.edition === ed && !searchQuery()}">${uiIcon(icon)}
    <span>${esc(name)}<small>${esc(sub)}</small></span>${pickedBadge(roles)}</button>`;
  $("#library").innerHTML = entry("all", "two-coins", t("library.all"), t("ed.count", { c: all.length, r: all.reduce((n, r) => n + remindersOf(r).length, 0) }), all)
    + (info.length ? entry("grimoire", "id-card", EDITIONS.grimoire.name[lang], t("ed.countInfo", { n: info.length }), info) : "");
  $("#editions").innerHTML = EDITION_ORDER.filter((e) => e !== "grimoire" && state.lib!.roles.some((r) => r.edition === e)).map((e) => {
    const roles = state.lib!.roles.filter((r) => r.edition === e);
    const rem = roles.reduce((n, r) => n + remindersOf(r).length, 0);
    return `<button class="ed" type="button" data-ed="${e}" aria-current="${state.edition === e && !searchQuery()}">
      <span>${esc(EDITIONS[e].name[lang])}<small>${esc(e === "grimoire" ? t("ed.countInfo", { n: roles.length }) : t("ed.count", { c: roles.length, r: rem }))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("");
  const scripts = loadScripts();
  $("#scripts").innerHTML = scripts.map((sc) => {
    const { roles, missing } = scriptRoles(sc);
    return `<button class="ed" type="button" data-ed="s:${esc(sc.id)}" aria-current="${state.edition === `s:${sc.id}` && !searchQuery()}">
      <span>${esc(sc.name)}<small>${esc(t("script.count", { n: roles.length, m: missing.length }))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("") || `<p class="scripts-empty">${esc(t("script.empty"))} <button type="button" data-script-new>${esc(t("script.emptyAdd"))}</button></p>`;
}

/** How many tokens of these characters (with copies and reminders) are picked, as a badge. */
function pickedBadge(roles: Role[]) {
  const ids = new Set(roles.map((r) => r.id));
  let n = 0;
  for (const [k, c] of state.pick) if (ids.has(k.split(":")[1])) n += c;
  return n ? `<span class="got" aria-label="${esc(t("pick.badge", { n }))}">${n}</span>` : "";
}

// ------------------------------------------------------------ scripts

/** A saved script that renames or re-icons official characters (older scripts: by their names). */
const scriptHasOwn = (sc: Script | null) => !!sc && (sc.custom ?? Object.entries(sc.labels || {}).some(([id, label]) => {
  const role = state.lib!.roles.find((r) => scriptKey(r.id) === id || scriptKey(r.en) === id);
  return role && !isOwnName(role, label);
}));
/** The sheet shows an edition ("tb") or one of your scripts ("s:<id>"). */
const scriptOf = (view: string | null | undefined): Script | null => (view?.startsWith("s:") ? loadScripts().find((x) => x.id === view.slice(2)) ?? null : null);

/**
 * A script entry that defines a character of its own (homebrew): a name and a team, usually
 * an ability and a picture too. Official characters only ever come as an id, so a definition
 * is the script's own character even when it shares a name with an official one. Returns its
 * team (the Script Tool's "traveler" is our "traveller"), or null.
 */
function homebrewTeam(e: ScriptJsonEntry | string | null | undefined): Team | null {
  if (!e || typeof e !== "object" || e.id === "_meta" || typeof e.name !== "string" || !e.name.trim()) return null;
  const team = (e.team === "traveler" ? "traveller" : e.team) as Team;
  return team !== "info" && TEAMS[team] ? team : null;
}
/** A homebrew character's role id: its script and its own id ("hb_1a2b3c4d_engineer"). */
const homebrewId = (sc: { id?: string }, id: string) => `hb_${sc.id}_${id}`;
/** Where a character comes from: its edition, or for a homebrew one, its script's name. */
const editionName = (role: Role, lang: string) => EDITIONS[role.edition]?.name[lang] || (role.kind === "homebrew" ? scriptOf(role.edition)?.name : "") || "";
/** A script's homebrew characters as roles, drawn and printed like the library's. */
const homebrewRoles = (sc: Script): Role[] => (sc.homebrew || []).map((h) => ({
  id: homebrewId(sc, h.id), kind: "homebrew", en: h.name, es: h.name, names: {}, fem: {}, team: h.team,
  edition: `s:${sc.id}`, editionName: sc.name, reminders: { en: h.reminders || [] }, ability: h.ability,
  loading: !h.icon && !h.noIcon && !!(h.def?.image || h.def?.icon),   // its icon is on its way
  g: h.icon?.g ?? "translate(0 0) scale(1)", body: h.icon?.body ?? "",
}));
/** Puts every saved script's homebrew characters in the library, replacing the ones there. */
function syncHomebrew() {
  for (const r of state.lib!.roles) if (r.kind === "homebrew") state.lib!.icons.delete(r.id);
  const roles = state.lib!.roles.filter((r) => r.kind !== "homebrew");
  state.lib!.roles.splice(0, Infinity, ...roles, ...loadScripts().flatMap(homebrewRoles));
}
/** A script's characters that are in the library, and the ids that aren't (with their names, when known). */
function scriptRoles(sc: { id?: string; ids: string[]; labels?: Record<string, string>; homebrew?: HomebrewEntry[] }) {
  const byKey = new Map(state.lib!.roles.filter((r) => r.kind !== "homebrew").flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  const own = new Set((sc.homebrew || []).map((h) => h.id));
  const roles: Role[] = [], missing: string[] = [];
  for (const id of sc.ids) {
    const r = own.has(id) ? roleById(homebrewId(sc, id)) : byKey.get(id) || (sc.labels?.[id] && byKey.get(scriptKey(sc.labels[id])));
    if (r) { if (!roles.includes(r)) roles.push(r); } else missing.push(sc.labels?.[id] || id);
  }
  return { roles, missing };
}
/** True when a name is one of the character's own (in any language). */
const isOwnName = (role: Role, name: string) => [role.en, role.es, ...Object.values(role.names || {})].some((x) => x && scriptKey(x) === scriptKey(name));
/**
 * True when Script Tool JSON gives official characters names or icons of its own. Those show on
 * the tokens, but not on the character sheet or night order from the official site.
 */
function scriptCustomizes(data: unknown) {
  if (!Array.isArray(data)) return false;
  const byKey = new Map(state.lib!.roles.flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  return data.some((e) => {
    if (typeof e !== "object" || !e?.id || e.id === "_meta" || homebrewTeam(e)) return false;   // homebrew shows as it is
    const role = byKey.get(scriptKey(e.id)) || (e.name && byKey.get(scriptKey(e.name)));
    return !!role && (!!(e.icon || e.image) || (!!e.name && !isOwnName(role, e.name)));
  });
}
/**
 * Reads a script in the Script Tool's JSON format into a name, ids, and the characters it
 * defines itself (homebrew: kept with the script, their icons traced later by traceHomebrew).
 */
function readScriptJson(text: string): NewScript {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error(t("import.badJson")); }
  if (!Array.isArray(data)) throw new Error(t("import.notList"));
  let name: string | null = null;
  const ids: string[] = [], labels: Record<string, string> = {}, homebrew: HomebrewEntry[] = [];
  for (const entry of data) {
    const raw = typeof entry === "string" ? entry : entry?.id;
    if (!raw) continue;
    if (raw === "_meta") { name = entry.name || null; continue; }
    const id = scriptKey(raw);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    const team = homebrewTeam(entry);
    if (team) {
      const reminders = Array.isArray(entry.reminders) ? entry.reminders.filter((x: unknown) => typeof x === "string" && x.trim()) : [];
      homebrew.push({ id, name: entry.name.trim(), team, ability: typeof entry.ability === "string" ? entry.ability : "", reminders, def: entry });
    } else if (entry?.name) labels[id] = entry.name;
  }
  const script = { name: name?.trim() || t("script.unnamed"), ids, labels, homebrew, custom: scriptCustomizes(data) };
  if (!homebrew.length && !scriptRoles(script).roles.length) throw new Error(t("import.noneKnown"));
  return script;
}
function keepScript(data: NewScript) {
  const { list, script } = saveScript(loadScripts(), data);
  storeScripts(list);
  syncHomebrew();
  goEdition(`s:${script.id}`);
  return script;
}
/**
 * Gives a script's homebrew characters the icons their entries bring: a game-icons.net link,
 * an SVG, or a picture traced into shapes. One at a time, the sheet redrawn as each lands.
 * Characters whose picture can't be read keep a name-only token. Returns { got, failed }.
 */
const tracing = new Set<string>();   // scripts whose icons are being prepared
async function traceHomebrew(scId: string, onProgress: (i: number, n: number) => void = () => {}) {
  if (tracing.has(scId)) return { got: 0, failed: 0 };
  tracing.add(scId);
  try { return await traceEach(scId, onProgress); } finally { tracing.delete(scId); }
}
/** A homebrew character still to get its icon, or whose picture was traced the old way. */
const needsIcon = (h: HomebrewEntry) => !h.noIcon && !!(h.def?.image || h.def?.icon) && (!h.icon || tracedBefore(h.icon));
/**
 * Icons left to prepare when the app was closed during an import, and pictures traced before
 * tracing improved: carry on in the background (a re-traced token keeps its icon meanwhile).
 */
function resumeHomebrew() {
  for (const sc of loadScripts()) if (sc.homebrew?.some(needsIcon)) traceHomebrew(sc.id);
}
async function traceEach(scId: string, onProgress: (i: number, n: number) => void) {
  const todo = (loadScripts().find((x) => x.id === scId)?.homebrew || []).filter(needsIcon);
  let got = 0, failed = 0;
  for (const [i, h] of todo.entries()) {
    onProgress(i, todo.length);
    const icon = await scriptEntryIcon(h.def).catch(() => null);
    const list = loadScripts(), own = list.find((x) => x.id === scId)?.homebrew?.find((x) => x.id === h.id);
    if (!own) return { got, failed };   // the script was deleted meanwhile
    if (icon) { own.icon = icon; got++; } else if (!own.icon) { own.noIcon = true; failed++; }   // a re-trace that fails keeps the old icon
    storeScripts(list);
    syncHomebrew(); scheduleSheet();
  }
  return { got, failed };
}
function openScriptDialog() {
  $<HTMLTextAreaElement>("#scriptDialogText").value = ""; $("#scriptDialogNote").textContent = ""; $("#scriptDialogNote").className = "hint";
  $("#scriptDialogWarn").hidden = true;
  drawer(false);
  $<HTMLDialogElement>("#scriptDialog").showModal();
}
/**
 * A script's own names for official characters ({"id": "gambler", "name": "Sondeainfiernos"})
 * become those tokens' printed text, unless you've already given them one. A name that's just
 * the character's own (in any language) only helps find it, so it's left alone. Returns how
 * many tokens got a name.
 */
function applyScriptNames(script: Pick<Script, "labels">) {
  const byKey = new Map(state.lib!.roles.flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  let n = 0;
  for (const [id, label] of Object.entries(script.labels || {})) {
    const role = byKey.get(id);
    if (!role || isOwnName(role, label)) continue;
    const key = charKey(role), own: TokenOverride = state.overrides.get(key) ?? {};
    if (own.text) continue;
    state.overrides.set(key, { ...own, text: label });
    n++;
  }
  if (n) { storeOverrides(); scheduleSheet(); }
  return n;
}
/**
 * A script's icons for official characters (its "image": a game-icons.net link, an SVG, or a
 * picture to trace; or our older "icon": "author/name") become those characters' own icons,
 * unless they already have one. Returns how many did; icons that can't be read are skipped.
 */
async function applyScriptIcons(text: string) {
  let data: unknown; try { data = JSON.parse(text); } catch { return 0; }
  const byKey = new Map(state.lib!.roles.flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  let n = 0;
  for (const entry of Array.isArray(data) ? data : []) {
    if (typeof entry !== "object" || !entry?.id || entry.id === "_meta" || (!entry.icon && !entry.image) || homebrewTeam(entry)) continue;
    const role = byKey.get(scriptKey(entry.id)) || (entry.name && byKey.get(scriptKey(entry.name)));
    if (!role || ownIcon(role.id)) continue;
    try {
      const icon = await scriptEntryIcon(entry);
      if (!icon) continue;
      const key = charKey(role);
      state.overrides.set(key, { ...(state.overrides.get(key) || {}), icon });
      n++;
    } catch { /* not an SVG we can print, or not reachable: keep the character's icon */ }
  }
  if (n) { storeOverrides(); scheduleSheet(); }
  return n;
}
/**
 * The script as Script Tool JSON, with the names and icons you've given its characters. Its
 * homebrew characters go out as they came in, with your name and icon for them.
 */
function scriptJsonWithOwn(sc: Script) {
  const { roles } = scriptRoles(sc);
  const byKey = new Map(roles.filter((r) => r.kind !== "homebrew").flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  const entries = sc.ids.map((id) => {
    const h = sc.homebrew?.find((x) => x.id === id);
    if (h) {
      const own = state.overrides.get(`c:${homebrewId(sc, id)}`);
      const def: ScriptJsonEntry = { ...(h.def || { id: h.id, name: h.name, team: h.team, ability: h.ability, reminders: h.reminders }) };
      if (own?.text) def.name = own.text;
      if (own?.icon) { delete def.icon; Object.assign(def, iconForScript(own.icon)); }
      return def;
    }
    const r = byKey.get(id) || (sc.labels?.[id] && byKey.get(scriptKey(sc.labels[id])));
    const own = r ? state.overrides.get(charKey(r)) : undefined;
    if (!own?.text && !own?.icon) return sc.labels?.[id] ? { id, name: sc.labels[id] } : id;
    return { id, ...(own.text ? { name: own.text } : {}), ...(own.icon ? iconForScript(own.icon) : {}) };
  });
  return JSON.stringify([{ id: "_meta", name: sc.name }, ...entries], null, 2);
}
async function saveFromDialog(text: string) {
  try {
    const script = keepScript(readScriptJson(text));
    const named = applyScriptNames(script);
    $<HTMLDialogElement>("#scriptDialog").close();
    $("#scriptNote").textContent = t("script.saved", { name: script.name }) + (named ? ` ${t("script.named", { n: named })}` : "");
    const iconed = await applyScriptIcons(text);
    if (iconed) $("#scriptNote").textContent += ` ${t("script.iconed", { n: iconed })}`;
    if (script.homebrew?.length) {
      const said = $("#scriptNote").textContent, show = (x: string) => { if (scriptOf(state.edition)?.id === script.id) $("#scriptNote").textContent = `${said} ${x}`; };
      show(t("script.homebrew", { n: script.homebrew.length }));
      const { got, failed } = await traceHomebrew(script.id, (i, n) => show(t("script.tracing", { i: i + 1, n })));
      show([t("script.homebrew", { n: script.homebrew.length }), got ? t("script.traced", { n: got }) : "", failed ? t("script.untraced", { n: failed }) : ""].filter(Boolean).join(" "));
    }
  } catch (err) {
    $("#scriptDialogNote").className = "hint warn";
    $("#scriptDialogNote").textContent = t("import.failed", { message: (err as Error).message });
  }
}
/** A link with a script in it (#s=…): show what it holds and offer to keep it. */
function openSharedScript() {
  const shared = readLink(location.hash);
  if (!shared) return;
  history.replaceState(null, "", location.pathname + location.search);   // don't offer it again on reload
  invite = { name: shared.name || null, ids: shared.ids };
  if (!scriptRoles(invite).roles.length) { invite = null; return; }
  renderInvite();
  $("#scriptInviteSave").onclick = () => {
    $<HTMLDialogElement>("#scriptInvite").close();
    const sc = keepScript({ ...invite!, name: invite!.name || t("script.unnamed") });
    $("#scriptNote").textContent = t("script.saved", { name: sc.name });
  };
  $<HTMLDialogElement>("#scriptInvite").showModal();
}
/** The shared-script prompt's text and tokens, in the current languages (redrawn when they change). */
let invite: { name: string | null; ids: string[] } | null = null;
function renderInvite() {
  if (!invite) return;
  const { roles, missing } = scriptRoles(invite);
  $("#scriptInviteText").textContent = t("script.inviteText", { name: invite.name || t("script.unnamed"), n: roles.length, m: missing.length });
  $("#scriptInviteTokens").innerHTML = roles.map((r) => `<span>${tokenSvg(state.lib!, r, { ...specFor(charKey(r), false), diameter: 45, back: "none" }, { text: charName(r) })}${esc(charName(r))}</span>`).join("");
}
async function shareScript() {
  const sc = scriptOf(state.edition);
  if (!sc) return;
  const link = scriptLink(sc, location.origin + location.pathname);
  const note = $("#scriptNote");
  // Phones get the system share sheet; elsewhere the link goes to the clipboard.
  if (PHONE.matches && (navigator as Partial<Navigator>).share) { try { await navigator.share({ title: sc.name, url: link }); return; } catch (err) { if ((err as Error).name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(link); note.textContent = t("script.copied"); }
  catch {
    note.innerHTML = `${esc(t("script.copyBy"))} <input class="text" type="text" readonly value="${esc(link)}">`;
    note.querySelector("input")!.select();
  }
}

function goEdition(ed: string | undefined) {
  if (!ed) return;
  state.edition = ed; state.team = "all"; $<HTMLInputElement>("#search").value = "";
  renderSpine(); renderSheet(); $("#sheet").scrollTo({ top: 0 });
}

// On a phone the sidebar is a drawer: closed, it is out of reach of the keyboard too.
const PHONE = matchMedia("(max-width: 900px)");
function drawer(open: boolean) {
  const spine = $("#spine");
  spine.classList.toggle("open", open);
  $("#scrim").classList.toggle("on", open);
  $("#drawerOpen").setAttribute("aria-expanded", String(open));
  spine.inert = PHONE.matches && !open;
  // preventScroll: while the drawer slides in, focusing would scroll the page to reach it
  if (open) $(".spine-scroll [aria-current=true]")?.focus({ preventScroll: true });
  else if (PHONE.matches && spine.contains(document.activeElement)) $("#drawerOpen").focus({ preventScroll: true });
}

// ------------------------------------------------------------ adding to the queue

/**
 * The "Add to queue" menu, for what the sheet shows (edition or script, team filter, search):
 * its characters, their reminders, or both. It only adds what's missing, so the order you
 * choose them in doesn't matter; removing is its own item at the end, with undo.
 */
function renderAddMenu() {
  const roles = state.shown || [], lang = uiLang();
  const cards = roles.length > 0 && roles.every(isCard);
  const who = state.team !== "all" && !searchQuery() ? TEAM_PLURAL[lang][state.team].toLowerCase() : t(cards ? "add.cardsWho" : "add.charsWho");
  const Who = who[0].toUpperCase() + who.slice(1);
  const missChars = roles.filter((r) => !isPicked(charKey(r))).length;
  const missRems = roles.flatMap((r) => remindersOf(r).map((_, i) => remKey(r, i))).filter((k) => !isPicked(k)).length;
  const hasRems = roles.some((r) => remindersOf(r).length);
  const inQueue = roles.some((r) => isPicked(charKey(r)) || remindersOf(r).some((_, i) => isPicked(remKey(r, i))));
  const item = (a: string, icon: string, title: string, sub: string, n: number | null, off: boolean) => `<button type="button" role="menuitem" data-a="${a}"${off ? " disabled" : ""}>${icon}<span>${esc(title)}<small>${esc(sub)}</small></span><b>${n == null ? "" : `+${n}`}</b></button>`;
  const PLUS = `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  const CROSS = `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  $("#addMenu").innerHTML =
    item("chars", uiIcon("two-coins"), hasRems ? t("add.chars", { who, Who }) : t("add.allOf", { who, Who }), missChars ? t("add.missing", { miss: missChars, n: roles.length }) : t("add.allIn"), missChars, !missChars)
    + (hasRems ? item("rems", uiIcon("stack"), t("add.rems"), missRems ? t("add.tokens", { n: missRems }) : t("add.allIn"), missRems, !missRems)
      + item("both", PLUS, t("add.both", { who, Who }), t("add.bothSub"), missChars + missRems, !missChars && !missRems) : "")
    + `<hr>` + item("none", CROSS, t("add.remove"), t("add.removeSub"), null, !inQueue).replace('data-a="none"', 'data-a="none" class="rm"');
}
function openAddMenu(on: boolean, focusFirst = false) {
  if (on) renderAddMenu();
  $("#addMenu").hidden = !on;
  $("#addBtn").setAttribute("aria-expanded", String(on));
  if (on && focusFirst) $("#addMenu button:not(:disabled)")?.focus();
}
/** One of the menu's choices, for everything shown. */
function addShown(how: string) {
  const roles = state.shown || [];
  const apply = () => {
    for (const r of roles) {
      const rems = remindersOf(r).map((_, i) => remKey(r, i));
      if (how === "none") { setPick(charKey(r), false); rems.forEach((k) => setPick(k, false)); continue; }
      if (how !== "rems") setPick(charKey(r), true);
      if (how !== "chars") rems.forEach((k) => setPick(k, true));
    }
  };
  if (how === "none") changePicks(apply, t("pick.cleared")); else { apply(); picksChanged(); }
}

// ------------------------------------------------------------ sheet

const searchQuery = () => fold($<HTMLInputElement>("#search").value.trim());

function renderSheet() {
  const lang = uiLang(), q = searchQuery();
  if (state.edition.startsWith("s:") && !scriptOf(state.edition)) state.edition = "all";   // a deleted script
  // the generic creator: a deleted catalog or type, or "all", shows the first type's entry
  if (OWN && !catalogOf(state.edition) && !typeOfView(state.edition)) state.edition = `t:${coll.types[0].id}`;
  const ed = state.edition, sc = scriptOf(ed), inScript = sc && scriptRoles(sc), cat = catalogOf(ed), ty = typeOfView(ed);
  const catOpen = !!cat && catalogsOf(coll).some(({ k, s: sec }) => k === cat && sec.open);
  // header
  $("#edTitle").textContent = q ? t("sheet.results", { q: $<HTMLInputElement>("#search").value.trim() }) : cat ? nameIn(cat.name, lang) : ty ? nameIn(ty.title, lang) : sc ? sc.name : ed === "all" ? t("library.all") : EDITIONS[ed].name[lang];
  // the generic creator's actions: new tokens in a type's entry or an open catalog; the open catalog itself
  $("#ownActions").hidden = !OWN || !!q || !(ty || catOpen);
  $("#ownCatRename").hidden = $("#ownCatDelete").hidden = $("#ownCatList").hidden = !catOpen;
  $("#edLead").textContent = q ? t("sheet.leadSearch")
    : OWN ? t(cat ? "own.leadCatalog" : "own.leadAll", { n: (cat ? cat.tokens.length : state.lib!.roles.filter((r) => typeOfToken(r.id) === ty?.id).length) })
    : sc ? t("script.lead", { n: inScript!.roles.length, eds: new Set(inScript!.roles.filter((r) => r.kind !== "homebrew").map((r) => r.edition)).size })
      + (inScript!.missing.length ? t("script.missing", { list: inScript!.missing.join(", ") }) : "")
    : ed === "all" ? t("library.allLead", { n: allCharacters().length })
    : t(`edition.lead.${ed}`);
  $("#scriptActions").hidden = !sc || !!q;
  $("#scriptCustomWarn").hidden = !scriptHasOwn(sc);
  if (sc && $("#scriptActions").dataset.for !== sc.id) {   // a different script: fresh buttons
    $("#scriptActions").dataset.for = sc.id;
    $("#scriptNote").textContent = "";
    $("#scriptDelete").dataset.confirm = ""; $("#scriptDelete").textContent = t("script.delete");
  }
  $("#scriptShare").textContent = t(PHONE.matches && (navigator as Partial<Navigator>).share ? "script.share" : "script.copy");

  // which characters
  let roles = q ? state.lib!.roles : cat ? cat.tokens.map(roleById).filter((r): r is Role => !!r) : ty ? state.lib!.roles.filter((r) => typeOfToken(r.id) === ty.id) : sc ? inScript!.roles : ed === "all" ? allCharacters() : state.lib!.roles.filter((r) => r.edition === ed);
  const teamsHere = TEAM_ORDER.filter((tm) => roles.some((r) => r.team === tm));
  if (state.team !== "all" && !teamsHere.includes(state.team as Team)) state.team = "all";
  storeJSON(VIEW_KEY, { edition: state.edition, team: state.team });   // where to come back to
  // each team: its icon in the team colour, and how many characters it has here
  $("#teamChips").innerHTML = ([["all", t("team.all"), roles.length], ...teamsHere.map((tm) => [tm, TEAM_PLURAL[lang][tm], roles.filter((r) => r.team === tm).length])] as [Team | "all", string, number][])
    .map(([id, label, n]) => `<button class="pill" type="button" data-team="${id}" aria-pressed="${state.team === id}"${id === "all" ? "" : ` style="--c: ${TEAMS[id].colour}"`}>${id === "all" ? "" : uiIcon(TEAM_ICONS[id])}<span class="lbl">${esc(label)}</span><small>${n}</small></button>`).join("");
  if (state.team !== "all") roles = roles.filter((r) => r.team === state.team);

  // search matches the name (English, Spanish, the token language or your own text) or any reminder text (yours too)
  const hits = new Map<string, Set<number>>();
  if (q) {
    roles = roles.filter((r) => {
      const remHits = remindersOf(r).map((text, i) => [text, r.reminders?.en?.[i], textFor(remKey(r, i), r, i)].some((s) => s && fold(s).includes(q)) ? i : -1).filter((i) => i >= 0);
      // a two-state token by its other state's name too
      const nameHit = [r.en, r.es, roleName(r, tokenLang()), r.fem?.[tokenLang()], textFor(charKey(r), r, null), r.flip?.en, r.flip?.es, r.flip?.names?.[tokenLang()]].some((s) => s && fold(s).includes(q));
      if (remHits.length) hits.set(r.id, new Set(remHits));
      return nameHit || remHits.length;
    });
  }

  // Pick everything shown: the characters on screen (edition, team filter, search), with or without reminders.
  state.shown = roles;
  // the design bar: only the shapes of the tokens on screen
  barShapes = SHAPES.filter((sh) => roles.some((r) => shapeOf(r) === sh));
  renderDesignBar();
  $("#addWrap").hidden = !roles.length;
  $("#addLabel").textContent = state.team !== "all" && !q ? t("add.buttonTeam", { who: TEAM_PLURAL[lang][state.team].toLowerCase() }) : t("add.button");
  if (!$("#addMenu").hidden) renderAddMenu();

  if (!roles.length) { $("#rows").innerHTML = `<p class="empty">${esc(t(OWN && !q ? "own.empty" : "sheet.noResults"))}</p>`; return; }
  $("#rows").innerHTML = TEAM_ORDER.map((team) => {
    const list = roles.filter((r) => r.team === team).sort((a, b) => collator().compare(catalogText(a, null), catalogText(b, null)));
    if (!list.length) return "";
    const teamOn = list.every((r) => isPicked(charKey(r)));
    return `<div class="team-h"><i style="background:${TEAMS[team].colour}"></i><span>${esc(TEAM_PLURAL[lang][team])}</span><small>${list.length}</small>
      <button class="pick-team" type="button" data-pick-team="${team}">${esc(t(teamOn ? "pick.teamOff" : "pick.team"))}</button></div>` +
      list.map((r) => rowHtml(r, q, hits.get(r.id))).join("");
  }).join("");
  peekHint();
}

/** A bin icon: taking a token out. */
const BIN = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.5h6.6l.7-8.5M6.8 7v3.5M9.2 7v3.5"/></svg>`;
/** A click on a copy stepper: one more or one fewer. True when it was one. */
function onCopyStep(e: Event) {
  const more = hit(e, "[data-more]"), less = hit(e, "[data-less]");
  if (more) { const k = more.dataset.more!; state.pick.set(k, (state.pick.get(k) || 0) + 1); }
  else if (less) { const k = less.dataset.less!, n = state.pick.get(k) || 0; if (n > 1) state.pick.set(k, n - 1); else state.pick.delete(k); }
  else return false;
  picksChanged();
  return true;
}

/** A token with something of its own: a design chosen for it or changes to it, or its own text, feminine name or icon. */
const hasOwn = (key: string) => { const o = state.overrides.get(key); return !!o && !!(o.text || o.fem || o.icon) || designOverridden(key); };
/** The mark of a token with its own changes, and the way to them. Beside the token's button: a button can't hold buttons. */
function ownPen(key: string, name: string) {
  const label = esc(t("sheet.editOwn", { name }));
  return `<button class="own-pen" type="button" data-edit="${key}" title="${label}" aria-label="${label}">✎</button>`;
}

/**
 * A character in or out of the queue, with its reminders: they come and go with it (each
 * reminder chip still adds or drops itself on its own).
 */
/** The rows on the sheet showing their linked tokens: opened by hand, or by picking the token. */
const openRows = new Set<string>();
function toggleCharacter(key: string) {
  const role = tokenRole(key);
  if (!role) return;
  const on = !isPicked(key);
  setPick(key, on);
  if (on) openRows.add(key); else openRows.delete(key);   // picked, its row opens; dropped, it folds
  if (key.startsWith("c:")) remindersOf(role).forEach((_, i) => setPick(remKey(role, i), on));
  picksChanged();
}
function rowHtml(r: Role, q: string, remHits: Set<number> | undefined) {
  const lang = uiLang(), ck = charKey(r);
  // Each token is a toggle: picked tokens light up with a check, and show their copies.
  const thumb = (key: string, reminder: number | null) => {
    const isRem = reminder != null;
    const spec = { ...specFor(key, isRem), diameter: isRem ? reminderSpec(DEFAULT_SPEC).diameter : 45, back: "none" };
    const own = hasOwn(key), copies = state.pick.get(key) || 0;
    const name = textFor(key, r, reminder);
    // once picked, a small stepper adds copies; tapping the token still drops it
    // a homebrew token whose icon is still on its way pulses where the icon will go
    const loading = r.loading ? ` loading" style="--team: ${r.colour ?? TEAMS[r.team].colour}` : "";
    // a two-state token shows both its faces: the other state, smaller, peeking from behind the front
    // a two-state token looks like any other, with ⇄ on its edge; pointing at the row (or tapping the ⇄)
    // turns it over in place to show its other state
    const two = !isRem && !!r.flip;
    // a one-sided token whose design prints a back turns over too: pointed at, or held down on a phone
    const full = specFor(key, false);
    const backed = !isRem && !two && SHAPE_FEATURES[shapeOf(r)].back && full.back !== "none";
    const face = tokenSvg(state.lib!, r, spec, { text: name });
    const art = two || backed ? `<span class="tok-turn">${face}${tokenSvg(state.lib!, r, { ...full, diameter: 45 }, { side: "back" })}</span>` : face;
    return `<span class="tok-w${two ? " two" : backed ? " backed" : ""}"><button class="tok${isCard(r) ? " card" : ""}${loading}" type="button" data-pick="${key}" aria-pressed="${copies > 0}" aria-label="${esc(name)}">${art}<span class="ck" aria-hidden="true">✓</span></button>${two ? `<button class="turn-btn" type="button" data-turn title="${esc(t("sheet.turn"))}" aria-label="${esc(t("sheet.turn"))}">⇄</button>` : ""}${own ? ownPen(key, name) : ""}</span>`;
  };
  const rems = remindersOf(r);
  // a two-state token shows its front; its other state is named under it
  const flip = flipFace(r, catalogSpec(false));
  // Reminders as chips under the name: identical ones share a chip ("Correct ×5"), which adds or
  // removes all of them; it shows how many are in when only some are.
  const groups = new Map<string, number[]>();
  rems.forEach((_, i) => { const w = catalogText(r, i); groups.set(w, [...(groups.get(w) || []), i]); });
  const remSpec = (key: string) => ({ ...specFor(key, true), diameter: reminderSpec(DEFAULT_SPEC).diameter, back: "none" });
  const loadingTok = r.loading ? ` loading" style="--team: ${r.colour ?? TEAMS[r.team].colour}` : "";
  const chips = [...groups].map(([w, idx]) => {
    const keys = idx.map((i) => remKey(r, i)), on = keys.filter(isPicked).length, own = keys.find(hasOwn);
    const count = keys.length > 1 ? `<small>×${keys.length}${on && on < keys.length ? ` · ${on}/${keys.length}` : ""}</small>` : "";
    return `<div class="rem${idx.some((i) => remHits?.has(i)) ? " hit" : ""}" data-on="${on === keys.length ? "all" : on ? "some" : "none"}">
      <button class="rem-chip" type="button" data-pick-rems="${keys.join(" ")}" aria-pressed="${on === keys.length}" aria-label="${esc(keys.length > 1 ? `${w} ×${keys.length}` : w)}"><span class="rem-tok${loadingTok}">${tokenSvg(state.lib!, r, remSpec(keys[0]), { text: textFor(keys[0], r, idx[0]) })}</span><span class="rem-w">${esc(w)}</span>${count}<span class="ck" aria-hidden="true">✓</span></button>${own ? ownPen(own, w) : ""}</div>`;
  }).join("");
  // Folded, the row shows how many linked tokens it has (and how many are in) with their small faces;
  // open, the linked tokens large, to pick. A search that found one opens its row.
  const open = rems.length > 0 && !isCard(r) && (openRows.has(ck) || !!remHits?.size);
  const inN = rems.filter((_, i) => isPicked(remKey(r, i))).length;
  const minis = [...groups].slice(0, 4).map(([w, idx]) => tokenSvg(state.lib!, r, remSpec(remKey(r, idx[0])), { text: w })).join("");
  const fold = rems.length && !isCard(r) ? `<button class="rems-fold" type="button" data-rems-fold="${ck}" aria-expanded="${open}"><span class="rf-minis" aria-hidden="true">${minis}</span><span>${esc(t("sheet.linked", { n: rems.length }))}</span>${inN ? `<b class="rf-in">${esc(inN === rems.length ? t("sheet.linkedAll") : t("sheet.linkedSome", { n: inN, of: rems.length }))}</b>` : ""}${CHEVRON}</button>` : "";
  return `<div class="row${isCard(r) ? " info" : ""}${rems.length ? "" : " no-rems"}${open ? " open" : ""}" data-picked="${isPicked(ck)}" data-row="${ck}">
    ${thumb(ck, null)}
    <div class="who" data-pick="${ck}"><b>${esc(catalogText(r, null))}${flip ? `<span class="flip-sep" title="${esc(t("sheet.flip"))}"> ⇄ </span>${esc(roleName(flip, tokenLang()))}` : ""}</b>${OWN ? (ownHome(r) && (q || catalogOf(state.edition) !== ownHomeCatalog(r.id)) ? `<em>${esc(ownHome(r))}</em>` : "") : q || state.edition === "all" || (state.edition.startsWith("s:") && r.kind !== "homebrew") ? `<em>${esc(editionName(r, lang))}</em>` : ""}${r.loading ? `<small>${esc(t("sheet.iconLoading"))}</small>` : ""}${OWN && !READONLY && !isLocked(coll, r.id) ? `<button class="own-edit" type="button" data-own-edit="${esc(r.id)}">${esc(t("own.edit"))}</button>` : ""}</div>
    ${rems.length ? `<div class="rems">${fold}${open ? `<div class="rem-list">${chips}</div>` : ""}</div>` : ""}
  </div>`;
}

/** The token the workshop shows (step 2). */
function selectToken(key: string | undefined) {
  const role = key && tokenRole(key);
  if (!key || !role) return;
  const was = state.sel?.reminder;
  if (state.sel?.key !== key) { state.flash = ""; state.saysOpen = false; }   // another token: the last one's note goes
  state.sel = { key, role, reminder: tokenRem(key) };
  if (state.sel!.reminder != null && was == null) { view3d("setView", "top"); syncView("top"); }
}

// ------------------------------------------------------------ workshop
//
// The design step's left column changes how one token looks, over the design it has. On top, what
// it says (a line, with the way to its content) and its design (the collection's default for its
// shape, or one chosen for it). Then its parts, which its shape decides: a coin's FRONT · BACK ·
// COIN · MAGNET, a ring's FRONT · RING, a card's FRONT · CARD; inside a face, its Layout · Text ·
// Icon · Frame (those the shape has). A change here is this token's only (an override); a design
// itself is changed in the Taller, which uses the same controls on one of your designs.

/** The shape being edited: the selected token's. */
const editShape = (): TokenShape => shapeOf(state.sel!.role);
/** The parts a type is made of (level 1), from what its shape has. */
const partsOf = (shape: TokenShape): Part[] => {
  const f = SHAPE_FEATURES[shape];
  return ["front", ...(f.back ? ["back" as const] : []), "body", ...(f.magnet ? ["magnet" as const] : [])];
};
/** A face's tabs (level 2): the layout only where there's more than one, the icon where the shape has one. */
const faceTabsOf = (shape: TokenShape, side: Side = "front"): FaceTab[] => {
  const f = SHAPE_FEATURES[shape];
  // the background pattern: the front's (a back face has none; a back design's is in BACK)
  return [...(f.layout ? ["layout" as const] : []), "text", ...(f.icon ? ["icon" as const] : []), "frame", ...(f.pattern && side === "front" ? ["pattern" as const] : [])];
};
/** The open level-1 tab of the type being edited (one it has). */
function openPart(): Part {
  const shape = editShape(), list = partsOf(shape);
  if (!list.includes(state.part[shape])) state.part[shape] = "front";
  return state.part[shape];
}
/** Which face the controls edit: the back's when BACK is open, else the front's. */
const editSide = (): Side => (openPart() === "back" ? "back" : "front");
/** The open panel: a face's tab, the back's choices, the body or the magnet. */
function openPanel(): string {
  const part = openPart(), shape = editShape();
  if (part === "front" || (part === "back" && editLook().backMode === "own")) {
    const side = part === "back" ? "back" : "front", tabs = faceTabsOf(shape, side);
    if (!tabs.includes(state.faceTab[side])) state.faceTab[side] = tabs[0];
    return state.faceTab[side];
  }
  return part;
}

/** The look the controls show: the selected token's (its design's, with its own changes), or in the Taller the design's. */
const editLook = () => lookOf(state.sel!.key);

/**
 * A face as the controls show it: the front is the spec itself; the back (a face) is the front's
 * look, or with "own" its own, with the back's relief and colours. As backFaceOf draws it, before
 * the rule that only one face is raised (the workshop asks about that instead).
 */
function faceOf(s: TokenSpec, side: Side): TokenSpec {
  const spec = { ...DEFAULT_SPEC, ...s, colours: { ...DEFAULT_SPEC.colours, ...s.colours } };
  if (side === "front") return spec;
  const b = spec.backFace ?? {};
  const look = spec.backMode === "own" ? Object.fromEntries(FACE_FIELDS.filter((k) => b[k] != null).map((k) => [k, b[k]])) : {};
  return { ...spec, ...look, relief: reliefOf(b), colours: { ...spec.colours, front: b.colours?.front ?? spec.colours.front, frame: b.colours?.frame ?? spec.colours.frame } };
}
/** Applies a change to a face: the front's goes to the spec; the back's to its own settings, only what changed (what it
 *  never changed keeps following the front). */
function changeFace(side: Side, mutate: (f: TokenSpec) => void) {
  changeLook((s) => {
    if (side === "front") { mutate(s); return; }
    const before = faceOf(s, "back"), v = structuredClone(before);
    mutate(v);
    const b: BackFace = { ...s.backFace };
    for (const k of FACE_FIELDS) if (v[k] !== before[k]) (b as Fields)[k] = v[k];
    for (const k of ["front", "frame"] as const) if (v.colours[k] !== before.colours[k]) b.colours = { ...b.colours, [k]: v.colours[k] };
    b.relief = reliefOf(v);
    s.backFace = b;
  });
}
/** A back face of its own starts as the front in another layout (the solo, or the classic for a solo front), so choosing it shows something new. */
function ownStart(s: TokenSpec): BackFace {
  const style: TokenStyle = s.style === "solo" ? "classic" : "solo";
  return { ...Object.fromEntries(FACE_FIELDS.map((k) => [k, s[k] ?? DEFAULT_SPEC[k]])), style, textSize: LAYOUT_TEXT[style] };
}
const hasOwnLook = (b: BackFace | undefined) => FACE_FIELDS.some((k) => b?.[k] != null);

/**
 * What of a design a shape shows, to tell whether a spec kept before styles is one of the
 * collection's: a coin, everything a style sets; a card or a ring, its colours, its frame as none or
 * a line, its thickness and colour depth (and a ring its letters and relief).
 */
function shapeLook(shape: TokenShape, spec: SpecInput) {
  const f = <K extends keyof TokenSpec>(k: K) => spec[k] ?? DEFAULT_SPEC[k], c = { ...DEFAULT_SPEC.colours, ...spec.colours };
  const line = f("frame") !== "none";
  const look = { base: c.base, front: c.front, frame: line ? c.frame : null, frameWidth: line ? f("frameWidth") : null, height: f("height"), depth: f("depth"),
    // a card's frame only at its corners; a ring's mark between repeats other than the dot (only when set: older looks compare as they did)
    ...(shape === "card" && f("frame") === "corners" ? { corners: true } : {}) };
  return shape === "ring" ? { ...look, textSize: f("textSize"), spacing: f("spacing"), relief: reliefOf(spec), ...(f("separator") !== "dot" ? { separator: f("separator") } : {}) } : look;
}
/** Whether a spec differs from a collection's style in anything the style sets for the shape (the magnet is a choice of its own). */
function differsFrom(d: StyleDef, spec: TokenSpec, shape: TokenShape) {
  const { preset: _id, ...whole } = defSpec(d);
  if (shape !== "coin") return JSON.stringify(shapeLook(shape, whole)) !== JSON.stringify(shapeLook(shape, spec));
  const colours = (c: unknown) => ({ ...DEFAULT_SPEC.colours, ...(c as Partial<SpecColours>) });
  return Object.entries(whole).some(([k, v]) => !STYLE_KEEPS.has(k)
    && JSON.stringify(k === "colours" ? colours(v) : v) !== JSON.stringify(k === "colours" ? colours(spec.colours) : spec[k as keyof TokenSpec] ?? DEFAULT_SPEC[k as keyof TokenSpec]));
}
/**
 * The collection's style a spec kept before styles started from (by the id it keeps), or the one it
 * matches; the templates of old (Clocktower's styles) too, for one made from one.
 */
function startedFrom(spec: TokenSpec, shape: TokenShape) {
  const list = [...knownStyles(shape), ...BOTC_STYLES[shape]], id = spec.preset ?? spec.fromPreset;
  const def = list.find((d) => d.id === id) ?? list.find((d) => !differsFrom(d, spec, shape));
  return { def, modified: !!def && differsFrom(def, spec, shape) };
}
/** What each tab shows in the 3D view: a face straight on, the body at an angle, the magnet from behind. */
const PART_VIEW: Record<Part, ViewKind> = { front: "top", back: "back", body: "angle", magnet: "back" };
/** Opens a tab: a part, and inside a face one of its tabs. */
function showTab({ part, face }: { part?: Part; face?: FaceTab } = {}) {
  if (part) state.part[editShape()] = part;
  if (face) state.faceTab[editSide()] = face;
  state.reliefAsk = null;
  $("#styleFields").scrollTop = 0;
}
/** Turns the 3D view to what the open tab changes. */
function viewTab() {
  const v = PART_VIEW[openPart()];
  view3d("setView", v); syncView(v);
}

let raf = 0;
function renderWorkshop() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (!state.sel || (TALLER && !tallerMine())) return;   // the Taller's editor only
    const { key, role, reminder } = state.sel;
    const isRem = reminder != null;
    const lang = uiLang();
    const spec = specFor(key, isRem);
    const text = textFor(key, role, reminder);
    const token = buildToken(state.lib!, role, spec, text);
    state.token = token;
    const shape = shapeOf(role);
    if (TALLER) renderTallerHead();
    else {
      view3d("setToken", token);
      // X-ray only makes sense with a magnet inside.
      $("#xray").hidden = !token.magnet;
      if (!token.magnet && $("#xray").getAttribute("aria-pressed") === "true") { $("#xray").setAttribute("aria-pressed", "false"); view3d("setXray", false); }
      const design = designFor(key, shape);
      $("#name").textContent = text.trim() || t("own.namePlaceholder");
      $("#sub").textContent = [isRem ? textFor(charKey(role), role, null) : null, TEAMS[role.team].label[lang], editionName(role, lang),
        t("design.sub", { name: design.name }), ownChanged(key) ? t("design.tweakedSub") : null].filter(Boolean).join(" · ");
      renderSays();
      renderDesignRow(key, shape);
    }
    $("#lookTitle").textContent = t(openPart() === "back" ? "look.titleBack" : "look.title");
    $("#lookSub").textContent = TALLER ? t("look.subDesign") : t("look.subToken");
    const look = editLook();
    renderTabs(role, look);
    syncControls(role, look, token);
    renderColourWarn(role, spec);
  });
}

/** A design drawn small on the token being edited: its colours and frame at a glance. */
function designSwatch(spec: TokenSpec, role = state.sel!.role) {
  return `<span class="style-sw">${tokenSvg(state.lib!, role, { ...filled(spec), lang: tokenLang(), icon: ownIcon(role.id), diameter: 45, back: "none", backMode: "design" }, { text: textFor(charKey(role), role, null) })}</span>`;
}

/**
 * The token's design: the one it uses (its shape's default, a linked token's character's, or one
 * chosen for it), drawn on it, with where it comes from; "Change" opens the designs to choose from.
 * With changes of its own over it, the token is "customised": they can be kept as a design of
 * yours, or dropped. A design chosen for it has the way back to the default; and the way to the
 * Taller, where the design itself is changed.
 */
function renderDesignRow(key: string, shape: TokenShape) {
  const d = designFor(key, shape), def = designOf(shape, inheritedRef(key, shape))!, tweaked = ownChanged(key);
  const { role, reminder } = state.sel!;
  $("#styleTok").innerHTML = tokenSvg(state.lib!, role, specFor(key, reminder != null), { text: textFor(key, role, reminder) });
  $("#styleName").innerHTML = esc(d.name) + (tweaked ? ` · ${esc(t("design.custom"))} <span aria-hidden="true">✎</span>` : "");
  $("#styleCount").textContent = d.ref === def.ref ? t("design.isDefault") : d.mine ? t("design.yours") : t("design.fromSrc", { name: d.ref.startsWith("a:") ? APP_NAME : collLabel() });
  $("#styleChange").setAttribute("aria-label", `${t("design.change")}: ${t("design.label")} ${d.name}`);
  $("#styleTweak").hidden = !tweaked;
  const back = $<HTMLButtonElement>("#styleBack");
  back.hidden = d.ref === def.ref;
  back.innerHTML = `<span aria-hidden="true">✎</span> ${esc(t("design.chosen"))} · <u>${esc(t("design.back"))}</u>`;
  $<HTMLAnchorElement>("#designTaller").href = tallerUrl(location.pathname, { shape, d: d.ref });
  $("#designFlash").hidden = !state.flash;
  $("#designFlash").textContent = state.flash;
  if (dz.open && dz.mode === "token") renderDesignSheet();
}

// ------------------------------------------------------------ choosing a design (the sheet)
//
// One sheet for a token's design (step 2) and for a shape's default in the collection (Pick):
// each design drawn large on the token it's for (in Pick, the shape's first token), with a line on
// it; the collection's and yours in two tabs, yours searchable when there are many. The
// collection's tab has its own first, then the app's (Tesserae Faber's), under their names. The token's
// default (in Pick, the collection's original) comes first, marked; the one in use is ringed.
// Choosing one is the same as it always was (setTokenDesign, setDefaults); the sheet just closes.

const dz = { open: false, mode: "token" as "token" | "default", shape: "coin" as TokenShape, tab: "coll" as "coll" | "mine", q: "", opener: null as HTMLElement | null };
/** A design's look as a token would print with it: its text and icon (and, given, its own changes over it). */
function specWith(base: TokenSpec, key: string, isReminder: boolean): TokenSpec {
  const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours }, lang: tokenLang(), icon: ownIcon(roleIdOf(key)) };
  return isReminder ? reminderSpec(spec) : spec;
}
/**
 * The designs the sheet offers, in its two tabs (the collection's: its own, then the app's): each
 * with what choosing it sets ("": a token's default), whether it's the first (marked) and whether
 * it's in use. A hidden style of the collection's in use (or the default) is shown with its own.
 */
function sheetDesigns() {
  const sh = dz.shape, mine = myDesigns[sh].map(myEntry), app = appDesigns(sh).map((x) => collEntry(sh, x, `a:${x.id}`));
  let first: string, cur: string;
  if (dz.mode === "token") {
    const key = state.sel!.key;
    first = inheritedRef(key, sh); cur = refOf(key, sh);
  } else { first = originalRef(sh); cur = defaultRef(sh); }
  const own = collDesigns(sh).map((x) => collEntry(sh, x));
  for (const r of new Set([first, cur])) if (r.startsWith("c:") && !own.some((d) => d.ref === r)) own.push(designOf(sh, r)!);
  const lead = (list: DesignEntry[]) => [...list.filter((d) => d.ref === first), ...list.filter((d) => d.ref !== first)];
  const item = (d: DesignEntry) => ({ d, pick: dz.mode === "token" && d.ref === first ? "" : d.ref, first: d.ref === first, on: d.ref === cur });
  return { own: lead(own).map(item), app: lead(app).map(item), coll: [...lead(own), ...lead(app)].map(item), mine: lead(mine).map(item), cur };
}
function openDesignSheet(mode: "token" | "default", shape: TokenShape, opener: HTMLElement) {
  Object.assign(dz, { open: true, mode, shape, opener, q: "" });
  dz.tab = sheetDesigns().cur.startsWith("u:") ? "mine" : "coll";
  $<HTMLInputElement>("#dzSearch").value = "";
  renderDesignSheet();
  const dlg = $<HTMLDialogElement>("#designDlg");
  if (!dlg.open) dlg.showModal();
  ($<HTMLElement>("#dzCards [aria-pressed=true]") ?? $<HTMLElement>("#dzTabs [aria-selected=true]"))?.focus();
}
function renderDesignSheet() {
  const sh = dz.shape, { own, app, coll, mine, cur } = sheetDesigns(), tokenMode = dz.mode === "token";
  const role = tokenMode ? state.sel!.role : sampleRole(sh), key = tokenMode ? state.sel!.key : charKey(role), reminder = tokenMode ? state.sel!.reminder : null;
  const look = tokenMode ? state.overrides.get(key)?.look : undefined, text = textFor(key, role, reminder);
  $("#dzTitle").textContent = t(tokenMode ? "dsheet.title" : `dsheet.title.${sh}`);
  $("#dzTabs").innerHTML = (["coll", "mine"] as const).map((tab) => `<button type="button" role="tab" data-dz-tab="${tab}" aria-selected="${dz.tab === tab}" tabindex="${dz.tab === tab ? 0 : -1}">${esc(t(`dsheet.${tab}`, { n: (tab === "coll" ? coll : mine).length }))}</button>`).join("");
  const search = $<HTMLInputElement>("#dzSearch");
  search.hidden = dz.tab !== "mine" || mine.length <= 6;
  const q = search.hidden ? "" : dz.q.trim().toLocaleLowerCase();
  const list = (dz.tab === "coll" ? coll : mine).filter((x) => !q || x.d.name.toLocaleLowerCase().includes(q));
  type Item = (typeof list)[number];
  const help = (d: DesignEntry) => {
    if (!d.mine) return d.help ?? "";
    const m = myDesigns[sh].find((x) => `u:${x.id}` === d.ref);
    return m?.from ? t("dsheet.from", { name: m.from.name }) : t("dsheet.yours");
  };
  const tag = t(tokenMode ? "design.defaultItem" : "bar.originalTag");
  const card = ({ d, pick, first, on }: Item) => `<button class="dz-card" type="button" data-dz-pick="${esc(pick)}" aria-pressed="${on}">`
    + `<span class="dz-tok">${tokenSvg(state.lib!, role, specWith(applyLook(d.spec, look), key, reminder != null), { text })}${first ? `<i class="dz-badge">${esc(tag)}</i>` : ""}</span>`
    + `<b>${esc(d.name)}</b>${help(d) ? `<small>${esc(help(d))}</small>` : ""}</button>`;
  // the collection's tab: its own under its name (when it has any), then the app's under Tesserae Faber
  const head = (name: string) => `<h3 class="dz-sec">${esc(name)}</h3>`;
  $("#dzCards").innerHTML = (dz.tab === "coll"
    ? (own.length ? head(collLabel()) + own.map(card).join("") : "") + head(APP_NAME) + app.map(card).join("")
    : list.map(card).join(""))
    || `<p class="dz-empty">${esc(t(q ? "dsheet.noMatch" : "design.mineNone"))}</p>`;
  $("#dzFor").textContent = tokenMode ? text : t("dsheet.sample", { name: text });
  $<HTMLAnchorElement>("#dzTaller").href = tallerUrl(location.pathname, { shape: sh, d: cur });
}
function wireDesignSheet() {
  const dlg = $<HTMLDialogElement>("#designDlg");
  dlg.addEventListener("close", () => {
    dz.open = false;
    const back = dz.opener?.isConnected ? dz.opener : dz.mode === "default" ? document.querySelector<HTMLElement>(`[data-default-shape="${dz.shape}"]`) : null;
    back?.focus();
  });
  // a click on the backdrop (outside the dialog's box) closes it
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect(), { clientX: x, clientY: y } = e;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) dlg.close();
  });
  const toTab = (tab: "coll" | "mine") => { dz.tab = tab; renderDesignSheet(); $<HTMLElement>("#dzTabs [aria-selected=true]")?.focus(); };
  $("#dzTabs").onclick = (e) => { const b = hit(e, "[data-dz-tab]"); if (b) toTab(b.dataset.dzTab as "coll" | "mine"); };
  $("#dzTabs").onkeydown = (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); toTab(dz.tab === "coll" ? "mine" : "coll"); } };
  $("#dzSearch").oninput = (e) => { dz.q = (e.target as HTMLInputElement).value; renderDesignSheet(); };
  $("#dzTaller").onclick = rememberReturn;
  $("#dzCards").onclick = (e) => {
    const b = hit(e, "[data-dz-pick]"); if (!b) return;
    const ref = b.dataset.dzPick!, { mode, shape } = dz;
    dlg.close();
    if (mode === "token") setTokenDesign(state.sel!.key, ref);
    else void setDefaults({ [shape]: ref }).then(() => document.querySelector<HTMLElement>(`[data-default-shape="${shape}"]`)?.focus());   // the bar is drawn again
  };
  // arrows move over the cards as they're laid out: along a row, and up and down its columns
  $("#dzCards").onkeydown = (e) => {
    const cards = $$("#dzCards .dz-card"), i = cards.indexOf(document.activeElement as HTMLElement);
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -i, End: cards.length - 1 - i };
    const cols = Math.max(1, cards.filter((c) => c.offsetTop === cards[0].offsetTop).length);
    steps.ArrowUp = -cols; steps.ArrowDown = cols;
    if (i < 0 || !(e.key in steps)) return;
    e.preventDefault();
    cards[Math.max(0, Math.min(cards.length - 1, i + steps[e.key]))]?.focus();
  };
}

/** A name asked for in a dialog of the app's (given one to start from): the name, or null when cancelled. */
function askName(text: string, value: string, ok: string): Promise<string | null> {
  const dlg = $<HTMLDialogElement>("#nameDlg"), input = $<HTMLInputElement>("#nameInput");
  $("#nameText").textContent = text;
  $("#nameOk").textContent = ok;
  input.value = value;
  dlg.returnValue = "";
  dlg.showModal();
  input.select();
  return new Promise((done) => {
    $("#nameCancel").onclick = () => dlg.close();
    dlg.onclose = () => done(dlg.returnValue === "ok" && input.value.trim() ? input.value.trim() : null);
  });
}
/**
 * A customised token's look kept as a design of yours: its design's with its changes, exactly, so it
 * prints the same. The token then uses it, with no changes of its own.
 */
async function saveLookAsDesign(key: string) {
  const shape = shapeOf(tokenRole(key)), d = designFor(key, shape);
  const name = await askName(t("design.saveAsk"), uniqueDesignName(shape, t("design.saveName", { name: d.name })), t("design.saveOk"));
  if (!name) return;
  const { preset: _p, fromPreset: _f, ...spec } = structuredClone(lookOf(key));
  const origin = d.mine ? myDesigns[shape].find((x) => `u:${x.id}` === d.ref)?.from : { name: d.name, spec: structuredClone(d.spec) };
  const mine: MyDesign = { id: newId("d"), name: uniqueDesignName(shape, name), spec: spec as TokenSpec, ...(origin ? { from: origin } : {}) };
  myDesigns[shape].push(mine); storeMyDesigns();
  const own: TokenOverride = { ...state.overrides.get(key) };
  delete own.look; own.style = `u:${mine.id}`;
  state.flash = t("design.saved", { name: mine.name });
  setOwn(key, own);
}
/** A token's design: kept on the token unless it's the one it has by default (none: back to that). Its own changes stay, as far as the new design hasn't them. */
function setTokenDesign(key: string, ref: string) {
  const shape = shapeOf(tokenRole(key)), own: TokenOverride = { ...state.overrides.get(key) };
  if (!ref || ref === inheritedRef(key, shape)) delete own.style; else own.style = ref;
  if (own.look) { const look = prunedLook(designOf(shape, ref || inheritedRef(key, shape))!.spec, own.look); if (look) own.look = look; else delete own.look; }
  state.flash = "";
  setOwn(key, own);
}

/** Your collection's token (or the one being made) whose content can be changed: not one of a built-in or closed collection. */
function ownEditable(role: Role) { return OWN && !READONLY && !!ownTokenOf(role.id) && !isLocked(coll, role.id); }
const ownTokenOf = (id: string): OwnToken | undefined => (state.creating?.draft.id === id ? state.creating.draft : coll.tokens.find((x) => x.id === id));

/**
 * What the token says, over its design: one line. A token of your collection: its name, group and
 * type, and the way to its content (the panel, as from the sheet). Clocktower's, a closed
 * collection's and a linked token's: its printed text, feminine name and icon, kept with the token
 * like its design (an override), opened in place.
 */
function renderSays() {
  const { key, role, reminder } = state.sel!, shape = shapeOf(role), lang = uiLang();
  const tk = ownEditable(role) && reminder == null ? ownTokenOf(role.id)! : null;
  const own = state.overrides.get(key), name = textFor(key, role, reminder);
  const mine = !!(own?.text || own?.fem || own?.icon);
  $("#saysLine").innerHTML = tk
    ? `<span class="says-what"><b>${esc(name)}</b><small>${esc([nameIn(coll.groups.find((g) => g.id === tk.group)?.name, lang), nameIn(coll.types.find((x) => x.id === tk.type)?.name, lang)].filter(Boolean).join(" · "))}</small></span><button class="pill" type="button" data-content-edit="${esc(tk.id)}">${esc(t("content.edit"))}</button>`
    : `<button class="says-toggle" type="button" aria-expanded="${state.saysOpen}" aria-controls="contentClosed"><span>${esc(t("content.says"))}: <b>${esc(name)}</b>${mine ? ` <i class="own-dot" title="${esc(t("sheet.own"))}">✎</i>` : ""}</span>${CHEVRON}</button>`;
  const box = $("#contentClosed");
  box.hidden = !!tk || !state.saysOpen;
  if (box.hidden) return;
  // a closed collection's: its text, feminine name and icon (Clocktower's own icon; your collection's tokens have theirs)
  const isRem = reminder != null;
  if (document.activeElement !== $("#printed")) $<HTMLInputElement>("#printed").value = own?.text ?? "";
  $<HTMLInputElement>("#printed").placeholder = isRem ? remindersOf(role)[reminder] : charName(role, key);
  const femName = !isRem && role.fem?.[tokenLang()];
  $("#femRow").hidden = !femName;
  if (femName) { $<HTMLInputElement>("#fem").checked = !!own?.fem; $("#femLabel").textContent = t("ws.fem", { name: femName }); }
  $("#iconField").hidden = !SHAPE_FEATURES[shape].icon || ownEditable(role);
  renderIconField();
}

/** The parts' tabs, and inside them the back's choices and a face's tabs. */
function renderTabs(role: Role, spec: TokenSpec) {
  const shape = shapeOf(role), part = openPart(), panel = openPanel();
  $("#parts").innerHTML = partsOf(shape).map((p) => `<button type="button" role="tab" data-part="${p}" aria-selected="${p === part}">${esc(p === "body" ? t(`part.body.${shape}`) : t(`part.${p}`))}</button>`).join("");
  const faceOpen = part === "front" || (part === "back" && spec.backMode === "own");
  $("#faceTabs").hidden = !faceOpen;
  if (faceOpen) $("#faceTabs").innerHTML = faceTabsOf(shape, part === "back" ? "back" : "front").map((f) => `<button type="button" role="tab" data-face="${f}" aria-selected="${f === panel}">${esc(t(`face.${f}`))}</button>`).join("");
  renderBackModes(role, spec, part === "back");
  $$(".ws-panel").forEach((p) => { p.hidden = p.dataset.panel !== panel; });
}

/** The token's other state, if the token being edited has one: its name (a back design doesn't reach it). */
function backReach() {
  const { key, role } = state.sel!, other = shapeOf(role) === "coin" ? selFlip(role) : null;
  return { flips: other ? [textFor(key, role, null)] : [], plain: !other };
}
/**
 * BACK's three choices, each drawn on the selected token: the front again, a face of its own, or
 * a design. A token with another state always shows that state on its back, drawn with the front's
 * look (or the back's own), and a line under the choices says so.
 */
function renderBackModes(role: Role, spec: TokenSpec, open: boolean) {
  const box = $("#backModes");
  box.hidden = !open;
  if (!open) return;
  const s = faceOf(spec, "front"), mode = s.backMode, text = textFor(state.sel!.key, role, state.sel!.reminder);
  const isRem = state.sel!.reminder != null;
  const back = (input: TokenSpec, r = role) => { const sp = { ...input, lang: tokenLang(), icon: ownIcon(role.id) }; return tokenSvg(state.lib!, r, isRem ? reminderSpec(sp) : sp, { side: "back", text }); };
  const own = hasOwnLook(s.backFace) ? s.backFace : { ...s.backFace, ...ownStart(s) };
  const modes: [BackMode, string][] = [
    ["match", back({ ...s, backMode: "match" })],
    ["own", back({ ...s, backMode: "own", backFace: own })],
    ["design", back({ ...s, backMode: "design" }, { ...role, flip: undefined })],
  ];
  const how = mode === "own" ? "own" : mode === "match" ? "match" : "design", other = selFlip(role);
  const note = other ? t(TALLER ? "flip.sample" : "flip.mine", { name: roleName(other, tokenLang()), how }) : "";
  box.innerHTML = `<div class="back-mode-list" role="radiogroup" aria-label="${esc(t("back.modes"))}">${modes.map(([m, svg]) => `<button type="button" role="radio" data-back-mode="${m}" aria-checked="${m === mode}">${svg}<span><b>${esc(t(`back.mode.${m}`))}</b><small>${esc(t(`back.mode.${m}.help`))}</small></span></button>`).join("")}</div>`
    + (note ? `<p class="flip-note"><span aria-hidden="true">⇄</span> ${esc(note)}</p>` : "");
}
/** Choosing what the back is. A face of its own starts from ownStart the first time. */
function setBackMode(mode: BackMode) {
  changeLook((s) => {
    s.backMode = mode;
    if (mode === "own" && !hasOwnLook(s.backFace)) s.backFace = { ...s.backFace, ...ownStart(faceOf(s, "front")) };
  });
  state.reliefAsk = null;
  view3d("setView", "back"); syncView("back");
}

/** Under the token's name: inlays the coin's colour, or light ones too shallow on a dark coin. */
function renderColourWarn(role: Role, spec: TokenSpec) {
  // checked as the shape prints it: a card or a ring has no back to check
  const shape = shapeOf(role), { clash, light } = colourIssues(role, shapeSpec(role, spec));
  const box = $("#colourWarn");
  box.hidden = !clash.length && !light.length;
  if (box.hidden) return;
  // Each part in the shape's words: a coin's "front" is its name and its icon (two words in the
  // list, "the name, the icon and the frame"); a ring's are letters, and its frame two lines.
  const words = (p: InlayPart) => (p === "front" ? (shape === "ring" ? ["letters"] : SHAPE_FEATURES[shape].icon ? ["name", "icon"] : ["name"]) : [shape === "ring" && p === "frame" ? "lines" : p]);
  const parts = (list: InlayPart[]) => { const w = list.flatMap(words).map((x) => t(`colour.part.${x}`)); return w.length > 1 ? `${w.slice(0, -1).join(", ")}${t("colour.and")}${w.at(-1)}` : w[0]; };
  box.innerHTML = [
    clash.length ? `<p><span aria-hidden="true">⚠</span> ${esc(shapeText("colour.clash", shape, { parts: parts(clash), n: clash.length }))}</p>` : "",
    light.length ? `<p><span aria-hidden="true">◐</span> ${esc(shapeText("colour.light", shape, { parts: parts(light), n: light.length, mm: dec1(LIGHT_DEPTH) }))}
      <button class="pill" type="button" data-deepen>${esc(t(TALLER ? "colour.deepenDesign" : "colour.deepenToken", { mm: dec1(LIGHT_DEPTH) }))}</button></p>` : "",
  ].join("");
}
/** A design text that names the token's body: the coin's, or the card's or ring's own version of it. */
const shapeText = (key: string, shape: TokenShape, vars?: Vars) => {
  const own = `${key}.${shape}`, text = t(own, vars);
  return text === own ? t(key, vars) : text;   // the coin's words where they fit any shape
};
/** One decimal in the interface's language. */
const dec1 = (v: number) => v.toFixed(1).replace(".", uiLang() === "es" ? "," : ".");
/** The fix for light inlays: the depth that covers the coin (this token's, or in the Taller the design's). */
function deepen() {
  changeLook((s) => { s.depth = LIGHT_DEPTH; });
}

/** The selection's colour problems (see colour-checks.ts), each with its token key and label. */
function selectionColourIssues() {
  return [...state.pick.keys()].map((k) => {
    const q = queueEntry(tokenRole(k), tokenRem(k)), role = roleById(q.roleId)!;
    return { k, label: queueLabel(q, role), ...colourIssues(role, itemSpec(q)) };
  });
}
/** The Print step's colour notes: inlays you can't tell from the coin (also on paper), and
 *  light inlays too shallow on a dark coin (3D only), with a fix for all of them at once. */
function colourNotes(way: string) {
  const all = selectionColourIssues();
  const list = (xs: { k: string; label: string }[]) => `<ul>${xs.map((x) => `<li><button type="button" data-fix="${x.k}">${esc(x.label)}</button></li>`).join("")}</ul>`;
  const clash = all.filter((x) => x.clash.length), light = way === "3d" ? all.filter((x) => x.light.length) : [];
  return (clash.length ? `<div class="q-note warn small-text"><span aria-hidden="true">⚠</span><div>
      <p>${esc(t("print.clash", { n: clash.length }))}</p>${list(clash)}</div></div>` : "")
    + (light.length ? `<div class="q-note warn small-text"><span aria-hidden="true">◐</span><div>
      <p>${esc(t("print.light", { n: light.length, mm: dec1(LIGHT_DEPTH) }))}</p>${list(light)}
      <p><button class="pill" type="button" data-deepen-all>${esc(t("print.deepenAll", { n: light.length, mm: dec1(LIGHT_DEPTH) }))}</button></p></div></div>` : "");
}
/**
 * Deepens every selected token with light inlays on a dark coin, each on its own (a change over its
 * design, like any made in the design step): the designs themselves are only changed in the Taller.
 */
function deepenAll() {
  for (const x of selectionColourIssues().filter((x) => x.light.length)) {
    const own: TokenOverride = { ...state.overrides.get(x.k) }, look = prunedLook(designFor(x.k).spec, withLookField(own.look ?? {}, "depth", LIGHT_DEPTH));
    if (look) own.look = look; else delete own.look;
    state.overrides.set(x.k, own);
  }
  storeOverrides();
  if (state.sel) renderWorkshop();
  renderSheet(); renderSpine(); renderQueue();
}

/** The layouts, each drawn on the token (the back's: on what its back shows) in the face's current colours. */
function renderStyleTiles(face: { role: Role; text: string }, spec: TokenSpec) {
  // without the background pattern: each would be cut anew (a tenth of a second each), and the tiles show the layout
  const s = { ...spec, diameter: 45, back: "none", backMode: "design" as const, frontPattern: null };
  $("[data-choice=style]").innerHTML = TOKEN_STYLES.map((st) =>
    `<button class="back-tile" type="button" data-v="${st.id}" aria-pressed="${s.style === st.id}">${
      tokenSvg(state.lib!, face.role, { ...s, style: st.id, ...(st.id !== s.style ? { textSize: LAYOUT_TEXT[st.id] } : {}) }, { text: face.text })
    }<span>${esc(t(`style.${st.id}`))}</span></button>`).join("");
}

/** The frame designs, each drawn on the token in the face's current colours. A card or a ring
 *  (whose shape has frames only as a line) gets two tiles, without and with, drawn on itself; a
 *  card a third, only its corners. */
function renderFrameTiles(face: { role: Role; text: string }, spec: TokenSpec) {
  const s = { ...spec, diameter: 45, back: "none", backMode: "design" as const, frontPattern: null }, shape = shapeOf(face.role), { role, text } = face;   // the pattern left out, as in the layouts
  if (SHAPE_FEATURES[shape].frame === "line") {
    // "with" keeps whatever design the spec has, so choosing it changes nothing else
    const line = s.frame === "none" || s.frame === "corners" ? "rim" : s.frame;
    const tiles = [["none", t("frame.none")], [line, t(`frame.line.${shape}`)], ...(SHAPE_FEATURES[shape].corners ? [["corners", t("frame.corners")]] : [])];
    $("[data-choice=frame]").innerHTML = tiles.map(([v, label]) =>
      `<button class="back-tile frame-tile" type="button" data-v="${v}" aria-pressed="${s.frame === v}">${tokenSvg(state.lib!, role, { ...s, frame: v }, { text })}<span>${esc(label)}</span></button>`).join("");
    return;
  }
  const list = s.style === "window" ? FRAME_STYLES.filter((f) => f.id === "none" || f.id === "rim") : FRAME_STYLES;
  $("[data-choice=frame]").innerHTML = list.map((f) =>
    `<button class="back-tile frame-tile" type="button" data-v="${f.id}" aria-pressed="${(s.style === "window" && s.frame !== "none" ? "rim" : s.frame) === f.id}">${
      tokenSvg(state.lib!, role, { ...s, frame: f.id, frameWidth: f.id === "rim" || f.id === "double" ? Math.max(s.frameWidth, 0.8) : s.frameWidth }, { text })
    }<span>${esc(t(`frame.${f.id}`))}</span></button>`).join("");
}

/** The back designs as small coin backs, in the colours of the design being edited. */
function renderBackTiles(role: Role, spec: TokenSpec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45, backMode: "design" as const };
  if (s.colours.back === "team") s.colours.back = FILAMENTS.gold;
  // on an ordinary coin's back: a two-state token's would show its other state
  const plain = { ...role, flip: undefined };
  $("[data-choice=back]").innerHTML = BACK_STYLES.filter((b) => b.id !== "seal").map((b) =>
    `<button class="back-tile" type="button" data-v="${b.id}" aria-pressed="${s.back === b.id}">${
      b.id === "custom" && !s.customSvg ? `<span class="upload-tile">SVG</span>` : tokenSvg(state.lib!, plain, { ...s, back: b.id }, { side: "back" })
    }<span>${esc(t(`back.${b.id}`))}</span></button>`).join("");
}

// A background pattern (the front's in its own tab, the back's under the back design): which one,
// drawn as small swatches in the token's colours, how big its rhombi are, how thick its lines (the
// gap between its cells), how far it keeps from what sits on it, and (the front's) whose colour it
// takes: the frame's or the name's, never a filament of its own.
type PatSide = "front" | "back";
const patKey = (side: PatSide) => (side === "front" ? "frontPattern" : "backPattern") as "frontPattern" | "backPattern";
/** A pattern as a small coin swatch: `fg` rhombi (lines or a checkerboard) on `bg`. */
function patternSwatch(id: string, bg: string, fg: string, clip: string) {
  const a = 6, b = 9.6, out: string[] = [];
  const rh = (cx: number, cy: number, k = 1) => `M${cx - (a / 2) * k} ${cy}L${cx} ${cy - (b / 2) * k}L${cx + (a / 2) * k} ${cy}L${cx} ${cy + (b / 2) * k}Z`;
  if (id === "rombos-lineas") for (let m = -3; m <= 3; m++) for (let n = -2; n <= 2; n++) out.push(rh(m * a, n * b), rh(m * a + a / 2, n * b + b / 2));
  if (id === "damero-rombos") for (let m = -3; m <= 3; m++) for (let n = -2; n <= 2; n++) out.push(rh(m * a, n * b, 0.82));
  if (id === "escamas" || id === "escamas-relleno") {
    // rows of scales, each a round lower edge, row over row
    const r = 2.6, arc = (cx: number, cy: number) => `M${cx - r} ${cy}A${r} ${r} 0 0 0 ${cx + r} ${cy}`;
    for (let n = -5; n <= 5; n++) for (let m = -3; m <= 3; m++) out.push(arc(2 * r * m + (n & 1 ? r : 0), -n * r));
    return `<svg viewBox="-10 -10 20 20" aria-hidden="true"><defs><clipPath id="${clip}"><circle r="9.2"/></clipPath></defs><circle r="10" fill="${bg}" stroke="rgba(239,230,214,.25)" stroke-width="0.3"/><g clip-path="url(#${clip})"><path d="${out.join("")}" fill="none" stroke="${fg}" stroke-width="${id === "escamas" ? 0.8 : 1.6}"/></g></svg>`;
  }
  if (id === "cuartelado" || id === "damero") {
    // the field quartered (top left and bottom right), or a checkerboard with a square on the centre
    const q = id === "cuartelado" ? `<path d="M-10 -10H-0.5V-0.5H-10ZM0.5 0.5H10V10H0.5Z"/>`
      : [-3, -2, -1, 0, 1, 2, 3].flatMap((m) => [-3, -2, -1, 0, 1, 2, 3].filter((n) => !((m + n) & 1)).map((n) => `<rect x="${m * 4.4 - 1.95}" y="${n * 4.4 - 1.95}" width="3.9" height="3.9"/>`)).join("");
    return `<svg viewBox="-10 -10 20 20" aria-hidden="true"><defs><clipPath id="${clip}"><circle r="9.2"/></clipPath></defs><circle r="10" fill="${bg}" stroke="rgba(239,230,214,.25)" stroke-width="0.3"/><g clip-path="url(#${clip})"><g fill="${fg}">${q}</g></g></svg>`;
  }
  if (id === "rayas") {
    // the bend: broad stripes from the top left to the bottom right
    const stripes = [-3, -2, -1, 0, 1, 2, 3].map((m) => `<rect x="-20" y="${m * 4.6 - 1.4}" width="40" height="2.8"/>`).join("");
    return `<svg viewBox="-10 -10 20 20" aria-hidden="true"><defs><clipPath id="${clip}"><circle r="9.2"/></clipPath></defs><circle r="10" fill="${bg}" stroke="rgba(239,230,214,.25)" stroke-width="0.3"/><g clip-path="url(#${clip})"><g fill="${fg}" transform="rotate(45)">${stripes}</g></g></svg>`;
  }
  const body = !out.length ? "" : id === "rombos-lineas" ? `<path d="${out.join("")}" fill="none" stroke="${fg}" stroke-width="0.8"/>` : `<path d="${out.join("")}" fill="${fg}"/>`;
  return `<svg viewBox="-10 -10 20 20" aria-hidden="true"><defs><clipPath id="${clip}"><circle r="9.2"/></clipPath></defs><circle r="10" fill="${bg}" stroke="rgba(239,230,214,.25)" stroke-width="0.3"/><g clip-path="url(#${clip})">${body}</g></svg>`;
}
/** The pattern group's controls, once (buildChoices): its tiles, its three sliders and the front's colours. */
function patternGroupHtml(side: PatSide) {
  const range = (k: string, label: string, min: number, max: number, step: number) =>
    `<div class="row"><label for="pat-${side}-${k}" ${k === "line" ? "data-pat-line-label" : ""}>${esc(label)}</label><output data-pat-out="${k}"></output><input type="range" id="pat-${side}-${k}" data-pat-range="${k}" min="${min}" max="${max}" step="${step}"></div>`;
  return (side === "back" ? `<p class="metal-label">${esc(t("pattern.title"))}</p>` : "")
    + `<div class="choices pat-tiles" data-pat-choice role="group" aria-label="${esc(t("pattern.title"))}"></div>`
    + `<button type="button" class="reset-f group" hidden data-reset="${patKey(side)}">↺</button>`
    + `<div class="pat-opts">`
    + range("scale", t("pattern.scale"), 2.4, 8, 0.1)
    + range("line", t("pattern.line"), PATTERN_MIN, 1.2, 0.05)
    + range("halo", t("pattern.halo"), PATTERN_MIN, 1.2, 0.05)
    + (side === "front" ? `<p class="metal-label">${esc(t("pattern.colour"))}</p><div class="choices" data-pat-colour></div>` : "")
    + `<p class="hint" data-pat-hint></p></div>`;
}
/** Puts a face's pattern into its group: the swatches, the sliders' values, the colours and a line on what it does. */
function renderPattern(side: PatSide, role: Role, s: TokenSpec) {
  const box = $(`[data-pat-side=${side}]`), p = s[patKey(side)] ?? null, pc = partColours(role, shapeSpec(role, s));
  const colour = side === "back" ? pc.back : (p?.colour ?? "frame") === "front" ? pc.front : pc.frame;
  const dec = uiLang() === "es" ? "," : ".";
  const tiles: [string, string][] = [["none", t("pattern.none")], ...PATTERNS.map((x) => [x.id, t(`pattern.${x.id}`)] as [string, string])];
  $("[data-pat-choice]", box).innerHTML = tiles.map(([id, label]) =>
    `<button class="back-tile" type="button" data-pat="${id}" aria-pressed="${(p?.id ?? "none") === id}">${patternSwatch(id, pc.base, colour, `patclip-${side}-${id}`)}<span>${esc(label)}</span></button>`).join("");
  $(".pat-opts", box).hidden = !p;
  if (!p) return;
  const d = patternDefaults(p.id), v = { scale: p.scale ?? d.scale, line: p.line ?? d.line, halo: p.halo ?? d.halo };
  for (const k of ["scale", "line", "halo"] as const) {
    const el = $<HTMLInputElement>(`[data-pat-range=${k}]`, box);
    if (document.activeElement !== el) el.value = String(v[k]);
    $(`[data-pat-out=${k}]`, box).textContent = v[k].toFixed(k === "scale" ? 1 : 2).replace(".", dec) + " mm";
  }
  $("[data-pat-line-label]", box).textContent = t(patternFilled(p.id) ? "pattern.gap" : "pattern.line");
  $("[data-pat-range=scale]", box).closest<HTMLElement>(".row")!.hidden = patternFixed(p.id);
  const colours = $("[data-pat-colour]", box);
  if (colours) colours.innerHTML = (["frame", "front"] as const).map((c) =>
    `<button class="pill group-pill" type="button" data-pat-col="${c}" aria-pressed="${(p.colour ?? "frame") === c}" style="--c: ${pc[c]}"><i></i>${esc(t(`pattern.colour.${c}`))}</button>`).join("");
  $("[data-pat-hint]", box).textContent = side === "front" && s.style === "window" ? t("pattern.window")
    : t(side === "front" ? "pattern.help" : "pattern.helpBack");
}
/** A change to a face's pattern: another one (keeping its size, thickness, halo and colour; from none, its defaults) or one of its fields. */
function changePattern(side: PatSide, change: { id?: string; field?: "scale" | "line" | "halo" | "colour"; value?: number | string }) {
  changeLook((s) => {
    const key = patKey(side), now = s[key] ?? null;
    if (change.id === "none") { delete s[key]; return; }
    if (change.id) {
      const id = change.id as PatternSpec["id"];
      s[key] = now ? { ...now, id } : { id, ...STARTING_PATTERN[side][id] };
      return;
    }
    if (!now || !change.field) return;
    s[key] = { ...now, [change.field]: change.value };
  });
}
/** A pattern chosen where there was none starts as Midnight Harlequin's. */
const STARTING_PATTERN: Record<PatSide, Record<PatternSpec["id"], Omit<PatternSpec, "id">>> = {
  front: { "rombos-lineas": { scale: 5.1, line: 0.6, halo: 0.8, colour: "frame" }, "damero-rombos": { scale: 4.2, line: 0.7, halo: 0.8, colour: "frame" },
    "escamas": { scale: 4.4, line: 0.6, halo: 0.8, colour: "frame" }, "escamas-relleno": { scale: 3.6, line: 0.7, halo: 0.8, colour: "frame" }, "rayas": { scale: 4, line: 1.6, halo: 0.8, colour: "frame" },
    "cuartelado": { line: 0.7, halo: 0.8, colour: "frame" }, "damero": { scale: 5, line: 0.7, halo: 0.8, colour: "frame" } },
  back: { "rombos-lineas": { scale: 5.1, line: 0.6, halo: 0.8 }, "damero-rombos": { scale: 4.2, line: 0.7, halo: 0.8 },
    "escamas": { scale: 4.4, line: 0.6, halo: 0.8 }, "escamas-relleno": { scale: 3.6, line: 0.7, halo: 0.8 }, "rayas": { scale: 4, line: 1.6, halo: 0.8 },
    "cuartelado": { line: 0.7, halo: 0.8 }, "damero": { scale: 5, line: 0.7, halo: 0.8 } },
};

/** The selected token's other state, if it has one (a reminder, a token of its own, never does). */
const selFlip = (role: Role) => flipFace(role, { linked: state.sel!.reminder != null });
/** The face being edited as the controls draw it: on the back of a two-state token, its other state. */
function faceRole(role: Role, side: Side) {
  const other = side === "back" ? selFlip(role) : null;
  return other ? { role: other, text: roleName(other, tokenLang()) } : { role, text: textFor(state.sel!.key, role, state.sel!.reminder) };
}

/**
 * A face part's relief, flush or raised (the shape's parts only), in a tab's relief slot: in Text,
 * Icon and Frame their own; in a back that matches the front, all three. Only one face can stand
 * out (the other lies on the bed): raising a part while the other face has raised parts asks
 * first, with the way to make that face flush.
 */
function renderRelief(slot: HTMLElement, shape: TokenShape, side: Side, f: TokenSpec, front: TokenSpec) {
  const has = SHAPE_FEATURES[shape].relief, which = slot.dataset.reliefPart!;
  const parts = (which === "all" ? RELIEF_PARTS : [which as ReliefPart]).filter((k) => has.includes(k));
  if (!parts.length) { slot.innerHTML = ""; return; }
  const relief = reliefOf(f), raised = parts.some((k) => relief[k]);
  // no name in the solo layout: nothing to raise
  const off = (k: ReliefPart) => k === "text" && shape === "coin" && f.style === "solo";
  const row = (k: ReliefPart) => `<div class="relief-el"><span><b>${esc(which === "all" ? t(`relief.${k}`) : t("relief.title"))}</b><small>${esc(shapeText(`relief.${k}.help`, shape))}</small></span><span class="seg2" role="group" aria-label="${esc(t(`relief.${k}`))}" data-relief="${k}" data-side="${side}"><button type="button" data-v="flat" aria-pressed="${!relief[k]}"${off(k) ? " disabled" : ""}>${esc(t("relief.flat"))}</button><button type="button" data-v="raised" aria-pressed="${relief[k]}"${off(k) ? " disabled" : ""}>${esc(t("relief.raised"))}</button></span></div>`;
  const ask = state.reliefAsk && state.reliefAsk.side === side && parts.includes(state.reliefAsk.part)
    ? `<p class="hint warn relief-ask">${esc(t(side === "front" ? "relief.askBack" : "relief.askFront"))} <button class="pill" type="button" data-relief-swap>${esc(t(side === "front" ? "relief.flattenBack" : "relief.flattenFront"))}</button></p>` : "";
  const total = dec1(front.height + front.reliefHeight);
  const help = raised ? t(side === "front" ? "relief.raisedHelp" : "relief.raisedBackHelp", { total }) : side === "front" ? shapeText("relief.flatHelp", shape) : t("relief.flatBack");
  slot.innerHTML = parts.map(row).join("") + ask + `<p class="hint${raised ? " warn" : ""}">${esc(help)}</p>`;
  // the raised parts' height, shared by every part (only one face stands out)
  if (raised) { slot.insertBefore($("#reliefHeightBox"), slot.lastElementChild); $("#reliefHeightBox").hidden = false; }
}
/** Raising or flattening a face part; raising one while the other face has raised parts asks first (renderRelief). */
function setRelief(side: Side, part: ReliefPart, raised: boolean) {
  const s = editLook();
  const other = side === "front" ? (s.backMode === "match" || s.backMode === "own") && hasRelief(s.backFace ?? {}) : hasRelief(s);
  if (raised && other) { state.reliefAsk = { side, part }; renderWorkshop(); return; }
  state.reliefAsk = null;
  changeFace(side, (f) => { f.relief = { ...reliefOf(f), [part]: raised }; });
  view3d("setView", "side"); syncView("side");
}
/** The answer to the question: the other face flush, and the part asked for raised. */
function swapRelief() {
  const ask = state.reliefAsk; if (!ask) return;
  state.reliefAsk = null;
  changeLook((s) => {
    if (ask.side === "front") { s.backFace = { ...s.backFace, relief: { text: false, frame: false, icon: false } }; s.relief = { ...reliefOf(s), [ask.part]: true }; }
    else { s.relief = { text: false, frame: false, icon: false }; s.backFace = { ...s.backFace, relief: { ...reliefOf(s.backFace ?? {}), [ask.part]: true } }; }
  });
  view3d("setView", "side"); syncView("side");
}

/** Puts a design's values into the controls: the face's (front or back) in a face's tabs, the token's elsewhere. */
function syncControls(role: Role, spec: TokenSpec, token: Token) {
  const shape = shapeOf(role), f = SHAPE_FEATURES[shape], side = editSide(), panel = openPanel();
  const s = faceOf(spec, "front"), face = faceOf(spec, side), who = faceRole(role, side);
  const dec = uiLang() === "es" ? "," : ".";
  const FACE_RANGES = new Set<string>(FACE_FIELDS);
  for (const [id, [dp, unit]] of Object.entries(RANGES) as [RangeKey, [number, string]][]) {
    const v = (FACE_RANGES.has(id) ? face : s)[id];
    $<HTMLInputElement>("#" + id).value = String(v);
    $(`output[data-for=${id}]`).textContent = (+v).toFixed(dp).replace(".", dec) + unit;
  }
  const row = (id: string) => $("#" + id).closest<HTMLElement>(".row")!;
  // Layout: the coin's layouts, drawn on this face
  if (panel === "layout") { renderStyleTiles(who, face); $("#styleHint").textContent = t(`style.${face.style}.help`); }
  // Text: the name; a ring's letters are as tall as asked only up to the band between its edge
  // lines (the slider stops there and shows the height they print at); a card's phrase is fitted.
  const textSize = $<HTMLInputElement>("#textSize");
  textSize.max = shape === "ring" ? String(Math.floor(ringBand(face).band * 10) / 10) : "6";
  if (shape === "ring") $("output[data-for=textSize]").textContent = (Math.min(face.textSize, +textSize.max)).toFixed(1).replace(".", dec) + " mm";
  const coinStyle = (st: TokenStyle) => shape === "coin" && face.style === st;
  row("textSize").hidden = !f.textSize || coinStyle("solo");
  row("spacing").hidden = !f.spacing || coinStyle("window") || coinStyle("solo");
  row("maxArc").hidden = !f.maxArc || coinStyle("window") || coinStyle("solo");
  // The window's front is the window itself; its icon takes the coin's colour. A card's or a
  // ring's front is only its name.
  $("#frontColourLabel").textContent = shape === "coin" ? t(face.style === "window" ? "front.colourWindow" : "front.colour") : t("front.colourName");
  // how the name came out: this face's (a two-state token's front also names its other state's when it's drawn alike)
  const hint = (n: Token["name"]) => {
    const small = n.letterHeight < smallLetters(), mm = (Math.floor(n.letterHeight * 10) / 10).toFixed(1);
    return !Number.isFinite(n.letterHeight) ? t("name.hintSolo")
      : n.repeats ? t("name.hintRing", { n: n.repeats, mm, shrunk: n.scale < 1, small, nozzle: nozzleMm() })
      : n.total == null ? t("name.hintWindow", { lines: n.lines, mm, small, nozzle: nozzleMm() })
      : t("name.hint", { arc: n.total.toFixed(0), mm, shrunk: n.scale < 1, small, nozzle: nozzleMm() });
  };
  const other = selFlip(role), b = token.backName;
  const names = side === "back" ? [b] : [token.name, other && s.backMode !== "own" ? b : undefined];
  $("#nameHint").className = "hint" + (names.some((x) => x && x.letterHeight < smallLetters()) ? " warn" : "");
  $("#nameHint").textContent = side === "back" && b ? (other ? `${t("name.flip", { name: roleName(other, tokenLang()) })} ` : `${t("name.back")} `) + hint(b)
    : hint(token.name) + (names[1] && other ? ` ${t("name.flip", { name: roleName(other, tokenLang()) })} ${hint(names[1])}` : "");
  $("#iconColourHint").textContent = t(face.style === "window" ? "icon.colourWindow" : "icon.colourName");
  // Frame: a coin's designs, or for a card or a ring only with or without (any design is a line there)
  if (panel === "frame") renderFrameTiles(who, face);
  // Back: a design (and its colour) or the front again in a colour of its own. The designs are the
  // style's, for its tokens without another state: one with another state shows that instead (the note says so).
  if (panel === "pattern") renderPattern("front", role, s);
  if (panel === "back") {
    const design = s.backMode !== "match";
    $("#backDesign").hidden = !design; $("#backMatch").hidden = design;
    if (design) renderBackTiles(role, s);
    $("[data-pat-side=back]").hidden = !design || !f.pattern;
    if (design && f.pattern) renderPattern("back", role, s);
    $("#matchColourLabel").textContent = t(s.style === "window" ? "back.faceColourWindow" : "back.faceColour");
  }
  // Body: its colour, size (a coin's diameter, a ring's base, a card's fixed), thickness and colour depth
  $("#diameterRow").hidden = !f.diameter;
  $("#ringBaseRow").hidden = !f.ringBase;
  $("#separatorRow").hidden = !f.separator;
  $("#cardSizeHint").hidden = shape !== "card";
  const rs = ringSize(s);
  $("#ringBaseHint").textContent = t("ring.baseHelp", { inner: dec1(2 * rs.inner), outer: dec1(2 * rs.outer) });
  $("#baseColourLabel").textContent = shapeText("coin.colour", shape);
  $("label[for=height]").textContent = shapeText("range.height", shape);
  $("#depthHint").className = "hint" + (token.depthClamped ? " warn" : "");
  $("#depthHint").textContent = token.depthClamped ? t("depth.clamped", { max: token.depthClamped.toFixed(1), core: "0.4" }) : shapeText("depth.help", shape);
  // Magnet: the hole, the pause and how thick the coin has to be, as the token prints it. A back
  // that is a face has no pocket (the magnet goes inside), nor has a token with another state.
  const printed = shapeSpec(role, s), faceBack = s.backMode === "match" || s.backMode === "own";
  const m = magnetLayout(printed), dec2 = (v: unknown) => String(v).replace(".", dec);
  $("#magnetSizeRow").hidden = !m;
  const flipsHere = backReach().flips;
  $("#magnetHint").textContent = !m ? t("magnet.none.help")
    : t(`magnet.${m.kind}.help`, { d: dec2((m.radius * 2).toFixed(1)), size: `${m.md} × ${m.mt}`, z: dec2(m.pauseZ) })
      + (s.height < m.minHeight ? " " + t("magnet.taller", { from: dec2(s.height), to: dec2(m.minHeight) }) : "")
      + (faceBack && s.magnet !== "none" ? " " + t("magnet.faceBack") : s.magnet === "pocket" && flipsHere.length ? " " + t("magnet.flipHidden", { n: flipsHere.length }) : "");
  // pressed: the face's choices in a face's tabs, the token's elsewhere; the magnet as it prints
  for (const b of $$("[data-choice] button")) {
    const key = b.parentElement!.dataset.choice as keyof TokenSpec, from = key === "style" || key === "frame" ? face : s;
    const v = key === "magnet" && faceBack && s.magnet === "pocket" ? "hidden" : from[key] ?? DEFAULT_SPEC[key];
    b.setAttribute("aria-pressed", String(v === b.dataset.v));
  }
  $("[data-choice=magnet] [data-v=pocket]").hidden = faceBack;
  $$(".metal").forEach((box) => {
    const k = box.dataset.colour as keyof SpecColours, from = box.dataset.side === "back" || (box.closest("[data-panel=text], [data-panel=frame]") && side === "back") ? faceOf(spec, "back") : s;
    $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === from.colours[k])));
  });
  // Relief: in the open tab's slot, for the face being edited
  $("#reliefHeightBox").hidden = true; $("#styleFields").append($("#reliefHeightBox"));
  for (const slot of $$<HTMLElement>(".relief-slot")) {
    if (slot.closest<HTMLElement>(".ws-panel")!.dataset.panel !== panel || slot.closest(".back-match[hidden]")) { slot.innerHTML = ""; continue; }
    renderRelief(slot, shape, slot.dataset.reliefPart === "all" ? "back" : side, slot.dataset.reliefPart === "all" ? faceOf(spec, "back") : face, s);
  }
  // Reset buttons: shown where a field differs from what it resets to (see resetBase), never on a
  // hidden field, and not on a back face (its fields follow the front until changed).
  for (const btn of $$("[data-reset]")) {
    const k = btn.dataset.reset!, own = btn.closest(".row") || btn.previousElementSibling, base = resetBase(k);
    btn.hidden = !base || side === "back" || sameValue(fieldValue(s, k), fieldValue(base.spec, k)) || !!own?.closest("[hidden]:not(.ws-panel)");   // a closed tab keeps its resets
    btn.title = base?.title ?? "";
    btn.setAttribute("aria-label", btn.title);
  }
}

/** A field of a spec by its key: "diameter", "frame" or "colours.base". */
function fieldValue(spec: SpecInput, key: string) {
  if (key.startsWith("colours.")) return { ...DEFAULT_SPEC.colours, ...spec.colours }[key.slice(8) as keyof SpecColours];
  return spec[key as keyof TokenSpec] ?? DEFAULT_SPEC[key as keyof TokenSpec];
}
/**
 * What a field resets to: in the design step, the token's design's value (the button shows where
 * the token changed it); in the Taller, the value of the design yours was made from, when it says.
 */
function resetBase(field: string): { spec: TokenSpec; title: string } | null {
  if (TALLER) { const from = tallerMine()?.from; return from ? { spec: from.spec, title: t("reset.toPreset", { name: from.name }) } : null; }
  const { key } = state.sel!, d = designFor(key);
  return lookFields(state.overrides.get(key)?.look).includes(field) ? { spec: d.spec, title: t("reset.toStyle", { name: d.name }) } : null;
}
function resetField(field: string) {
  const base = resetBase(field); if (!base) return;
  if (!TALLER) {   // the token's own change goes: its design's value again
    const key = state.sel!.key, o = { ...state.overrides.get(key)! }, look = prunedLook(designFor(key).spec, withoutLookField(o.look!, field));
    if (look) o.look = look; else delete o.look;
    setOwn(key, o);
    return;
  }
  const v = structuredClone(fieldValue(base.spec, field));
  changeLook((s) => {
    setField(s, field, v);
    if (field === "back" && v === "custom") s.customSvg = base.spec.customSvg;
  });
}

/**
 * A change to the look, from any control. In the design step it's the token's own, over its design
 * (kept field by field, and only as far as it differs from it). In the Taller it's the design's,
 * which every token using it shows.
 */
function changeLook(mutate: (s: TokenSpec) => void) {
  if (TALLER) {
    const d = tallerMine(); if (!d) return;
    const next = structuredClone(d.spec);
    mutate(next);
    d.spec = next;
    storeMyDesigns(); renderTaller();
    return;
  }
  const { key } = state.sel!, own: TokenOverride = { ...state.overrides.get(key) };
  const before = lookOf(key), next = structuredClone(before);
  mutate(next);
  let look = own.look ?? {};
  for (const f of lookDiff(before, next)) look = withLookField(look, f, fieldOf(next, f));
  const kept = prunedLook(designFor(key).spec, look);
  if (kept) own.look = kept; else delete own.look;
  state.flash = "";
  setOwn(key, own);
}
let sheetTimer: ReturnType<typeof setTimeout> | number = 0;
function scheduleSheet() { clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { renderSheet(); renderSpine(); renderQueue(); }, 180); }
/** A token's own text, feminine name, icon, design or look changes; with none left, it simply has its default design. */
function setOwn(key: string, own: TokenOverride) {
  if (!own.text && !own.fem && !own.icon && !own.style && !own.look) state.overrides.delete(key); else state.overrides.set(key, own);
  storeOverrides(); renderWorkshop(); scheduleSheet();
}

// ------------------------------------------------------------ own icons

/** Gives the selected token's character an icon (null: back to its own). Its reminders follow. */
function setIcon(icon: TokenIcon | null) {
  const key = charKey(state.sel!.role), own: TokenOverride = { ...(state.overrides.get(key) || {}) };
  if (icon) own.icon = icon; else delete own.icon;
  setOwn(key, own);
}
function renderIconField() {
  const role = state.sel?.role; if (!role) return;
  const icon = ownIcon(role.id), isRem = state.sel!.reminder != null;
  $("#iconReset").hidden = !icon;
  $("#iconHint").className = "hint";
  $("#iconHint").textContent = icon
    ? t(icon.source === "game-icons" ? "icon.isGame" : "icon.isOwn", { name: icon.name || "SVG", author: icon.author || "" }) + (isRem ? ` ${t("icon.remShares")}` : "")
    : t("icon.help");
}
function wireIcons() {
  $("#iconUpload").onclick = () => $("#iconFile").click();
  $("#iconFile").onchange = async (e) => {
    const file = input(e).files![0]; input(e).value = "";
    if (!file) return;
    try { setIcon(iconFromSvg(await file.text(), { source: "upload", name: file.name.replace(/\.svg$/i, "") })); }
    catch (err) { $("#iconHint").className = "hint warn"; $("#iconHint").textContent = t((err as Error).message === "no-shapes" ? "icon.noShapes" : "icon.notSvg"); }
  };
  $("#iconReset").onclick = () => setIcon(null);
  $("#iconSearchOpen").onclick = () => { const box = $("#iconSearch"); box.hidden = !box.hidden; if (!box.hidden) $("#iconQuery").focus(); };
  let timer: ReturnType<typeof setTimeout> | number = 0;
  $("#iconQuery").oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const hits = await searchGameIcons(input(e).value);
      $("#iconResults").innerHTML = hits.length
        ? hits.map((p) => `<button type="button" class="icon-hit" data-gi="${esc(p)}" title="${esc(p.replace("/", " · "))}"><img src="${gameIconPreview(p)}" alt="" loading="lazy"><span>${esc(p.split("/")[1])}</span></button>`).join("")
        : `<p class="hint">${esc(t(input(e).value.trim() ? "icon.none" : "icon.type"))}</p>`;
    }, 200);
  };
  $("#iconResults").onclick = async (e) => {
    const b = hit(e, "[data-gi]"); if (!b) return;
    try { setIcon(await gameIcon(b.dataset.gi!)); $("#iconSearch").hidden = true; }
    catch { $("#iconHint").className = "hint warn"; $("#iconHint").textContent = t("icon.fetchFailed"); }
  };
}

function syncView(v: string | undefined) {
  const turned = (state.view === "back") !== (v === "back");
  state.view = v ?? "angle";
  $$(".turn .pill[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  if (turned && state.step === 2 && state.lib) renderDesignStage();   // the strip shows the coins from the side the view does
}

function buildChoices() {
  const make = (key: string, list: { id: string }[]) => {
    $(`[data-choice=${key}]`).innerHTML = list.map((s) => `<button class="pill" type="button" data-v="${s.id}">${esc(t(`${key}.${s.id}`))}</button>`).join("");
  };
  // Layouts are drawn as coin tiles by renderStyleTiles().
  make("magnet", [{ id: "none" }, { id: "pocket" }, { id: "hidden" }]);
  $("[data-choice=magnetSize]").innerHTML = MAGNET_SIZES.map((v) => `<button class="pill" type="button" data-v="${v}">${v.replace("x", " × ")} mm</button>`).join("");
  // a ring's mark between repeats: each drawn as itself, with its name
  $("[data-choice=separator]").innerHTML = RING_SEPARATORS.map((id) => `<button class="pill" type="button" data-v="${id}">${SEPARATOR_MARKS[id]}${esc(t(`separator.${id}`))}</button>`).join("");
  $("[data-choice=ringBase]").innerHTML = RING_BASES.map((v) => `<button class="pill" type="button" data-v="${v}">${v} mm</button>`).join("");
  // Frames are drawn as coin tiles by renderFrameTiles().
  // Backs are drawn as coin tiles by renderBackTiles().
  for (const side of ["front", "back"] as const) $(`[data-pat-side=${side}]`).innerHTML = patternGroupHtml(side);
  for (const box of $$(".metal")) {
    // Every filament the Bambu export knows. The name and icon and the frame can take the team
    // colour; on the coin or the back it would show the team from behind.
    const opts = [...(["front", "frame"].includes(box.dataset.colour!) ? [{ id: "team", hex: "team" }] : []), ...COLOUR_CHOICES];
    box.innerHTML = opts.map((o) => `<button type="button" class="${o.id === "team" ? "team" : ""}" data-v="${o.hex}" style="${o.id === "team" ? "" : `background:${o.hex}`}" aria-label="${esc(t(`metal.${o.id}`))}" title="${esc(t(`metal.${o.id}`))}"></button>`).join("");
  }
}

// ------------------------------------------------------------ wiring

function wire() {
  // spine and sheet
  $(".spine-scroll").onclick = (e) => {
    if (hit(e, "[data-script-new]")) { openScriptDialog(); return; }
    const b = hit(e, "[data-ed]"); if (!b) return;
    goEdition(b.dataset.ed);
    drawer(false);
  };
  // scripts
  $("#scriptNew").onclick = openScriptDialog;
  $("#scriptDialogCancel").onclick = () => $<HTMLDialogElement>("#scriptDialog").close();
  $("#scriptDialogSave").onclick = () => saveFromDialog($<HTMLTextAreaElement>("#scriptDialogText").value);
  // Warn as soon as the pasted JSON renames or re-icons official characters.
  $("#scriptDialogText").oninput = (e) => {
    let data = null; try { data = JSON.parse(input(e).value); } catch { /* not JSON yet */ }
    $("#scriptDialogWarn").hidden = !scriptCustomizes(data);
  };
  $("#scriptDialogFile").onchange = async (e) => { const f = input(e).files![0]; input(e).value = ""; if (f) saveFromDialog(await f.text()); };
  $("#scriptInviteSkip").onclick = () => $<HTMLDialogElement>("#scriptInvite").close();
  $("#scriptShare").onclick = shareScript;
  $("#scriptJson").onclick = () => {
    const sc = scriptOf(state.edition); if (!sc) return;
    saveFile(new Blob([scriptJsonWithOwn(sc)], { type: "application/json" }), `${sc.name.replace(/[\\/:*?"<>|]+/g, "").trim() || "script"}.json`);
  };
  $("#scriptDelete").onclick = (e) => {
    const b = e.currentTarget as HTMLElement, sc = scriptOf(state.edition); if (!sc) return;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("script.deleteConfirm"); return; }
    storeScripts(loadScripts().filter((x) => x.id !== sc.id));
    // its homebrew characters go with it, and so do their tokens in the selection
    const gone = (k: string) => roleIdOf(k).startsWith(`hb_${sc.id}_`);
    if ([...state.pick.keys()].some(gone)) { for (const k of [...state.pick.keys()]) if (gone(k)) state.pick.delete(k); persistPicks(); }
    if (gone(state.sel!.key)) { const first = state.lib!.roles.find((r) => r.en === "Fortune Teller") || state.lib!.roles[0]; state.sel = { key: charKey(first), role: first, reminder: null }; }
    syncHomebrew();
    goEdition("all");
  };
  window.addEventListener("hashchange", openSharedScript);
  // phone: the top bar opens the sidebar as a drawer (step 1)
  $("#drawerOpen").onclick = () => drawer(true);
  $("#scrim").onclick = () => drawer(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#spine").classList.contains("open")) drawer(false); });
  PHONE.addEventListener("change", () => drawer(false));
  drawer(false);
  $("#search").oninput = () => { renderSpine(); renderSheet(); };
  $("#teamChips").onclick = (e) => { const b = hit(e, "[data-team]"); if (b) { state.team = b.dataset.team!; renderSheet(); } };
  // step 1: tap a token to pick it (or drop it); a team or everything shown at once
  $("#rows").onclick = (e) => {
    const ownEdit = hit(e, "[data-own-edit]");
    if (ownEdit) { openTokenPanel(ownEdit.dataset.ownEdit!); return; }
    const pen = hit(e, "[data-edit]");
    if (pen) { editToken(pen.dataset.edit!); return; }
    if (onCopyStep(e)) return;
    const fold = hit(e, "[data-rems-fold]");
    if (fold) { const k = fold.dataset.remsFold!; openRows.has(k) ? openRows.delete(k) : openRows.add(k); renderSheet(); $(`[data-rems-fold="${CSS.escape(k)}"]`)?.focus(); return; }
    const pick = hit(e, "[data-pick]"), team = hit(e, "[data-pick-team]");
    if (pick) { toggleCharacter(pick.dataset.pick!); return; }
    // a reminder chip: all its reminders in, or (when they're all in already) all out
    const chip = hit(e, "[data-pick-rems]");
    if (chip) { const keys = chip.dataset.pickRems!.split(" "), on = !keys.every(isPicked); keys.forEach((k) => setPick(k, on)); picksChanged(); return; }
    // anywhere else in a character's row adds or drops the character
    const row = !team && hit(e, "[data-row]");
    if (row && !hit(e, "a, button, input")) { toggleCharacter(row.dataset.row!); return; }
    if (team) {
      const list = (state.shown || []).filter((r) => r.team === team.dataset.pickTeam), on = !list.every((r) => isPicked(charKey(r)));
      list.forEach((r) => setPick(charKey(r), on)); picksChanged();
    }
  };
  wireCollSwitch();
  wireDesignBar();
  if (OWN) wireOwn();
  // your designs changed in another tab (the Taller): drawn with them here too
  window.addEventListener("storage", (e) => {
    if (e.key !== MY_DESIGNS_KEY || TALLER || !state.lib) return;
    myDesigns = readMyDesigns();
    renderAll(); renderQueue();
  });
  // "Add to queue": a menu of what to add (see renderAddMenu)
  $("#addBtn").onclick = (e) => { openAddMenu($("#addMenu").hidden, e.detail === 0); };
  $("#addMenu").onclick = (e) => {
    const b = hit(e, "[data-a]") as HTMLButtonElement | null; if (!b || b.disabled) return;
    openAddMenu(false); addShown(b.dataset.a!); $("#addBtn").focus();
  };
  $("#addMenu").onkeydown = (e) => {
    const items = [...$$("#addMenu button:not(:disabled)")], i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
    else if (e.key === "Escape") { openAddMenu(false); $("#addBtn").focus(); }
    else if (e.key === "Tab") openAddMenu(false);
  };
  document.addEventListener("click", (e) => { if (!$("#addMenu").hidden && !hit(e, ".addmenu")) openAddMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#addMenu").hidden) { openAddMenu(false); $("#addBtn").focus(); } });
  // the steps
  $("#flowSteps").onclick = (e) => { const b = hit(e, "[data-goto]") as HTMLButtonElement | null; if (b && !b.disabled) goStep(+b.dataset.goto!); };
  $("#flowBack").onclick = () => goStep(state.step - 1);
  $("#flowNext").onclick = () => (state.step < 3 ? goStep(state.step + 1) : flow.way === "paper" ? downloadPdf() : downloadBambu());
  // step 2: your tokens; tap one to give it its own design
  $("#designGrid").onclick = (e) => {
    const drop = hit(e, "[data-drop]");
    if (drop) { dropFromDesign(drop.dataset.drop!); return; }
    if (onCopyStep(e)) return;
    const b = hit(e, "[data-design]"); if (b) designToken(b.dataset.design!);
  };
  // a mouse wheel moves the strip of tokens sideways
  $("#designGrid").addEventListener("wheel", (e) => {
    const g = e.currentTarget as HTMLElement;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || g.scrollWidth <= g.clientWidth) return;
    g.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  // step 3: how to print
  $("#printPage").addEventListener("change", (e) => {
    if (input(e).id !== "paperBacks") return;
    flow.backs = input(e).checked; storeJSON(PAPER_BACKS_KEY, flow.backs);
    $("#printNote").textContent = ""; renderQueue();
  });
  $("#printPage").addEventListener("click", (e) => {
    const w = hit(e, "[data-way]"), pr = hit(e, "[data-printer]"), nz = hit(e, "[data-nozzle]"), fix = hit(e, "[data-fix]");
    if (fix) { goStep(2); designToken(fix.dataset.fix!); return; }
    if (hit(e, "[data-deepen-all]")) { deepenAll(); return; }
    if (hit(e, "[data-test]") && testQ) { downloadBambu(testQ, hit(e, "[data-test]") as HTMLButtonElement); return; }
    if (w) { flow.way = w.dataset.way!; storeJSON(PRINT_WAY_KEY, flow.way); }
    else if (pr) { flow.printer = printerOf(pr.dataset.printer!).id; storeJSON(PRINTER_KEY, flow.printer); }
    else if (nz) { flow.nozzle = nozzleOf(nz.dataset.nozzle!).id; storeJSON(NOZZLE_KEY, flow.nozzle); }
    else return;
    $("#printNote").textContent = ""; renderQueue();
  });

  // workshop
  // Front and Back turn the view; on a coin, they also open its FRONT or BACK when one of them is open.
  $$(".turn .pill[data-view]").forEach((b) => b.onclick = () => {
    const v = b.dataset.view as ViewKind;
    view3d("setView", v); syncView(v);
    if (state.sel && editShape() === "coin" && (v === "top" || v === "back")) {
      const part = openPart(), want = v === "back" ? "back" : "front";
      if ((part === "front" || part === "back") && part !== want) { showTab({ part: want }); renderWorkshop(); }
    }
  });
  $("#xray").onclick = () => {
    const on = $("#xray").getAttribute("aria-pressed") !== "true";
    $("#xray").setAttribute("aria-pressed", String(on));
    view3d("setXray", on);
    if (on) { view3d("setView", "side"); syncView("side"); }
  };
  // the token's design: the sheet to choose it (the default, the collection's, yours); its own changes
  // kept as a design of yours or dropped; and the way back to the default
  $("#styleChange").onclick = () => openDesignSheet("token", shapeOf(state.sel!.role), $("#styleChange"));
  wireDesignSheet();
  $("#styleSave").onclick = () => void saveLookAsDesign(state.sel!.key);
  $("#styleDrop").onclick = () => {
    const key = state.sel!.key, own: TokenOverride = { ...state.overrides.get(key) };
    delete own.look;
    setOwn(key, own);
    state.flash = t("design.dropDone", { name: designFor(key).name });
    renderWorkshop();
  };
  $("#styleBack").onclick = () => {
    const key = state.sel!.key, own: TokenOverride = { ...state.overrides.get(key) };
    delete own.look; delete own.style;
    setOwn(key, own);
    state.flash = t("design.backDone", { name: designFor(key).name });
    renderWorkshop();
  };
  $("#designTaller").onclick = rememberReturn;
  // what the token says: one line, opening its content (your collection's) or its printed text and icon (a closed one's)
  $("#saysLine").onclick = (e) => {
    const edit = hit(e, "[data-content-edit]");
    if (edit) { openTokenPanel(edit.dataset.contentEdit!); return; }
    if (hit(e, ".says-toggle")) { state.saysOpen = !state.saysOpen; renderSays(); }
  };
  $("#parts").onclick = (e) => { const b = hit(e, "[data-part]"); if (!b) return; showTab({ part: b.dataset.part as Part }); viewTab(); renderWorkshop(); };
  $("#faceTabs").onclick = (e) => { const b = hit(e, "[data-face]"); if (!b) return; showTab({ face: b.dataset.face as FaceTab }); renderWorkshop(); };
  $("#backModes").onclick = (e) => { const b = hit(e, "[data-back-mode]"); if (b) setBackMode(b.dataset.backMode as BackMode); };
  // A face's choices and sliders go to the face being edited (the front, or a back of its own); the rest to the token.
  const FACE_KEYS = new Set<string>(FACE_FIELDS);
  const change = (key: string, mutate: (s: TokenSpec) => void) => (FACE_KEYS.has(key) ? changeFace(editSide(), mutate) : changeLook(mutate));
  for (const key of ["style", "frame", "back", "magnet", "magnetSize", "ringBase", "separator"]) {
    $(`[data-choice=${key}]`).onclick = (e) => {
      const b = hit(e, "button"); if (!b) return;
      if (key === "back" && b.dataset.v === "custom" && !editLook().customSvg) { $("#upload").click(); return; }
      change(key, (s) => {
        // a name size doesn't carry over between layouts: each starts from its own
        if (key === "style" && (s.style ?? DEFAULT_SPEC.style) !== b.dataset.v) s.textSize = LAYOUT_TEXT[b.dataset.v as TokenStyle];
        (s as unknown as Fields)[key] = b.dataset.v;
      });
      if (key === "back") { view3d("setView", "back"); syncView("back"); }
    };
  }
  // the name's and the frame's colours are the face's; the back's own (a back that matches the front) is marked as the back's
  for (const box of $$(".metal")) box.onclick = (e) => {
    const b = hit(e, "button"); if (!b) return;
    const key = box.dataset.colour!, mutate = (s: TokenSpec) => { s.colours = { ...DEFAULT_SPEC.colours, ...s.colours, [key]: b.dataset.v! }; };
    if (box.dataset.side === "back") changeFace("back", mutate);
    else if (box.closest("[data-panel=text], [data-panel=frame]")) changeFace(editSide(), mutate);
    else changeLook(mutate);
  };
  for (const id of Object.keys(RANGES) as RangeKey[]) $("#" + id).oninput = (e) => change(id, (s) => { s[id] = +input(e).value; });
  $("#colourWarn").addEventListener("click", (e) => { if (hit(e, "[data-deepen]")) deepen(); });
  // A reset button for every field: in a slider's row, after a group of choices or colours.
  const resetBtn = () => Object.assign(document.createElement("button"), { type: "button", className: "reset-f", hidden: true, textContent: "↺" });
  for (const id of Object.keys(RANGES)) { const b = resetBtn(); b.dataset.reset = id; $(`output[data-for=${id}]`).after(b); }
  for (const el of $$("#styleFields [data-choice], #styleFields .metal:not([data-side])")) {
    const b = resetBtn(); b.classList.add("group"); b.dataset.reset = el.dataset.choice ?? `colours.${el.dataset.colour}`; el.after(b);
  }
  $("#styleFields").addEventListener("click", (e) => {
    const r = hit(e, "[data-reset]");
    if (r) { resetField(r.dataset.reset!); return; }
    if (hit(e, "[data-relief-swap]")) { swapRelief(); return; }
    const v = hit(e, "[data-relief] [data-v]"), seg = hit(e, "[data-relief]");
    if (v && seg) setRelief(seg.dataset.side as Side, seg.dataset.relief as ReliefPart, v.dataset.v === "raised");
  });
  // a pattern: its tiles and colours on a click, its sliders when let go (each cut takes a moment), their value as they move
  for (const side of ["front", "back"] as const) {
    const box = $(`[data-pat-side=${side}]`);
    box.addEventListener("click", (e) => {
      const tile = hit(e, "[data-pat]"), col = hit(e, "[data-pat-col]");
      if (tile) changePattern(side, { id: tile.dataset.pat });
      else if (col) changePattern(side, { field: "colour", value: col.dataset.patCol });
    });
    box.addEventListener("input", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLInputElement>("[data-pat-range]"); if (!el) return;
      const k = el.dataset.patRange!;
      $(`[data-pat-out=${k}]`, box).textContent = (+el.value).toFixed(k === "scale" ? 1 : 2).replace(".", uiLang() === "es" ? "," : ".") + " mm";
    });
    box.addEventListener("change", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLInputElement>("[data-pat-range]"); if (!el) return;
      changePattern(side, { field: el.dataset.patRange as "scale" | "line" | "halo", value: Math.max(PATTERN_MIN, +el.value) });
    });
  }
  $("#upload").onchange = async (e) => {
    const f = input(e).files![0]; input(e).value = "";
    if (!f) return;
    const hint = $("#uploadHint");
    hint.hidden = false;
    if (f.size > MAX_SVG) { hint.className = "hint warn"; hint.textContent = t("upload.tooBig", { file: f.name, kb: (f.size / 1024).toFixed(0), max: MAX_SVG / 1000 }); return; }
    const svg = await f.text();
    changeLook((s) => { s.customSvg = svg; s.back = "custom"; });
    hint.className = "hint"; hint.textContent = t("upload.using", { file: f.name });
    view3d("setView", "back"); syncView("back");
  };
  // what the token says: its printed text, its feminine name and its icon (Clocktower's, a closed collection's)
  $("#printed").oninput = (e) => {
    const own = { ...(state.overrides.get(state.sel!.key) || {}), text: input(e).value };
    setOwn(state.sel!.key, own);
  };
  wireIcons();
  $("#fem").onchange = (e) => {
    const own: TokenOverride = { ...(state.overrides.get(state.sel!.key) || {}) };
    if (input(e).checked) own.fem = true; else delete own.fem;
    setOwn(state.sel!.key, own);
  };
  $("#download").onclick = forge;

  // your selection: copies, reminders, clear
  $("#queueToggle").onclick = openQueue;
  $("#queueClose").onclick = () => $<HTMLDialogElement>("#queueDrawer").close();
  $("#queueDrawer").addEventListener("click", (e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });   // backdrop
  $("#queue").onclick = onQueueClick;
  $("#queueToast button").onclick = $("#appToast button").onclick = undoPicks;
  $("#queueClear").onclick = (e) => {
    const b = e.currentTarget as HTMLElement;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("queue.clearConfirm"); return; }
    b.dataset.confirm = ""; b.textContent = t("queue.clear");
    changePicks(() => state.pick.clear(), t("queue.cleared"));
  };

  // account
  $("#signOut").onclick = () => { $<HTMLDetailsElement>(".me").open = false; signOutUser(); };
  $("#openAdmin").onclick = () => { $<HTMLDetailsElement>(".me").open = false; openAdmin(); };
  $("#adminSignIn").onclick = adminSignIn;
}

const roleById = (id: string) => state.lib!.roles.find((r) => r.id === id);
function note(text: string) { $("#exportNote").textContent = text; }

async function forge() {
  const btn = $<HTMLButtonElement>("#download");
  btn.disabled = true;
  try {
    const { role, reminder, key } = state.sel!;
    const [{ default: JSZip }, { addTokenToZip }] = await Promise.all([import("jszip"), import("./engine/export.ts")]);
    const zip = new JSZip();
    const folder = addTokenToZip(zip, state.token!, role, textFor(key, role, reminder), { faceDown: true });
    await saveFile(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
    note(t("act.downloaded", { file: `${folder}.zip` }));
  } catch (err) {
    note(t("act.downloadFailed", { message: (err as Error)?.message || String(err) }));
  } finally { btn.disabled = false; }
}

// ------------------------------------------------------------ selection

// What you picked: token keys ("c:imp", "r:imp:0") with how many copies, in the order picked.
// Picked tokens always use their style (with their own changes), so nothing goes stale.
function loadPicks() {
  const saved = loadJSON<[string, number][] | null>(PICK_KEY, null);
  if (Array.isArray(saved)) return new Map(saved.filter(([k, n]) => tokenRole(k) && n > 0));
  // From the old print queue (entries with a role, a reminder and a frozen style): keep what and how many.
  const picks = new Map<string, number>();
  for (const q of loadJSON<({ roleId: string; ri?: number | null; reminder?: string | null } | null)[]>(QUEUE_KEY, [])) {
    const role = q && roleById(q.roleId);
    if (!role) continue;
    let ri = q.ri ?? null;
    if (q.reminder != null && ri == null) for (const list of Object.values(role.reminders || {})) { const i = list.indexOf(q.reminder); if (i >= 0) { ri = i; break; } }
    if (q.reminder != null && ri == null) continue;
    const key = ri != null ? remKey(role, ri) : charKey(role);
    picks.set(key, (picks.get(key) || 0) + 1);
  }
  return picks;
}
function persistPicks() { storeJSON(PICK_KEY, [...state.pick]); }
/** The role and reminder index a token key stands for (the character is in the library: it's a key of the selection). */
function tokenRole(key: string) { return roleById(key.split(":")[1])!; }
const tokenRem = (key: string) => (key.startsWith("r:") ? +key.split(":")[2] : null);
const isPicked = (key: string) => state.pick.has(key);
function setPick(key: string, on: boolean) {
  if (on) { if (!state.pick.has(key)) state.pick.set(key, 1); }
  else state.pick.delete(key);
}
/** After any change to the selection: save it and redraw what shows it. */
function picksChanged() { persistPicks(); renderSpine(); renderSheet(); renderQueue(); }

/** The selection as queue entries, one per copy, in the current language and design. */
function queueNow() {
  const out: QueueEntry[] = [];
  for (const [key, n] of state.pick) {
    const role = tokenRole(key), ri = tokenRem(key);
    for (let i = 0; i < n; i++) out.push({ key: `${key}#${i}`, pick: key, ...queueEntry(role, ri) });
  }
  return out;
}
/** A queue entry as the sheet would draw it now: the token language, its style's look (with its own changes) and its text. */
function queueEntry(role: Role, ri: number | null): QueueEntry {
  const isRem = ri != null, key = isRem ? remKey(role, ri) : charKey(role);
  return {
    roleId: role.id, ri: isRem ? ri : null,
    reminder: isRem ? textFor(key, role, ri) : null,
    text: isRem ? null : textFor(key, role, null),
    custom: hasOwn(key),
    spec: { ...structuredClone(lookOf(key)), lang: tokenLang(), icon: ownIcon(role.id) },
  };
}
const isReminder = (q: QueueEntry): q is QueueEntry & { reminder: string } => q.reminder != null;
// As its shape prints it (shapeSpec): a card's or ring's has no back or magnet to count, and its
// real size for a diameter (a ring's outer edge), which plates and paper go by.
const itemSpec = (q: QueueEntry): TokenSpec => shapeSpec(roleById(q.roleId), isReminder(q) ? reminderSpec({ ...DEFAULT_SPEC, ...q.spec }) : q.spec);
const queueTitle = (q: QueueEntry, role: Role) => (isReminder(q) ? q.reminder : q.text ?? roleName(role, q.spec.lang));
const queueLabel = (q: QueueEntry, role: Role) => (isReminder(q) ? `${roleName(role, q.spec.lang)}: ${q.reminder}` : queueTitle(q, role));
const queueGroup = (q: QueueEntry, role: Role) => PLATE_LABEL[uiLang()][PLATE_GROUP[role.team]] + (isReminder(q) ? t("queue.reminderSuffix") : "");

/** The queue in print order: good, evil, travellers, fabled, loric; characters before their reminders. */
const PRINT_GROUPS: string[] = ["good", "evil", "traveller", "fabled", "loric", "info"];
const printOrder = () => queueNow().map((q): [QueueEntry, number] => [q, PRINT_GROUPS.indexOf(PLATE_GROUP[roleById(q.roleId)!.team] as typeof PRINT_GROUPS[number]) * 2 + (isReminder(q) ? 1 : 0)])
  .sort((a, b) => a[1] - b[1]).map(([q]) => q);   // a stable sort keeps the queue's order within a group

/** Plate plan without building geometry: which parts exist and their colours. */
/** A queued token on a plate: what the plan needs of it, without its geometry. */
type QueueItem = PlateItem<PlanToken & { spec: TokenSpec; colours: Record<PartName, Hex> }> & { q: QueueEntry };

function queuePlan() {
  const items = printOrder().map((q): QueueItem => {
    const role = roleById(q.roleId)!;
    const base = itemSpec(q);
    const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours } };
    const shape = shapeOf(role), has = SHAPE_FEATURES[shape], c = partColours(role, spec);
    const hasBack = has.back && spec.back !== "none" && (spec.back !== "custom" || spec.customSvg) && (spec.back !== "seal" || state.lib!.sealSvg) && (spec.back !== "edition" || role.edition);
    // a back that is a face (itemSpec says so) is drawn like a front: its name, icon and frame
    const face = backFaceOf(role, spec, "")?.spec, iconColour = has.icon && spec.style !== "window" ? c.front : c.base;
    return {
      q, title: queueLabel(q, role), group: queueGroup(q, role),
      token: {
        spec,
        // a card's footprint is its own; a ring takes up its outer diameter but has no body in its hole
        ...(shape === "card" ? { foot: { w: CARD.w, h: CARD.h } } : shape === "ring" ? { hole: 2 * ringSize(spec).inner } : {}),
        parts: { base: 1, front: 1, icon: has.icon ? 1 : null, frame: spec.frame !== "none" ? 1 : null, back: hasBack ? 1 : null,
          backIcon: face && has.icon ? 1 : null, backFrame: face && face.frame !== "none" ? 1 : null },
        // the window's icon is in the coin colour; the classic one in the name's (on a back face, in the back's)
        colours: { base: c.base, front: c.front, icon: iconColour, frame: c.frame, back: c.back,
          backIcon: face ? (face.style === "window" ? c.base : c.back) : iconColour, backFrame: c.backFrame },
      },
    };
  });
  return planPlates(items, { bed: printerOf(flow.printer).bed });
}

/**
 * The token to print first as a test: the one with the most colours (the most filament
 * changes to check), a character before a reminder or a card. An item of queuePlan().
 */
function testItem(plan: PlatePlan<QueueItem>) {
  const colours = (it: QueueItem) => new Set(Object.entries(it.token.parts).filter(([, v]) => v).map(([p]) => it.token.colours[p as PartName] ?? it.token.colours.base)).size;
  const rank = (it: QueueItem) => colours(it) * 4 - (isReminder(it.q) ? 2 : 0) - (isCardEntry(it.q) ? 1 : 0);
  return plan.plates.flatMap((p) => p.items).reduce<QueueItem | null>((best, it) => (!best || rank(it) > rank(best) ? it : best), null);
}
let testQ: QueueEntry | null = null;   // the Print step's test token (a queue entry)

/** A queued token's footprint: a coin's diameter, or a card's size. */
const isCardEntry = (q: QueueEntry) => isCard(roleById(q.roleId));
const paperSize = (q: QueueEntry): PaperSize => (isCardEntry(q) ? CARD : itemSpec(q).diameter);

/** Each part's volume (mm³) for a queued token, from its real geometry; cached by what shapes it. */
const volumeCache = new Map<string, Volumes>();
function tokenVolumes(q: QueueEntry) {
  const role = roleById(q.roleId)!, spec = itemSpec(q), text = queueTitle(q, role);
  const k = JSON.stringify([q.roleId, text, spec]);
  if (!volumeCache.has(k)) {
    const { parts, above } = buildToken(state.lib!, role, spec, text);
    volumeCache.set(k, { ...Object.fromEntries(Object.entries(parts).map(([p, g]) => [p, geometryVolume(g)])), above: above ?? {} } as Volumes);
    if (volumeCache.size > 500) volumeCache.delete(volumeCache.keys().next().value!);
  }
  return volumeCache.get(k)!;
}
/** Filament and time per plate of the plan (estimates; Bambu Studio gives the exact figures). */
const plateEstimates = (plan: PlatePlan<QueueItem>) => plan.plates.map((p) => plateFeatures(p.items.map((it) => ({ token: it.token, vol: tokenVolumes(it.q) })), flow.nozzle));


// ------------------------------------------------------------ steps

const PRINT_WAY_KEY = "midnight-mint-print-way", PRINTER_KEY = "midnight-mint-printer", NOZZLE_KEY = "midnight-mint-nozzle", PAPER_BACKS_KEY = "midnight-mint-paper-backs";
const flow: { way: string; printer: string; nozzle: string; backs: boolean; undo: Map<string, number> | null } = { way: loadJSON<string>(PRINT_WAY_KEY, "3d") === "paper" ? "paper" : "3d", printer: printerOf(loadJSON(PRINTER_KEY, "a1")).id,
  nozzle: nozzleOf(loadJSON(NOZZLE_KEY, "0.4")).id,   // 3D: the printer's nozzle, 0.4 mm (standard) or 0.2 mm
  backs: loadJSON<boolean>(PAPER_BACKS_KEY, true) !== false,   // paper: print the backs too (double-sided)
  undo: null };
/** Letters smaller than this (mm) may not print cleanly: the 3D nozzle's limit; on paper, the 0.4 mm one's. */
const smallLetters = () => (flow.way === "3d" ? nozzleOf(flow.nozzle).smallLetters : SMALL_LETTERS_MM);
const nozzleMm = () => String(flow.way === "3d" ? nozzleOf(flow.nozzle).mm : 0.4).replace(".", uiLang() === "es" ? "," : ".");
const queuePic = (q: QueueEntry, role = roleById(q.roleId)!) => tokenSvg(state.lib!, role, itemSpec(q), { text: queueTitle(q, role) });

/** Moves to step 1 (pick), 2 (design) or 3 (print). Steps 2 and 3 need something picked. */
function goStep(step: number) {
  if (step > 1 && !state.pick.size) step = 1;
  state.step = step;
  $("#app").dataset.step = String(step);
  drawer(false);
  if (step === 2) {
    // the workshop shows a picked token, preferably the one already selected
    if (!state.sel || !isPicked(state.sel!.key)) { const k = state.pick.keys().next().value; selectToken(k); }
    renderWorkshop(); renderDesignStage();
    revealPicked();
  }
  if (step === 3) { $("#printNote").textContent = ""; renderPrintStep(); $("#printPage").scrollTo({ top: 0 }); }
  if (step === 1) renderSheet();
  renderQueue();
}

/** The top bar's steps and the bottom bar: the selection, back and on. */
function renderQueue() {
  if (!state.lib) return;
  const queue = queueNow(), n = queue.length, step = state.step;
  const chars = new Set([...state.pick.keys()].filter((k) => k.startsWith("c:"))).size, rems = queue.filter(isReminder).length;
  $("#flowSteps").innerHTML = [1, 2, 3].map((i) => `<button class="flow-step${step > i ? " done" : ""}" type="button" data-goto="${i}" ${step === i ? 'aria-current="step"' : ""} ${i > 1 && !n ? "disabled" : ""}><i>${step > i ? "✓" : i}</i><b>${esc(t(`flow.step${i}`))}</b></button>`).join("");
  $("#queueCount").textContent = n ? t("queue.count", { n }) : t("pick.nothing");
  $("#queueStack").innerHTML = [...state.pick.keys()].slice(-5).map((k) => queuePic({ pick: k, ...queueEntry(tokenRole(k), tokenRem(k)) })).join("");
  $<HTMLButtonElement>("#queueToggle").disabled = !n;
  $("#queueSummary").textContent = n ? t("queue.summary", { c: chars, r: rems }) : t("pick.help");
  $("#flowBack").hidden = step === 1;
  // on a phone only the chevron shows; the step's name stays as the label
  $("#flowBack").innerHTML = step > 1 ? `<span aria-hidden="true">‹</span> <span class="fb-l">${esc(t(`flow.step${step - 1}`))}</span>` : "";
  $("#flowBack").setAttribute("aria-label", step > 1 ? t(`flow.step${step - 1}`) : "");
  const next = $<HTMLButtonElement>("#flowNext");
  next.textContent = step === 1 ? `${t("flow.step2")} ›` : step === 2 ? `${t("flow.step3")} ›` : (flow.way === "paper" ? t("queue.downloadPdf") : t("queue.download", { printer: `Bambu ${printerOf(flow.printer).short}` }));
  next.disabled = !n;
  if ($<HTMLDialogElement>("#queueDrawer").open) renderQueueList();
  if (step === 2) renderDesignStage();
  if (step === 3) renderPrintStep();
}

// ------------------------------------------------------------ your selection (the drawer)

function openQueue() {
  if (!state.pick.size) return;
  const dlg = $<HTMLDialogElement>("#queueDrawer");
  if (!dlg.open) dlg.showModal();
  renderQueueList();
}
/** Changes the selection with "Undo" for a few seconds. */
let toastTimer: ReturnType<typeof setTimeout> | undefined;   // the Undo toast's
function changePicks(mutate: () => void, message: string) {
  const before = new Map(state.pick);
  mutate();
  picksChanged();
  flow.undo = before;
  const toast = $<HTMLDialogElement>("#queueDrawer").open ? $("#queueToast") : $("#appToast");   // a modal drawer hides the page
  $("span", toast).textContent = message;
  $("button", toast).hidden = false;
  toast.hidden = false;
  clearTimeout(toastTimer);
  (toast.id === "appToast" ? $("#queueToast") : $("#appToast")).hidden = true;
  toastTimer = setTimeout(() => { toast.hidden = true; flow.undo = null; }, 5000);
}
function undoPicks() {
  if (flow.undo) { state.pick = flow.undo; picksChanged(); }
  flow.undo = null; $("#queueToast").hidden = $("#appToast").hidden = true;
}
function onQueueClick(e: Event) {
  const pen = hit(e, "[data-edit]");
  if (pen) { editToken(pen.dataset.edit!); return; }
  const plus = hit(e, "[data-plus]"), minus = hit(e, "[data-minus]"), rm = hit(e, "[data-unpick]");
  if (plus) { const k = plus.dataset.plus!; state.pick.set(k, (state.pick.get(k) || 0) + 1); picksChanged(); }
  else if (minus) {
    const k = minus.dataset.minus!, n = state.pick.get(k) || 0, role = tokenRole(k);
    const ri = tokenRem(k), name = ri != null ? `${textFor(charKey(role), role, null)}: ${textFor(k, role, ri)}` : textFor(k, role, null);
    if (n > 1) { state.pick.set(k, n - 1); picksChanged(); }
    else changePicks(() => state.pick.delete(k), t("queue.removed", { name }));
  } else if (rm) {
    const k = rm.dataset.unpick!, role = tokenRole(k);
    changePicks(() => state.pick.delete(k), t("queue.removed", { name: `${textFor(charKey(role), role, null)}: ${textFor(k, role, tokenRem(k))}` }));
  }
}

/**
 * The drawer: the characters, then the reminders, each with how many tokens they make and
 * each token's copies (− n +). One copy less than one takes it out, with Undo.
 */
function renderQueueList() {
  const lang = uiLang(), n = queueNow().length;
  $("#queueTitle").innerHTML = `${esc(t("queue.title"))}${n ? `<small>${esc(t("queue.count", { n }))}</small>` : ""}`;
  $("#queueClear").hidden = !n;
  if (!n) { $("#queue").innerHTML = `<div class="q-empty"><h3>${esc(t("pick.nothing"))}</h3><p>${esc(t("pick.help"))}</p></div>`; return; }
  const keys = sortKeys(state.pick.keys()), chars = keys.filter((k) => tokenRem(k) == null), rems = keys.filter((k) => tokenRem(k) != null);
  const copies = (list: string[]) => list.reduce((s, k) => s + (state.pick.get(k) || 0), 0);
  const qty = (k: string, name: string) => `<span class="qty"><button type="button" data-minus="${k}" aria-label="${esc(t("queue.lessCopy", { name }))}">−</button><span>${state.pick.get(k) || 0}</span><button type="button" data-plus="${k}" aria-label="${esc(t("queue.moreCopy", { name }))}">+</button></span>`;
  const item = (k: string) => {
    const r = tokenRole(k), ri = tokenRem(k), isRem = ri != null, name = textFor(k, r, ri), char = textFor(charKey(r), r, null);
    const pic = tokenSvg(state.lib!, r, { ...specFor(k, isRem), back: "none" }, { text: name });
    return `<div class="q-item${isRem ? " r" : ""}"><span class="pic">${pic}</span>
      <span class="q-name"><b>${esc(name)}${hasOwn(k) ? ` ${ownPen(k, name)}` : ""}</b>${isRem ? `<small>${esc(char)}</small>` : ""}</span>
      ${qty(k, isRem ? `${char}: ${name}` : name)}</div>`;
  };
  const section = (title: string, list: string[], byTeam: boolean) => !list.length ? "" : `<section class="q-sec"><h3 class="q-sec-h">${esc(title)}<small>${esc(t("queue.count", { n: copies(list) }))}</small></h3>`
    + (byTeam ? TEAM_ORDER.map((team) => { const here = list.filter((k) => tokenRole(k).team === team); return here.length ? `<h4 class="q-team">${esc(TEAM_PLURAL[lang][team])}</h4>${here.map(item).join("")}` : ""; }).join("") : list.map(item).join(""))
    + `</section>`;
  $("#queue").innerHTML = section(t("queue.chars"), chars, true) + section(t("queue.rems"), rems, false);
}

// ------------------------------------------------------------ step 2: your tokens in their styles

function renderDesignStage() {
  // the coins on the side the 3D view shows: from behind when it's turned over
  const keys = sortKeys(state.pick.keys()), total = queueNow().length, side = state.view === "back" ? "back" : "front";
  $("#designGrid").innerHTML = keys.map((k) => {
    const role = tokenRole(k), ri = tokenRem(k), text = textFor(k, role, ri);
    const spec = specFor(k, ri != null);
    const label = ri != null ? `${textFor(charKey(role), role, null)}: ${text}` : text;
    // the copies stepper sits beside the button (a button can't hold buttons), over the coin's foot
    return `<div class="ds-item${ri != null ? " r" : ""}"><button class="ds-cell${ri != null ? " r" : ""}${isCard(role) ? " card" : ""}" type="button" data-design="${k}" aria-current="${state.sel?.key === k}" title="${esc(t("design.tap"))}">${tokenSvg(state.lib!, role, spec, { text, side: shapeOf(role) === "coin" ? side : "front" })}${hasOwn(k) ? `<span class="mark" title="${esc(t("sheet.own"))}">✎</span>` : ""}<span>${esc(label)}</span></button><button type="button" class="ds-drop" data-drop="${k}" aria-label="${esc(t("queue.removeAria", { name: label }))}">${BIN}</button></div>`;
  }).join("");
}
/** Takes a token out of the selection from step 2, with Undo. The workshop moves on to another
 *  picked token if it showed this one; with nothing left, back to step 1. */
function dropFromDesign(key: string) {
  const role = tokenRole(key), ri = tokenRem(key);
  const name = ri != null ? `${textFor(charKey(role), role, null)}: ${textFor(key, role, ri)}` : textFor(key, role, null);
  changePicks(() => state.pick.delete(key), t("queue.removed", { name }));
  if (!state.pick.size) { goStep(1); return; }
  if (!state.sel || !isPicked(state.sel.key)) { selectToken(sortKeys(state.pick.keys())[0]); renderWorkshop(); renderDesignStage(); }
}
/** Tapping one of your tokens: the workshop shows it. */
function designToken(key: string) {
  const was = state.sel && shapeOf(state.sel.role);
  selectToken(key);
  // another type: its design opens where it was left, the 3D view turned to it
  if (was && was !== shapeOf(state.sel!.role)) viewTab();
  renderWorkshop(); renderDesignStage();
  revealPicked();
}
/** Keeps the selected token in view in the strip. */
function revealPicked() { $("#designGrid .ds-cell[aria-current=true]")?.scrollIntoView({ inline: "nearest", block: "nearest" }); }
/** The pen on a token with its own changes: to step 2, showing it. Step 2 only holds picked tokens, so it picks it first. */
function editToken(key: string) {
  if (!isPicked(key)) { setPick(key, true); picksChanged(); }
  if ($<HTMLDialogElement>("#queueDrawer").open) $<HTMLDialogElement>("#queueDrawer").close();
  selectToken(key);
  showTab({ part: "front" });
  goStep(2);
  revealPicked();
}

// ------------------------------------------------------------ step 3: how to print

/** Step 3: how to print. A 3D printer shows the plates and filaments; paper shows the A4 sheets (fronts and backs). */
function renderPrintStep() {
  const queue = queueNow(), way = flow.way, detail = $("#printDetail");
  $("#printLead").textContent = t("print.lead", { n: queue.length });
  $$("#printPage [data-way]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.way === way)));
  const swatches = (slots: number[]) => `<span class="sws">${slots.map((sl) => `<i class="sw" style="background:${FILAMENT_SLOTS[sl].hex}" title="${esc(filamentName(sl))}"></i>`).join("")}</span>`;
  let plan: PlatePlan<QueueItem> | null = null, planError: string | null = null, sheets: SheetSlot[][] = [];
  try { plan = queuePlan(); } catch (err) { planError = (err as Error).message; }
  try { sheets = layoutCoins(queue.map(paperSize)); } catch { /* shown below */ }
  const printer = printerOf(flow.printer);
  $("#way3dSub").textContent = plan ? t("queue.way3dSub", { printer: printer.name, n: plan.plates.length }) : t("queue.way3dError", { printer: printer.name });
  $("#wayPaperSub").textContent = t("queue.wayPaperSub", { n: sheets.length, backs: flow.backs });
  if (way === "3d") {
    $<HTMLButtonElement>("#flowNext").disabled = !plan;
    // which printer: the A1 or the A1 mini (same AMS lite, a smaller bed)
    const printers = `<h3 class="q-h">${esc(t("print.printer"))}</h3>
      <div class="printers" role="radiogroup" aria-label="${esc(t("print.printer"))}">${Object.values(PRINTERS).map((pr) => `<button class="pill" type="button" role="radio" data-printer="${pr.id}" aria-checked="${pr.id === printer.id}">${esc(pr.name)}<small>${esc(t("print.bed", { mm: pr.bed }))}</small></button>`).join("")}</div>
      <h3 class="q-h">${esc(t("print.nozzle"))}</h3>
      <div class="printers" role="radiogroup" aria-label="${esc(t("print.nozzle"))}">${Object.values(NOZZLES).map((nz) => `<button class="pill" type="button" role="radio" data-nozzle="${nz.id}" aria-checked="${nz.id === flow.nozzle}">${esc(`${String(nz.mm).replace(".", uiLang() === "es" ? "," : ".")} mm`)}<small>${esc(t(nz.id === "0.4" ? "print.nozzle04" : "print.nozzle02"))}</small></button>`).join("")}</div>`;
    if (!plan) { detail.innerHTML = `${printers}<p class="q-note warn">${esc(planError)}</p>`; return; }
    // Names too small to print cleanly, smallest first, each opening its token in step 2.
    const smalls = [...state.pick.keys()].map((k) => {
      const q = { pick: k, ...queueEntry(tokenRole(k), tokenRem(k)) }, role = roleById(q.roleId)!;
      return { k, mm: nameLetterHeight(state.lib!, itemSpec(q), queueTitle(q, role), role), label: queueLabel(q, role) };
    }).filter((x) => x.mm < smallLetters()).sort((a, b) => a.mm - b.mm);
    const smallNote = smalls.length ? `<div class="q-note warn small-text"><span aria-hidden="true">⚠</span><div>
      <p>${esc(t("print.small", { n: smalls.length, mm: dec1(smallLetters()) }))}</p>
      <ul>${smalls.map((x) => `<li><button type="button" data-fix="${x.k}">${esc(x.label)}</button> <small>${esc(dec1(Math.floor(x.mm * 10) / 10))} mm</small></li>`).join("")}</ul></div></div>` : "";
    const slots = [...new Set(plan.plates.flatMap((p) => [...p.slots]))].sort((a, b) => a - b);
    // Estimates: grams per filament and minutes per plate (Bambu Studio has the exact figures).
    const est = plateEstimates(plan), gramsBy = new Map<number, number>();
    for (const e of est) for (const [sl, g] of e.grams) gramsBy.set(sl, (gramsBy.get(sl) || 0) + g);
    const nb = (s: string) => s.replace(/ /g, "\u00a0");   // a figure never breaks across lines
    const fmtG = (g: number) => nb(`≈ ${g < 10 ? g.toFixed(1).replace(".", dec) : Math.round(g)} g`);
    const fmtT = (m: number) => { m = Math.max(5, Math.round(m / 5) * 5); return nb(`≈ ${m >= 60 ? `${Math.floor(m / 60)} h ` : ""}${m % 60 ? `${m % 60} min` : ""}`.trim()); };
    const totalMin = est.reduce((a, e) => a + e.minutes, 0);
    const dec = uiLang() === "es" ? "," : ".";
    const pauses = [...new Set(queue.map((q) => magnetLayout(itemSpec(q))).filter((m): m is MagnetLayout => m?.kind === "hidden").map((m) => m.pauseZ!))].sort((a, b) => a - b);
    // A test token first: one coin with the most colours, on its own plate, before hours of plates.
    const test = queue.length > 1 ? testItem(plan) : null;
    testQ = test?.q ?? null;
    const testNote = test ? `<div class="q-note test-print"><span aria-hidden="true">✓</span><div>
      <p>${esc(t("print.test", { name: test.title, time: fmtT(plateFeatures([{ token: test.token, vol: tokenVolumes(test.q) }], flow.nozzle).minutes) }))}</p>
      <button class="pill" type="button" data-test>${esc(t("print.testBtn"))}</button></div></div>` : "";
    detail.innerHTML = `${printers}${smallNote}${colourNotes("3d")}<h3 class="q-h">${esc(t("queue.filaments"))}</h3>
      <p class="q-note">${swatches(slots)}<span>${esc(t("queue.filamentsNote", { list: slots.map((sl) => `${filamentName(sl)} ${fmtG(gramsBy.get(sl) || 0)}`).join(", ") }))}</span></p>
      <p class="q-note"><span aria-hidden="true">⏱</span><span>${esc(t("print.estimate", { time: fmtT(totalMin), n: plan.plates.length }))}</span></p>
      ${testNote}
      ${pauses.length ? `<p class="q-note"><span aria-hidden="true">⏸</span><span>${esc(t("queue.pauses", { z: pauses.map((z) => String(z).replace(".", dec)).join(", ") }))}</span></p>` : ""}
      <h3 class="q-h">${esc(t("queue.platesH", { n: plan.plates.length }))}</h3>
      <div class="q-plates">${plan.plates.map((p, i) => `<article class="q-plate"><header><h3>${esc(t("queue.plateName", { i: i + 1, name: p.name }))}<small>${esc(t("queue.plateFill", { n: p.items.length, cap: p.capacity }))}</small></h3>${swatches([...p.slots].sort((a, b) => a - b))}
        <span class="q-fill"><i style="width:${Math.round(100 * p.items.length / p.capacity)}%"></i></span>
        <p class="q-est">${esc(fmtG(est[i].grams.reduce((a, [, g]) => a + g, 0)))} · ${esc(fmtT(est[i].minutes))}</p></header>
        <div class="q-coins">${p.items.map((it) => `<span class="${isReminder(it.q) ? "r" : ""}" title="${esc(it.title)}">${queuePic(it.q)}</span>`).join("")}</div></article>`).join("")}</div>`;
  } else {
    $<HTMLButtonElement>("#flowNext").disabled = !sheets.length;
    // Each sheet as the PDF prints it: the front, and the back with every coin's reverse at the
    // mirrored x (printed double-sided on the long edge, it lands behind its front). Paper has no magnets.
    // Positions and sizes in % of the sheet, so the preview matches whatever width the CSS gives it.
    const pctW = (mm: number) => `${(100 * mm / PAGE.w).toFixed(3)}%`, pctH = (mm: number) => `${(100 * mm / PAGE.h).toFixed(3)}%`;
    const coinAt = (q: QueueEntry, side: "front" | "back", x: number, c: SheetSlot) => {
      const role = roleById(q.roleId)!, spec = { ...itemSpec(q), magnet: "none" as const };
      return tokenSvg(state.lib!, role, spec, { side, text: queueTitle(q, role) })
        .replace("<svg", `<svg style="left:${pctW(x)};top:${pctH(c.y)};width:${pctW(c.w)};height:${pctH(c.h)}"`);
    };
    const face = (page: SheetSlot[], side: "front" | "back") => `<figure><div class="q-sheet">${page.map((c) => coinAt(queue[c.index], side, side === "front" ? c.x : backX(c.x), c)).join("")}</div>
      <figcaption>${esc(t(side === "front" ? "queue.pdfFront" : "queue.pdfBack"))}</figcaption></figure>`;
    const backs = flow.backs;
    detail.innerHTML = `${colourNotes("paper")}<label class="switch"><input type="checkbox" id="paperBacks" ${backs ? "checked" : ""}> <span>${esc(t("print.backs"))}</span></label>
      <h3 class="q-h">${esc(t("queue.sheetsH", { n: sheets.length, backs }))}</h3>
      ${sheets.map((page, i) => `<div class="q-pair"><h4>${esc(t("queue.sheetN", { i: i + 1, n: sheets.length }))}</h4><div class="q-sheets">${face(page, "front")}${backs ? face(page, "back") : ""}</div></div>`).join("")}
      <ol class="q-howto"><li>${esc(t(backs ? "queue.howto1" : "queue.howto1Single"))}</li><li>${esc(t("queue.howto2"))}</li><li>${esc(t("queue.howto3"))}</li></ol>`;
  }
}

/** Downloads the selection as a Bambu project, or only `one` queue entry (the test token). */
async function downloadBambu(one: QueueEntry | null = null, btn = $<HTMLButtonElement>("#flowNext")) {
  const out = $("#printNote");
  btn.disabled = true;
  try {
    const { buildBambuProject } = await import("./bambu/bambu3mf.ts");   // JSZip and the printer template load only now
    const items: PlateItem<Token>[] = [];
    const order = one ? [one] : printOrder();
    for (const [i, q] of order.entries()) {
      const role = roleById(q.roleId)!;
      out.className = "hint"; out.textContent = t("queue.building", { i: i + 1, n: order.length, name: queueLabel(q, role) });
      await new Promise((r) => setTimeout(r));
      items.push({ token: buildToken(state.lib!, role, itemSpec(q), queueTitle(q, role)), title: queueLabel(q, role), group: queueGroup(q, role) });
    }
    const printer = printerOf(flow.printer);
    const nozzle = nozzleOf(flow.nozzle);
    const { blob, plan, filaments } = await buildBambuProject(items, { printer: printer.id, nozzle: nozzle.id, onProgress: (d, total) => { out.textContent = t("queue.writing", { i: d, n: total }); } });
    const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const what = one ? `test-${slug(items[0].title)}` : `${items.length}-tokens`;
    const file = `midnight-mint-${what}-${printer.short.toLowerCase().replace(/\s+/g, "-")}${nozzle.id === "0.4" ? "" : `-${nozzle.id}mm`}.3mf`;
    await saveFile(blob, file);
    out.textContent = t("queue.done", { file, n: plan.plates.length, filaments: filaments.map((f) => t(`filament.${f.name}`)).join(", ") });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.failed", { message: (err as Error).message });
  } finally { btn.disabled = false; }
}

/** The queue as an A4 PDF of paper tokens: fronts and backs on alternate pages, for duplex printing. */
async function downloadPdf() {
  const btn = $<HTMLButtonElement>("#flowNext"), out = $("#printNote");
  btn.disabled = true;
  try {
    out.className = "hint"; out.textContent = t("queue.pdfLoading");
    const { buildPrintPdf } = await import("./pdf/print-pdf.ts");   // jsPDF only loads when asked for
    const entries = queueNow().map((q) => { const role = roleById(q.roleId)!; return { role, spec: itemSpec(q), text: queueTitle(q, role) }; });
    const { blob, sheets } = await buildPrintPdf(state.lib!, entries, {
      labels: { front: t("queue.pdfFront"), back: t("queue.pdfBack") }, backs: flow.backs,
      onProgress: (i, n) => { out.textContent = t("queue.pdfWriting", { i, n }); },
    });
    const file = `midnight-mint-${entries.length}-tokens${flow.backs ? "" : "-fronts"}.pdf`;
    await saveFile(blob, file);
    out.textContent = t(flow.backs ? "queue.pdfDone" : "queue.pdfDoneSingle", { file, n: sheets });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.pdfFailed", { message: (err as Error).message });
  } finally { btn.disabled = !state.pick.size; }
}

// ------------------------------------------------------------ how it works

// A short guide: the three steps, each with a picture of the app in the interface language.
// It opens by itself on a first visit; the "?" in the top bar opens it again.
const GUIDE_KEY = "midnight-mint-guide-seen", GUIDE_STEPS = 3;
const guide: { at: number; wired?: boolean } = { at: 0 };
function openGuide() {
  guide.at = 0;
  renderGuide();
  $<HTMLDialogElement>("#guide").showModal();
  try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* no storage */ }
}
function renderGuide() {
  const i = guide.at + 1, lang = uiLang();
  $("#guideKicker").textContent = t("guide.kicker", { i, n: GUIDE_STEPS, name: t(`flow.step${i}`) });
  $("#guideTitle").textContent = t(`guide.title${i}`);
  $("#guideText").textContent = t(`guide.text${i}`);
  const img = $<HTMLImageElement>("#guideShot");
  img.src = `/guide/${lang === "es" ? "es" : "en"}-${i}.jpg`;
  img.alt = t(`guide.alt${i}`);
  $("#guideBack").hidden = guide.at === 0;
  $("#guideNext").textContent = t(i === GUIDE_STEPS ? "guide.done" : "guide.next");
  $("#guideDots").innerHTML = Array.from({ length: GUIDE_STEPS }, (_, k) => `<i${k === guide.at ? ' class="on"' : ""}></i>`).join("");
}
function wireGuide() {
  document.addEventListener("click", (e) => { if (hit(e, "[data-guide]")) { e.preventDefault(); drawer(false); if ($<HTMLDialogElement>("#credits").open) $<HTMLDialogElement>("#credits").close(); openGuide(); } });
  $("#guideBack").onclick = () => { guide.at = Math.max(0, guide.at - 1); renderGuide(); };
  $("#guideNext").onclick = () => { if (guide.at < GUIDE_STEPS - 1) { guide.at++; renderGuide(); } else $<HTMLDialogElement>("#guide").close(); };
  $("#guide").addEventListener("click", (e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });   // backdrop
  let seen: string | null = null;
  try { seen = localStorage.getItem(GUIDE_KEY); } catch { /* no storage */ }
  // A first visit opens it, unless it came with a shared script, which opens its own invite.
  if (!seen && !location.hash.startsWith("#s=")) openGuide();
}

// The UI test server drives the flow through these.
declare global {
  interface Window { __mm: { goStep: (step: number) => void; designToken: (key: string) => void; estimates: () => ReturnType<typeof plateEstimates> } }
}
window.__mm = { goStep, designToken, estimates: () => plateEstimates(queuePlan()) };

// ------------------------------------------------------------ designs saved to an account

/** Moves designs saved to an account (before sign-in was dropped) into this browser, as designs of yours of their type. */
async function importAccountDesigns(user: User) {
  const remote = await listAccountDesigns(user.uid);
  if (!remote.length) return;
  myDesigns = readMyDesigns();
  for (const d of remote) {
    const role = state.lib && roleById(d.roleId), shape = (d.shape as TokenShape | undefined) ?? (role ? shapeOf(role) : "coin"), { lang: _lang, ...spec } = upgradeSpec(d.spec as TokenSpec);
    if (!myDesigns[shape].some((x) => x.id === d.id || sameLook(x.spec, spec))) myDesigns[shape].push({ id: d.id, name: uniqueDesignName(shape, d.title || t("style.mine")), spec: spec as TokenSpec });
  }
  storeMyDesigns();
  if (state.lib && !TALLER) { renderAll(); renderQueue(); }
  await Promise.all(remote.map((d) => deleteAccountDesign(user.uid, d.id)));
}

// ------------------------------------------------------------ credits

const AUTHOR_NAMES: Record<string, string> = {
  lorc: "Lorc", delapouite: "Delapouite", "caro-asercion": "Caro Asercion", skoll: "Skoll", "carl-olsen": "Carl Olsen",
  "lord-berandas": "Lord Berandas", "various-artists": "Various artists", cathelineau: "Cathelineau", zajkonur: "Zajkonur",
  aussiesim: "AussieSim", faithtoken: "Faithtoken", starseeker: "Starseeker", willdabeast: "Willdabeast",
};
const authorName = (a: string) => AUTHOR_NAMES[a] || a.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Credits: the game, the translators (the translation in use first), the icon authors
 * (CC BY 3.0 asks for author credit) and the fonts and libraries.
 */
function openCredits() {
  const cur = tokenLang();
  const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`;
  const translations = [...TRANSLATIONS].sort((a, b) => Number(b.id === cur) - Number(a.id === cur)).map((x) => `<li${x.id === cur ? ' aria-current="true"' : ""}>
    <b>${esc(tlName(x))}</b><span>${esc(x.pack ? x.by ?? t("credits.community") : t("credits.official"))}${x.fem ? ` <small>· ${esc(t("credits.feminine"))}</small>` : ""}</span>
    ${x.id === cur ? `<em>${esc(t("credits.inUse"))}</em>` : ""}</li>`).join("");

  const byAuthor = new Map<string, Set<string>>();
  // the library's icons, and the game-icons.net ones you've chosen for tokens
  const ownGame = [...state.overrides.values()].map((o) => o.icon).filter((i): i is TokenIcon => i?.source === "game-icons").map((i) => ({ icon: i.name, author: i.author }));
  // and the interface's own (team filters, the add menu)
  const ui = Object.entries(UI_ICONS).map(([icon, { author }]) => ({ icon, author }));
  // a two-state token's other state has an icon of its own
  const flips = (state.lib?.roles || []).flatMap((r) => (r.flip ? [r.flip] : []));
  for (const r of [...(state.lib?.roles || []), ...flips, ...ownGame, ...ui]) {
    if (!r.icon) continue;
    if (!byAuthor.has(r.author!)) byAuthor.set(r.author!, new Set());
    byAuthor.get(r.author!)!.add(r.icon);
  }
  const icons = [...byAuthor].sort((a, b) => b[1].size - a[1].size).map(([a, set]) => `<li><details>
    <summary><b>${esc(authorName(a))}</b> <small>${esc(t("credits.count", { n: set.size }))}</small></summary>
    <p>${[...set].sort().map((i) => link(`https://game-icons.net/1x1/${encodeURIComponent(a)}/${encodeURIComponent(i)}.html`, i)).join(", ")}</p></details></li>`).join("");

  // First the collection: what it says about itself (a built-in one: in the code, src/builtins.ts), its links and its mark
  const lang = uiLang(), built = builtIn(OWN ? OWN_ID ?? "" : "botc");
  const a = built?.about ?? (OWN ? coll.about : undefined), cname = built?.name ?? nameIn(coll.name, lang);
  const paras = (n: Parameters<typeof nameIn>[0] | undefined, cls = "") => nameIn(n, lang).split(/\n\s*\n/).filter((x) => x.trim()).map((x) => `<p${cls}>${esc(x.trim())}</p>`).join("");
  const own = a ? `<section class="about own-about"><h3>${esc(cname)}</h3>${paras(a?.text)}${paras(a?.credits, ' class="hint"')}
      ${a?.links?.length ? `<p class="about-links">${a.links.map((l) => link(l.url, nameIn(l.label, lang))).join(" · ")}</p>` : ""}</section>` : "";
  const mark = built?.mark ? `<div class="about-ccc about-mark"><img src="${esc(built.mark.src)}" alt="${esc(built.mark.alt)}"${built.mark.invert ? ' class="invert"' : ""}><p>${esc(nameIn(built.mark.notice, lang))}</p></div>` : "";
  const ccc = (built ? built.ccc : hasCcc(coll)) ? `<div class="about-ccc"><img src="/ccc-sleeve.png" alt="Community Created Content"><p>${esc(t("ccc.app"))}</p></div>` : "";
  // About: what the app is and how it treats your things, then the credits
  $("#creditsBody").innerHTML = `${own}${ccc}${mark}<h2 class="credits-h">${esc(t("about.title"))}</h2><section class="about"><p>${esc(t(OWN ? "own.aboutApp" : "about.what"))}</p>
      <p class="hint">${esc(t("about.data"))}</p>
      <p class="about-actions"><button type="button" class="pill" data-guide>${esc(t("guide.open"))}</button></p></section>
    <h2 class="credits-h">${esc(t("credits.title"))}</h2>
    ${!OWN ? `<section><h3>${esc(t("credits.translations"))}</h3>
      <p class="hint">${esc(t("credits.translationsIntro")).replace("Villacuervos", link(VILLACUERVOS_URL, "Villacuervos"))}</p>
      <ul class="credit-grid">${translations}</ul></section>` : ""}
    <section><h3>${esc(t("credits.icons"))}</h3>
      <p class="hint">${esc(t("credits.iconsIntro")).replace("game-icons.net", link("https://game-icons.net", "game-icons.net"))}</p>
      <ul class="credit-icons">${icons}</ul></section>
    <section><h3>${esc(t("credits.more"))}</h3>
      <p class="hint">${esc(t("credits.moreText"))}</p>
      <p class="hint">${esc(t("credits.code"))}: ${REPO_PUBLIC ? `${link(REPO_URL, "GitHub")} · ` : ""}PolyForm Noncommercial 1.0.0</p></section>`;
  $<HTMLDialogElement>("#credits").showModal();
}
document.addEventListener("click", (e) => { if (hit(e, "[data-about], [data-credits]")) { e.preventDefault(); drawer(false); openCredits(); } });

// ------------------------------------------------------------ admin

async function openAdmin() {
  const dlg = $<HTMLDialogElement>("#admin");
  if (!dlg.open) dlg.showModal();
  const roles = state.lib?.roles.length ?? (await loadRoles()).length;
  $("#libraryState").textContent = roles ? t("admin.libraryState", { n: roles }) : t("admin.libraryEmpty");
}
$("#libraryFile").onchange = async (e) => {
  const f = input(e).files![0]; input(e).value = "";
  if (!f) return;
  const out = $("#libraryState");
  try {
    const roles = JSON.parse(await f.text());
    const count = await uploadRoles(roles, (done, total) => { out.textContent = t("admin.uploading", { i: done, n: total }); });
    out.textContent = t("admin.uploaded", { n: count });
    setTimeout(() => location.reload(), 800);
  } catch (err) { out.textContent = t("admin.uploadFailed", { message: (err as Error).message }); }
};

// ------------------------------------------------------------ each shape's default design (Pick)
//
// Over the sheet, the collection's default design for each shape it has ("Coins: Steel ▾"): the
// one its tokens print with unless one was chosen for them. Any of the collection's designs or
// yours can be the default, and "Original design" sets them back to the collection's own. Tokens
// with a design of their own or changes to it are asked about first: kept as they are, or given
// the new default too.

/** A token of a shape to draw designs on: the first of the collection's. */
const sampleRole = (shape: TokenShape) => state.lib!.roles.find((r) => shapeOf(r) === shape && r.id !== state.creating?.draft.id)!;
/** The shapes the design bar offers: those of the tokens on screen (set by renderSheet). */
let barShapes: TokenShape[] | null = null;
function renderDesignBar() {
  const all = shapesHere(), shapes = (barShapes ?? all).filter((sh) => all.includes(sh));
  const changed = shapes.filter((sh) => defaultRef(sh) !== originalRef(sh));
  $(".design-bar-wrap").hidden = !shapes.length;
  $("#designBar").innerHTML = `<span class="db-l">${esc(t("bar.label"))}</span>`
    + shapes.map((sh) => {
      const d = designOf(sh, defaultRef(sh))!;
      return `<button class="db-chip" type="button" data-default-shape="${sh}" aria-haspopup="dialog" aria-label="${esc(t("bar.chipAria", { shape: t(`type.${sh}.many`), name: d.name }))}">${designSwatch(d.spec, sampleRole(sh))}<span><small>${esc(t(`type.${sh}.many`))}</small><b>${esc(d.name)}</b></span>${CHEVRON}</button>`;
    }).join("")
    + (changed.length ? `<button class="link db-original" type="button" data-default-original>${esc(t("bar.original"))}</button>` : "")
    + `<a class="db-taller" href="${esc(tallerUrl())}" data-to-taller>${esc(t("bar.taller"))} <span aria-hidden="true">›</span></a>`;
  if (dz.open && dz.mode === "default") renderDesignSheet();
}
/**
 * New defaults for some shapes (the original: none kept). Tokens of those shapes with a design of
 * their own or changes to it are asked about: kept as they are, or given the new default too.
 */
async function setDefaults(next: Partial<Record<TokenShape, string>>) {
  const shapes = (Object.keys(next) as TokenShape[]).filter((sh) => next[sh] !== defaultRef(sh));
  if (!shapes.length) return;
  const touched = shapes.flatMap((sh) => tokensOf(sh).filter(designOverridden));
  let clear = false;
  if (touched.length) {
    const name = shapes.length === 1 ? designOf(shapes[0], next[shapes[0]])!.name : t("bar.originalName");
    const a = await ask(t("bar.ask", { n: touched.length, name }), [{ id: "clear", label: t("bar.clear", { name }) }, { id: "keep", label: t("bar.keep"), main: true }]);
    if (!a) return;
    clear = a === "clear";
  }
  for (const sh of shapes) { if (next[sh] === originalRef(sh)) delete defaults[sh]; else defaults[sh] = next[sh]; }
  if (clear) for (const k of touched) { const o = { ...state.overrides.get(k) }; delete o.style; delete o.look; if (Object.keys(o).length) state.overrides.set(k, o); else state.overrides.delete(k); }
  storeDefaults(); storeOverrides();
  toast(shapes.length === 1 ? t("bar.done", { shape: t(`type.${shapes[0]}.many`).toLowerCase(), name: designOf(shapes[0], defaultRef(shapes[0]))!.name }) : t("bar.doneOriginal"));
  renderSheet(); renderSpine(); renderQueue();
  if (state.step === 2) { renderWorkshop(); renderDesignStage(); }
}
function wireDesignBar() {
  $("#designBar").onclick = (e) => {
    const chip = hit(e, "[data-default-shape]");
    if (chip) { openDesignSheet("default", chip.dataset.defaultShape as TokenShape, chip); return; }
    if (hit(e, "[data-default-original]")) { void setDefaults(Object.fromEntries(shapesHere().filter((sh) => !barShapes || barShapes.includes(sh)).map((sh) => [sh, originalRef(sh)]))); return; }
    if (hit(e, "[data-to-taller]")) rememberReturn();
  };
}

/** A question with its answers as buttons (a dialog of the app's, not the browser's): the answer's id, or null when closed. */
function ask(text: string, choices: { id: string; label: string; main?: boolean }[]): Promise<string | null> {
  const dlg = $<HTMLDialogElement>("#askDlg");
  $("#askText").textContent = text;
  $("#askActions").innerHTML = `<button class="pill" type="button" data-ask="">${esc(t("script.cancel"))}</button>`
    + choices.map((c) => `<button class="${c.main ? "forge" : "pill"}" type="button" data-ask="${esc(c.id)}">${esc(c.label)}</button>`).join("");
  dlg.showModal();
  $<HTMLElement>("#askActions .forge")?.focus();
  return new Promise((done) => {
    dlg.onclick = (e) => { const b = hit(e, "[data-ask]"); if (b) { dlg.close(); done(b.dataset.ask || null); } };
    dlg.onclose = () => done(null);   // Escape: as Cancel (a second answer is ignored)
  });
}
/** A line at the bottom of the page for a moment ("Steel is now the coins' design"). */
function toast(message: string) {
  const el = $("#appToast");
  $("span", el).textContent = message;
  $("button", el).hidden = true;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}
/** Going to the Taller from the design step: coming back opens it again, on the same token. */
function rememberReturn() {
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: location.pathname, step: state.step, sel: state.sel?.key ?? null })); } catch { /* no storage */ }
}
const RETURN_KEY = "tesserae-return";
/** Back from the Taller: the step and token it was opened from, once. */
function takeReturn(): { step: number; sel: string | null } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(RETURN_KEY) as string);
    sessionStorage.removeItem(RETURN_KEY);
    return v && v.path === location.pathname ? v : null;
  } catch { return null; }
}

// ------------------------------------------------------------ the Taller
//
// The Taller (/taller) is where your designs are made and changed, outside the steps, for every
// shape the app has. Entering it starts a new design in two steps: 1. its shape (or one of yours to
// carry on with), 2. the design it starts from, its base: Basic (the app's own, blank), then the
// collection it was opened from, then the app's collections' (Clocktower, Draw Steel), each with its
// own designs only, then the app's (Tesserae Faber's, offered in every collection). Starting
// makes a copy of the base, yours, and opens it in the editor: its look changed with the design
// step's controls (the workshop column), straight on the design, which every token using it shows.
// A collection's designs are never changed here: they're only bases. A design is drawn on sample
// tokens: the collection's it was opened from, else a few of the app's own.

const TALLER = OWN_VIEW === "taller";
/**
 * A group of bases in the second step: Basic ("blank"), the collection the Taller was opened from
 * ("from"), another of the app's collections ("other"), each with its own designs; the app's
 * designs, Tesserae Faber's ("app").
 */
interface TallerGroup { kind: "blank" | "from" | "other" | "app"; name: string; designs: Partial<Record<TokenShape, StyleDef[]>>; look?: GroupLook }
/** How a collection's group of bases looks folded: like its cover on the collections page. */
interface GroupLook { logo?: string; accent?: string; cover?: string }
/** A collection's cover look: an app collection's from its entry, one of yours from its brand and theme. */
function lookOfCollection(id: string | null, c?: Collection | null): GroupLook {
  const b = id ? builtIn(id) : undefined;
  if (b) return { logo: b.logo ?? APP_LOGO, accent: b.accent, cover: b.cover };
  const theme = c && typeof c.theme === "object" ? c.theme : undefined;
  return { logo: c?.brand?.logo || APP_LOGO_SMALL, accent: theme?.accent };
}
/** Where the Taller is: choosing a shape, choosing a base, or changing one of your designs. */
type TallerView = "shape" | "base" | "edit";
/**
 * The Taller's state: where it is, the shape, the design open in the editor ("u:<id>"), the base
 * chosen in the second step ("g<n>:<id>", by its group's place in `groups`), where it was opened
 * from, and each shape's sample tokens (token keys).
 */
const taller: { view: TallerView; shape: TokenShape; ref: string; pick: string; from: { path: string; id: string; name: string } | null; groups: TallerGroup[]; samples: Record<TokenShape, string[]>; focusName: boolean } =
  { view: "shape", shape: "coin", ref: "", pick: "", from: null, groups: [], samples: { coin: [], ring: [], card: [] }, focusName: false };
/** The design open in the Taller's editor (always one of yours). */
const tallerMine = () => (TALLER && taller.view === "edit" && taller.ref.startsWith("u:") ? myDesigns[taller.shape].find((x) => x.id === taller.ref.slice(2)) : undefined);
/** A base of the second step by its reference ("g<n>:<id>"). */
function tallerBase(shape: TokenShape, ref: string): DesignEntry | undefined {
  const m = ref.match(/^g(\d+):(.+)$/), d = m ? taller.groups[+m[1]]?.designs[shape]?.find((x) => x.id === m[2]) : undefined;
  return d ? collEntry(shape, d, ref) : undefined;
}
/** The base the second step starts on: Basic, the first group's. */
const firstBase = (shape: TokenShape) => `g0:${taller.groups[0].designs[shape]![0].id}`;
/** A sample token as it prints with a design's look. */
function tallerPic(key: string, spec: TokenSpec, side: "front" | "back" = "front") {
  const role = tokenRole(key), ri = tokenRem(key);
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, lang: tokenLang(), icon: ownIcon(roleIdOf(key)) };
  return tokenSvg(state.lib!, role, ri != null ? reminderSpec(s) : s, { text: textFor(key, role, ri), side });
}
/** A few tokens a design is drawn on when there's no collection to take them from (or it has none of the shape). */
function sampleTokens(groups: string[]): Collection {
  const [g1, g2 = g1] = groups, n = (es: string, en: string) => ({ es, en });
  return {
    name: APP_NAME, groups: [], sections: [],
    types: SHAPES.map((sh) => ({ id: `sample-${sh}`, name: sh, title: sh, shape: sh })),
    tokens: [
      { id: "sample-a", type: "sample-coin", group: g1, name: n("Ejemplo", "Sample"), icon: uiTokenIcon("two-coins"), linked: [n("Recuerdo", "Reminder")] },
      { id: "sample-b", type: "sample-coin", group: g2, name: n("Otra ficha", "Another token"), icon: uiTokenIcon("stack"), linked: [] },
      { id: "sample-c", type: "sample-coin", group: g1, name: n("Preparado", "Ready"), icon: null, linked: [], flip: { name: n("Usado", "Used"), icon: null } },
      { id: "sample-r1", type: "sample-ring", group: g1, name: n("Aturdido", "Dazed"), icon: null, linked: [] },
      { id: "sample-r2", type: "sample-ring", group: g2, name: n("Sangrando", "Bleeding"), icon: null, linked: [] },
      { id: "sample-k1", type: "sample-card", group: g1, name: n("Eres", "You are"), icon: null, linked: [] },
      { id: "sample-k2", type: "sample-card", group: g2, name: n("Elige a un jugador", "Choose a player"), icon: null, linked: [] },
    ],
  };
}
/** One of the interface's game-icons.net icons as a token's icon, where the library places them. */
function uiTokenIcon(id: string): TokenIcon | null {
  const ui = UI_ICONS[id];
  return ui ? { id: `ui:${id}`, source: "game-icons", name: id, author: ui.author, g: "translate(28.063 19.134) scale(0.139518)", body: ui.body.replace(/\sfill="[^"]*"/g, "") } : null;
}
/**
 * Opens the Taller: the collection it was opened from (its tokens to draw on, its look, its designs
 * among the bases), the bases, your designs, and the step the address says.
 */
async function openTaller() {
  const params = new URLSearchParams(location.search), path = params.get("from") ?? "";
  const id = /^\/botc(\/|$)/.test(path) ? "botc" : path.match(/^\/c\/([\w-]+)/)?.[1] ?? null;
  const c = id ? (builtIn(id) ? await readBuiltIn(id) : loadCollection(id)) : null;
  const label = (x: Collection) => (id === "botc" ? "Blood on the Clocktower" : nameIn(x.brand?.title, uiLang()) || nameIn(x.name, uiLang()));
  if (c && id) { coll = c; taller.from = { path, id, name: label(c) }; applyGroups(); }
  applyOwnTheme();   // the collection's colours (Clocktower's velvet), else Tesserae Faber's
  // the bases: Basic first (each shape's first basic design, named Basic), then the collection's own
  // designs, the app's collections' own, and the app's designs (but the one Basic already is)
  const basic = basicStyles(), own = (styles: CollectionStyles | undefined) => Object.fromEntries(SHAPES.map((sh) => [sh, styles?.[sh]?.length ? ownStylesOf({ styles }, sh) : []]));
  const groups: TallerGroup[] = [{ kind: "blank", name: APP_NAME, designs: Object.fromEntries(SHAPES.map((sh) => [sh, [{ ...basic[sh][0], name: { es: "Básico", en: "Basic" } }]])) }];
  if (c?.styles) groups.push({ kind: "from", name: label(c), designs: own(c.styles), look: lookOfCollection(id, c) });
  if (id !== "botc") groups.push({ kind: "other", name: "Blood on the Clocktower", designs: own(BOTC_STYLES), look: lookOfCollection("botc") });
  if (id !== "drawsteel") { const ds = await builtInStyles("drawsteel"); if (ds) groups.push({ kind: "other", name: builtIn("drawsteel")!.name, designs: own(ds), look: lookOfCollection("drawsteel") }); }
  groups.push({ kind: "app", name: APP_NAME, designs: Object.fromEntries(SHAPES.map((sh) => [sh, appDesigns(sh).filter((d) => d.id !== basic[sh][0].id)])), look: { logo: APP_LOGO } });
  taller.groups = groups;
  // the tokens to draw on: a few of each shape from the collection, different groups first, one with another state
  const roles = c ? collectionRoles(c, uiLang()) : [];
  const teams = c?.groups.map((g) => g.id) ?? [];
  const generic = collectionRoles(sampleTokens(teams.length ? teams : ["townsfolk", "demon"]), uiLang());
  const chosen: Role[] = [];
  for (const sh of SHAPES) {
    const here = roles.filter((r) => shapeOf(r) === sh), out: Role[] = [];
    for (const r of here) if (!r.flip && out.length < 4 && !out.some((o) => o.team === r.team)) out.push(r);
    const two = here.find((r) => r.flip); if (two) out.push(two);
    for (const r of here) if (out.length < 5 && !out.includes(r)) out.push(r);
    const list = out.length ? out : generic.filter((r) => shapeOf(r) === sh);
    chosen.push(...list);
    const withRem = list.find((r) => !r.flip && r.reminders?.en?.length);
    taller.samples[sh] = [...list.map(charKey), ...(sh === "coin" && withRem ? [remKey(withRem, 0)] : [])];
  }
  state.lib = await loadLibrary(chosen);
  myDesigns = readMyDesigns();
  readTallerAddress();
  startTaller();
}
/**
 * The Taller's step from its address: "d=u:<id>" one of your designs, in the editor; "shape" (with
 * "d=c:<id>", a collection's design as the design step names it, "d=a:<id>", one of the app's, or "d=g<n>:<id>", a base) the
 * second step, on that base; else the first.
 */
function readTallerAddress() {
  const q = new URLSearchParams(location.search), want = q.get("shape") as TokenShape, d = q.get("d") ?? "";
  const shape = SHAPES.includes(want) ? want : null;
  if (d.startsWith("u:")) {
    const sh = [shape, ...SHAPES].find((s) => s && myDesigns[s].some((x) => x.id === d.slice(2)));
    if (sh) { Object.assign(taller, { view: "edit", shape: sh, ref: d }); return; }
  }
  if (!shape || d.startsWith("u:")) { taller.view = "shape"; return; }
  let pick = tallerBase(shape, d) ? d : "";
  if (d.startsWith("c:")) {
    // the collection's design: its own when it has designs of the shape, else one of the basic ones (Basic first)
    const own = taller.groups.some((g) => g.kind === "from" && g.designs[shape]?.length);
    const rank = (g: TallerGroup) => (own ? (g.kind === "from" ? 0 : 1) : (g.kind === "blank" || g.kind === "app" ? 0 : 1));
    const order = taller.groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g));
    const hit = order.find(({ g }) => g.designs[shape]?.some((x) => x.id === d.slice(2)));
    if (hit) pick = `g${hit.i}:${d.slice(2)}`;
  }
  if (d.startsWith("a:")) {
    // the app's: in its group, or Basic when it's the one Basic is
    const i = taller.groups.findIndex((g) => (g.kind === "app" || g.kind === "blank") && g.designs[shape]?.some((x) => x.id === d.slice(2)));
    if (i >= 0) pick = `g${i}:${d.slice(2)}`;
  }
  Object.assign(taller, { view: "base", shape, pick: pick || firstBase(shape) });
}
/** The address for where the Taller is, so a reload (or going back) opens the same. */
function tallerAddress() {
  const q = new URLSearchParams(), from = new URLSearchParams(location.search).get("from");
  if (from) q.set("from", from);
  if (taller.view !== "shape") { q.set("shape", taller.shape); q.set("d", taller.view === "edit" ? taller.ref : taller.pick); }
  return `${location.pathname}?${q}`;
}
/** Goes to a step (a new entry in the history: the browser's back comes back) or changes it in place. */
function tallerGo(next: Partial<Pick<typeof taller, "view" | "shape" | "ref" | "pick" | "focusName">>, push = true) {
  const was = taller.view;
  Object.assign(taller, next);
  const url = tallerAddress();
  if (url !== location.pathname + location.search) history[push ? "pushState" : "replaceState"](null, "", url);
  if (taller.view !== was || push) { $("#tallerMain").scrollTop = 0; $("#styleFields").scrollTop = 0; }
  renderTaller();
}
/** The Taller's shapes, in the order the first step shows them. */
const TALLER_SHAPES: TokenShape[] = ["coin", "ring", "card"];
function startTaller() {
  gateState = null;
  $("#gate").hidden = true; $("#app").hidden = false;
  $("#app").dataset.step = "taller";
  document.title = `${t("taller.title")} · ${APP_NAME}`;
  $<HTMLLinkElement>("#favicon").href = APP_ICON;
  const back = $<HTMLAnchorElement>("#tallerBack");
  back.href = taller.from?.path ?? LIST_URL;
  $("b", back).textContent = taller.from?.name ?? t("own.homeTitle");
  started = true;
  history.replaceState(null, "", tallerAddress());
  wire(); wireTaller();
  buildChoices();
  renderTaller();
}
/** Everything in the Taller, for where it is. */
function renderTaller() {
  if (!state.lib) return;
  if (taller.view === "edit" && !tallerMine()) taller.view = "shape";   // deleted (in another tab)
  const edit = taller.view === "edit";
  $("#app").dataset.tv = edit ? "edit" : "start";
  $("#tallerWizard").hidden = edit;
  $("#tallerPreview").hidden = $("#tallerList").hidden = !edit;
  if (taller.view === "shape") { renderTallerShapes(); return; }
  if (taller.view === "base") { renderTallerBases(); return; }
  const sh = taller.shape, key = taller.samples[sh][0];
  if (state.sel?.key !== key) state.sel = { key, role: tokenRole(key), reminder: tokenRem(key) };
  renderTallerPreview();
  renderTallerList();
  renderWorkshop();
}
/** "1. Shape › 2. Base › 3. Design", the step it's on marked. */
const tallerSteps = (n: number) => `<ol class="tw-steps">${["shape", "base", "design"].map((k, i) => `<li${i + 1 === n ? ' aria-current="step"' : ""}><span>${i + 1}. ${esc(t(`taller.step.${k}`))}</span></li>`).join("")}</ol>`;
/** Your design as a card to open: drawn on the shape's first sample token, with what it is and where it's used. */
function myDesignCard(sh: TokenShape, d: MyDesign, withShape: boolean) {
  const sub = [withShape ? t(`own.shape.${sh}`) : "", usesLine(sh, d.id)].filter(Boolean).join(" · ");
  return `<button class="tl-design" type="button" data-taller-open="${sh}" data-ref="u:${esc(d.id)}" aria-pressed="${taller.view === "edit" && taller.ref === `u:${d.id}`}">${designSwatch(d.spec, tokenRole(taller.samples[sh][0]))}<span><b>${esc(d.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
}
/** The first step: the three shapes, each drawn on a sample token, and your designs to carry on with. */
function renderTallerShapes() {
  const shapes = TALLER_SHAPES.map((sh) => {
    const n = myDesigns[sh].length, from = taller.groups.findIndex((g) => g.kind === "from" && g.designs[sh]?.length);
    const look = from >= 0 ? tallerBase(sh, `g${from}:${taller.groups[from].designs[sh]![0].id}`)! : tallerBase(sh, firstBase(sh))!;
    return `<button class="tw-shape" type="button" data-tw-shape="${sh}"><span class="tw-tok ${sh}">${tallerPic(taller.samples[sh][0], look.spec)}</span>
      <span><b>${esc(t(`taller.shape.${sh}`))}</b><small>${esc(t(`taller.shapeHelp.${sh}`))}</small>${n ? `<span class="cnt">${esc(t("taller.yoursN", { n }))}</span>` : ""}</span></button>`;
  }).join("");
  const mine = TALLER_SHAPES.flatMap((sh) => myDesigns[sh].map((d) => myDesignCard(sh, d, true)));
  $("#tallerWizard").innerHTML = `${tallerSteps(1)}
    <h2 class="tw-title">${esc(t("taller.shapeQ"))}</h2>
    <div class="tw-shapes">${shapes}</div>
    ${mine.length ? `<section class="tl-sec"><h3>${esc(t("taller.carryOn"))}<small>${mine.length}</small></h3><div class="tl-grid">${mine.join("")}</div></section>`
      : `<p class="hint tw-none">${esc(t("taller.noneYet"))}</p>`}`;
}
/** The second step: the bases for the shape, Basic first; the one chosen drawn on the sample tokens, and the way to start. */
/** The collections' groups of bases left open in step 2 (shape:index). */
const tallerOpenGroups = new Set<string>();
document.addEventListener("toggle", (e) => {
  const d = e.target as HTMLElement;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.twGroup) return;
  if (d.open) tallerOpenGroups.add(d.dataset.twGroup); else tallerOpenGroups.delete(d.dataset.twGroup);
}, true);
function renderTallerBases() {
  const sh = taller.shape, role = tokenRole(taller.samples[sh][0]);
  if (!tallerBase(sh, taller.pick)) taller.pick = firstBase(sh);
  const pick = tallerBase(sh, taller.pick)!;
  const more = (spec: TokenSpec) => `<span class="tw-more">${taller.samples[sh].slice(1, sh === "card" ? 3 : 4).map((k) => tallerPic(k, spec)).join("")}${SHAPE_FEATURES[sh].back ? tallerPic(taller.samples[sh][0], spec, "back") : ""}</span>`;
  const row = (g: TallerGroup, i: number, def: StyleDef) => {
    const d = tallerBase(sh, `g${i}:${def.id}`)!, on = d.ref === pick.ref;
    return `<button class="tw-opt" type="button" role="radio" aria-checked="${on}" data-tw-pick="${esc(d.ref)}">${designSwatch(d.spec, role)}<span class="tw-ot"><b>${esc(d.name)}${g.kind === "blank" ? ` <span class="tw-tag">${esc(t("taller.blankTag"))}</span>` : ""}</b>${d.help ? `<small>${esc(d.help)}</small>` : ""}</span><span class="rad" aria-hidden="true"></span>${on ? more(d.spec) : ""}</button>`;
  };
  const label = (g: TallerGroup) => (g.kind === "blank" ? t("taller.blankGroup") : g.kind === "app" ? g.name : t("taller.of", { name: g.name }));
  const note = (g: TallerGroup) => (g.kind === "blank" ? t("taller.blankNote") : g.kind === "from" ? t("taller.fromNote") : g.kind === "app" ? t("taller.appNote") : "");
  // the starting base in the open; each collection's designs folded (open where the chosen base is)
  const opts = taller.groups.map((g, i) => {
    const list = g.designs[sh];
    if (!list?.length) return "";
    const head = `${esc(label(g))}${note(g) ? ` <small>${esc(note(g))}</small>` : ""}`, rows = list.map((def) => row(g, i, def)).join("");
    if (g.kind === "blank") return `<p class="tw-gl">${head}</p>${rows}`;
    const open = tallerOpenGroups.has(`${sh}:${i}`) || list.some((def) => `g${i}:${def.id}` === pick.ref);
    // folded, it looks like the collection's cover: its colours, logo and name, and its designs on the sample token
    const lk = g.look ?? {}, minis = list.slice(0, 6).map((def) => designSwatch(tallerBase(sh, `g${i}:${def.id}`)!.spec, role)).join("");
    const style = `--acc:${esc(lk.accent ?? "#c9963a")}${lk.cover ? `;--cover:${esc(lk.cover)}` : ""}`;
    return `<details class="tw-grp" data-tw-group="${sh}:${i}"${open ? " open" : ""}><summary class="tw-cover" style="${style}"><img src="${esc(lk.logo ?? APP_LOGO)}" alt=""><span class="tw-cv-t"><b>${esc(g.name)}</b><small>${esc(t("taller.groupCount", { n: list.length }))}${note(g) ? ` · ${esc(note(g))}` : ""}</small></span><span class="tw-cv-minis" aria-hidden="true">${minis}</span>${CHEVRON}</summary><div class="tw-grp-rows">${rows}</div></details>`;
  }).join("");
  const go = esc(t("taller.go", { name: pick.name }));
  $("#tallerWizard").innerHTML = `${tallerSteps(2)}
    <div class="tw-titlebar"><button class="link" type="button" data-tw-back>‹ ${esc(t("taller.step.shape"))}</button><h2 class="tw-title">${esc(t(`taller.baseQ.${sh}`))}</h2></div>
    <div class="tw-blist">
      <div class="tw-opts" role="radiogroup" aria-label="${esc(t("taller.step.base"))}">${opts}</div>
      <div class="tw-side">
        <div class="tw-pv">${tallerPreviewHtml(sh, pick.spec)}</div>
        <p class="tw-desc"><b>${esc(pick.name)}</b>${pick.help ? ` · ${esc(pick.help)}` : ""}</p>
        <button class="forge" type="button" data-tw-go>${go} ›</button>
        <p class="hint tw-note">${esc(t("taller.goNote", { name: uniqueDesignName(sh, t("taller.mineName", { name: pick.name })) }))}</p>
      </div>
    </div>`;
}
/** A design on the sample tokens: the first large, front and back; the rest beside it (a coin's backs under them). */
function tallerPreviewHtml(sh: TokenShape, spec: TokenSpec) {
  const keys = taller.samples[sh], backs = SHAPE_FEATURES[sh].back;
  const front = esc(t("part.front")), back = esc(t("part.back")), rest = keys.slice(1);
  const cell = (k: string, side: "front" | "back") => `<span class="${tokenRem(k) != null ? "r" : ""}${side === "back" ? " b" : ""}">${tallerPic(k, spec, side)}</span>`;
  return `<div class="tv-hero"><figure>${tallerPic(keys[0], spec)}${backs ? `<figcaption>${front}</figcaption>` : ""}</figure>${backs ? `<figure>${tallerPic(keys[0], spec, "back")}<figcaption>${back}</figcaption></figure>` : ""}</div>
    ${rest.length ? `<div class="tv-rest${sh === "card" ? " cards" : ""}${backs ? " two" : ""}" style="--n:${rest.length}">${backs ? `<i>${front}</i>` : ""}${rest.map((k) => cell(k, "front")).join("")}${backs ? `<i class="b">${back}</i>${rest.map((k) => cell(k, "back")).join("")}` : ""}</div>` : ""}`;
}
/** The design open in the editor, on the sample tokens. */
function renderTallerPreview() {
  $("#tallerPreview").innerHTML = tallerPreviewHtml(taller.shape, tallerMine()!.spec);
}
/** Your other designs of the shape, to switch to. */
function renderTallerList() {
  const sh = taller.shape;
  $("#tallerList").innerHTML = `<section class="tl-sec"><h3>${esc(t("taller.mine"))}<small>${esc(t(`type.${sh}.many`))} · ${myDesigns[sh].length}</small></h3>
    <div class="tl-grid">${myDesigns[sh].map((d) => myDesignCard(sh, d, false)).join("")}</div></section>`;
}
/**
 * Where one of your designs is used: as a default in a collection, or by its tokens, in every
 * collection kept in this browser (and Clocktower).
 */
function designUses(id: string): { prefix: string; name: string; defaults: TokenShape[]; tokens: number }[] {
  const ref = `u:${id}`, out = new Map<string, { prefix: string; name: string; defaults: TokenShape[]; tokens: number }>();
  const entry = (prefix: string) => {
    if (!out.has(prefix)) {
      const cid = prefix.match(/^midnight-mint-own-(.+)-$/)?.[1];
      out.set(prefix, { prefix, name: cid ? builtIn(cid)?.name ?? listCollections().find((x) => x.id === cid)?.name ?? cid : "Blood on the Clocktower", defaults: [], tokens: 0 });
    }
    return out.get(prefix)!;
  };
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.endsWith("design-defaults")) for (const [sh, r] of Object.entries(loadJSON<Record<string, string>>(k, {}))) { if (r === ref) entry(k.slice(0, -15)).defaults.push(sh as TokenShape); }
      if (k.endsWith("design-tokens")) { const n = Object.values(loadJSON<Record<string, TokenOverride>>(k, {})).filter((o) => o?.style === ref).length; if (n) entry(k.slice(0, -13)).tokens += n; }
    }
  } catch { /* storage unavailable */ }
  return [...out.values()];
}
/** A line on one of your designs saying where it's the default ("Default in Draw Steel"). */
function usesLine(shape: TokenShape, id: string) {
  const uses = designUses(id), def = uses.filter((u) => u.defaults.includes(shape)).map((u) => u.name), n = uses.reduce((a, u) => a + u.tokens, 0);
  return [def.length ? t("taller.defaultIn", { list: def.join(", ") }) : "", n ? t("taller.tokens", { n }) : ""].filter(Boolean).join(" · ");
}
/** The editor's head, over the controls: back to your designs, the design's name (to change), its shape, where it's used, and what can be done with it. */
let tallerHeadFor = "";
function renderTallerHead() {
  const sh = taller.shape, mine = tallerMine()!, head = $("#tallerHead");
  const sig = `${mine.id}|${uiLang()}`;
  if (tallerHeadFor !== sig || !head.firstElementChild) {
    tallerHeadFor = sig;
    head.innerHTML = `<div class="th-top"><button class="link th-back" type="button" data-taller-act="mine">‹ ${esc(t("taller.mine"))}</button><span class="th-shape">${uiIcon(SHAPE_ICONS[sh])}${esc(t(`taller.shape.${sh}`))}</span></div>
      <input class="th-name" id="tallerName" type="text" autocomplete="off" maxlength="80" value="${esc(mine.name)}" aria-label="${esc(t("taller.nameLabel"))}">
      <p class="hint" id="tallerUses"></p>
      <div class="th-actions"><button class="pill" type="button" data-taller-act="copy">${esc(t("taller.duplicate"))}</button><button class="pill danger" type="button" data-taller-act="delete">${esc(t("taller.delete"))}</button><button class="pill th-new" type="button" data-taller-act="new">+ ${esc(t("taller.new"))}</button></div>`;
  }
  const name = $<HTMLInputElement>("#tallerName");
  if (document.activeElement !== name) name.value = mine.name;
  const uses = usesLine(sh, mine.id);
  $("#tallerUses").textContent = uses; $("#tallerUses").hidden = !uses;
  // the new copy's name ready to type over; not on a touch screen, where the keyboard would cover the preview
  if (taller.focusName) { taller.focusName = false; if (!matchMedia("(hover: none)").matches) { name.focus(); name.select(); } }
}
/** A design of yours from a base (a collection's, or Basic) or another of yours: it opens in the editor, to be changed. */
function tallerCopy(from: DesignEntry, name: string, origin = from.mine ? tallerMine()?.from : { name: from.name, spec: structuredClone(from.spec) }) {
  const { preset: _p, fromPreset: _f, ...spec } = structuredClone(from.spec);
  const d: MyDesign = { id: newId("d"), name: uniqueDesignName(taller.shape, name), spec: spec as TokenSpec, ...(origin ? { from: origin } : {}) };
  myDesigns[taller.shape].push(d); storeMyDesigns();
  tallerGo({ view: "edit", ref: `u:${d.id}`, focusName: true });
  toast(t("taller.made", { name: d.name }));
}
/** The name typed in the editor's head: kept as it's typed, made unique among the shape's when it's done. */
function tallerRename(done: boolean) {
  const mine = tallerMine(), input = $<HTMLInputElement>("#tallerName"); if (!mine) return;
  const typed = input.value.trim();
  if (typed) mine.name = done ? uniqueDesignName(taller.shape, typed, mine) : typed;
  if (done) input.value = mine.name;
  storeMyDesigns(); renderTallerList();
}
async function tallerAction(act: string) {
  const sh = taller.shape, mine = tallerMine();
  if (act === "mine" || act === "new") { tallerGo({ view: "shape" }); return; }
  if (!mine) return;
  if (act === "copy") { tallerCopy(myEntry(mine), t("style.copyOf", { name: mine.name })); return; }
  if (act === "delete") {
    const uses = designUses(mine.id);
    const where = uses.map((u) => [u.defaults.includes(sh) ? t("taller.useDefault", { name: u.name }) : "", u.tokens ? t("taller.useTokens", { name: u.name, n: u.tokens }) : ""].filter(Boolean).join(", ")).filter(Boolean);
    const text = t("taller.deleteAsk", { name: mine.name }) + " " + (where.length ? t("taller.deleteUses", { list: where.join("; ") }) : t("taller.deleteUnused"));
    if (await ask(text, [{ id: "delete", label: t("taller.delete"), main: true }]) !== "delete") return;
    myDesigns[sh] = myDesigns[sh].filter((x) => x !== mine); storeMyDesigns();
    // where it was used, back to the default: the collections' and their tokens' references to it go
    const ref = `u:${mine.id}`;
    for (const u of uses) {
      const defs = loadJSON<Record<string, string>>(`${u.prefix}design-defaults`, {});
      for (const k of Object.keys(defs)) if (defs[k] === ref) delete defs[k];
      storeJSON(`${u.prefix}design-defaults`, defs);
      const own = loadJSON<Record<string, TokenOverride>>(`${u.prefix}design-tokens`, {});
      for (const [k, o] of Object.entries(own)) if (o?.style === ref) { delete o.style; if (!Object.keys(o).length) delete own[k]; }
      storeJSON(`${u.prefix}design-tokens`, own);
    }
    tallerGo({ view: "shape" }, false);
    toast(t("taller.deleted", { name: mine.name }));
  }
}
function wireTaller() {
  const open = (b: HTMLElement) => tallerGo({ view: "edit", shape: b.dataset.tallerOpen as TokenShape, ref: b.dataset.ref! });
  $("#tallerWizard").onclick = (e) => {
    const shape = hit(e, "[data-tw-shape]"), pick = hit(e, "[data-tw-pick]"), mine = hit(e, "[data-taller-open]");
    if (shape) { const sh = shape.dataset.twShape as TokenShape; tallerGo({ view: "base", shape: sh, pick: firstBase(sh) }); }
    else if (pick) { tallerGo({ pick: pick.dataset.twPick! }, false); $<HTMLElement>(`[data-tw-pick="${CSS.escape(taller.pick)}"]`).focus({ preventScroll: true }); }
    else if (mine) open(mine);
    else if (hit(e, "[data-tw-back]")) tallerGo({ view: "shape" });
    else if (hit(e, "[data-tw-go]")) { const base = tallerBase(taller.shape, taller.pick)!; tallerCopy(base, t("taller.mineName", { name: base.name })); }
  };
  $("#tallerList").onclick = (e) => {
    const b = hit(e, "[data-taller-open]");
    if (b && b.dataset.ref !== taller.ref) { open(b); if (PHONE.matches) $("#workshop").scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  $("#tallerHead").onclick = (e) => { const b = hit(e, "[data-taller-act]"); if (b) void tallerAction(b.dataset.tallerAct!); };
  $("#tallerHead").oninput = (e) => { if ((e.target as HTMLElement).id === "tallerName") tallerRename(false); };
  $("#tallerHead").onchange = (e) => { if ((e.target as HTMLElement).id === "tallerName") tallerRename(true); };
  $("#tallerHead").onkeydown = (e) => { if (e.key === "Enter" && (e.target as HTMLElement).id === "tallerName") (e.target as HTMLInputElement).blur(); };
  window.addEventListener("popstate", () => { readTallerAddress(); renderTaller(); });
}

// ------------------------------------------------------------ Tesserae Faber, the generic creator
//
// Your own collection (collection.ts) stands in for Clocktower's library: each token is a
// character whose team is its colour group and whose reminders are its linked tokens. The
// sidebar has a fixed entry per type ("t:<id>", like "All characters" and "Grimoire"), then the
// sections with their catalogs ("k:<id>", like the editions and scripts). Everything after
// picking (design, queue, print) is the same app.

const catalogOf = (view: string | null | undefined): OwnCatalog | null =>
  (OWN && view?.startsWith("k:") ? catalogsOf(coll).find(({ k }) => k.id === view.slice(2))?.k ?? null : null);
const typeOfView = (view: string | null | undefined) => (OWN && view?.startsWith("t:") ? coll.types.find((x) => x.id === view.slice(2)) ?? null : null);
const typeOfToken = (id: string) => coll.tokens.find((x) => x.id === id)?.type;
/** The closed catalog a token came in ("Trouble Brewing"), shown under its name like an edition. */
const ownHomeCatalog = (id: string) => coll.sections.find((s) => !s.open && s.catalogs.some((k) => k.tokens.includes(id)))?.catalogs.find((k) => k.tokens.includes(id)) ?? null;
const ownHome = (r: Role) => { const k = ownHomeCatalog(r.id); return k ? nameIn(k.name, uiLang()) : ""; };
const sectionOf = (k: OwnCatalog) => coll.sections.find((s) => s.catalogs.includes(k))!;

/** The collection's groups take the place of the teams in every table that sorts, names or colours by team. */
function applyGroups() {
  const ids = coll.groups.map((g) => g.id as Team);
  TEAM_ORDER.splice(0, TEAM_ORDER.length, ...ids);
  PRINT_GROUPS.splice(0, PRINT_GROUPS.length, ...ids);
  const slug = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  for (const g of coll.groups) {
    const id = g.id as Team;
    for (const lang of Object.keys(TEAM_PLURAL)) { TEAM_PLURAL[lang][id] = nameIn(g.name, lang); PLATE_LABEL[lang][id] = nameIn(g.name, lang); }
    PLATE_GROUP[id] = id;
    TEAMS[id] = { label: { en: nameIn(g.name, "en"), es: nameIn(g.name, "es") }, colour: g.colour, file: slug(nameIn(g.name, "en")) || id };
    if (g.iconBody) UI_ICONS[`group:${id}`] = { author: "", body: g.iconBody };   // its own icon, from the collection
    TEAM_ICONS[id] = g.iconBody ? `group:${id}` : g.icon && UI_ICONS[g.icon] ? g.icon : TEAM_ICONS[id] ?? "two-coins";
  }
}

/** What depends on the collection itself: its name, its look, and the language button (its token languages). */
function syncOwnChrome() {
  for (const el of $$(".coll-name")) el.textContent = nameIn(coll.brand?.title, uiLang()) || nameIn(coll.name, uiLang());
  applyOwnTheme(); applyOwnBrand();
  renderLangButtons();
}

/** After any change to the collection: keep it, redraw, and drop picks and designs of tokens that are gone. */
function collectionChanged() {
  clearTimeout(ownTimer);
  storeCollection(coll);
  applyGroups();
  state.lib!.roles = ownRoles();
  // the token being made is there too, with its style
  const ids = new Set([...coll.tokens, ...(state.creating ? [state.creating.draft] : [])].map((x) => x.id)), linkedOf = new Map([...coll.tokens, ...(state.creating ? [state.creating.draft] : [])].map((x) => [x.id, x.linked.length]));
  const alive = (k: string) => { const [kind, id, i] = k.split(":"); return ids.has(id) && (kind !== "r" || +i < linkedOf.get(id)!); };
  for (const k of [...state.pick.keys()]) if (!alive(k)) state.pick.delete(k);
  for (const k of [...state.overrides.keys()]) if (!alive(k)) state.overrides.delete(k);
  persistPicks(); storeOverrides();
  const sel = state.sel && roleById(state.sel.role.id);
  state.sel = sel && alive(state.sel!.key) ? { ...state.sel!, role: sel } : { key: charKey(state.lib!.roles[0]), role: state.lib!.roles[0], reminder: null };
  syncOwnChrome();
  renderAll(); renderQueue();
}

function renderOwnSpine() {
  if (!catalogOf(state.edition) && !typeOfView(state.edition)) state.edition = `t:${coll.types[0].id}`;
  const q = searchQuery(), lang = uiLang();
  const rolesOf = (ids: string[]) => ids.map(roleById).filter((r): r is Role => !!r);
  const sub = (roles: Role[], card: boolean) => card ? t("ed.countInfo", { n: roles.length }) : t("own.count", { n: roles.length, l: roles.reduce((n, r) => n + remindersOf(r).length, 0) });
  $("#library").innerHTML = coll.types.map((ty) => {
    const roles = state.lib!.roles.filter((r) => typeOfToken(r.id) === ty.id);
    return `<button class="ed" type="button" data-ed="t:${esc(ty.id)}" aria-current="${state.edition === `t:${ty.id}` && !q}">${uiIcon(ty.icon && UI_ICONS[ty.icon] ? ty.icon : SHAPE_ICONS[ty.shape])}
      <span>${esc(nameIn(ty.title, lang))}<small>${esc(sub(roles, ty.shape === "card"))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("");
  // a read-only collection can't be added to: an open section with nothing in it is just an empty heading there
  $("#editions").innerHTML = coll.sections.filter((sec) => !(READONLY && sec.open && !sec.catalogs.length)).map((sec) => `
    <div class="spine-h spine-sec"><h2>${esc(nameIn(sec.title, lang))}</h2>${sec.open ? `<button class="spine-add" type="button" data-sec-new="${esc(sec.id)}" title="${esc(t("own.newCatalog"))}" aria-label="${esc(t("own.newCatalog"))}">+</button>` : ""}</div>
    ${sec.catalogs.map((k) => {
      const roles = rolesOf(k.tokens);
      return `<button class="ed" type="button" data-ed="k:${esc(k.id)}" aria-current="${state.edition === `k:${k.id}` && !q}">
        <span>${esc(nameIn(k.name, lang))}<small>${esc(sub(roles, false))}</small></span>${pickedBadge(roles)}</button>`;
    }).join("") || (sec.open ? `<p class="scripts-empty">${esc(t("own.noCatalogs"))}</p>` : "")}`).join("");
}

// a catalog made (in an open section) or added to: a name, and optionally a list of tokens
let catTarget: { section: OwnSection } | { catalog: OwnCatalog } | null = null;
function openCatalogDialog(target: NonNullable<typeof catTarget>) {
  catTarget = target;
  const adding = "catalog" in target;
  $("#ownCatTitle").textContent = t(adding ? "own.addFromList" : "own.newCatalog");
  $("#ownCatNameRow").hidden = adding;
  $<HTMLInputElement>("#ownCatName").value = "";
  $<HTMLTextAreaElement>("#ownCatText").value = "";
  $("#ownCatNote").textContent = "";
  $("#ownCatSave").textContent = t(adding ? "own.add" : "own.create");
  $<HTMLDialogElement>("#ownCat").showModal();
  (adding ? $("#ownCatText") : $("#ownCatName")).focus();
}

/**
 * The collection switch, the brand of both apps: the collection's logo and name over "Tesserae
 * Faber", opening the list of collections (the app's and yours) and, for one of your own, its
 * settings. Clocktower (/botc) wears it too.
 */
let openCollMenu: (on: boolean) => void = () => {};
function wireCollSwitch() {
  const menu = $("#collMenu"), sw = $("#collSwitch");
  openCollMenu = (on: boolean) => { menu.hidden = !on; sw.setAttribute("aria-expanded", String(on)); if (on) $("#ownNote").textContent = ""; };
  sw.onclick = () => openCollMenu(menu.hidden);
  // the Taller, from this collection (it comes back here: to the design step, if that's where it was)
  for (const l of $$<HTMLAnchorElement>("[data-coll-taller]")) { l.href = tallerUrl(); l.onclick = rememberReturn; }
  document.addEventListener("click", (e) => { if (!menu.hidden && !hit(e, ".coll-switch")) openCollMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { openCollMenu(false); sw.focus(); } });
  if (!OWN) {   // Clocktower: its clock and name
    for (const img of $$<HTMLImageElement>(".coll-logo")) img.src = "/logo-mark.svg";
    for (const el of $$(".coll-name")) el.textContent = "Blood on the Clocktower";
  }
}

function wireOwn() {
  $("#editions").addEventListener("click", (e) => {
    const b = hit(e, "[data-sec-new]"); if (!b) return;
    e.stopPropagation();
    openCatalogDialog({ section: coll.sections.find((s) => s.id === b.dataset.secNew)! });
  });
  closeOnBackdrop($<HTMLDialogElement>("#ownCat"));
  $("#ownCatCancel").onclick = () => $<HTMLDialogElement>("#ownCat").close();
  $<HTMLInputElement>("#ownCatFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    $<HTMLTextAreaElement>("#ownCatText").value = await f.text();
  };
  $("#ownCatSave").onclick = () => {
    const text = $<HTMLTextAreaElement>("#ownCatText").value.trim();
    const list = text ? readTokenList(coll, text) : { name: null, ids: [], missing: [] };
    if (text && !list.ids.length) { $("#ownCatNote").textContent = t("own.listNone"); return; }
    if ("section" in catTarget!) {
      const name = $<HTMLInputElement>("#ownCatName").value.trim() || list.name || t("own.newCatalogName");
      const k = { id: newId("k"), name, tokens: list.ids };
      catTarget.section.catalogs.push(k); state.edition = `k:${k.id}`;
    } else {
      const k = catTarget!.catalog; for (const id of list.ids) if (!k.tokens.includes(id)) k.tokens.push(id);
    }
    $<HTMLDialogElement>("#ownCat").close();
    collectionChanged();
    if (list.missing.length) $("#edLead").textContent += " " + t("own.listMissing", { list: list.missing.join(", ") });
  };
  $("#ownCatList").onclick = () => { const k = catalogOf(state.edition); if (k) openCatalogDialog({ catalog: k }); };
  $("#ownCatRename").onclick = () => {
    const k = catalogOf(state.edition); if (!k) return;
    const name = prompt(t("own.renamePrompt"), nameIn(k.name, uiLang()))?.trim(); if (!name) return;
    k.name = withName(k.name, uiLang(), name); collectionChanged();
  };
  $("#ownCatDelete").onclick = () => {
    const k = catalogOf(state.edition); if (!k || !confirm(t("own.deleteCatalogConfirm", { name: nameIn(k.name, uiLang()) }))) return;
    const sec = sectionOf(k); sec.catalogs = sec.catalogs.filter((x) => x !== k); state.edition = "all"; collectionChanged();
  };
  // the same items in the top bar's menu and, on a phone, at the head of the drawer
  document.addEventListener("click", (e) => {
    const b = hit(e, "[data-coll]"); if (!b) return;
    const what = b.dataset.coll!;
    if (what !== "import") { openCollMenu(false); drawer(false); }
    if (what === "copy" && BUILT) {
      const n = $("#ownNote"); n.textContent = t("own.copying");
      void copyBuiltIn(BUILT.id, t("own.copyName", { name: BUILT.name })).then((id) => { if (id) location.href = collectionUrl(id); else n.textContent = t("own.storageFull"); });
      return;
    }
    if (what === "settings") openOwnSettings();
    if (what === "groups") { renderOwnGroups(); $<HTMLDialogElement>("#ownGroupsDlg").showModal(); }
    if (what === "export") saveFile(new Blob([JSON.stringify(collectionFile(coll), null, 2)], { type: "application/json" }), `${nameIn(coll.name, "en").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "collection"}.json`);
    if (what === "import") $("#ownImportFile").click();
  });
  wireOwnSettings();
  $("#ownNewTok").onclick = () => startCreate();
  $<HTMLInputElement>("#ownImportFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    const noteEl = $("#ownNote");
    try {
      const next = await readCollectionFile(JSON.parse(await f.text()), (i, n) => { noteEl.textContent = t("own.importing", { i, n }); });
      if (!next.tokens.length) throw new Error("empty");
      const id = addCollection(next);   // a collection of its own, beside this one
      if (!id) { noteEl.textContent = t("own.storageFull"); return; }
      location.href = collectionUrl(id);
    } catch { noteEl.textContent = t("own.importFailed"); if (PHONE.matches) alert(t("own.importFailed")); }   // the note is in the top bar menu, which a phone hides
  };
  // types and groups
  $("#ownGroupAdd").onclick = () => {
    const used = new Set(coll.groups.map((g) => g.colour));
    coll.groups.push({ id: newId("g"), name: t("own.groupName", { n: coll.groups.length + 1 }), colour: GROUP_COLOURS.find((c) => !used.has(c)) ?? GROUP_COLOURS[0] });
    collectionChanged(); renderOwnGroups();
  };
  $("#ownTypeAdd").onclick = () => {
    coll.types.push({ id: newId("y"), name: t("own.typeName", { n: coll.types.length + 1 }), title: t("own.typeTitle", { n: coll.types.length + 1 }), shape: "coin" });
    collectionChanged(); renderOwnGroups();
  };
  $("#ownGroupsDlg").addEventListener("click", (e) => {
    const sw = hit(e, "[data-colour]"), del = hit(e, "[data-gdel]"), tdel = hit(e, "[data-tdel]");
    if (sw) { coll.groups.find((g) => g.id === sw.dataset.for)!.colour = sw.dataset.colour as Hex; collectionChanged(); renderOwnGroups(); }
    if (del) {
      const id = del.dataset.gdel!, to = coll.groups.find((g) => g.id !== id)!.id;
      coll.tokens.forEach((tk) => { if (tk.group === id) tk.group = to; });
      coll.groups = coll.groups.filter((g) => g.id !== id); collectionChanged(); renderOwnGroups();
    }
    if (tdel) {
      const id = tdel.dataset.tdel!, to = coll.types.find((x) => x.id !== id)!.id;
      coll.tokens.forEach((tk) => { if (tk.type === id) tk.type = to; });
      coll.types = coll.types.filter((x) => x.id !== id); collectionChanged(); renderOwnGroups();
    }
  });
  $("#ownGroupsDlg").addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement, lang = uiLang();
    if (el.dataset.gname) { const g = coll.groups.find((x) => x.id === el.dataset.gname)!; g.name = withName(g.name, lang, el.value.trim() || t("own.groupName", { n: 1 })); }
    else if (el.dataset.tname) { const ty = coll.types.find((x) => x.id === el.dataset.tname)!; ty.name = withName(ty.name, lang, el.value.trim() || ty.id); }
    else if (el.dataset.ttitle) { const ty = coll.types.find((x) => x.id === el.dataset.ttitle)!; ty.title = withName(ty.title, lang, el.value.trim() || nameIn(ty.name, lang)); }
    else if (el.dataset.tshape) coll.types.find((x) => x.id === el.dataset.tshape)!.shape = SHAPES.find((x) => x === el.value) ?? "coin";
    else return;
    collectionChanged();
  });
  closeOnBackdrop($<HTMLDialogElement>("#ownGroupsDlg"));
  wireOwnToken();
}

function renderOwnGroups() {
  const lang = uiLang();
  $("#ownTypeList").innerHTML = coll.types.map((ty) => `<div class="own-group">
    <span class="own-type-fields">
      <label class="field"><span>${esc(t("own.typeNameLabel"))}</span><input class="text" value="${esc(nameIn(ty.name, lang))}" data-tname="${esc(ty.id)}"></label>
      <label class="field"><span>${esc(t("own.typeTitleLabel"))}</span><input class="text" value="${esc(nameIn(ty.title, lang))}" data-ttitle="${esc(ty.id)}"></label>
      <label class="field"><span>${esc(t("own.shape"))}</span><select class="text" data-tshape="${esc(ty.id)}">${SHAPES.map((x) => `<option value="${x}"${ty.shape === x ? " selected" : ""}>${esc(t(`own.shape.${x}`))}</option>`).join("")}</select></label>
    </span>
    <small>${esc(t("own.groupCount", { n: coll.tokens.filter((tk) => tk.type === ty.id).length }))}</small>
    ${coll.types.length > 1 ? `<button class="link" type="button" data-tdel="${esc(ty.id)}">${esc(t("own.deleteGroup"))}</button>` : ""}
  </div>`).join("");
  $("#ownGroupList").innerHTML = coll.groups.map((g) => `<div class="own-group">
    <input class="text" value="${esc(nameIn(g.name, lang))}" data-gname="${esc(g.id)}" aria-label="${esc(t("own.groupNameLabel"))}">
    <span class="own-swatches">${GROUP_COLOURS.map((c) => `<button type="button" style="background:${c}" data-colour="${c}" data-for="${esc(g.id)}" aria-pressed="${c === g.colour}" aria-label="${c}"></button>`).join("")}</span>
    <small>${esc(t("own.groupCount", { n: coll.tokens.filter((tk) => tk.group === g.id).length }))}</small>
    ${coll.groups.length > 1 ? `<button class="link" type="button" data-gdel="${esc(g.id)}">${esc(t("own.deleteGroup"))}</button>` : ""}
  </div>`).join("");
}

// ------------------------------------------------------------ a token's content: its panel
//
// A token of your collection is made and changed in a panel over the sheet ("+ Token", and each
// token's "Edit"), or over the design step ("Edit content"): its shape and type, name, icon, group,
// catalogs, linked tokens and other state, beside the token as it prints (in its design). A token
// being made is a draft (state.creating), drawn like any token until it's created; a token's
// changes are kept at once (and the sheet redrawn a moment later).

/** Your collection's tokens as characters, and the one being made. */
function ownRoles() {
  const roles = collectionRoles(coll, uiLang());
  if (state.creating) roles.push(draftRole(state.creating));
  return roles;
}
/** The token being made as a character of a shape: its type's, or (a shape the collection doesn't use yet) one to come. */
function draftRole(c: Creating, shape = c.shape): Role {
  const type = coll.types.find((x) => x.id === c.draft.type && x.shape === shape) ?? { id: "__draft", name: "", title: "", shape };
  return ownRole({ ...coll, types: [...coll.types, type] }, { ...c.draft, type: type.id }, uiLang());
}
/** A type of a shape for a token being made: the sheet's own type if it has that shape, else the collection's first of it (none: one comes with Create). */
function typeFor(shape: TokenShape) {
  const here = typeOfView(state.edition);
  return (here?.shape === shape ? here : coll.types.find((x) => x.shape === shape))?.id ?? "__draft";
}
/** The token whose content is open: the one being made, or one of yours being changed. */
const editingOwn = (): OwnToken | undefined => state.creating?.draft ?? (state.editing ? coll.tokens.find((x) => x.id === state.editing) : undefined);
const shapeOfToken = (tk: OwnToken): TokenShape => (state.creating?.draft === tk ? state.creating.shape : coll.types.find((x) => x.id === tk.type)?.shape ?? "coin");
let ownTimer: ReturnType<typeof setTimeout> | number = 0;
/** After a change to a token's content (its name, icon, group…): drawn at once; your collection's is kept, and the sheet redrawn, a moment later. */
function ownEdited() {
  state.lib!.roles = ownRoles();
  if (state.sel) { const r = roleById(state.sel.role.id); if (r) state.sel = { ...state.sel, role: r }; }
  if (state.creating) renderPanelShape(state.creating.draft, state.creating.shape);
  renderPanelToken();
  if (state.step === 2 && state.sel) { renderWorkshop(); renderDesignStage(); }
  if (!state.creating) { clearTimeout(ownTimer); ownTimer = setTimeout(collectionChanged, 400); }
}

/** "Edit" on one of your tokens (the sheet's, or the design step's "Edit content"): its panel. */
function openTokenPanel(id: string) {
  if (!coll.tokens.some((x) => x.id === id) || READONLY || isLocked(coll, id)) return;
  dropDraft();
  state.editing = id; panelFor = "";
  $("#tpFlash").textContent = "";
  renderTokenPanel();
  showTokenPanel();
}
/**
 * "+ Token": the panel on a new token. Its shape is the sheet's type's, its group the one the sheet
 * shows, and it goes in the catalog open; "Create and another" passes on the last one's shape,
 * type, group and catalogs.
 */
function startCreate(like?: { shape: TokenShape; type: string; group: string; cats: string[] }) {
  dropDraft();
  state.editing = null;
  const here = catalogOf(state.edition), shape = like?.shape ?? typeOfView(state.edition)?.shape ?? "coin";
  const group = like?.group ?? (state.team !== "all" && coll.groups.some((g) => g.id === state.team) ? state.team : coll.groups[0].id);
  const draft: OwnToken = { id: newId("t"), type: like?.type ?? typeFor(shape), group, name: "", icon: null, linked: [] };
  state.creating = { draft, shape, cats: like?.cats ?? (here ? [here.id] : []) };
  state.lib!.roles = ownRoles();
  panelFor = "";
  if (!like) $("#tpFlash").textContent = "";
  renderTokenPanel();
  showTokenPanel();
  setTimeout(() => $("#ownTokName").focus(), 60);   // once the panel has drawn
}
function showTokenPanel() { const d = $<HTMLDialogElement>("#tokenPanel"); if (!d.open) d.showModal(); }
/** The token being made is dropped. */
function dropDraft() {
  if (!state.creating) return;
  state.creating = null;
  state.lib!.roles = ownRoles();
}
/** Done, or Cancel: back to the sheet (or the design step). A token being made is left unmade; a token's changes, kept now. */
function closeTokenPanel() {
  const made = !!state.creating, was = state.editing;
  dropDraft();
  state.editing = null;
  const d = $<HTMLDialogElement>("#tokenPanel"); if (d.open) d.close();
  if (was) { clearTimeout(ownTimer); collectionChanged(); }
  else if (made) { renderSheet(); renderSpine(); }
}
/** Choosing the shape of the token being made: its type follows. */
function chooseShape(shape: TokenShape) {
  const c = state.creating; if (!c || c.shape === shape) return;
  c.shape = shape; c.draft.type = typeFor(shape);
  panelFor = "";
  ownEdited(); renderTokenPanel();
}
/**
 * Create: the token joins the collection (with a type for its shape, made now if the collection had
 * none: "Coins", "Rings", "Cards") and the queue, and the panel closes on the sheet; "Create and
 * another" opens a new one like it instead. It needs a name, and its other state one too.
 */
function createToken(more: boolean) {
  const c = state.creating; if (!c) return;
  const d = c.draft, lang = tokenLang();
  if (!nameIn(d.name, lang).trim()) { $("#tpFlash").textContent = t("create.needName"); $("#ownTokName").focus(); return; }
  const flip = SHAPE_FEATURES[c.shape].flip ? d.flip : undefined;
  if (flip && !nameIn(flip.name, lang).trim()) { $("#tpFlash").textContent = t("create.needFlipName"); $("#ownTokFlipName").focus(); return; }
  let type = coll.types.find((x) => x.id === d.type && x.shape === c.shape);
  if (!type) { const name = t(`type.${c.shape}.many`); type = { id: newId("y"), name, title: name, shape: c.shape }; coll.types.push(type); }
  const { flip: _flip, ...rest } = d;
  const tk: OwnToken = { ...rest, type: type.id, linked: d.linked.filter((w) => nameIn(w, lang).trim()), ...(flip ? { flip } : {}) };
  coll.tokens.push(tk);
  for (const k of coll.sections.filter((x) => x.open).flatMap((x) => x.catalogs)) if (c.cats.includes(k.id)) k.tokens.push(tk.id);
  const key = `c:${tk.id}`, name = nameIn(tk.name, lang);
  state.creating = null;
  collectionChanged();
  setPick(key, true); tk.linked.forEach((_, i) => setPick(`r:${tk.id}:${i}`, true));
  picksChanged();
  if (more) { startCreate({ shape: c.shape, type: type.id, group: tk.group, cats: c.cats }); $("#tpFlash").textContent = t("create.doneMore", { name }); return; }
  closeTokenPanel();
  toast(t("create.done", { name }));
}

/** The panel's fields are filled when another token (or shape, or language) opens, so typing in them isn't undone by a redraw. */
let panelFor = "";
function renderTokenPanel() {
  const tk = editingOwn(); if (!tk) return;
  const c = state.creating, shape = shapeOfToken(tk);
  $("#tpTitle").textContent = t(c ? "own.newTokenTitle" : "panel.editTitle");
  $("#tpCancel").hidden = $("#tpMore").hidden = !c;
  $("#ownTokDelete").hidden = !!c;
  $("#tpDone").textContent = t(c ? "create.create" : "panel.done");
  renderPanelShape(tk, shape);
  renderPanelToken();
  renderTokenColour(tk);
  const sig = [tk.id, shape, tokenLang(), uiLang()].join("|");
  if (sig === panelFor) return;
  panelFor = sig;
  $<HTMLInputElement>("#ownTokName").value = nameIn(tk.name, tokenLang());
  $("#ownTokIconRow").hidden = !SHAPE_FEATURES[shape].icon;
  $<HTMLInputElement>("#ownTokIq").value = ""; $("#ownTokHits").innerHTML = "";
  renderGroupPills(tk);
  const openCats = coll.sections.filter((x) => x.open).flatMap((x) => x.catalogs), inCat = (k: OwnCatalog) => (c ? c.cats.includes(k.id) : k.tokens.includes(tk.id));
  $("#ownTokCats").innerHTML = openCats.map((k) => `<label class="check"><input type="checkbox" value="${esc(k.id)}"${inCat(k) ? " checked" : ""}> ${esc(nameIn(k.name, uiLang()))}</label>`).join("") || `<p class="hint">${esc(t("own.noCatalogs"))}</p>`;
  renderOwnLinked(tk);
  $("#contentFlip").hidden = !SHAPE_FEATURES[shape].flip;
  renderOwnFlip(tk);
}
/**
 * Its shape. A token being made chooses it, each shape drawn with the token in its default design;
 * one the collection doesn't use yet makes its type when the token is created. A token's shape is
 * its type's, said, with the other types of that shape when there are some to move it to.
 */
function renderPanelShape(tk: OwnToken, shape: TokenShape) {
  const c = state.creating, types = coll.types.filter((x) => x.shape === shape);
  const typePick = types.length > 1 ? `<label class="field tp-type"><span>${esc(t("own.type"))}</span><select class="text" data-type-pick>${types.map((x) => `<option value="${esc(x.id)}"${x.id === tk.type ? " selected" : ""}>${esc(nameIn(x.name, uiLang()))}</option>`).join("")}</select></label>` : "";
  if (!c) {
    $("#tpShape").innerHTML = `<p class="ws-shape-fixed">${uiIcon(SHAPE_ICONS[shape])}<span>${esc(t("shape.fixed", { shape: t(`own.shape.${shape}`) }))}</span></p>${typePick}`;
    return;
  }
  const name = nameIn(c.draft.name, tokenLang()).trim() || t("own.namePlaceholder");
  $("#tpShape").innerHTML = `<div class="field"><span>${esc(t("own.shape"))}</span><div class="shape-cards" role="radiogroup" aria-label="${esc(t("own.shape"))}">${SHAPES.map((sh) => {
    const r = draftRole(c, sh), spec = designOf(sh, defaultRef(sh))!.spec;
    return `<button type="button" role="radio" data-shape="${sh}" aria-checked="${sh === c.shape}">${tokenSvg(state.lib!, r, { ...filled(spec), lang: tokenLang(), diameter: 45, back: "none", backMode: "design" }, { text: name })}<span>${esc(t(`own.shape.${sh}`))}</span></button>`;
  }).join("")}</div></div>${typePick}`;
}
/** The token as it prints, in its design (front, back, linked tokens), and which design that is. */
function renderPanelToken() {
  const tk = editingOwn(), role = tk && roleById(tk.id);
  if (!tk || !role) return;
  const key = charKey(role), shape = shapeOf(role), d = designFor(key, shape);
  const text = nameIn(tk.name, tokenLang()).trim() || t("own.namePlaceholder"), spec = specFor(key, false);
  const fig = (svg: string, label: string, cls = "") => `<figure class="${cls}">${svg}<figcaption>${esc(label)}</figcaption></figure>`;
  const linked = tk.linked.map((w, i) => ({ w: nameIn(w, tokenLang()), i })).filter((x) => x.w.trim());
  $("#tpPic").innerHTML = `<div class="tp-faces">${fig(tokenSvg(state.lib!, role, spec, { text }), t("view.front"))}${SHAPE_FEATURES[shape].back ? fig(tokenSvg(state.lib!, role, spec, { side: "back", text }), t("view.back")) : ""}</div>`
    + (linked.length ? `<div class="tp-linked">${linked.map(({ w, i }) => fig(tokenSvg(state.lib!, role, specFor(remKey(role, i), true), { text: w }), w, "r")).join("")}</div>` : "");
  const own = designOverridden(key);
  $("#tpDesign").textContent = t(own ? "panel.designOwn" : "panel.design", { name: d.name, shape: t(`type.${shape}.many`).toLowerCase() });
}
/**
 * The token's own colour, over its group's (what "the group's colour" is in its design): a menu with
 * the group's first, then the colours a group can have.
 */
function renderTokenColour(tk: OwnToken) {
  const group = coll.groups.find((g) => g.id === tk.group)?.colour ?? GROUP_COLOURS[0], now = tk.colour ?? group;
  const name = (hex: string) => { const c = COLOUR_CHOICES.find((x) => x.hex === hex.toLowerCase()); return c ? t(`metal.${c.id}`) : hex; };
  $("#ownTokColour summary").innerHTML = `<i style="--c: ${now}"></i><span>${esc(tk.colour ? name(tk.colour) : t("own.colourGroup"))}</span><b aria-hidden="true">▾</b>`;
  $("#ownTokColour .tok-colour-menu").innerHTML = `<button class="pill group-pill" type="button" data-tcolour="" aria-pressed="${!tk.colour}" style="--c: ${group}"><i></i>${esc(t("own.colourGroup"))}</button>`
    + `<span class="own-swatches">${GROUP_COLOURS.map((c) => `<button type="button" style="background:${c}" data-tcolour="${c}" aria-pressed="${c === tk.colour}" aria-label="${esc(name(c))}" title="${esc(name(c))}"></button>`).join("")}</span>`;
}
/** The groups as their colours, the token's pressed, and a new one. */
function renderGroupPills(tk: OwnToken) {
  $("#ownTokGroups").innerHTML = coll.groups.map((g) => `<button class="pill group-pill" type="button" data-group="${esc(g.id)}" aria-pressed="${g.id === tk.group}" style="--c: ${g.colour}"><i></i>${esc(nameIn(g.name, uiLang()))}</button>`).join("")
    + `<button class="pill" type="button" data-group-new>${esc(t("own.groupNew"))}</button>`;
}
function renderOwnLinked(tk: OwnToken) {
  const lang = tokenLang();
  $("#ownTokLinked").innerHTML = tk.linked.map((w, i) => `<span class="own-link"><input class="text" value="${esc(nameIn(w, lang))}" data-li="${i}" aria-label="${esc(t("own.linked"))}"><button class="link" type="button" data-ldel="${i}" aria-label="${esc(t("own.remove"))}">✕</button></span>`).join("");
}
/** The other state's fields: the way to add one, or its name and icon and the way to take it away. */
function renderOwnFlip(tk: OwnToken) {
  $("#ownTokFlipAdd").hidden = !!tk.flip;
  $("#ownTokFlipBox").hidden = !tk.flip;
  $<HTMLInputElement>("#ownTokFlipName").value = tk.flip ? nameIn(tk.flip.name, tokenLang()) : "";
  $<HTMLInputElement>("#ownTokFlipIq").value = ""; $("#ownTokFlipHits").innerHTML = "";
}
/** A linked token taken out: the ones after it move up, and their picks and own designs follow them. */
function dropLinked(id: string, i: number) {
  for (const store of [state.pick, state.overrides] as Map<string, unknown>[]) {
    const mine = [...store].filter(([k]) => k.startsWith(`r:${id}:`));
    for (const [k] of mine) store.delete(k);
    for (const [k, v] of mine) { const j = +k.split(":")[2]; if (j !== i) store.set(`r:${id}:${j > i ? j - 1 : j}`, v); }
  }
}
function wireOwnToken() {
  const panel = $<HTMLDialogElement>("#tokenPanel");
  // Escape, the ×, Cancel and Done all close it the same way (a draft is dropped, changes kept)
  panel.addEventListener("cancel", (e) => { e.preventDefault(); closeTokenPanel(); });
  $("#tpClose").onclick = $("#tpCancel").onclick = closeTokenPanel;
  $("#tpMore").onclick = () => createToken(true);
  $("#tpDone").onclick = () => (state.creating ? createToken(false) : closeTokenPanel());
  $("#tpShape").onclick = (e) => { const b = hit(e, "[data-shape]"); if (b) chooseShape(b.dataset.shape as TokenShape); };
  $("#tpShape").onchange = (e) => {
    const el = e.target as HTMLSelectElement, tk = editingOwn();
    if (tk && el.dataset.typePick != null) { tk.type = el.value; ownEdited(); }
  };
  $("#ownTokName").oninput = (e) => { const tk = editingOwn(); if (tk) { tk.name = withName(tk.name, tokenLang(), input(e).value); ownEdited(); } };
  // The token's icon and its other state's are chosen alike: game-icons.net, an SVG of yours, or none.
  const iconPicker = (id: string, set: (icon: TokenIcon | null) => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    $(`#${id}Iq`).oninput = (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const query = input(e).value.trim(), hits = query ? await searchGameIcons(query, 48) : [];
        $(`#${id}Hits`).innerHTML = hits.map((p) => `<button type="button" class="icon-hit" data-gi="${esc(p)}" title="${esc(p.replace("/", " · "))}"><img src="${gameIconPreview(p)}" alt="" loading="lazy"><span>${esc(p.split("/")[1])}</span></button>`).join("")
          || (query ? `<p class="hint">${esc(t("icon.none"))}</p>` : "");
      }, 200);
    };
    $(`#${id}Hits`).onclick = async (e) => {
      const b = hit(e, "[data-gi]"); if (!b) return;
      try { set({ ...(await gameIcon(b.dataset.gi!)), id: b.dataset.gi! }); } catch { /* offline: keep the old one */ }
    };
    $<HTMLInputElement>(`#${id}Svg`).onchange = async (e) => {
      const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
      try { set({ ...iconFromSvg(await f.text(), { source: "upload", name: f.name }), id: `upload:${newId("i")}` }); }
      catch { $(`#${id}Hits`).innerHTML = `<p class="hint warn">${esc(t("own.svgFailed"))}</p>`; }
    };
    $(`#${id}NoIcon`).onclick = () => set(null);
  };
  iconPicker("ownTok", (icon) => { const tk = editingOwn(); if (tk) { tk.icon = icon; ownEdited(); } });
  iconPicker("ownTokFlip", (icon) => { const tk = editingOwn(); if (tk?.flip) { tk.flip.icon = icon; ownEdited(); } });
  // its group, as the groups' colours, or a new one
  $("#ownTokGroups").onclick = (e) => {
    const tk = editingOwn(); if (!tk) return;
    const g = hit(e, "[data-group]");
    if (g) { tk.group = g.dataset.group!; renderGroupPills(tk); renderTokenColour(tk); ownEdited(); return; }
    if (hit(e, "[data-group-new]")) {
      const used = new Set(coll.groups.map((x) => x.colour)), id = newId("g");
      coll.groups.push({ id, name: t("own.groupName", { n: coll.groups.length + 1 }), colour: GROUP_COLOURS.find((c) => !used.has(c)) ?? GROUP_COLOURS[0] });
      tk.group = id;
      collectionChanged(); renderGroupPills(tk);
    }
  };
  // its own colour, or its group's
  $("#ownTokColour").onclick = (e) => {
    const tk = editingOwn(), b = hit(e, "[data-tcolour]"); if (!tk || !b) return;
    if (b.dataset.tcolour) tk.colour = b.dataset.tcolour; else delete tk.colour;
    $<HTMLDetailsElement>("#ownTokColour").open = false;
    renderTokenColour(tk); ownEdited();
  };
  $("#ownTokCats").onchange = (e) => {
    const tk = editingOwn(), id = input(e).value, k = catalogsOf(coll).find((x) => x.k.id === id)?.k; if (!tk || !k) return;
    const on = input(e).checked;
    if (state.creating) state.creating.cats = on ? [...state.creating.cats, id] : state.creating.cats.filter((x) => x !== id);
    else { k.tokens = on ? [...k.tokens.filter((x) => x !== tk.id), tk.id] : k.tokens.filter((x) => x !== tk.id); ownEdited(); }
  };
  // the other state: added, named (in the token language, like the name) and taken out
  $("#ownTokFlipAdd").onclick = () => { const tk = editingOwn(); if (!tk) return; tk.flip = { name: "", icon: null }; renderOwnFlip(tk); ownEdited(); $("#ownTokFlipName").focus(); };
  $("#ownTokFlipRemove").onclick = () => { const tk = editingOwn(); if (!tk) return; delete tk.flip; renderOwnFlip(tk); ownEdited(); };
  $("#ownTokFlipName").oninput = (e) => { const tk = editingOwn(); if (tk?.flip) { tk.flip.name = withName(tk.flip.name, tokenLang(), input(e).value); ownEdited(); } };
  // linked tokens: one more, renamed in place, or taken out (an empty one goes when you leave it)
  $("#ownTokAddLinked").onclick = () => {
    const tk = editingOwn(); if (!tk) return;
    tk.linked.push(""); renderOwnLinked(tk);
    $<HTMLInputElement>(`[data-li="${tk.linked.length - 1}"]`).focus();
  };
  $("#ownTokLinked").oninput = (e) => { const tk = editingOwn(), i = input(e).dataset.li; if (tk && i != null) { tk.linked[+i] = withName(tk.linked[+i], tokenLang(), input(e).value); ownEdited(); } };
  const dropAt = (tk: OwnToken, i: number) => { if (!state.creating) dropLinked(tk.id, i); tk.linked.splice(i, 1); renderOwnLinked(tk); ownEdited(); };
  $("#ownTokLinked").onclick = (e) => { const tk = editingOwn(), b = hit(e, "[data-ldel]"); if (tk && b) dropAt(tk, +b.dataset.ldel!); };
  $("#ownTokLinked").addEventListener("focusout", (e) => {
    const tk = editingOwn(), i = (e.target as HTMLElement).dataset.li;
    if (tk && i != null && !nameIn(tk.linked[+i], tokenLang()).trim()) dropAt(tk, +i);
  });
  $("#ownTokDelete").onclick = () => {
    const tk = editingOwn(); if (!tk || state.creating) return;
    if (coll.tokens.length <= 1) { alert(t("own.lastToken")); return; }
    if (!confirm(t("own.deleteTokenConfirm", { name: nameIn(tk.name, tokenLang()) }))) return;
    coll.tokens = coll.tokens.filter((x) => x.id !== tk.id);
    for (const { k } of catalogsOf(coll)) k.tokens = k.tokens.filter((x) => x !== tk.id);
    closeTokenPanel();
    if (state.step === 2) { if (!state.pick.size) goStep(1); else { selectToken(sortKeys(state.pick.keys())[0]); renderWorkshop(); renderDesignStage(); } }
  };
}

// ------------------------------------------------------------ the collection's own look, loading line and About

/** The collection's colours on the whole app: Clocktower's own stylesheet for "botc", else its theme's. */
function applyOwnTheme() {
  const root = document.documentElement, th = coll.theme ?? "faber";
  // "botc" is the stylesheet's own colours: nothing to set
  const colours: OwnTheme | null = th === "botc" ? null : typeof th === "string" ? THEMES[th] ?? THEMES.faber : th;
  root.dataset.theme = th === "botc" ? "botc" : "";
  const vars: Record<string, string | undefined> = colours ? {
    "--velvet": colours.surface, "--velvet-mid": colours.surface, "--velvet-deep": colours.background, "--brass": colours.accent,
    "--bone": colours.text, "--dust": colours.muted, "--seam": `${colours.text}1f`, "--glow": colours.glow ?? colours.surface,
    "--display": colours.font ? `"${colours.font}", sans-serif` : undefined,
  } : {};
  for (const k of ["--velvet", "--velvet-mid", "--velvet-deep", "--brass", "--bone", "--dust", "--seam", "--glow", "--display"]) {
    if (vars[k]) root.style.setProperty(k, vars[k]!); else root.style.removeProperty(k);
  }
}

/** The collection's mark: its logo on the top bar, the loading screen and the tab, and its name beside it. */
function applyOwnBrand() {
  const own = coll.brand?.logo, name = nameIn(coll.brand?.title, uiLang()) || nameIn(coll.name, uiLang());
  $<HTMLImageElement>(".gate-logo").src = own || APP_LOGO;
  for (const img of $$<HTMLImageElement>(".coll-logo")) img.src = own || APP_LOGO_SMALL;
  const icon = $<HTMLLinkElement>("#favicon");
  icon.href = own || APP_ICON; icon.type = (own || APP_ICON).startsWith("data:image/svg") || (own || APP_ICON).endsWith(".svg") ? "image/svg+xml" : "";
  // the loading screen: the collection's logo and name, the app's name small beneath
  for (const el of $$(".gate-card .wordmark")) el.hidden = true;
  for (const el of $$(".brand-title")) { el.textContent = name; el.hidden = !name; }
  for (const el of $$(".coll-name")) el.textContent = name;
  document.title = name ? `${name} · ${APP_NAME}` : APP_NAME;
}

function openOwnSettings() {
  const lang = uiLang();
  $<HTMLImageElement>("#osLogo").src = coll.brand?.logo || APP_LOGO;
  $<HTMLInputElement>("#osBrandTitle").value = nameIn(coll.brand?.title, lang);
  $("#osLogoNote").textContent = "";
  $<HTMLInputElement>("#osName").value = nameIn(coll.name, lang);
  $<HTMLInputElement>("#osLoader").value = nameIn(coll.loader?.text, lang);
  $<HTMLInputElement>("#osCcc").checked = hasCcc(coll);
  $<HTMLTextAreaElement>("#osAbout").value = nameIn(coll.about?.text, lang);
  $<HTMLTextAreaElement>("#osCredits").value = nameIn(coll.about?.credits, lang);
  $<HTMLTextAreaElement>("#osLinks").value = (coll.about?.links ?? []).map((l) => `${nameIn(l.label, lang)} | ${l.url}`).join("\n");
  renderOwnThemes();
  $<HTMLDialogElement>("#ownSettings").showModal();
}
function renderOwnThemes() {
  const th = coll.theme ?? "faber", custom = typeof th === "object" ? th : null;
  $("#osThemes").innerHTML = Object.entries(THEMES).map(([id, c]) => {
    const sw = c ?? { background: "#170812", surface: "#2a0f20", accent: "#c9a227", text: "#efe6d6" };
    return `<button type="button" class="os-theme" data-theme-id="${id}" aria-pressed="${th === id}"><span style="background:${sw.background};border-color:${sw.surface}"><i style="background:${sw.accent}"></i><b style="color:${sw.text}">Aa</b></span>${esc(t(`own.theme.${id}`))}</button>`;
  }).join("") + `<button type="button" class="os-theme" data-theme-id="custom" aria-pressed="${!!custom}"><span class="custom"><i></i><b>+</b></span>${esc(t("own.theme.custom"))}</button>`;
  const base = custom ?? (typeof th === "string" ? THEMES[th] : null) ?? THEMES.faber!;
  $("#osCustom").hidden = !custom;
  for (const k of ["accent", "background", "surface", "text", "muted"] as const) $<HTMLInputElement>(`#os-${k}`).value = base[k];
  $("#osFont").innerHTML = THEME_FONTS.map((f) => `<option${(custom?.font ?? "Marcellus") === f ? " selected" : ""}>${esc(f)}</option>`).join("");
}
function wireOwnSettings() {
  const dlg = $<HTMLDialogElement>("#ownSettings");
  closeOnBackdrop(dlg);
  $("#osThemes").onclick = (e) => {
    const b = hit(e, "[data-theme-id]"); if (!b) return;
    const id = b.dataset.themeId!;
    if (id === "custom") { const cur = coll.theme ?? "faber"; coll.theme = { ...(typeof cur === "object" ? cur : THEMES[cur] ?? THEMES.faber!) }; }
    else coll.theme = id;
    storeCollection(coll); applyOwnTheme(); renderOwnThemes();
  };
  $("#osCustom").oninput = () => {
    if (typeof coll.theme !== "object") return;
    for (const k of ["accent", "background", "surface", "text", "muted"] as const) coll.theme[k] = $<HTMLInputElement>(`#os-${k}`).value as Hex;
    coll.theme.glow = coll.theme.surface;
    coll.theme.font = $<HTMLSelectElement>("#osFont").value;
    storeCollection(coll); applyOwnTheme();
  };
  $<HTMLInputElement>("#osLogoFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
    if (!okLogo(url)) { $("#osLogoNote").textContent = t("own.logoTooBig"); return; }
    coll.brand = { ...coll.brand, logo: url }; storeCollection(coll); applyOwnBrand();
    $<HTMLImageElement>("#osLogo").src = url; $("#osLogoNote").textContent = "";
  };
  $("#osLogoReset").onclick = () => { if (coll.brand) delete coll.brand.logo; storeCollection(coll); applyOwnBrand(); $<HTMLImageElement>("#osLogo").src = APP_LOGO; };
  $("#osCancel").onclick = () => dlg.close();
  $("#osSave").onclick = () => {
    const lang = uiLang(), v = (id: string) => $<HTMLInputElement>(id).value.trim();
    if (v("#osName")) coll.name = withName(coll.name, lang, v("#osName"));
    coll.brand = { ...coll.brand, title: withName(coll.brand?.title ?? "", lang, v("#osBrandTitle")) };
    if (!v("#osBrandTitle")) delete coll.brand.title;
    coll.loader = { ...coll.loader, text: withName(coll.loader?.text ?? "", lang, v("#osLoader")) };
    delete coll.loader.ccc;   // the mark has its own field now
    if ($<HTMLInputElement>("#osCcc").checked) coll.ccc = true; else delete coll.ccc;
    if (!v("#osLoader")) delete coll.loader.text;
    const links = v("#osLinks").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter(([label, url]) => label && /^https?:\/\//.test(url ?? "")).map(([label, url]) => ({ label, url }));
    coll.about = { text: withName(coll.about?.text ?? "", lang, v("#osAbout")), credits: withName(coll.about?.credits ?? "", lang, v("#osCredits")), links };
    dlg.close();
    collectionChanged();
  };
}

// ------------------------------------------------------------ the list of your collections

/** The collections, the app's own apart from yours: [built-in, opened ones kept here], [yours]. */
async function collectionsByKind() {
  const built = await builtInCollections(), ids = new Set(built.map((b) => b.id));
  const kept = listCollections();
  return { built: built.map((b) => ({ b, kept: kept.find((k) => k.id === b.id) ?? null })), mine: kept.filter((k) => !ids.has(k.id)).sort((a, b) => b.updated - a.updated) };
}
/** The top bar menu's (and the phone drawer's) list of collections to go to, the app's own first. */
/** The creator's own pages (front page, list): the app's name and icon, nothing of a collection's. */
function showOwnPage(id: string) {
  $("#gate").hidden = true; $("#app").hidden = true;
  for (const el of $$("#ownLanding, #ownHome")) el.hidden = el.id !== id;
  document.title = APP_NAME;
  $<HTMLLinkElement>("#favicon").href = APP_ICON;
  document.documentElement.dataset.theme = "";
}
/** The front page (/): what the app is, the ways in, and back to the last collection you had open. */
async function renderOwnLanding() {
  showOwnPage("ownLanding");
  // the honeycomb of tokens, drawn once by the engine (tools/make-crear-art.mjs); inline, so its cells can be laid in turn
  fetch("/crear-hero.svg").then((r) => (r.ok ? r.text() : "")).then((svg) => { $("#ownComb").innerHTML = svg; $("#ownComb").classList.add("play"); }).catch(() => {});
  const last = lastCollection(), lang = uiLang();
  if (!last) return;
  const { built, mine } = await collectionsByKind();
  const b = built.find((x) => x.b.id === last), m = mine.find((x) => x.id === last);
  const name = m?.name ?? b?.b.name, logo = m?.logo ?? b?.kept?.logo ?? b?.b.logo;
  if (!name) return;
  const r = $<HTMLAnchorElement>("#ownResume");
  r.href = openUrl(last, built.map((x) => x.b)); r.hidden = false;
  r.querySelector("img")!.src = logo || APP_LOGO_SMALL;
  r.querySelector("b")!.textContent = name;
  void lang;
}
/** /colecciones: the app's collections as covers, yours as a working list. */
async function renderOwnHome() {
  showOwnPage("ownHome");
  if (OWN_VIEW !== "list") history.replaceState(null, "", LIST_URL);   // a collection that isn't there: its list
  const { built, mine } = await collectionsByKind(), lang = uiLang();
  const when = (ms: number) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(ms);
  const exp = (id: string) => `<button class="link" type="button" data-oh-export="${esc(id)}">${esc(t("own.export"))}</button>`;
  $("#ownHomeBuilt").innerHTML = built.map(({ b }) => `<article class="oh-cover" style="--acc:${esc(b.accent ?? "#c9963a")}${b.cover ? `;--cover:${esc(b.cover)}` : ""}">
      <a class="oh-cover-link" href="${b.href ?? collectionUrl(b.id)}">
        <span class="who"><img src="${esc(b.logo ?? APP_LOGO)}" alt=""><span><h3>${esc(b.name)}</h3><p>${esc(nameIn(b.text, lang))}</p></span></span>
        ${b.preview ? `<img class="strip" src="${esc(b.preview)}" alt="">` : ""}
        <span class="go"><span class="forge">${esc(t("own.open"))}</span>${esc(nameIn(b.facts, lang) || t("own.homeCount", { n: b.tokens, when: "" }))}</span>
      </a>
      ${b.ccc ? `<img class="oh-ccc" src="/ccc-sleeve.png" alt="Community Created Content" width="172" height="68">` : ""}
      ${b.mark ? `<img class="oh-ccc oh-mark${b.mark.invert ? " invert" : ""}" src="${esc(b.mark.src)}" alt="${esc(b.mark.alt)}">` : ""}
    </article>`).join("");
  $("#ownHomeBuiltH").hidden = !built.length;
  $("#ownHomeList").innerHTML = mine.map((c: CollectionEntry) => `<article class="oh-tile" style="--acc:${esc(c.accent ?? "#c9963a")}">
      <a class="oh-tile-link" href="${collectionUrl(c.id)}"><img src="${esc(c.logo || APP_LOGO_SMALL)}" alt=""><span><b>${esc(c.name)}</b><small>${esc(t("own.homeCount", { n: c.tokens, when: when(c.updated) }))}</small></span></a>
      <span class="oh-actions">${exp(c.id)}<button class="link danger" type="button" data-oh-delete="${esc(c.id)}">${esc(t("own.homeDelete"))}</button></span>
    </article>`).join("")
    || `<p class="oh-empty">${esc(t("own.mineEmpty"))}</p>`;
}
function wireOwnHome() {
  const note = (k: string, v = {}) => { for (const el of $$("[data-own-note]")) el.textContent = t(k, v); };
  for (const b of $$("[data-own-new]")) b.onclick = () => { const id = addCollection(starterCollection()); if (id) location.href = collectionUrl(id); else note("own.storageFull"); };
  $("#ownHomeImport").onclick = () => $("#ownHomeFile").click();
  $<HTMLInputElement>("#ownHomeFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    try {
      const c = await readCollectionFile(JSON.parse(await f.text()), (i, n) => note("own.importing", { i, n }));
      const id = addCollection(c);
      if (id) location.href = collectionUrl(id); else note("own.storageFull");
    } catch { note("own.importFailed"); }
  };
  $("#ownHome").onclick = (e) => {
    const ex = hit(e, "[data-oh-export]"), del = hit(e, "[data-oh-delete]"), cp = hit(e, "[data-oh-copy]");
    if (cp) {
      const b = builtIn(cp.dataset.ohCopy!); if (!b) return;
      cp.textContent = t("own.copying"); (cp as HTMLButtonElement).disabled = true;
      void copyBuiltIn(b.id, t("own.copyName", { name: b.name })).then((id) => { if (id) location.href = collectionUrl(id); else { note("own.storageFull"); renderOwnHome(); } });
      return;
    }
    if (ex) { const c = loadCollection(ex.dataset.ohExport!); if (c) saveFile(new Blob([JSON.stringify(collectionFile(c), null, 2)], { type: "application/json" }), `${nameIn(c.name, "en").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "collection"}.json`); }
    if (del) {
      const entry = listCollections().find((x) => x.id === del.dataset.ohDelete);
      if (entry && confirm(t("own.homeDeleteConfirm", { name: entry.name }))) { deleteCollection(entry.id); renderOwnHome(); }
    }
  };
}
if (OWN && !OWN_ID) wireOwnHome();
