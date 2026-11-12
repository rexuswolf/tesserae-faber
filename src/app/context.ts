// Shared app state, page helpers and the keys of what this browser keeps.
import type { ReliefPart, TokenStyle, TokenShape, Team, Role, TokenSpec, Library, TokenOverride, Token } from "../types.ts";
import { DEFAULT_SPEC, normalizeSpec } from "../engine/token-engine.ts";
import { OWN, OWN_ID, MODE, THEME_VARS, rememberCollection, loadCollection, builtIn, APP_LOGO, nameIn, stylesOf, ownStylesOf, knownStylesOf } from "../collection.ts";
import type { Collection, StyleDef } from "../collection.ts";
import type { AppUser } from "../ports.ts";
import { uiLang, t } from "../i18n.ts";
import { writeJSON, session, readJSON } from "../services.ts";
import type { ViewKind, Viewer } from "../engine/viewer.ts";
import { FILAMENT_SLOTS } from "../bambu/plates.ts";
import type { GateConfig } from "./boot.ts";
import { BOTC_STYLES } from "../botc-styles.ts";

/** The face parts that can be raised, in the order a back that matches the front lists them. */
export const RELIEF_PARTS: ReliefPart[] = ["text", "frame", "icon"];
/** Each layout's name size (mm): the arcs' run along the edge, the window's has the lower half. */
export const LAYOUT_TEXT: Record<TokenStyle, number> = { classic: DEFAULT_SPEC.textSize, window: 6, solo: DEFAULT_SPEC.textSize, double: DEFAULT_SPEC.textSize , text: DEFAULT_SPEC.textSize};

/** The first element matching `s`: the app's own markup, so it's there. */
export const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector(s) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => [...el.querySelectorAll<T>(s)];
/** The element matching `sel` that an event happened in, if any. */
export const hit = (e: Event, sel: string) => (e.target as Element).closest<HTMLElement>(sel);
/** The input (or textarea) an event happened on. */
export const input = (e: Event) => e.target as HTMLInputElement;
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
export const fold = (s: string) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
/** A spec seen as fields by name: a collection's style and the reset buttons set them one by one. */
export type Fields = Record<string, unknown>;

