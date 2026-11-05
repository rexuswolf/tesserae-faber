import {
  loadLibrary, buildToken, geometryVolume, magnetLayout, MAGNET_SIZES, tokenSvg, roleName, saveFile, reminderSpec, layoutName, nameLetterHeight, SMALL_LETTERS_MM,
  TEAMS, EDITIONS, FRAME_STYLES, BACK_STYLES, TOKEN_STYLES, FILAMENTS, DEFAULT_SPEC, CARD, isCard,
  normalizeSpec, reliefOf, hasRelief, reliefTop,
} from "./engine/token-engine.ts";
/** The face parts that can be raised, in the order the Layout section lists them. */
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
import { t, uiLang, setUiLang, LANGUAGES } from "./i18n.ts";
import { TRANSLATIONS, VILLACUERVOS_URL, translationById, translationGroups } from "./translations.ts";
import { uiIcon, UI_ICONS, TEAM_ICONS } from "./ui-icons.ts";
import { OWN, OWN_ID, collectionUrl, listCollections, addCollection, deleteCollection, starterCollection, MODE, loadCollection, storeCollection, collectionRoles, collectionFile, readCollectionFile, readTokenList, GROUP_COLOURS, newId, nameIn, withName, catalogsOf, isLocked, THEMES, THEME_FONTS, okLogo } from "./collection.ts";
import type { Collection, OwnToken, OwnCatalog, OwnSection, OwnTheme } from "./collection.ts";
import { loadScripts, storeScripts, saveScript, scriptLink, readLink, scriptJson, idKey as scriptKey } from "./scripts.ts";
import type { HomebrewEntry, NewScript, Script, ScriptJsonEntry } from "./scripts.ts";
import type { Translation } from "./translations.ts";
import type { InlayPart } from "./colour-checks.ts";
import type { PaperSize, SheetSlot } from "./pdf/layout.ts";
import type { Viewer, ViewKind } from "./engine/viewer.ts";
import type { User } from "firebase/auth";
import type {
  ColourRef, Hex, Library, MagnetLayout, PartName, PlanToken, PlateItem, PlatePlan, QueueEntry, ReliefPart, Role, SpecColours,
  SpecInput, Team, Token, TokenIcon, TokenOverride, TokenSpec, TokenStyle, Volumes,
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
/** A spec seen as fields by name: the templates and the reset buttons set them one by one. */
type Fields = Record<string, unknown>;

/** The sliders: each field's decimals and unit. */
type RangeKey = "diameter" | "height" | "depth" | "reliefHeight" | "iconScale" | "textSize" | "spacing" | "maxArc" | "frameWidth";
const RANGES: Record<RangeKey, [number, string]> = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], reliefHeight: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"] };
const MAX_SVG = 300000;
// The source code. Its links (sidebar footer and credits) stay hidden while the repository
// is private, so nobody lands on GitHub's 404: set REPO_PUBLIC to true once it is published.
const REPO_URL = "https://github.com/rexuswolf/midnight-mint";
const REPO_PUBLIC = false;
const QUEUE_KEY = "midnight-mint-queue";   // the old print queue, read once to carry it over
// The generic creator (/crear) keeps its own queue, style and designs, apart from Clocktower's.
const KEYS = OWN ? `midnight-mint-own-${OWN_ID ?? "none"}-` : "midnight-mint-";   // each collection its own
const PICK_KEY = `${KEYS}picks`;
const STYLE_KEY = `${KEYS}style`;
const OVERRIDES_KEY = `${KEYS}overrides`;
const DESIGNS_KEY = `${KEYS}designs`;
const TOKEN_LANG_KEY = "midnight-mint-token-lang";
const VIEW_KEY = `${KEYS}view`;   // the sheet you were on (all, an edition or a script) and its team filter
const EDITION_ORDER = ["tb", "bmr", "snv", "carousel", "fabled", "loric", "grimoire"];
document.documentElement.dataset.mode = MODE;   // the generic creator's own colours (style.css)
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
/** A design saved in this browser (one per character). */
interface Design { id: string; roleId: string; text: string | null; fem: boolean; spec: TokenSpec; title: string; updatedAt: number }

const state: {
  user: User | null; lib: Library | null;
  edition: string; team: string; sel: Selection | null; tab: string; section: string; lastSection: string;
  spec: TokenSpec; overrides: Map<string, TokenOverride>; step: number; pick: Map<string, number>; designs: Design[];
  /** The characters the sheet shows, and the token the workshop built. */
  shown?: Role[]; token?: Token;
} = {
  user: null, lib: null,
  edition: "all", team: "all",   // the sheet opens on every character
  sel: null,              // { key, role, reminder: index | null }
  tab: "set",   // what the controls edit: "set" or "token"
  section: "presets",   // what the panel shows; "presets" is the templates, open under their line
  lastSection: "text",
  // Default set style: "Edición" (black coin, team colour, thin team rim, the edition's name in
  // gold on the back), the first of PRESETS.
  spec: upgradeSpec(loadJSON<TokenSpec | null>(STYLE_KEY, null)) || {
    ...structuredClone(DEFAULT_SPEC), preset: "edicion", style: "classic", frame: "rim", frameWidth: 0.8, back: "edition", depth: 0.4,
    colours: { ...DEFAULT_SPEC.colours, base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold },
  },
  // key -> { text?, spec?, icon? }; game-icons placed before they sat with the library's are moved there
  overrides: new Map(Object.entries(loadJSON<Record<string, TokenOverride>>(OVERRIDES_KEY, {})).map(([k, v]): [string, TokenOverride] => [k, v && { ...v, ...(v.icon ? { icon: placeGameIcon(v.icon) } : {}), ...(v.spec ? { spec: upgradeSpec(v.spec) } : {}) }])),
  step: 1,
  pick: new Map(),         // token key ("c:imp", "r:imp:0") -> copies
  designs: [],
};
/** The generic creator's collection (/crear); empty, and unused, in Clocktower. */
let coll: Collection = (OWN && loadCollection()) || { name: "", types: [], groups: [], tokens: [], sections: [] };
if (OWN && OWN_ID) { applyOwnTheme(); applyOwnBrand(); }   // before the loading screen shows: it wears the collection's colours and mark too

// After a deploy, a page opened earlier may ask for code files that no longer
// exist (their names change with each version). Reload once to get the new ones.
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

/** Filament colours offered for the coin, frame and back (all of them print on the A1). */
const COLOUR_CHOICES = ["Black", "White", "Gold", "Silver", "Bronze", "Blue", "Red", "Purple", "Yellow", "Green"]
  .map((name) => ({ id: name.toLowerCase(), hex: FILAMENT_SLOTS.find((f) => f.name === name)!.hex }));
let gateState: (() => GateConfig) | null = null;

/** A template: the spec it sets (anything left out takes DEFAULT_SPEC's). */
interface Preset { id: string; spec: Partial<TokenSpec> }
/** Premade designs. Applying one replaces the style being edited (set or token), all but its
 *  magnet, which is a choice of its own. Every design keeps the frame in the team colour, like
 *  the name, so a token's side reads the same whatever the design. */