/** The sliders: each field's decimals and unit. */
export type RangeKey = "diameter" | "height" | "depth" | "reliefHeight" | "reliefBevel" | "iconScale" | "textSize" | "spacing" | "maxArc" | "frameWidth" | "frameInset" | "cardIconSize" | "pieceMargin";
export const RANGES: Record<RangeKey, [number, string]> = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], reliefHeight: [1, " mm"], reliefBevel: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"], frameInset: [1, " mm"], cardIconSize: [0, " mm"], pieceMargin: [1, " mm"] };
export const MAX_SVG = 300000;
// The source code. Its links (sidebar footer and credits) stay hidden while the repository
// is private, so nobody lands on GitHub's 404: set REPO_PUBLIC to true once it is published.
export const REPO_URL = "https://github.com/rexuswolf/tesserae-faber";
export const REPO_PUBLIC = true;
export const QUEUE_KEY = "midnight-mint-queue";   // the old print queue, read once to carry it over
// Tesserae Faber keeps each collection's own queue, style and designs, apart from Clocktower's.
const KEYS = OWN ? `midnight-mint-own-${OWN_ID ?? "none"}-` : "midnight-mint-";   // each collection its own
export const PICK_KEY = `${KEYS}picks`;
// Your designs, one library for every collection (and Clocktower); this collection's default design
// per shape, where it isn't its own; and what each token has of its own (its text, icon, design and
// changes to it). See loadDesigns.
export const MY_DESIGNS_KEY = "tesserae-styles";
export const DEFAULTS_KEY = `${KEYS}design-defaults`;
export const OVERRIDES2_KEY = `${KEYS}design-tokens`;
// Before designs were yours: each collection's styles and its tokens' own (49eeec0). Before styles:
// the set's design per type (the coin's under the key the single design had), each token's own
// whole design, and the designs saved in this browser. Read once, to make the designs.
export const STYLES_KEY = `${KEYS}styles`;
export const TOKENS_KEY = `${KEYS}tokens`;
const STYLE_KEY = `${KEYS}style`;
export const STYLE_KEYS: Record<TokenShape, string> = { coin: STYLE_KEY, ring: `${KEYS}style-ring`, card: `${KEYS}style-card`, base: `${KEYS}style-base`, piece: `${KEYS}style-piece` };
export const OVERRIDES_KEY = `${KEYS}overrides`;
export const DESIGNS_KEY = `${KEYS}designs`;
export const TOKEN_LANG_KEY = "midnight-mint-token-lang";
export const VIEW_KEY = `${KEYS}view`;   // the sheet you were on (all, an edition or a script) and its team filter
export const EDITION_ORDER = ["tb", "bmr", "snv", "carousel", "fabled", "loric", "grimoire"];
document.documentElement.dataset.mode = MODE;   // the generic creator's own colours (style.css)
if (!OWN) { document.title = "Blood on the Clocktower · Tesserae Faber"; rememberCollection("botc"); }   // and it's where the front page's "carry on" leads   // Clocktower keeps its name (the page's own title is Tesserae Faber's)
export const TEAM_ORDER: Team[] = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric", "info"];
export const TEAM_PLURAL: Record<string, Record<string, string>> = {
  es: { townsfolk: "Aldeanos", outsider: "Forasteros", minion: "Esbirros", demon: "Demonios", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos", info: "Tarjetas de información" },
  en: { townsfolk: "Townsfolk", outsider: "Outsiders", minion: "Minions", demon: "Demons", traveller: "Travellers", fabled: "Fabled", loric: "Loric", info: "Info cards" },
};
export const PLATE_GROUP: Record<Team, string> = { townsfolk: "good", outsider: "good", minion: "evil", demon: "evil", traveller: "traveller", fabled: "fabled", loric: "loric", info: "info" };
export const PLATE_LABEL: Record<string, Record<string, string>> = {
  es: { good: "Aldeanos y forasteros", evil: "Esbirros y demonios", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos", info: "Tarjetas de información" },
  en: { good: "Townsfolk & outsiders", evil: "Minions & demons", traveller: "Travellers", fabled: "Fabled", loric: "Loric", info: "Info cards" },
};

/** The token the workshop shows: its key, its character and, for a reminder, which one. */
interface Selection { key: string; role: Role; reminder: number | null }
/** A design saved in this browser before styles (one per character): it became a style of its type. */
export interface SavedDesign { id: string; roleId: string; text: string | null; fem: boolean; spec: TokenSpec; title: string; updatedAt: number; shape?: TokenShape }
/** The workshop's tabs: level 1, the token's parts ("body" is the coin, ring or card itself); level 2, a face's. */
export type Part = "token" | "front" | "colours" | "back" | "body" | "relief" | "magnet";
export type FaceTab = "layout" | "text" | "icon" | "frame" | "pattern";
export type Side = "front" | "back";

export const state: {
  user: AppUser | null; lib: Library | null;
  edition: string; team: string; sel: Selection | null;
  /** The open part of each type, and the open tab of each face. */
  part: Record<TokenShape, Part>; faceTab: Record<Side, FaceTab>;
  /** A part asked to be raised while the other face has raised parts: the question is shown. */
  /** The 3D view's side ("back" shows the strip's coins from behind too). */
  view: string;
  /** What each token has of its own (see loadDesigns). */
  overrides: Map<string, TokenOverride>;
  /** A line under the design for a moment: what just happened to it ("Back to its default"). */
  flash: string;
  /** The token of yours open in the designer (its fields there). */
  editing: string | null;
  /** A closed collection's token: what it says is open in the design step. */
  saysOpen: boolean;
  step: number; pick: Map<string, number>;
  /** The characters the sheet shows, and the token the workshop built. */
  shown?: Role[]; token?: Token;
} = {
  user: null, lib: null,
  edition: "all", team: "all",   // the sheet opens on every character
  sel: null,              // { key, role, reminder: index | null }
  part: { coin: "front", ring: "front", card: "front", base: "front", piece: "front" }, faceTab: { front: "layout", back: "layout" },   // the first tab: Layout (Text where a shape has no layouts)
  view: "angle",
  overrides: new Map(),   // read by loadDesigns once the tokens are known
  flash: "",
  editing: null, saysOpen: false,
  step: 1,
  pick: new Map(),         // token key ("c:imp", "r:imp:0") -> copies
};
/** The collection this page shows (Tesserae Faber); empty, and unused, in Clocktower. */
export let coll: Collection = (OWN && loadCollection()) || { name: "", groups: [], tokens: [], catalogs: [] };
/** Another collection to show (a built-in one read from its file; the Taller's from where it was opened). */
export const setColl = (c: Collection) => { coll = c; };
/** The collection open is one of the app's own (Clocktower at /botc, or one at /c/<id>): read-only, with "Make a copy" instead. */
export const BUILT = OWN ? (OWN_ID ? builtIn(OWN_ID) : undefined) : builtIn("botc");
export const READONLY = OWN && !!BUILT;
if (BUILT?.file) document.documentElement.dataset.builtin = BUILT.id;   // its menu offers a copy (Clocktower has no file to copy: its library is private)
if (READONLY) document.documentElement.dataset.readonly = "";   // no editing (Clocktower at /botc keeps its scripts)
// its name, logo, colours and loading line from the start: the loading screen shows them while its file is read
if (READONLY && BUILT) coll = { ...coll, name: BUILT.name, ...(BUILT.theme ? { theme: BUILT.theme } : {}), ...(BUILT.logo ? { brand: { logo: BUILT.logo } } : {}), ...(BUILT.loader ? { loader: BUILT.loader } : {}) };
/**
 * The loading screen as this collection wears it (colours, logo, name, line), kept for the next
 * visit: index.html shows it before the app's code has even loaded (it can take a moment, fetched
 * fresh from the network), instead of a screen that knows nothing of the collection.
 */
export function keepGateLook() {
  try {
    const root = document.documentElement, vars: Record<string, string> = {};
    for (const k of THEME_VARS) { const v = root.style.getPropertyValue(k); if (v) vars[k] = v; }
    const logo = coll.brand?.logo && coll.brand.logo.length < 30000 ? coll.brand.logo : APP_LOGO;   // a big uploaded logo isn't worth keeping twice
    const lang = uiLang();
    writeJSON(`midnight-mint-gate:${location.pathname}`, {
      theme: root.dataset.theme ?? "", vars, logo,
      name: nameIn(coll.name, lang),
      title: coll.loader?.text ? nameIn(coll.loader.text, lang) : t("gate.opening"),
      footer: coll.loader?.footer ? nameIn(coll.loader.footer, lang) : "",
    });
  } catch { /* storage unavailable or full: the next visit shows the plain screen */ }
}

/** A notice at the top of the page (not the Undo toast's), one per kind, that stays until it's
 *  replaced or cleared (message null): a new version to reload into, a collection that doesn't fit. */
export function stickyNotice(kind: string, message: string | null, action?: { label: string; run: () => void }) {
  let el = document.querySelector<HTMLElement>(`.update-toast[data-kind="${kind}"]`);
  if (!message) { el?.remove(); return; }
  if (!el) { el = document.createElement("div"); el.className = "toast update-toast"; el.dataset.kind = kind; el.setAttribute("role", "status"); document.body.append(el); }
  const msg = document.createElement("span"); msg.textContent = message;
  el.replaceChildren(msg);
  if (action) { const b = document.createElement("button"); b.type = "button"; b.textContent = action.label; b.onclick = action.run; el.append(b); }
}
// After a deploy, a page opened earlier may ask for code files that no longer
// exist (their names change with each version). Reload once to get the new ones.
//
// The service worker (vite.config.js) keeps the app's files. When a new version takes over, the page
// reloads into it at once, unless something you're making lives only in this page (a token not yet
// created, a design in the Taller): then it offers to reload, at the bottom of the page.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const hadOne = !!navigator.serviceWorker.controller;   // the first install brings nothing new
  const reg = navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  // a phone keeps the tab alive for days: look for a new version whenever the app comes back to the front
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.then((r) => r?.update().catch(() => {})); });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadOne) return;
    if ($("#app").dataset.step !== "taller") { location.reload(); return; }
    stickyNotice("update", t("app.updated"), { label: t("app.reload"), run: () => location.reload() });
  });
}
$("#buildTag").textContent = `v ${__BUILD__}`;
window.addEventListener("vite:preloadError", (e) => {
  if (session.get("mm-reloaded")) return;   // don't loop if it really is broken
  e.preventDefault();
  session.set("mm-reloaded", "1");
  location.reload();
});
setTimeout(() => session.remove("mm-reloaded"), 10000);