const PRESETS: Preset[] = [
  // The default: the edition's name (a homebrew's script) in gold on the back; gold on a dark
  // coin needs two layers (0.4 mm) to cover it.
  { id: "edicion", spec: { style: "classic", frame: "rim", frameWidth: 0.8, back: "edition", depth: 0.4,
    colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  // The thinnest token that holds up: one layer of colour on 1 mm of black (opaque, stiff at
  // 45 mm), no back. 1.2 mm is also the thickness slider's floor.
  { id: "rapida", spec: { style: "classic", height: 1.2, frame: "rim", frameWidth: 0.8, back: "none", depth: 0.2,
    colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  { id: "noche", spec: { style: "classic", frame: "fases", frameWidth: 0.8, back: "eclipse", depth: 0.4,
    colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  // The gold midnight clock on the back is light on a dark coin: 0.4 mm covers it.
  { id: "medianoche", spec: { style: "classic", frame: "firmamento", frameWidth: 0.8, back: "medianoche", depth: 0.4,
    colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  { id: "marfil", spec: { style: "classic", frame: "rim", frameWidth: 1.0, back: "guilloche", depth: 0.4,
    colours: { base: FILAMENTS.white, front: "team", frame: "team", back: FILAMENTS.bronze } } },
  { id: "legible", spec: { style: "window", textSize: 6, frame: "none", back: "none", depth: 0.4,
    colours: { base: FILAMENTS.white, front: "team", frame: "team", back: FILAMENTS.gold } } },
];
/** Applying a design leaves these alone: the magnet is chosen in its own section. */
const PRESET_KEEPS = new Set(["lang", "customSvg", "magnet", "magnetSize"]);
const presetSpec = (p: Preset): TokenSpec => ({ ...structuredClone(DEFAULT_SPEC), ...structuredClone(p.spec) });

function loadJSON<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) as string) ?? fallback; } catch { return fallback; } }
function storeJSON(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
/** A saved design as the app now has it: an old window's "relief" finish becomes its icon raised. */
function upgradeSpec<T extends TokenSpec | null | undefined>(spec: T): T {   // a declaration: the state above uses it before this line runs
  return (spec && typeof spec === "object" ? normalizeSpec(spec) : spec) as T;
}

// ------------------------------------------------------------ tokens: keys, text, style

const charKey = (role: Role) => `c:${role.id}`;
const remKey = (role: Role, i: number) => `r:${role.id}:${i}`;
/** Characters by team, then alphabetically by the name the token shows. */
// The token language is a translation id ("es-bumble3ee"); collation needs its language ("es").
const collators = new Map<string, Intl.Collator>();
const collator = (lang = translationById(tokenLang()).lang) => collators.get(lang) ?? collators.set(lang, new Intl.Collator(lang, { sensitivity: "base" })).get(lang)!;
const byName = (a: Role, b: Role) => collator().compare(textFor(charKey(a), a, null), textFor(charKey(b), b, null));
const byTeamName = (a: Role, b: Role) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || byName(a, b);
/** Token keys in sheet order: team, name, the character before its reminders. */
const sortKeys = (keys: Iterable<string>) => [...keys].sort((a, b) => byTeamName(tokenRole(a), tokenRole(b)) || (tokenRem(a) ?? -1) - (tokenRem(b) ?? -1));
const remindersOf = (role: Role, lang = tokenLang()): string[] => role.reminders?.[lang] || role.reminders?.en || [];
/** The character's name in the token language, in its feminine form when the token asks for it. */
const charName = (role: Role, key = charKey(role), lang = tokenLang()) =>
  (state.overrides.get(key)?.fem && role.fem?.[lang]) || roleName(role, lang);

/** The style a token uses: its own, or the set's; reminders get the reminder layout. */
/** A character's own icon (on its token; its reminders share it), or undefined. */
const ownIcon = (roleId: string) => state.overrides.get(`c:${roleId}`)?.icon;
const roleIdOf = (key: string) => key.split(":")[1];
function specFor(key: string, isReminder: boolean): TokenSpec {
  const base = state.overrides.get(key)?.spec ?? state.spec;
  const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours }, lang: tokenLang(), icon: ownIcon(roleIdOf(key)) };
  return isReminder ? reminderSpec(spec) : spec;
}
/**
 * A token as the catalog has it, for step 1 (Pick): the default design with the character's
 * own name and icon. The set's design and a token's own changes show in the queue and step 2.
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

/** Language menus (sidebar and gate): the current flag, opening a list of every language. */
function renderLangMenus() {
  const cur = LANGUAGES.find((l) => l.code === uiLang()) ?? LANGUAGES[0];
  for (const menu of $$("[data-lang-menu]")) {
    menu.innerHTML = `<summary aria-label="${esc(t("lang.group"))}: ${esc(cur.name)}" title="${esc(t("lang.group"))}">
      <img src="${cur.flag}" alt="" width="22" height="22"><span>${cur.code.toUpperCase()}</span>${CHEVRON}</summary>
      <ul class="lang-list" aria-label="${esc(t("lang.group"))}">${LANGUAGES.map((l) => `<li><button type="button" data-lang="${l.code}" lang="${l.code}" aria-current="${l.code === cur.code}">
        <img src="${l.flag}" alt="" width="22" height="22"><span>${esc(l.name)}</span>${l.code === cur.code ? CHECK : ""}</button></li>`).join("")}</ul>`;
  }
  // the sidebar's flag: a button that opens the languages in a dialog
  const btn = $("#uiLangBtn");
  if (btn) {
    btn.innerHTML = `<img src="${cur.flag}" alt="" width="26" height="26">`;
    btn.setAttribute("aria-label", `${t("lang.group")}: ${cur.name}`); btn.title = `${t("lang.group")}: ${cur.name}`;
    $("#uiLangList").innerHTML = LANGUAGES.map((l) => `<li><button type="button" data-ui-lang="${l.code}" lang="${l.code}" aria-current="${l.code === cur.code}">
      <img src="${l.flag}" alt="" width="28" height="28"><span>${esc(l.name)}</span>${l.code === cur.code ? CHECK : ""}</button></li>`).join("");
  }
}
function setLang(lang: string) {
  setUiLang(lang);
  renderLangMenus();
  renderTokenLang();
  if (state.lib) { buildChoices(); renderAll(); renderQueue(); renderDesigns(); if ($<HTMLDialogElement>("#scriptInvite").open) renderInvite(); }
  else if (gateState) gate(gateState());
}
document.addEventListener("click", (e) => {
  if (hit(e, "#uiLangBtn")) { drawer(false); $<HTMLDialogElement>("#uiLang").showModal(); $("#uiLangList [aria-current=true]")?.focus(); return; }
  const ui = hit(e, "[data-ui-lang]");
  if (ui) { $<HTMLDialogElement>("#uiLang").close(); setLang(ui.dataset.uiLang!); $("#uiLangBtn").focus(); return; }
  const pick = hit(e, "[data-lang-menu] [data-lang]");
  if (pick) { pick.closest("details")!.open = false; setLang(pick.dataset.lang!); return; }
  // Clicking anywhere else closes an open language menu.
  for (const m of $$<HTMLDetailsElement>("[data-lang-menu][open]")) if (!m.contains(e.target as Node)) m.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const m of $$<HTMLDetailsElement>("[data-lang-menu][open]")) { m.open = false; m.querySelector("summary")!.focus(); }
});
setLang(uiLang());

// ------------------------------------------------------------ token language

// The language printed on the tokens, apart from the interface language. Until one is
// picked it follows the interface (Spanish → Rovortox's translation, English → English).
function tokenLang(): string {
  let saved: string | null = null;
  try { saved = localStorage.getItem(TOKEN_LANG_KEY); } catch { /* no storage */ }
  return TRANSLATIONS.some((x) => x.id === saved) ? saved as string : uiLang() === "en" ? "en" : "es";
}
/** The menu label for a translation: "Español · Rovortox" when its language has several. */
function isGrouped(x: Translation) { return translationGroups().find((g) => g.name === x.name)!.items.length > 1; }
function tlName(x: Translation) { return x.version ? `${x.name} · ${x.version}` : x.name; }
function tlCredit(x: Translation) { return x.pack ? (x.by ? t("tlang.by", { by: x.by }) : t("tlang.community")) : t("tlang.official"); }

/** The header button: the flag and name of the language the tokens are printed in. */
function renderTokenLang() {
  const cur = translationById(tokenLang());
  const btn = $("#tokenLangBtn");
  btn.innerHTML = `<img src="${cur.flag}" alt="" width="30" height="30"><span><small>${esc(t("tlang.label"))}</small><b>${esc(tlName(cur))}</b></span>${CHEVRON}`;
  btn.setAttribute("aria-label", t("tlang.open", { name: tlName(cur) }));
}
function setTokenLang(id: string) {
  try { localStorage.setItem(TOKEN_LANG_KEY, id); } catch { /* no storage */ }
  renderTokenLang();
  if (state.lib) { renderAll(); renderQueue(); if ($<HTMLDialogElement>("#scriptInvite").open) renderInvite(); }
}

// The dialog: languages on the left (one with several versions folds open), and on the
// right the selected character, its reminders and a few of the characters on screen,
// drawn in the set's style in whichever language is picked or pointed at.
const tl = { pick: null as string | null, open: new Set<string>() };
function openTokenLang() {
  tl.pick = tokenLang();
  tl.open = new Set([translationById(tl.pick).name]);
  drawTokenLang();
  $<HTMLDialogElement>("#tlangDialog").showModal();
  const sel = $("#tlangList [aria-selected=true]");
  sel?.scrollIntoView({ block: "nearest" }); sel?.focus();
}
function drawTokenLang() {
  const item = (x: Translation, label: string | undefined, sub: string) => `<button class="tl-item" type="button" role="option" aria-selected="${x.id === tl.pick}" data-id="${x.id}">
    ${isGrouped(x) ? "" : `<img src="${x.flag}" alt="">`}<b>${esc(label)}</b><small>${esc(sub)}</small>${x.id === tl.pick ? '<i class="dot"></i>' : ""}</button>`;
  $("#tlangList").innerHTML = translationGroups().map((g) => {
    if (g.items.length === 1) return item(g.items[0], g.name, tlCredit(g.items[0]));
    const open = tl.open.has(g.name), here = g.items.find((x) => x.id === tl.pick);
    return `<div class="tl-group" data-current="${!!here}">
      <button class="tl-item" type="button" aria-expanded="${open}" data-group="${esc(g.name)}"><img src="${g.flag}" alt="">
        <b>${esc(g.name)}</b><small>${esc(t("tlang.versions", { n: g.items.length }))}${here ? ` · ${esc(here.version)}` : ""}</small>${CHEVRON}</button>
      ${open ? `<div class="tl-versions" role="group" aria-label="${esc(g.name)}">${g.items.map((x) => item(x, x.version, tlCredit(x))).join("")}</div>` : ""}</div>`;
  }).join("");
  drawTokenLangStage(tl.pick!);
  $("#tlangUse").textContent = t("tlang.use", { name: tlName(translationById(tl.pick)) });
}
function drawTokenLangStage(id: string) {
  if (!state.lib || !state.sel) return;
  const x = translationById(id), hero = state.sel!.role;
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
$("#tokenLangBtn").onclick = openTokenLang;
$("#tlangList").onclick = (e) => {
  const g = hit(e, "[data-group]"), b = hit(e, "[data-id]");
  if (g) { const n = g.dataset.group!; tl.open.has(n) ? tl.open.delete(n) : tl.open.add(n); drawTokenLang(); $(`#tlangList [data-group="${CSS.escape(n)}"]`).focus(); return; }
  if (b) { tl.pick = b.dataset.id!; drawTokenLang(); $(`#tlangList [data-id="${CSS.escape(tl.pick)}"]`).focus(); }
};
// Pointing at a language previews it without choosing; a language group previews its first version.
$("#tlangList").addEventListener("pointerover", (e) => {
  const b = hit(e, "[data-id]"), g = hit(e, "[data-group]");
  if (b) drawTokenLangStage(b.dataset.id!);
  else if (g) { const grp = translationGroups().find((x) => x.name === g.dataset.group)!; drawTokenLangStage((grp.items.find((x) => x.id === tl.pick) ?? grp.items[0]).id); }
});
$("#tlangList").addEventListener("pointerleave", () => drawTokenLangStage(tl.pick!));
$("#tlangList").addEventListener("keydown", (e) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const items = $$("#tlangList .tl-item"), i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
  items[next].focus();
  if (items[next].dataset.id) drawTokenLangStage(items[next].dataset.id);
});
$("#tlangCancel").onclick = () => $<HTMLDialogElement>("#tlangDialog").close();
$("#tlangUse").onclick = () => { $<HTMLDialogElement>("#tlangDialog").close(); if (tl.pick !== tokenLang()) setTokenLang(tl.pick!); };
$("#tlangDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });   // backdrop
/** A click outside a dialog's box (on its backdrop) closes it; one on its own margin, inside, doesn't. */
function closeOnBackdrop(dlg: HTMLDialogElement) {
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
}
closeOnBackdrop($<HTMLDialogElement>("#credits"));
closeOnBackdrop($<HTMLDialogElement>("#uiLang"));

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
  showGate(() => ({ title: OWN && coll.loader?.text ? nameIn(coll.loader.text, uiLang()) : t("gate.opening") }));
  if (OWN) {   // the collection's own line under the loading screen, and the community mark only if it asks for it
    $(".gate-card .ccc").hidden = !coll.loader?.ccc && !coll.loader?.footer;
    $(".gate-card .ccc img").hidden = !coll.loader?.ccc;
    if (coll.loader?.footer) $("#gateCcc").textContent = nameIn(coll.loader.footer, uiLang());
  }
  try {
    if (OWN && (!OWN_ID || !coll.tokens.length)) { renderOwnHome(); return; }   // /crear: the list of collections
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
  state.pick = loadPicks();
  persistPicks();
  renderAll();
  goStep(1);
  refreshDesigns();
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
      const nameHit = [r.en, r.es, roleName(r, tokenLang()), r.fem?.[tokenLang()], textFor(charKey(r), r, null)].some((s) => s && fold(s).includes(q));
      if (remHits.length) hits.set(r.id, new Set(remHits));
      return nameHit || remHits.length;
    });
  }

  // Pick everything shown: the characters on screen (edition, team filter, search), with or without reminders.
  state.shown = roles;
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

/** The mark of a token with its own changes, and the way to them. Beside the token's button: a button can't hold buttons. */
function ownPen(key: string, name: string) {
  const label = esc(t("sheet.editOwn", { name }));
  return `<button class="own-pen" type="button" data-edit="${key}" title="${label}" aria-label="${label}">✎</button>`;
}

/**
 * A character in or out of the queue, with its reminders: they come and go with it (each
 * reminder chip still adds or drops itself on its own).
 */
function toggleCharacter(key: string) {
  const role = tokenRole(key);
  if (!role) return;
  const on = !isPicked(key);
  setPick(key, on);
  if (key.startsWith("c:")) remindersOf(role).forEach((_, i) => setPick(remKey(role, i), on));
  picksChanged();
}
function rowHtml(r: Role, q: string, remHits: Set<number> | undefined) {
  const lang = uiLang(), ck = charKey(r);
  // Each token is a toggle: picked tokens light up with a check, and show their copies.
  const thumb = (key: string, reminder: number | null) => {
    const isRem = reminder != null;
    const spec = { ...catalogSpec(isRem), diameter: isRem ? reminderSpec(DEFAULT_SPEC).diameter : 45, back: "none" };
    const own = state.overrides.has(key), copies = state.pick.get(key) || 0;
    const name = catalogText(r, reminder);
    // once picked, a small stepper adds copies; tapping the token still drops it
    // a homebrew token whose icon is still on its way pulses where the icon will go
    const loading = r.loading ? ` loading" style="--team: ${TEAMS[r.team].colour}` : "";
    return `<span class="tok-w"><button class="tok${isCard(r) ? " card" : ""}${loading}" type="button" data-pick="${key}" aria-pressed="${copies > 0}" aria-label="${esc(name)}">${tokenSvg(state.lib!, r, spec, { text: name })}<span class="ck" aria-hidden="true">✓</span></button>${own ? ownPen(key, name) : ""}</span>`;
  };
  const rems = remindersOf(r);
  const other = tokenLang() === "en" ? roleName(r, uiLang() === "en" ? "es" : uiLang()) : r.en;
  // Reminders as chips under the name: identical ones share a chip ("Correct ×5"), which adds or
  // removes all of them; it shows how many are in when only some are.
  const groups = new Map<string, number[]>();
  rems.forEach((_, i) => { const w = catalogText(r, i); groups.set(w, [...(groups.get(w) || []), i]); });
  const remSpec = { ...catalogSpec(true), diameter: reminderSpec(DEFAULT_SPEC).diameter, back: "none" };
  const loadingTok = r.loading ? ` loading" style="--team: ${TEAMS[r.team].colour}` : "";
  const chips = [...groups].map(([w, idx]) => {
    const keys = idx.map((i) => remKey(r, i)), on = keys.filter(isPicked).length, own = keys.find((k) => state.overrides.has(k));
    const count = keys.length > 1 ? `<small>×${keys.length}${on && on < keys.length ? ` · ${on}/${keys.length}` : ""}</small>` : "";
    return `<div class="rem${idx.some((i) => remHits?.has(i)) ? " hit" : ""}" data-on="${on === keys.length ? "all" : on ? "some" : "none"}">
      <button class="rem-chip" type="button" data-pick-rems="${keys.join(" ")}" aria-pressed="${on === keys.length}" aria-label="${esc(keys.length > 1 ? `${w} ×${keys.length}` : w)}"><span class="rem-tok${loadingTok}">${tokenSvg(state.lib!, r, remSpec, { text: w })}</span><span class="rem-w">${esc(w)}</span>${count}<span class="ck" aria-hidden="true">✓</span></button>${own ? ownPen(own, w) : ""}</div>`;
  }).join("");
  return `<div class="row${isCard(r) ? " info" : ""}${rems.length ? "" : " no-rems"}" data-picked="${isPicked(ck)}" data-row="${ck}">
    ${thumb(ck, null)}
    <div class="who" data-pick="${ck}"><b>${esc(catalogText(r, null))}</b>${other !== catalogText(r, null) ? `<small>${esc(other)}</small>` : ""}${OWN ? (ownHome(r) && (q || catalogOf(state.edition) !== ownHomeCatalog(r.id)) ? `<em>${esc(ownHome(r))}</em>` : "") : q || state.edition === "all" || (state.edition.startsWith("s:") && r.kind !== "homebrew") ? `<em>${esc(editionName(r, lang))}</em>` : ""}${r.loading ? `<small>${esc(t("sheet.iconLoading"))}</small>` : ""}${OWN && !isLocked(coll, r.id) ? `<button class="own-edit" type="button" data-own-edit="${esc(r.id)}">${esc(t("own.edit"))}</button>` : ""}</div>
    ${rems.length ? `<div class="rems">${chips}</div>` : ""}
  </div>`;
}

/** The token the workshop shows (step 2). */
function selectToken(key: string | undefined) {
  const role = key && tokenRole(key);
  if (!key || !role) return;
  const was = state.sel?.reminder;
  state.sel = { key, role, reminder: tokenRem(key) };
  if (state.sel!.reminder != null && was == null) { view3d("setView", "top"); syncView("top"); }
}

// ------------------------------------------------------------ workshop

/** The spec the style controls show: the set's, or the selected token's own if it has one. */
function editingSpec(): TokenSpec {
  if (state.tab === "token") return state.overrides.get(state.sel!.key)?.spec ?? state.spec;
  return state.spec;
}
/** The spec a change goes to. In "this token only", the first change gives the token its own copy of the set's. */
function writableSpec(): TokenSpec {
  if (state.tab !== "token") return state.spec;
  const key = state.sel!.key, own = state.overrides.get(key);
  if (own?.spec) return own.spec;
  const spec = structuredClone(state.spec);
  spec.fromPreset = templateOf(state.spec).preset?.id;   // for the template line
  delete spec.preset;   // resets go to the set's values
  state.overrides.set(key, { ...own, spec });
  return spec;
}
/** Whether a spec differs from a template in anything the template sets (the magnet is a choice of its own). */
function differsFrom(p: Preset, spec: TokenSpec) {
  const colours = (c: unknown) => ({ ...DEFAULT_SPEC.colours, ...(c as Partial<SpecColours>) });
  return Object.entries(presetSpec(p)).some(([k, v]) => !PRESET_KEEPS.has(k)
    && JSON.stringify(k === "colours" ? colours(v) : v) !== JSON.stringify(k === "colours" ? colours(spec.colours) : spec[k as keyof TokenSpec] ?? DEFAULT_SPEC[k as keyof TokenSpec]));
}
/** The template a spec started from, or for one saved before this was kept, the template it matches. */
function templateOf(spec: TokenSpec) {
  const id = spec.preset ?? spec.fromPreset;
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => !differsFrom(p, spec));
  return { preset, modified: !!preset && differsFrom(preset, spec) };
}
/** Before a change: a spec that matches a template but never named it keeps which one, or it'd be lost. */
function rememberTemplate(spec: TokenSpec) {
  if (spec.preset || spec.fromPreset) return;
  const { preset } = templateOf(spec);
  if (preset) spec.fromPreset = preset.id;
}
/** The line above the sections: which template, and the way to the others. */
function renderTemplateRow() {
  const open = state.section === "presets", row = $("#tplRow");
  row.setAttribute("aria-expanded", String(open));
  if (open) { row.innerHTML = `<b>${esc(t("tpl.choose"))}</b><em>${esc(t("tpl.done"))}</em>`; return; }
  const { preset, modified } = templateOf(editingSpec());
  row.innerHTML = `<span>${esc(t("tpl.label"))}</span><b>${esc(preset ? t(`preset.${preset.id}`) : t("tpl.none"))}</b>${modified ? `<small>${esc(t("tpl.modified"))}</small>` : ""}<em>${esc(t("tpl.change"))}</em>`;
}
/** Each section turns the 3D view to what it changes. */
const SECTION_VIEW: Record<string, ViewKind> = { presets: "angle", layout: "angle", text: "top", frame: "top", back: "back", coin: "angle", magnet: "back" };
function showSection(section: string) {
  state.section = section;
  if (section !== "presets") state.lastSection = section;
  $("#sections").hidden = section === "presets";
  renderTemplateRow();
  $$(".sections [data-section]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.section === section)));
  $$(".ws-panel").forEach((p) => { p.hidden = p.dataset.panel !== section; });
  $("#styleFields").scrollTop = 0;
}

let raf = 0;
function renderWorkshop() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const { key, role, reminder } = state.sel!;
    const isRem = reminder != null;
    const lang = uiLang();
    const spec = specFor(key, isRem);
    const text = textFor(key, role, reminder);
    const token = buildToken(state.lib!, role, spec, text);
    state.token = token;
    view3d("setToken", token);
    // X-ray only makes sense with a magnet inside.
    $("#xray").hidden = !token.magnet;
    if (!token.magnet && $("#xray").getAttribute("aria-pressed") === "true") { $("#xray").setAttribute("aria-pressed", "false"); view3d("setXray", false); }

    $("#name").textContent = text;
    $("#sub").textContent = [isRem ? textFor(charKey(role), role, null) : null, TEAMS[role.team].label[lang], editionName(role, lang),
      role.en !== text && !isRem ? role.en : null].filter(Boolean).join(" · ");

    // the whole set, or this token only
    $$(".scope [data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === state.tab)));
    const own = state.overrides.get(key);
    $("#tokenOnly").hidden = state.tab !== "token";
    $("#textOnlyHint").hidden = state.tab === "token";
    $<HTMLInputElement>("#printed").value = own?.text ?? "";
    renderIconField();
    $<HTMLInputElement>("#printed").placeholder = isRem ? remindersOf(role)[reminder!] : charName(role, key);
    const femName = !isRem && role.fem?.[tokenLang()];
    $("#femRow").hidden = !femName;
    if (femName) { $<HTMLInputElement>("#fem").checked = !!own?.fem; $("#femLabel").textContent = t("ws.fem", { name: femName }); }
    $("#resetToken").hidden = !own || state.tab !== "token";
    $("#styleScope").textContent = state.tab === "set" ? t("ws.scopeSet") : t("ws.scopeToken", { name: text });
    const editing = editingSpec();
    // The design tiles show a coin: a card shows them on a character.
    const tileRole = isCard(role) ? state.lib!.roles.find((r) => !isCard(r) && r.edition === "tb") ?? role : role;
    renderPresets(tileRole, editing);
    renderTemplateRow();
    renderBackTiles(tileRole, editing);
    renderFrameTiles(tileRole, editing);
    renderStyleTiles(tileRole, editing);
    syncControls(editing);

    $("#depthHint").className = "hint" + (token.depthClamped ? " warn" : "");
    $("#depthHint").textContent = token.depthClamped
      ? t("depth.clamped", { max: token.depthClamped.toFixed(1), core: "0.4" })
      : t("depth.help");
    const n = token.name;
    const small = n.letterHeight < smallLetters();
    $("#nameHint").className = "hint" + (small ? " warn" : "");
    $("#nameHint").textContent = !Number.isFinite(n.letterHeight) ? t("name.hintSolo")
      : n.total == null
      ? t("name.hintWindow", { lines: n.lines, mm: (Math.floor(n.letterHeight * 10) / 10).toFixed(1), small, nozzle: nozzleMm() })
      : t("name.hint", { arc: n.total.toFixed(0), mm: (Math.floor(n.letterHeight * 10) / 10).toFixed(1), shrunk: n.scale < 1, small, nozzle: nozzleMm() });
    renderColourWarn(role, spec, key);
  });
}