// The 3D preview loads on its own (WebGL and camera controls), so the sheet doesn't wait for
// it. Until it's ready, calls are remembered and replayed: the latest token, view and X-ray.
/** The calls the app makes to the preview, with their arguments. */
type ViewerCalls = { setToken: [Token]; setXray: [boolean]; setView: [ViewKind]; setGrid: [boolean]; setDie: [boolean] };
let viewer: Viewer | null = null;
const viewerWaiting: { [M in keyof ViewerCalls]?: ViewerCalls[M] } = {};
export const view3d = <M extends keyof ViewerCalls>(method: M, ...args: ViewerCalls[M]) => {
  if (viewer) (viewer[method] as (...a: ViewerCalls[M]) => void)(...args); else viewerWaiting[method] = args;
};
// It starts the first time the design step shows it (WebGL takes a moment the token list shouldn't
// wait for); its code is fetched earlier, when the page has nothing else to do (prefetchViewer).
let viewerAsked = false;
const viewerModule = () => import("../engine/viewer.ts");
export function prefetchViewer() {
  const go = () => void viewerModule().catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 5000 }); else setTimeout(go, 2000);
}
export function loadViewer() {
  if (viewerAsked) return;
  viewerAsked = true;
  viewerModule().then(({ createViewer }) => {
    viewer = createViewer($<HTMLCanvasElement>("#view"));
    view3d("setView", "angle");
    for (const m of ["setGrid", "setDie", "setToken", "setXray", "setView"] as const) if (viewerWaiting[m]) (viewer[m] as (...a: unknown[]) => void)(...viewerWaiting[m]);
  }).catch((err) => { viewerAsked = false; console.error("3D preview failed to load", err); });
}

/** The mark each ring separator pill shows before its name. */
export const SEPARATOR_MARKS: Record<string, string> = { dot: "• ", diamond: "◆ ", star: "★ ", none: "" };
/** The colours offered at once (filaments, all print on the A1): black, white, the basic colours, gold and silver. Any other, with the picker (it prints in the nearest filament). */
export const COLOUR_CHOICES = ["Black", "White", "Red", "Blue", "Green", "Gold", "Silver"]
  .map((name) => ({ id: name.toLowerCase(), hex: FILAMENT_SLOTS.find((f) => f.name === name)!.hex }));
export let gateState: (() => GateConfig) | null = null;
export const setGateState = (make: (() => GateConfig) | null) => { gateState = make; };

/**
 * The designs the collection comes with, per shape (its styles, in its file): read-only, the first
 * of a shape the one its tokens use unless you choose another. Clocktower's are its own; a
 * collection's come in its file, else Basic. What "c:<id>" means (hidden ones too); the ones it
 * offers as its own are collDesigns, the app's (appDesigns) are offered after them in every one.
 */
export const startingStyles = (shape: TokenShape): StyleDef[] => (OWN ? stylesOf(coll, shape) : BOTC_STYLES[shape]);
export const collDesigns = (shape: TokenShape): StyleDef[] => ownStylesOf({ styles: OWN ? coll.styles : BOTC_STYLES }, shape);
/** Every style "c:<id>" can be here: the collection's, then the app's under the ids it hasn't (the ones that were collections' once). */
export const knownStyles = (shape: TokenShape): StyleDef[] => knownStylesOf({ styles: OWN ? coll.styles : BOTC_STYLES }, shape);
/**
 * One of them by id. The templates every collection was offered before were Clocktower's styles,
 * under the same ids (now its own and the app's): a style named after one keeps that one's name.
 */
export const startingStyle = (shape: TokenShape, id: string | undefined): StyleDef | undefined =>
  id == null ? undefined : knownStyles(shape).find((d) => d.id === id) ?? BOTC_STYLES[shape].find((d) => d.id === id);
export const defName = (d: StyleDef) => nameIn(d.name, uiLang());
/** Comparing an old spec with a collection's style leaves these alone: the magnet is chosen in its own tab, a ring's base is the miniatures'. */
export const STYLE_KEEPS = new Set(["lang", "customSvg", "magnet", "magnetSize", "ringBase"]);
/** A collection's style as a whole spec (what it leaves out, the default's), named after it. */
export const defSpec = (d: StyleDef): TokenSpec => {
  const spec = structuredClone(d.spec);
  return { ...structuredClone(DEFAULT_SPEC), ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, preset: d.id } as TokenSpec;
};

/**
 * The set's design per type, as kept before styles. The coin's is the one the set had before designs
 * were kept per type; a ring's and a card's, when none was kept, a copy of it (what they printed
 * from, as their shape prints it).
 */
export function legacySpecs(): Record<TokenShape, TokenSpec> {
  // without one kept, the collection's first coin style (what the set's design was by default: Edition)
  const coin = upgradeSpec(loadJSON<TokenSpec | null>(STYLE_KEY, null)) || defSpec(startingStyles("coin")[0]);
  const specs = { coin } as Record<TokenShape, TokenSpec>;
  for (const shape of ["ring", "card", "base", "piece"] as const) specs[shape] = upgradeSpec(loadJSON<TokenSpec | null>(STYLE_KEYS[shape], null)) ?? structuredClone(coin);
  return specs;
}
export const loadJSON = <T>(key: string, fallback: T): T => readJSON(key, fallback);
export const storeJSON = (key: string, value: unknown): boolean => writeJSON(key, value);
/** A saved design as the app now has it: an old window's "relief" finish becomes its icon raised. */
export function upgradeSpec<T extends TokenSpec | null | undefined>(spec: T): T {   // a declaration: the state above uses it before this line runs
  return (spec && typeof spec === "object" ? normalizeSpec(spec) : spec) as T;
}