/** Under the token's name: inlays the coin's colour, or light ones too shallow on a dark coin. */
function renderColourWarn(role: Role, spec: TokenSpec, key: string) {
  const { clash, light } = colourIssues(role, spec);
  const box = $("#colourWarn");
  box.hidden = !clash.length && !light.length;
  if (box.hidden) return;
  // "front" is the name and the icon: two words in the list ("the name, the icon and the frame")
  const parts = (list: InlayPart[]) => { const w = list.flatMap((p) => (p === "front" ? [t("colour.part.name"), t("colour.part.icon")] : [t(`colour.part.${p}`)])); return w.length > 1 ? `${w.slice(0, -1).join(", ")}${t("colour.and")}${w.at(-1)}` : w[0]; };
  const own = !!state.overrides.get(key)?.spec;
  box.innerHTML = [
    clash.length ? `<p><span aria-hidden="true">⚠</span> ${esc(t("colour.clash", { parts: parts(clash), n: clash.length }))}</p>` : "",
    light.length ? `<p><span aria-hidden="true">◐</span> ${esc(t("colour.light", { parts: parts(light), n: light.length, mm: dec1(LIGHT_DEPTH) }))}
      <button class="pill" type="button" data-deepen>${esc(t(own ? "colour.deepenToken" : "colour.deepenSet", { mm: dec1(LIGHT_DEPTH) }))}</button></p>` : "",
  ].join("");
}
/** One decimal in the interface's language. */
const dec1 = (v: number) => v.toFixed(1).replace(".", uiLang() === "es" ? "," : ".");
/** The fix for light inlays: the depth that covers the coin, on the style the token actually uses. */
function deepen() {
  const key = state.sel!.key, own = state.overrides.get(key)?.spec;
  rememberTemplate(own ?? state.spec);
  (own ?? state.spec).depth = LIGHT_DEPTH;
  if (own) storeOverrides(); else storeJSON(STYLE_KEY, state.spec);
  renderWorkshop(); scheduleSheet();
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
      <p><button class="pill" type="button" data-deepen-all>${esc(t("print.deepenAll", { n: light.length, mm: dec1(LIGHT_DEPTH) }))}</button></p>
      ${light.some((x) => !state.overrides.get(x.k)?.spec) ? `<p><small>${esc(t("print.deepenSetNote"))}</small></p>` : ""}</div></div>` : "");
}
/** Deepens every selected token with light inlays on a dark coin: its own style, or the set's. */
function deepenAll() {
  let set = false, own = false;
  for (const x of selectionColourIssues().filter((x) => x.light.length)) {
    const o = state.overrides.get(x.k)?.spec;
    if (o) { rememberTemplate(o); o.depth = LIGHT_DEPTH; own = true; } else set = true;
  }
  if (set) { rememberTemplate(state.spec); state.spec.depth = LIGHT_DEPTH; storeJSON(STYLE_KEY, state.spec); }
  if (own) storeOverrides();
  if (state.sel) renderWorkshop();
  renderSheet(); renderSpine(); renderQueue();
}

/** The two layouts, each drawn on the selected character in the current colours. */
function renderStyleTiles(role: Role, spec: TokenSpec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45 };
  const text = textFor(charKey(role), role, null);
  $("[data-choice=style]").innerHTML = TOKEN_STYLES.map((st) =>
    `<button class="back-tile" type="button" data-v="${st.id}" aria-pressed="${s.style === st.id}">${
      tokenSvg(state.lib!, role, { ...s, style: st.id, ...(st.id !== s.style ? { textSize: LAYOUT_TEXT[st.id] } : {}) }, { text })
    }<span>${esc(t(`style.${st.id}`))}</span></button>`).join("");
}

/** The frame designs, each drawn on the selected character in the current colours. */
function renderFrameTiles(role: Role, spec: TokenSpec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45 };
  const text = textFor(charKey(role), role, null);
  const list = s.style === "window" ? FRAME_STYLES.filter((f) => f.id === "none" || f.id === "rim") : FRAME_STYLES;
  $("[data-choice=frame]").innerHTML = list.map((f) =>
    `<button class="back-tile frame-tile" type="button" data-v="${f.id}" aria-pressed="${(s.style === "window" && s.frame !== "none" ? "rim" : s.frame) === f.id}">${
      tokenSvg(state.lib!, role, { ...s, frame: f.id, frameWidth: f.id === "rim" || f.id === "double" ? Math.max(s.frameWidth, 0.8) : s.frameWidth }, { text })
    }<span>${esc(t(`frame.${f.id}`))}</span></button>`).join("");
}

/** The back designs as small coin backs, in the colours of the style being edited. */
function renderBackTiles(role: Role, spec: TokenSpec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45 };
  if (s.colours.back === "team") s.colours.back = FILAMENTS.gold;
  $("[data-choice=back]").innerHTML = BACK_STYLES.filter((b) => b.id !== "seal").map((b) =>
    `<button class="back-tile" type="button" data-v="${b.id}" aria-pressed="${s.back === b.id}">${
      b.id === "custom" && !s.customSvg ? `<span class="upload-tile">SVG</span>` : tokenSvg(state.lib!, role, { ...s, back: b.id }, { side: "back" })
    }<span>${esc(t(`back.${b.id}`))}</span></button>`).join("");
}

/** The premade designs, each previewed with the selected character. */
function renderPresets(role: Role, editing: TokenSpec) {
  const chosen = templateOf(editing).preset;
  $("#presets").innerHTML = PRESETS.map((p) =>
    `<button class="preset" type="button" data-preset="${p.id}" aria-pressed="${p === chosen}" title="${esc(t(`preset.${p.id}.help`))}">${tokenSvg(state.lib!, role, { ...presetSpec(p), diameter: 45 }, { text: textFor(charKey(role), role, null) })}<span>${esc(t(`preset.${p.id}`))}</span></button>`).join("");
  // what the chosen one is: under the tiles, so a phone has it too
  $("#presetHelp").textContent = chosen ? t(`preset.${chosen.id}.help`) : "";
}

/** Puts a spec's values into the style controls. */
function syncControls(spec: TokenSpec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours } };
  const dec = uiLang() === "es" ? "," : ".";
  for (const [id, [dp, unit]] of Object.entries(RANGES) as [RangeKey, [number, string]][]) {
    $<HTMLInputElement>("#" + id).value = String(s[id]);
    $(`output[data-for=${id}]`).textContent = (+s[id]).toFixed(dp).replace(".", dec) + unit;
  }
  $("#styleHint").textContent = t(`style.${s.style}.help`);
  // Relief: each face part flat or raised; the height only matters with something raised.
  const relief = reliefOf(s), raised = hasRelief(s);
  $("#reliefEls").innerHTML = RELIEF_PARTS.map((k) => `<div class="relief-el"><span><b>${esc(t(`relief.${k}`))}</b><small>${esc(t(`relief.${k}.help`))}</small></span><span class="seg2" role="group" aria-label="${esc(t(`relief.${k}`))}" data-relief="${k}"><button type="button" data-v="flat" aria-pressed="${!relief[k]}"${k === "text" && s.style === "solo" ? " disabled" : ""}>${esc(t("relief.flat"))}</button><button type="button" data-v="raised" aria-pressed="${relief[k]}"${k === "text" && s.style === "solo" ? " disabled" : ""}>${esc(t("relief.raised"))}</button></span></div>`).join("");
  $("#reliefHeightRow").hidden = !raised;
  const total = (s.height + reliefTop(s)).toFixed(1).replace(".", dec);
  $("#reliefHint").className = "hint" + (raised ? " warn" : "");
  $("#reliefHint").textContent = raised ? t("relief.raisedHelp", { total }) : t("relief.flatHelp");
  // The curved-name controls don't apply to the window style.
  for (const id of ["spacing", "maxArc"]) $("#" + id).closest<HTMLElement>(".row")!.hidden = s.style === "window" || s.style === "solo";
  $("#textSize").closest<HTMLElement>(".row")!.hidden = s.style === "solo";   // no name on the face
  // Magnet: the hole, the pause and how thick the coin has to be.
  const m = magnetLayout(s), dec2 = (v: unknown) => String(v).replace(".", dec);
  $("#magnetSizeRow").hidden = !m;
  $("#magnetHint").textContent = !m ? t("magnet.none.help")
    : t(`magnet.${m.kind}.help`, { d: dec2((m.radius * 2).toFixed(1)), size: `${m.md} × ${m.mt}`, z: dec2(m.pauseZ) })
      + (s.height < m.minHeight ? " " + t("magnet.taller", { from: dec2(s.height), to: dec2(m.minHeight) }) : "");
  $$("[data-choice] button").forEach((b) => b.setAttribute("aria-pressed", String(s[b.parentElement!.dataset.choice as keyof TokenSpec] === b.dataset.v)));
  $$(".metal").forEach((box) => $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === s.colours[box.dataset.colour as keyof SpecColours]))));
  // The window style's front is the window itself; its icon takes the coin's colour.
  $("#frontColourLabel").textContent = t(s.style === "window" ? "front.colourWindow" : "front.colour");
  // Reset buttons: shown where a field differs from its default (see baseSpec), never on a hidden field.
  const { spec: base, name } = baseSpec();
  for (const b of $$("[data-reset]")) {
    const k = b.dataset.reset!, own = b.closest(".row") || b.previousElementSibling;
    b.hidden = JSON.stringify(fieldValue(s, k)) === JSON.stringify(fieldValue(base, k)) || !!own?.closest("[hidden]:not(.ws-panel)");   // a closed section keeps its resets
    b.title = name ? t("reset.toPreset", { name }) : t("reset.toSet");
    b.setAttribute("aria-label", b.title);
  }
}

/** A field of a spec by its key: "diameter", "frame" or "colours.base". */
function fieldValue(spec: SpecInput, key: string) {
  if (key.startsWith("colours.")) return { ...DEFAULT_SPEC.colours, ...spec.colours }[key.slice(8) as keyof SpecColours];
  return spec[key as keyof TokenSpec] ?? DEFAULT_SPEC[key as keyof TokenSpec];
}
/** What a field resets to: the design (preset) it started from, else for a token its set's
 *  style and for the set "Edition" (the starting style). `name` is the preset's, if any. */
function baseSpec(): { spec: TokenSpec; name: string | null } {
  if (state.tab === "token" && !state.overrides.get(state.sel!.key)?.spec) return { spec: state.spec, name: null };
  const p = PRESETS.find((x) => x.id === editingSpec().preset);
  if (p) return { spec: presetSpec(p), name: t(`preset.${p.id}`) };
  if (state.tab === "token") return { spec: state.spec, name: null };
  return { spec: presetSpec(PRESETS[0]), name: t(`preset.${PRESETS[0].id}`) };
}
function resetField(key: string) {
  const { spec: base } = baseSpec(), v = structuredClone(fieldValue(base, key));
  changeStyle((s) => {
    if (key.startsWith("colours.")) s.colours = { ...DEFAULT_SPEC.colours, ...s.colours, [key.slice(8)]: v as ColourRef };
    else (s as unknown as Fields)[key] = v;
    if (key === "back" && v === "custom") s.customSvg = base.customSvg;
  });
}

/** Applies a style change to whatever the controls are editing. */
function changeStyle(mutate: (s: TokenSpec) => void) {
  const target = writableSpec();
  rememberTemplate(target);
  mutate(target);
  if (state.tab === "set") storeJSON(STYLE_KEY, state.spec); else storeOverrides();
  renderWorkshop();
  scheduleSheet();
}
let sheetTimer: ReturnType<typeof setTimeout> | number = 0;
function scheduleSheet() { clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { renderSheet(); renderSpine(); renderQueue(); }, 180); }
function storeOverrides() { storeJSON(OVERRIDES_KEY, Object.fromEntries(state.overrides)); }
/** A token's own text, style, feminine name or icon; with none left, it goes back to the set's. */
function setOwn(key: string, own: TokenOverride) {
  if (!own.text && !own.spec && !own.fem && !own.icon) state.overrides.delete(key); else state.overrides.set(key, own);
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

function syncView(v: string | undefined) { $$(".turn .pill[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v))); }

function buildChoices() {
  const make = (key: string, list: { id: string }[]) => {
    $(`[data-choice=${key}]`).innerHTML = list.map((s) => `<button class="pill" type="button" data-v="${s.id}">${esc(t(`${key}.${s.id}`))}</button>`).join("");
  };
  // Layouts are drawn as coin tiles by renderStyleTiles().
  make("magnet", [{ id: "none" }, { id: "pocket" }, { id: "hidden" }]);
  $("[data-choice=magnetSize]").innerHTML = MAGNET_SIZES.map((v) => `<button class="pill" type="button" data-v="${v}">${v.replace("x", " × ")} mm</button>`).join("");
  // Frames are drawn as coin tiles by renderFrameTiles().
  // Backs are drawn as coin tiles by renderBackTiles().
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
    if (ownEdit) { openOwnToken(ownEdit.dataset.ownEdit!); return; }
    const pen = hit(e, "[data-edit]");
    if (pen) { editToken(pen.dataset.edit!); return; }
    if (onCopyStep(e)) return;
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
  if (OWN) wireOwn();
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
  $$(".turn .pill[data-view]").forEach((b) => b.onclick = () => { view3d("setView", b.dataset.view as ViewKind); syncView(b.dataset.view); });
  $("#xray").onclick = () => {
    const on = $("#xray").getAttribute("aria-pressed") !== "true";
    $("#xray").setAttribute("aria-pressed", String(on));
    view3d("setXray", on);
    if (on) { view3d("setView", "side"); syncView("side"); }
  };
  $$(".scope [data-tab]").forEach((b) => b.onclick = () => {
    state.tab = b.dataset.tab!;
    if (state.tab === "token" && state.section === "presets") showSection("text");   // a token's text and icon are what's new here
    renderWorkshop();
  });
  const goSection = (section: string) => { showSection(section); view3d("setView", SECTION_VIEW[section]); syncView(SECTION_VIEW[section]); };
  $$(".sections [data-section]").forEach((b) => b.onclick = () => goSection(b.dataset.section!));
  // opens the templates; closing goes back to the section you were on
  $("#tplRow").onclick = () => goSection(state.section === "presets" ? state.lastSection : "presets");
  for (const key of ["style", "frame", "back", "magnet", "magnetSize"]) {
    $(`[data-choice=${key}]`).onclick = (e) => {
      const b = hit(e, "button"); if (!b) return;
      if (key === "back" && b.dataset.v === "custom" && !editingSpec()?.customSvg) { $("#upload").click(); return; }
      changeStyle((s) => {
        // a name size doesn't carry over between layouts: each starts from its own
        if (key === "style" && (s.style ?? DEFAULT_SPEC.style) !== b.dataset.v) s.textSize = LAYOUT_TEXT[b.dataset.v as TokenStyle];
        (s as unknown as Fields)[key] = b.dataset.v;
      });
      if (key === "back") { view3d("setView", "back"); syncView("back"); }
    };
  }
  for (const box of $$(".metal")) box.onclick = (e) => {
    const b = hit(e, "button"); if (!b) return;
    changeStyle((s) => { s.colours = { ...DEFAULT_SPEC.colours, ...s.colours, [box.dataset.colour!]: b.dataset.v! }; });
  };
  for (const id of Object.keys(RANGES) as RangeKey[]) $("#" + id).oninput = (e) => changeStyle((s) => { s[id] = +input(e).value; });
  $("#colourWarn").addEventListener("click", (e) => { if (hit(e, "[data-deepen]")) deepen(); });
  // A reset button for every field: in a slider's row, after a group of choices or colours.
  const resetBtn = () => Object.assign(document.createElement("button"), { type: "button", className: "reset-f", hidden: true, textContent: "↺" });
  for (const id of Object.keys(RANGES)) { const b = resetBtn(); b.dataset.reset = id; $(`output[data-for=${id}]`).after(b); }
  for (const el of $$("#styleFields [data-choice], #styleFields .metal")) {
    const b = resetBtn(); b.classList.add("group"); b.dataset.reset = el.dataset.choice ?? `colours.${el.dataset.colour}`; el.after(b);
  }
  { const b = resetBtn(); b.classList.add("group"); b.dataset.reset = "relief"; $("#reliefEls").after(b); }
  $("#reliefEls").onclick = (e) => {
    const b = hit(e, "[data-v]"), part = hit(e, "[data-relief]")?.dataset.relief; if (!b || !part) return;
    changeStyle((s) => { s.relief = { ...reliefOf(s), [part]: b.dataset.v === "raised" }; });
    view3d("setView", "side"); syncView("side");
  };
  $("#styleFields").addEventListener("click", (e) => { const b = hit(e, "[data-reset]"); if (b) resetField(b.dataset.reset!); });
  $("#upload").onchange = async (e) => {
    const f = input(e).files![0]; input(e).value = "";
    if (!f) return;
    const hint = $("#uploadHint");
    hint.hidden = false;
    if (f.size > MAX_SVG) { hint.className = "hint warn"; hint.textContent = t("upload.tooBig", { file: f.name, kb: (f.size / 1024).toFixed(0), max: MAX_SVG / 1000 }); return; }
    const svg = await f.text();
    changeStyle((s) => { s.customSvg = svg; s.back = "custom"; });
    hint.className = "hint"; hint.textContent = t("upload.using", { file: f.name });
    view3d("setView", "back"); syncView("back");
  };
  $("#presets").onclick = (e) => {
    const b = hit(e, "[data-preset]"); if (!b) return;
    const next = presetSpec(PRESETS.find((p) => p.id === b.dataset.preset)!);
    changeStyle((s) => { for (const k of Object.keys(next)) if (!PRESET_KEEPS.has(k)) (s as unknown as Fields)[k] = structuredClone((next as unknown as Fields)[k]); s.preset = b.dataset.preset; });
  };
  // this token only
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
  $("#resetToken").onclick = () => { state.overrides.delete(state.sel!.key); storeOverrides(); renderWorkshop(); scheduleSheet(); };
  $("#download").onclick = forge;
  $("#save").onclick = save;
  $("#saved").onclick = onSavedClick;

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
// Picked tokens always use the set's design (or the token's own), so nothing goes stale.
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
/** A queue entry as the sheet would draw it now: the token language, the set's style (or the token's own) and its text. */
function queueEntry(role: Role, ri: number | null): QueueEntry {
  const isRem = ri != null, key = isRem ? remKey(role, ri) : charKey(role);
  const own = state.overrides.get(key);
  return {
    roleId: role.id, ri: isRem ? ri : null,
    reminder: isRem ? textFor(key, role, ri) : null,
    text: isRem ? null : textFor(key, role, null),
    custom: !!own,
    spec: { ...structuredClone(own?.spec ?? state.spec), lang: tokenLang(), icon: ownIcon(role.id) },
  };
}
const isReminder = (q: QueueEntry): q is QueueEntry & { reminder: string } => q.reminder != null;
const itemSpec = (q: QueueEntry): TokenSpec => (isReminder(q) ? reminderSpec({ ...DEFAULT_SPEC, ...q.spec }) : { ...DEFAULT_SPEC, ...q.spec });
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
    const team = TEAMS[role.team].colour, pick = (v: ColourRef) => (v === "team" ? team : v);
    const hasBack = spec.back !== "none" && (spec.back !== "custom" || spec.customSvg) && (spec.back !== "seal" || state.lib!.sealSvg) && (spec.back !== "edition" || role.edition);
    if (isCard(role)) return {   // a card: its body, the phrase and the set's frame; no back
      q, title: queueLabel(q, role), group: queueGroup(q, role),
      token: { spec, foot: { w: CARD.w, h: CARD.h }, parts: { base: 1, front: 1, icon: null, frame: spec.frame !== "none" ? 1 : null, back: null },
        colours: { base: pick(spec.colours.base), front: pick(spec.colours.front), icon: pick(spec.colours.base), frame: pick(spec.colours.frame), back: pick(spec.colours.back) } },
    };
    return {
      q, title: queueLabel(q, role), group: queueGroup(q, role),
      token: { spec, parts: { base: 1, front: 1, icon: 1, frame: spec.frame !== "none" ? 1 : null, back: hasBack ? 1 : null },
        // the window's icon is in the coin colour; the classic one in the name's
        colours: { base: pick(spec.colours.base), front: pick(spec.colours.front), icon: pick(spec.style === "window" ? spec.colours.base : spec.colours.front), frame: pick(spec.colours.frame), back: pick(spec.colours.back) } },
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
      <span class="q-name"><b>${esc(name)}${state.overrides.has(k) ? ` ${ownPen(k, name)}` : ""}</b>${isRem ? `<small>${esc(char)}</small>` : ""}</span>
      ${qty(k, isRem ? `${char}: ${name}` : name)}</div>`;
  };
  const section = (title: string, list: string[], byTeam: boolean) => !list.length ? "" : `<section class="q-sec"><h3 class="q-sec-h">${esc(title)}<small>${esc(t("queue.count", { n: copies(list) }))}</small></h3>`
    + (byTeam ? TEAM_ORDER.map((team) => { const here = list.filter((k) => tokenRole(k).team === team); return here.length ? `<h4 class="q-team">${esc(TEAM_PLURAL[lang][team])}</h4>${here.map(item).join("")}` : ""; }).join("") : list.map(item).join(""))
    + `</section>`;
  $("#queue").innerHTML = section(t("queue.chars"), chars, true) + section(t("queue.rems"), rems, false);
}

// ------------------------------------------------------------ step 2: your tokens in the set's design

function renderDesignStage() {
  const keys = sortKeys(state.pick.keys()), total = queueNow().length;
  $("#designGrid").innerHTML = keys.map((k) => {
    const role = tokenRole(k), ri = tokenRem(k), text = textFor(k, role, ri);
    const spec = specFor(k, ri != null);
    const label = ri != null ? `${textFor(charKey(role), role, null)}: ${text}` : text;
    // the copies stepper sits beside the button (a button can't hold buttons), over the coin's foot
    return `<div class="ds-item${ri != null ? " r" : ""}"><button class="ds-cell${ri != null ? " r" : ""}${isCard(role) ? " card" : ""}" type="button" data-design="${k}" aria-current="${state.sel?.key === k}" title="${esc(t("design.tap"))}">${tokenSvg(state.lib!, role, spec, { text })}${state.overrides.has(k) ? `<span class="mark" title="${esc(t("sheet.own"))}">✎</span>` : ""}<span>${esc(label)}</span></button><button type="button" class="ds-drop" data-drop="${k}" aria-label="${esc(t("queue.removeAria", { name: label }))}">${BIN}</button></div>`;
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
/** Tapping one of your tokens: the workshop shows it. What you're editing (set or token) stays as it is. */
function designToken(key: string) {
  selectToken(key);
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
  state.tab = "token";
  showSection("text");
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

// ------------------------------------------------------------ saved designs

// Saved designs live in this browser (localStorage), newest first.
const readDesigns = () => loadJSON<Design[]>(DESIGNS_KEY, []).filter((d) => d && d.id && d.roleId && d.spec).map((d) => ({ ...d, spec: upgradeSpec(d.spec) }));
const writeDesigns = (list: Design[]) => storeJSON(DESIGNS_KEY, list);
function refreshDesigns() { state.designs = readDesigns(); renderDesigns(); }

/** Moves designs saved to an account (before sign-in was dropped) into this browser. */
async function importAccountDesigns(user: User) {
  const remote = await listAccountDesigns(user.uid);
  if (!remote.length) return;
  const list = readDesigns();
  for (const d of remote) {
    if (list.some((x) => x.id === d.id)) continue;
    const { updatedAt, ...rest } = d;
    list.push({ ...rest, updatedAt: updatedAt?.toMillis?.() ?? Date.now() } as Design);
  }
  writeDesigns(list.sort((a, b) => b.updatedAt - a.updatedAt));
  await Promise.all(remote.map((d) => deleteAccountDesign(user.uid, d.id)));
  if (state.lib) refreshDesigns();
}
function renderDesigns() {
  if (!state.lib) return;
  $("#savedSummary").textContent = state.designs.length ? String(state.designs.length) : "";
  $("#saved").innerHTML = state.designs.map((d) => {
    const role = roleById(d.roleId);
    if (!role) return "";
    const pic = tokenSvg(state.lib!, role, { ...DEFAULT_SPEC, ...d.spec, diameter: 45, colours: { ...DEFAULT_SPEC.colours, ...d.spec.colours } }, { text: d.text || (d.fem && role.fem?.[d.spec.lang]) || roleName(role, d.spec.lang) });
    return `<li><button class="open" type="button" data-open="${d.id}">${pic}<span>${esc(d.title)}</span></button><button class="del" type="button" data-del="${d.id}" aria-label="${esc(t("saved.deleteAria", { name: d.title }))}">${esc(t("saved.delete"))}</button></li>`;
  }).join("") || `<li class="hint">${esc(t("saved.empty"))}</li>`;
}
async function save() {
  const btn = $<HTMLButtonElement>("#save");
  btn.disabled = true;
  const { key, role, reminder } = state.sel!;
  if (reminder != null) { $("#saveNote").textContent = t("saved.charactersOnly"); btn.disabled = false; return; }
  const title = textFor(key, role, null);
  try {
    const spec = specFor(key, false);
    // One saved design per character: saving again updates it.
    const list = readDesigns().filter((d) => d.roleId !== role.id);
    list.unshift({ id: role.id, roleId: role.id, text: state.overrides.get(key)?.text || null, fem: !!state.overrides.get(key)?.fem, spec, title, updatedAt: Date.now() });
    writeDesigns(list);
    $("#saveNote").textContent = t("saved.saved", { name: title });
    refreshDesigns();
  } catch (err) {
    $("#saveNote").textContent = t("saved.failed", { message: (err as Error).message });
  } finally { btn.disabled = false; }
}
async function onSavedClick(e: Event) {
  const open = hit(e, "[data-open]"), del = hit(e, "[data-del]");
  if (open) {
    // A saved design becomes that token's own style and name.
    const d = state.designs.find((x) => x.id === open.dataset.open)!;
    const role = roleById(d.roleId)!;
    const { lang, ...spec } = d.spec;   // the token language decides that
    state.overrides.set(charKey(role), { text: d.text || null, spec: spec as TokenSpec, ...(d.fem ? { fem: true } : {}) });
    storeOverrides();
    if (role.edition) state.edition = role.edition;
    $<HTMLInputElement>("#search").value = "";
    state.tab = "token";
    renderSpine(); renderSheet();
    if (state.step === 2) { selectToken(charKey(role)); renderWorkshop(); renderDesignStage(); }
    $("#saveNote").textContent = t("saved.opened", { name: d.title });
  }
  if (del) {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = t("saved.deleteConfirm"); return; }
    writeDesigns(readDesigns().filter((d) => d.id !== del.dataset.del));
    refreshDesigns();
  }
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
  for (const r of [...(state.lib?.roles || []), ...ownGame, ...ui]) {
    if (!r.icon) continue;
    if (!byAuthor.has(r.author!)) byAuthor.set(r.author!, new Set());
    byAuthor.get(r.author!)!.add(r.icon);
  }
  const icons = [...byAuthor].sort((a, b) => b[1].size - a[1].size).map(([a, set]) => `<li><details>
    <summary><b>${esc(authorName(a))}</b> <small>${esc(t("credits.count", { n: set.size }))}</small></summary>
    <p>${[...set].sort().map((i) => link(`https://game-icons.net/1x1/${encodeURIComponent(a)}/${encodeURIComponent(i)}.html`, i)).join(", ")}</p></details></li>`).join("");

  // The generic creator: first what the collection says about itself (and its links)
  const lang = uiLang(), a = OWN ? coll.about : undefined;
  const paras = (n: Parameters<typeof nameIn>[0] | undefined, cls = "") => nameIn(n, lang).split(/\n\s*\n/).filter((x) => x.trim()).map((x) => `<p${cls}>${esc(x.trim())}</p>`).join("");
  const own = OWN ? `<section class="about own-about"><h3>${esc(nameIn(coll.name, lang))}</h3>${paras(a?.text)}${paras(a?.credits, ' class="hint"')}
      ${a?.links?.length ? `<p class="about-links">${a.links.map((l) => link(l.url, nameIn(l.label, lang))).join(" · ")}</p>` : ""}</section>` : "";
  // About: what the app is and how it treats your things, then the credits
  $("#creditsBody").innerHTML = `${own}<section class="about"><p>${esc(t(OWN ? "own.aboutApp" : "about.what"))}</p>
      ${OWN ? "" : `<p class="hint">${esc(t("credits.intro"))}</p>`}
      <p class="hint">${esc(t("about.data"))}</p>
      <p class="about-actions"><button type="button" class="pill" data-guide>${esc(t("guide.open"))}</button></p></section>
    <h2 class="credits-h">${esc(t("credits.title"))}</h2>
    ${!OWN || (coll.languages?.length ?? 0) > 1 ? `<section><h3>${esc(t("credits.translations"))}</h3>
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

// ------------------------------------------------------------ the generic creator (/crear)
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
    TEAM_ICONS[id] = g.icon && UI_ICONS[g.icon] ? g.icon : TEAM_ICONS[id] ?? "two-coins";
  }
}

/** What depends on the collection itself: its name, its look, and the token language when it has several. */
function syncOwnChrome() {
  $("#ownCollName").textContent = nameIn(coll.name, uiLang());
  applyOwnTheme(); applyOwnBrand();
  $("#tokenLangBtn").hidden = !((coll.languages?.length ?? 0) > 1);
}

/** After any change to the collection: keep it, redraw, and drop picks and designs of tokens that are gone. */
function collectionChanged() {
  storeCollection(coll);
  applyGroups();
  state.lib!.roles = collectionRoles(coll, uiLang());
  const ids = new Set(coll.tokens.map((x) => x.id)), linkedOf = new Map(coll.tokens.map((x) => [x.id, x.linked.length]));
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
    return `<button class="ed" type="button" data-ed="t:${esc(ty.id)}" aria-current="${state.edition === `t:${ty.id}` && !q}">${uiIcon(ty.icon && UI_ICONS[ty.icon] ? ty.icon : ty.shape === "card" ? "id-card" : "two-coins")}
      <span>${esc(nameIn(ty.title, lang))}<small>${esc(sub(roles, ty.shape === "card"))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("");
  $("#editions").innerHTML = coll.sections.map((sec) => `
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
  $("#ownCollName").onclick = () => openOwnSettings();
  wireOwnSettings();
  $("#ownNewTok").onclick = () => openOwnToken(null);
  $("#ownGroups").onclick = () => { renderOwnGroups(); $<HTMLDialogElement>("#ownGroupsDlg").showModal(); };
  $("#ownExport").onclick = () => saveFile(new Blob([JSON.stringify(collectionFile(coll), null, 2)], { type: "application/json" }), `${nameIn(coll.name, "en").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "collection"}.json`);
  $("#ownImport").onclick = () => $("#ownImportFile").click();
  $<HTMLInputElement>("#ownImportFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    const noteEl = $("#ownNote");
    try {
      const next = await readCollectionFile(JSON.parse(await f.text()), (i, n) => { noteEl.textContent = t("own.importing", { i, n }); });
      if (!next.tokens.length) throw new Error("empty");
      const id = addCollection(next);   // a collection of its own, beside this one
      if (!id) { noteEl.textContent = t("own.storageFull"); return; }
      location.href = collectionUrl(id);
    } catch { noteEl.textContent = t("own.importFailed"); }
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
    else if (el.dataset.tshape) coll.types.find((x) => x.id === el.dataset.tshape)!.shape = el.value === "card" ? "card" : "coin";
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
      <label class="field"><span>${esc(t("own.shape"))}</span><select class="text" data-tshape="${esc(ty.id)}"><option value="coin"${ty.shape === "coin" ? " selected" : ""}>${esc(t("own.shapeCoin"))}</option><option value="card"${ty.shape === "card" ? " selected" : ""}>${esc(t("own.shapeCard"))}</option></select></label>
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

// a token, made or changed: the editor holds a copy until it's saved. Names are edited in the
// token language (a collection with translations keeps the others).
let ownDraft: (OwnToken & { cats: string[] }) | null = null;
function openOwnToken(id: string | null) {
  const tk = id ? coll.tokens.find((x) => x.id === id) : null, lang = tokenLang();
  const here = catalogOf(state.edition), hereType = typeOfView(state.edition);
  const openCats = coll.sections.filter((s) => s.open).flatMap((s) => s.catalogs);
  ownDraft = tk
    ? { ...structuredClone(tk), cats: openCats.filter((k) => k.tokens.includes(tk.id)).map((k) => k.id) }
    : { id: newId("t"), type: hereType?.id ?? coll.types[0].id, name: "", icon: null, linked: [], cats: here ? [here.id] : [],
        group: state.team !== "all" && coll.groups.some((g) => g.id === state.team) ? state.team : coll.groups[0].id };
  $("#ownTokTitle").textContent = t(tk ? "own.editToken" : "own.newTokenTitle");
  $("#ownTokSave").textContent = t(tk ? "own.save" : "own.add");
  $("#ownTokDelete").hidden = !tk;
  $<HTMLInputElement>("#ownTokName").value = nameIn(ownDraft.name, lang);
  $<HTMLInputElement>("#ownTokIq").value = ""; $("#ownTokHits").innerHTML = "";
  $("#ownTokTypeRow").hidden = coll.types.length < 2;
  $("#ownTokType").innerHTML = coll.types.map((x) => `<option value="${esc(x.id)}"${x.id === ownDraft!.type ? " selected" : ""}>${esc(nameIn(x.name, uiLang()))}</option>`).join("");
  $("#ownTokGroup").innerHTML = coll.groups.map((g) => `<option value="${esc(g.id)}"${g.id === ownDraft!.group ? " selected" : ""}>${esc(nameIn(g.name, uiLang()))}</option>`).join("");
  $("#ownTokCats").innerHTML = openCats.map((k) => `<label class="check"><input type="checkbox" value="${esc(k.id)}"${ownDraft!.cats.includes(k.id) ? " checked" : ""}> ${esc(nameIn(k.name, uiLang()))}</label>`).join("") || `<p class="hint">${esc(t("own.noCatalogs"))}</p>`;
  renderOwnLinked(); drawOwnPreview();
  $<HTMLDialogElement>("#ownTok").showModal();
  if (!tk) $("#ownTokName").focus();
}
function renderOwnLinked() {
  const lang = tokenLang();
  $("#ownTokLinked").innerHTML = ownDraft!.linked.map((w, i) => `<span class="own-link"><input class="text" value="${esc(nameIn(w, lang))}" data-li="${i}" aria-label="${esc(t("own.linked"))}"><button class="link" type="button" data-ldel="${i}" aria-label="${esc(t("own.remove"))}">✕</button></span>`).join("");
}
function drawOwnPreview() {
  const d = ownDraft!;
  const role = { ...collectionRoles({ ...coll, tokens: [d] }, uiLang())[0], id: `__draft_${d.id}`, iconKey: `__draft:${d.icon?.id ?? "none"}` };
  const spec = { ...state.spec, lang: tokenLang() };
  const name = nameIn(d.name, tokenLang()).trim() || t("own.namePlaceholder");
  const card = coll.types.find((x) => x.id === d.type)?.shape === "card";
  $("#ownTokPv").innerHTML = tokenSvg(state.lib!, role, spec, { text: name })
    + (d.linked.length && !card ? `<span class="own-pv-links">${d.linked.slice(0, 4).map((w) => tokenSvg(state.lib!, role, reminderSpec(spec), { text: nameIn(w, tokenLang()) || "…" })).join("")}</span>` : "");
}
function wireOwnToken() {
  const dlg = $<HTMLDialogElement>("#ownTok");
  closeOnBackdrop(dlg);
  $("#ownTokName").oninput = (e) => { ownDraft!.name = withName(ownDraft!.name, tokenLang(), input(e).value); drawOwnPreview(); };
  $("#ownTokGroup").onchange = (e) => { ownDraft!.group = (e.target as HTMLSelectElement).value; drawOwnPreview(); };
  $("#ownTokType").onchange = (e) => { ownDraft!.type = (e.target as HTMLSelectElement).value; drawOwnPreview(); };
  let timer: ReturnType<typeof setTimeout> | undefined;
  $("#ownTokIq").oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query = input(e).value.trim(), hits = query ? await searchGameIcons(query, 48) : [];
      $("#ownTokHits").innerHTML = hits.map((p) => `<button type="button" class="icon-hit" data-gi="${esc(p)}" title="${esc(p.replace("/", " · "))}"><img src="${gameIconPreview(p)}" alt="" loading="lazy"><span>${esc(p.split("/")[1])}</span></button>`).join("")
        || (query ? `<p class="hint">${esc(t("icon.none"))}</p>` : "");
    }, 200);
  };
  $("#ownTokHits").onclick = async (e) => {
    const b = hit(e, "[data-gi]"); if (!b) return;
    try { ownDraft!.icon = { ...(await gameIcon(b.dataset.gi!)), id: b.dataset.gi! }; drawOwnPreview(); } catch { /* offline: keep the old one */ }
  };
  $<HTMLInputElement>("#ownTokSvg").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    try { const icon = iconFromSvg(await f.text(), { source: "upload", name: f.name }); ownDraft!.icon = { ...icon, id: `upload:${newId("i")}` }; drawOwnPreview(); }
    catch { $("#ownTokHits").innerHTML = `<p class="hint warn">${esc(t("own.svgFailed"))}</p>`; }
  };
  $("#ownTokNoIcon").onclick = () => { ownDraft!.icon = null; drawOwnPreview(); };
  $("#ownTokAddLinked").onclick = () => { ownDraft!.linked.push(""); renderOwnLinked(); drawOwnPreview(); $<HTMLInputElement>(`[data-li="${ownDraft!.linked.length - 1}"]`).focus(); };
  $("#ownTokLinked").oninput = (e) => { const i = input(e).dataset.li; if (i != null) { ownDraft!.linked[+i] = withName(ownDraft!.linked[+i], tokenLang(), input(e).value); drawOwnPreview(); } };
  $("#ownTokLinked").onclick = (e) => { const b = hit(e, "[data-ldel]"); if (b) { ownDraft!.linked.splice(+b.dataset.ldel!, 1); renderOwnLinked(); drawOwnPreview(); } };
  $("#ownTokCancel").onclick = () => dlg.close();
  $("#ownTokSave").onclick = () => {
    const d = ownDraft!, lang = tokenLang();
    if (!nameIn(d.name, lang).trim()) { $("#ownTokName").focus(); return; }
    const linked = d.linked.filter((w) => nameIn(w, lang).trim());
    // a linked token taken out shifts the ones after it: their picks and own designs follow them
    const old = coll.tokens.find((x) => x.id === d.id);
    if (old) remapLinked(d.id, old.linked.map((w) => nameIn(w, lang)), linked.map((w) => nameIn(w, lang)));
    const { cats: _cats, ...tk } = { ...d, linked };
    if (old) Object.assign(old, tk); else coll.tokens.push(tk);
    const cats = new Set($$<HTMLInputElement>("#ownTokCats input:checked").map((x) => x.value));
    for (const k of coll.sections.filter((s) => s.open).flatMap((s) => s.catalogs)) {
      const has = k.tokens.includes(d.id);
      if (cats.has(k.id) && !has) k.tokens.push(d.id);
      if (!cats.has(k.id) && has) k.tokens = k.tokens.filter((x) => x !== d.id);
    }
    dlg.close();
    collectionChanged();
  };
  $("#ownTokDelete").onclick = () => {
    const d = ownDraft!;
    if (coll.tokens.length <= 1) { alert(t("own.lastToken")); return; }
    if (!confirm(t("own.deleteTokenConfirm", { name: nameIn(d.name, tokenLang()) }))) return;
    coll.tokens = coll.tokens.filter((x) => x.id !== d.id);
    for (const { k } of catalogsOf(coll)) k.tokens = k.tokens.filter((x) => x !== d.id);
    dlg.close();
    collectionChanged();
  };
}
/** Linked tokens are picked and designed by their place ("r:id:2"): when the list changes, they keep theirs. */
function remapLinked(id: string, before: string[], after: string[]) {
  const moveMap = new Map<number, number>(), used = new Set<number>();
  after.forEach((w, ni) => { const oi = before.findIndex((b, i) => b === w && !used.has(i)); if (oi >= 0) { used.add(oi); moveMap.set(oi, ni); } });
  for (const store of [state.pick, state.overrides] as Map<string, unknown>[]) {
    const moved = new Map<string, unknown>();
    for (const [k, v] of [...store]) {
      const [kind, rid, i] = k.split(":");
      if (kind !== "r" || rid !== id) continue;
      store.delete(k);
      const ni = moveMap.get(+i); if (ni != null) moved.set(remKey({ id } as Role, ni), v);
    }
    for (const [k, v] of moved) store.set(k, v);
  }
}

// ------------------------------------------------------------ the collection's own look, loading line and About

/** The collection's colours on the whole app: Clocktower's own stylesheet for "botc", else its theme's. */
function applyOwnTheme() {
  const root = document.documentElement, th = coll.theme ?? "graphite";
  // "botc" is the stylesheet's own colours: nothing to set
  const colours: OwnTheme | null = th === "botc" ? null : typeof th === "string" ? THEMES[th] ?? THEMES.graphite : th;
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
  const logo = coll.brand?.logo || "/logo-mark.svg", title = nameIn(coll.brand?.title, uiLang());
  for (const img of $$<HTMLImageElement>(".brand img, .gate-logo")) img.src = logo;
  const icon = $<HTMLLinkElement>("#favicon");
  icon.href = logo; icon.type = logo.startsWith("data:image/svg") || logo.endsWith(".svg") ? "image/svg+xml" : "";
  for (const el of $$(".brand-title")) { el.textContent = title; el.hidden = !title; }
  for (const el of $$(".brand .wordmark, .gate-card .wordmark")) el.hidden = !!title;
  document.title = title ? `${title} · Midnight Mint` : nameIn(coll.name, uiLang()) ? `${nameIn(coll.name, uiLang())} · Midnight Mint` : "Midnight Mint";
}

function openOwnSettings() {
  const lang = uiLang();
  $<HTMLImageElement>("#osLogo").src = coll.brand?.logo || "/logo-mark.svg";
  $<HTMLInputElement>("#osBrandTitle").value = nameIn(coll.brand?.title, lang);
  $("#osLogoNote").textContent = "";
  $<HTMLInputElement>("#osName").value = nameIn(coll.name, lang);
  $<HTMLInputElement>("#osLoader").value = nameIn(coll.loader?.text, lang);
  $<HTMLTextAreaElement>("#osAbout").value = nameIn(coll.about?.text, lang);
  $<HTMLTextAreaElement>("#osCredits").value = nameIn(coll.about?.credits, lang);
  $<HTMLTextAreaElement>("#osLinks").value = (coll.about?.links ?? []).map((l) => `${nameIn(l.label, lang)} | ${l.url}`).join("\n");
  renderOwnThemes();
  $<HTMLDialogElement>("#ownSettings").showModal();
}
function renderOwnThemes() {
  const th = coll.theme ?? "graphite", custom = typeof th === "object" ? th : null;
  $("#osThemes").innerHTML = Object.entries(THEMES).map(([id, c]) => {
    const sw = c ?? { background: "#170812", surface: "#2a0f20", accent: "#c9a227", text: "#efe6d6" };
    return `<button type="button" class="os-theme" data-theme-id="${id}" aria-pressed="${th === id}"><span style="background:${sw.background};border-color:${sw.surface}"><i style="background:${sw.accent}"></i><b style="color:${sw.text}">Aa</b></span>${esc(t(`own.theme.${id}`))}</button>`;
  }).join("") + `<button type="button" class="os-theme" data-theme-id="custom" aria-pressed="${!!custom}"><span class="custom"><i></i><b>+</b></span>${esc(t("own.theme.custom"))}</button>`;
  const base = custom ?? (typeof th === "string" ? THEMES[th] : null) ?? THEMES.graphite!;
  $("#osCustom").hidden = !custom;
  for (const k of ["accent", "background", "surface", "text", "muted"] as const) $<HTMLInputElement>(`#os-${k}`).value = base[k];
  $("#osFont").innerHTML = THEME_FONTS.map((f) => `<option${(custom?.font ?? "Bricolage Grotesque") === f ? " selected" : ""}>${esc(f)}</option>`).join("");
}
function wireOwnSettings() {
  const dlg = $<HTMLDialogElement>("#ownSettings");
  closeOnBackdrop(dlg);
  $("#osThemes").onclick = (e) => {
    const b = hit(e, "[data-theme-id]"); if (!b) return;
    const id = b.dataset.themeId!;
    if (id === "custom") { const cur = coll.theme ?? "graphite"; coll.theme = { ...(typeof cur === "object" ? cur : THEMES[cur] ?? THEMES.graphite!) }; }
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
  $("#osLogoReset").onclick = () => { if (coll.brand) delete coll.brand.logo; storeCollection(coll); applyOwnBrand(); $<HTMLImageElement>("#osLogo").src = "/logo-mark.svg"; };
  $("#osCancel").onclick = () => dlg.close();
  $("#osSave").onclick = () => {
    const lang = uiLang(), v = (id: string) => $<HTMLInputElement>(id).value.trim();
    if (v("#osName")) coll.name = withName(coll.name, lang, v("#osName"));
    coll.brand = { ...coll.brand, title: withName(coll.brand?.title ?? "", lang, v("#osBrandTitle")) };
    if (!v("#osBrandTitle")) delete coll.brand.title;
    coll.loader = { ...coll.loader, text: withName(coll.loader?.text ?? "", lang, v("#osLoader")) };
    if (!v("#osLoader")) delete coll.loader.text;
    const links = v("#osLinks").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter(([label, url]) => label && /^https?:\/\//.test(url ?? "")).map(([label, url]) => ({ label, url }));
    coll.about = { text: withName(coll.about?.text ?? "", lang, v("#osAbout")), credits: withName(coll.about?.credits ?? "", lang, v("#osCredits")), links };
    dlg.close();
    collectionChanged();
  };
}

// ------------------------------------------------------------ /crear: the list of your collections

function renderOwnHome() {
  $("#gate").hidden = true; $("#app").hidden = true; $("#ownHome").hidden = false;
  document.title = "Midnight Mint";
  const list = listCollections().sort((a, b) => b.updated - a.updated);
  const when = (ms: number) => new Intl.DateTimeFormat(uiLang(), { day: "numeric", month: "short" }).format(ms);
  $("#ownHomeList").innerHTML = list.map((c) => `<article class="oh-card" style="--acc:${esc(c.accent ?? "#4fd1c5")}">
      <a class="oh-open" href="${collectionUrl(c.id)}"><img src="${esc(c.logo || "/logo-mark.svg")}" alt=""><span><b>${esc(c.name)}</b><small>${esc(t("own.homeCount", { n: c.tokens, when: when(c.updated) }))}</small></span></a>
      <span class="oh-actions"><button class="link" type="button" data-oh-export="${esc(c.id)}">${esc(t("own.export"))}</button><button class="link danger" type="button" data-oh-delete="${esc(c.id)}">${esc(t("own.homeDelete"))}</button></span>
    </article>`).join("") || `<p class="hint">${esc(t("own.homeEmpty"))}</p>`;
}
function wireOwnHome() {
  const note = (k: string, v = {}) => { $("#ownHomeNote").textContent = t(k, v); };
  $("#ownHomeNew").onclick = () => { const id = addCollection(starterCollection()); if (id) location.href = collectionUrl(id); else note("own.storageFull"); };
  $("#ownHomeImport").onclick = () => $("#ownHomeFile").click();
  $<HTMLInputElement>("#ownHomeFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    try {
      const c = await readCollectionFile(JSON.parse(await f.text()), (i, n) => note("own.importing", { i, n }));
      const id = addCollection(c);
      if (id) location.href = collectionUrl(id); else note("own.storageFull");
    } catch { note("own.importFailed"); }
  };
  $("#ownHomeList").onclick = (e) => {
    const ex = hit(e, "[data-oh-export]"), del = hit(e, "[data-oh-delete]");
    if (ex) { const c = loadCollection(ex.dataset.ohExport!); if (c) saveFile(new Blob([JSON.stringify(collectionFile(c), null, 2)], { type: "application/json" }), `${nameIn(c.name, "en").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "collection"}.json`); }
    if (del) {
      const entry = listCollections().find((x) => x.id === del.dataset.ohDelete);
      if (entry && confirm(t("own.homeDeleteConfirm", { name: entry.name }))) { deleteCollection(entry.id); renderOwnHome(); }
    }
  };
}
if (OWN && !OWN_ID) wireOwnHome();
