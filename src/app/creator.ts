// Collections of your own: the creator, a token's panel, the collection's look and the list.
import { emit } from "./events.ts";
import { paintTesserae } from "./tesserae.ts";
import { OWN, nameIn, storeMyLists, foldAbout, storeCollection, OWN_ID, builtIn, tallerUrl, readTokenList, newId, withName, copyBuiltIn, collectionUrl, collectionFile, readCollectionFile, addCollection, GROUP_COLOURS, SHAPES, collectionRoles, tokenRole as ownRole, isLocked, coinContent, THEMES, THEME_VARS, themeVars, APP_LOGO, APP_LOGO_SMALL, APP_ICON, APP_NAME, hasCcc, THEME_FONTS, okLogo, builtInCollections, listCollections, lastCollection, openUrl, OWN_VIEW, LIST_URL, starterCollection, loadCollection, deleteCollection, isUntouchedStarter } from "../collection.ts";
import type { OwnWord, OwnWords, OwnCatalog, OwnToken, OwnTheme, CollectionEntry, OwnFlip } from "../collection.ts";
import { FILAMENT_SLOTS, slotOf, isFilament } from "../bambu/plates.ts";
import { PLA_BASIC } from "../bambu/pla-basic.ts";
import { coll, TEAM_ORDER, TEAM_PLURAL, PLATE_LABEL, PLATE_GROUP, $$, stickyNotice, state, $, esc, READONLY, hit, input, BUILT } from "./context.ts";
import type { Role, Team, Hex, TokenShape, TokenIcon, TokenContent } from "../types.ts";
import { uiLang, t, setOwnWords, applyStatic, appWord } from "../i18n.ts";
import type { Word, WordKind } from "../i18n.ts";
import { PRINT_GROUPS, persistPicks, renderDesignStage, setPick, goStep, editToken, settingsStep } from "./queue.ts";
import { markdown } from "../markdown.ts";
import { openPartTab } from "./editor.ts";
import { TEAMS, saveFile, SHAPE_FEATURES, tokenSvg, ICON_VIEW } from "../engine/token-engine.ts";
import { safeIconMarkup, safeTransform } from "../engine/safe-svg.ts";
import { UI_ICONS, TEAM_ICONS, uiIcon, SHAPE_ICONS } from "../ui-icons.ts";
import { renderLangButtons, closeOnBackdrop, tokenLang } from "./token-language.ts";
import { storeOverrides, designOf, defaultRef, lookOf } from "./designs.ts";
import { roleById } from "./wiring.ts";
import { charKey, remindersOf, sortKeys, filamentName } from "./tokens.ts";
import { searchQuery, pickedBadge, selectToken } from "./sheet.ts";
import { rememberReturn, toast } from "./design-sheet.ts";
import { drawer, PHONE } from "./scripts-ui.ts";
import { renderWorkshop } from "./workshop.ts";
import { filled } from "./looks.ts";
import { searchGameIcons, gameIconPreview, gameIcon, iconFromSvg } from "../icons.ts";
import posthog, { posthogEnabled } from "../posthog.ts";

// ------------------------------------------------------------ Tesserae Faber, the generic creator
//
// Your own collection (collection.ts) stands in for Clocktower's library: each token is a
// character whose team is its category (a group, its colour) and whose reminders are its linked
// tokens. The sidebar has Everything ("all", like "All characters"), an entry per shape there is
// ("f:<shape>": the coins, the cards…), then the lists ("k:<id>"): the collection's own first,
// fixed (like the editions), then yours (like the scripts). Everything after picking (design,
// queue, print) is the same app.

export const catalogOf = (view: string | null | undefined): OwnCatalog | null =>
  (OWN && view?.startsWith("k:") ? coll.catalogs.find((k) => k.id === view.slice(2)) ?? null : null);
/** A shape's entry ("f:coin"): every token of that shape. */
export const shapeOfView = (view: string | null | undefined): TokenShape | null =>
  (OWN && view?.startsWith("f:") && (SHAPES as string[]).includes(view.slice(2)) ? view.slice(2) as TokenShape : null);
export const tokenShape = (id: string) => coll.tokens.find((x) => x.id === id)?.shape;
/** The collection's own list a token came in ("Trouble Brewing"), shown under its name like an edition. */
export const ownHomeCatalog = (id: string) => coll.catalogs.find((k) => k.fixed && k.tokens.includes(id)) ?? null;
export const ownHome = (r: Role) => { const k = ownHomeCatalog(r.id); return k ? nameIn(k.name, uiLang()) : ""; };

/** The collection's groups take the place of the teams in every table that sorts, names or colours by team. */
export function applyGroups() {
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
export function syncOwnChrome() {
  applyWords();
  for (const el of $$(".coll-name")) el.textContent = nameIn(coll.name, uiLang());
  applyOwnTheme(); applyOwnBrand();
  renderLangButtons();
}

/** The collection's own words (its categories, lists and linked tokens), in each interface language: the app's texts say them. */
const WORD_KINDS: WordKind[] = ["group", "list", "linked"];
export function applyWords() {
  const words: Record<string, Partial<Record<WordKind, Word>>> = {};
  for (const lang of ["es", "en"]) {
    words[lang] = {};
    for (const k of WORD_KINDS) {
      const w = coll.words?.[k], one = w ? nameIn(w.one, lang).trim() : "", many = w ? nameIn(w.many, lang).trim() : "";
      if (one || many) words[lang][k] = { one: one || many, many: many || one, ...(lang === "es" ? { fem: !!w!.fem } : {}) };
    }
  }
  setOwnWords(words);
  applyStatic();
}
/** The settings' Names: each word's singular and plural (the app's as their placeholders), and in Spanish its gender. */
function renderWords() {
  const lang = uiLang();
  $("#osWords").innerHTML = WORD_KINDS.map((k) => {
    const w = coll.words?.[k], app = appWord(lang, k), fem = w ? !!w.fem : !!app.fem;
    return `<div class="os-word" data-word="${k}"><b>${esc(app.one.charAt(0).toUpperCase() + app.one.slice(1))}</b>
      <input class="text" data-part="one" value="${esc(w ? nameIn(w.one, lang) : "")}" placeholder="${esc(app.one)}" aria-label="${esc(t("own.wordOne"))}">
      <input class="text" data-part="many" value="${esc(w ? nameIn(w.many, lang) : "")}" placeholder="${esc(app.many)}" aria-label="${esc(t("own.wordMany"))}">
      ${lang === "es" ? `<select class="text" data-part="fem" aria-label="${esc(t("own.wordFem"))}"><option value="1"${fem ? " selected" : ""}>${esc(t("own.wordFem"))}</option><option value=""${fem ? "" : " selected"}>${esc(t("own.wordMasc"))}</option></select>` : ""}</div>`;
  }).join("");
}

/** After any change to the collection: keep it, redraw, and drop picks and designs of tokens that are gone. */
/** Saves the collection; if it doesn't fit, a notice at the top says so until a save fits again. */
function saveColl() {
  // one of the app's own: only your lists in it are kept (beside it)
  if (READONLY) { const ok = storeMyLists(OWN_ID!, coll.catalogs); stickyNotice("storage", ok ? null : t("own.storageFull")); return ok; }
  const ok = storeCollection(coll), full = !ok && !!OWN_ID && !builtIn(OWN_ID);
  stickyNotice("storage", full ? t("own.storageFull") : null);
  return ok;
}
function collectionChanged() {
  clearTimeout(ownTimer);
  saveColl();
  applyGroups();
  state.lib!.roles = ownRoles();
  const ids = new Set(coll.tokens.map((x) => x.id)), linkedOf = new Map(coll.tokens.map((x) => [x.id, x.linked.length]));
  const alive = (k: string) => { const [kind, id, i] = k.split(":"); return ids.has(id) && (kind !== "r" || +i < linkedOf.get(id)!); };
  for (const k of [...state.pick.keys()]) if (!alive(k)) state.pick.delete(k);
  for (const k of [...state.overrides.keys()]) if (!alive(k)) state.overrides.delete(k);
  persistPicks(); storeOverrides();
  const sel = state.sel && roleById(state.sel.role.id);
  state.sel = sel && alive(state.sel!.key) ? { ...state.sel!, role: sel } : { key: charKey(state.lib!.roles[0]), role: state.lib!.roles[0], reminder: null };
  syncOwnChrome();
  emit("all");
}

/** "all": every token, coins, cards and rings together. */
export const ownAllView = (view: string) => OWN && view === "all";
/** The shapes the collection's tokens have, in the app's order: an entry each, where there's more than one. */
export const shapesHere = () => SHAPES.filter((sh) => coll.tokens.some((x) => x.shape === sh));
export function renderOwnSpine() {
  if (!ownAllView(state.edition) && !catalogOf(state.edition) && !shapeOfView(state.edition)) state.edition = "all";
  const q = searchQuery(), lang = uiLang();
  const rolesOf = (ids: string[]) => ids.map(roleById).filter((r): r is Role => !!r);
  const sub = (roles: Role[], card: boolean) => card ? t("ed.countInfo", { n: roles.length }) : t("own.count", { n: roles.length, l: roles.reduce((n, r) => n + remindersOf(r).length, 0) });
  // everything the collection has at the top, then an entry per shape (where it has more than one)
  const entry = (ed: string, icon: string, name: string, roles: Role[], small: string) => `<button class="ed" type="button" data-ed="${ed}" aria-current="${state.edition === ed && !q}">${uiIcon(icon)}
      <span>${esc(name)}<small>${esc(small)}</small></span>${pickedBadge(roles)}</button>`;
  const shapes = shapesHere(), all = state.lib!.roles;
  $("#library").innerHTML = entry("all", "stack", t("own.everything"), all, t("own.everythingCount", { n: all.length }))
    + (shapes.length > 1 ? shapes.map((sh) => { const roles = all.filter((r) => tokenShape(r.id) === sh); return entry(`f:${sh}`, SHAPE_ICONS[sh], t(`type.${sh}.many`), roles, sub(roles, sh === "card")); }).join("") : "");
  // the lists: the collection's own first (a lock: they came with it), then yours; "+" makes one
  $("#editions").innerHTML = `<div class="spine-h spine-sec"><h2>${esc(t("own.lists"))}</h2><button class="spine-add" type="button" data-list-new title="${esc(t("own.newCatalog"))}" aria-label="${esc(t("own.newCatalog"))}">+</button></div>`
    + (coll.catalogs.map((k) => {
      const roles = rolesOf(k.tokens);
      return `<button class="ed" type="button" data-ed="k:${esc(k.id)}" aria-current="${state.edition === `k:${k.id}` && !q}">
        <span>${esc(nameIn(k.name, lang))}${k.fixed ? ` <i class="list-lock" title="${esc(t("own.listFixed"))}" aria-label="${esc(t("own.listFixed"))}">${LOCK}</i>` : ""}<small>${esc(sub(roles, false))}</small></span>${pickedBadge(roles)}</button>`;
    }).join("") || `<p class="scripts-empty">${esc(t("own.noCatalogs"))}</p>`);
}

/** A small padlock: a list that came with the collection (Clocktower: its editions). */
export const LOCK = `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7zm1.5 0h3V5a1.5 1.5 0 0 0-3 0z"/></svg>`;

// a list made or added to: a name, and optionally a list of tokens
let catTarget: { make: true } | { catalog: OwnCatalog } | null = null;
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
export function wireCollSwitch() {
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

export function wireOwn() {
  $("#editions").addEventListener("click", (e) => {
    const b = hit(e, "[data-list-new]"); if (!b) return;
    e.stopPropagation();
    openCatalogDialog({ make: true });
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
    if ("make" in catTarget!) {
      const name = $<HTMLInputElement>("#ownCatName").value.trim() || list.name || t("own.newCatalogName");
      const k = { id: newId("k"), name, tokens: list.ids };
      coll.catalogs.push(k); state.edition = `k:${k.id}`;
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
    if (k.fixed) return;
    coll.catalogs = coll.catalogs.filter((x) => x !== k); state.edition = "all"; collectionChanged();
  };
  // the same items in the top bar's menu and, on a phone, at the head of the drawer
  document.addEventListener("click", (e) => {
    const b = hit(e, "[data-coll]"); if (!b) return;
    const what = b.dataset.coll!;
    if (what !== "import") { openCollMenu(false); drawer(false); }
    if (what === "copy" && BUILT) {
      const n = $("#ownNote"); n.textContent = t("own.copying");
      void copyBuiltIn(BUILT.id, t("own.copyName", { name: nameIn(BUILT.name, uiLang()) })).then((id) => { if (id) location.href = collectionUrl(id); else n.textContent = t("own.storageFull"); });
      return;
    }
    if (what === "settings") goStep(4);
    if (what === "export") saveFile(new Blob([JSON.stringify(collectionFile(coll), null, 2)], { type: "application/json" }), `${nameIn(coll.name, "en").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "collection"}.json`);
    if (what === "import") $("#ownImportFile").click();
  });
  wireOwnSettings();
  $("#ownNewTok").onclick = () => newToken();
  setTimeout(() => void arriveToMake(), 0);   // once the sheet is up
  $<HTMLInputElement>("#ownImportFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    const noteEl = $("#ownNote");
    try {
      const next = await readCollectionFile(JSON.parse(await f.text()), (i, n) => { noteEl.textContent = t("own.importing", { i, n }); });
      if (!next.tokens.length) throw new Error("empty");
      const id = addCollection(next);   // a collection of its own, beside this one
      if (!id) { noteEl.textContent = t("own.storageFull"); return; }
      if (posthogEnabled) posthog.capture("collection_imported", {
        token_count: next.tokens.length,
        group_count: next.groups.length,
        list_count: next.catalogs.length,
      });
      location.href = collectionUrl(id);
    } catch { noteEl.textContent = t("own.importFailed"); if (PHONE.matches) alert(t("own.importFailed")); }   // the note is in the top bar menu, which a phone hides
  };
  wireOwnToken();
}

/** A colour's name: the app's filament's (Yellow and Gold are two, alike on a screen), else Bambu's PLA Basic one's, else its code. */
const colourName = (hex: string) => {
  const h = hex.toLowerCase(), f = FILAMENT_SLOTS.find((x) => x.hex === h), b = PLA_BASIC.find((x) => x.hex === h);
  return f ? t(`metal.${f.name.toLowerCase()}`) : b ? `${b.name[uiLang() === "es" ? "es" : "en"]} · Bambu PLA Basic` : hex;
};
/** The metal filaments: their swatches and dots have a sheen, so Gold isn't Yellow. */
const METAL = new Set(FILAMENT_SLOTS.filter((f) => ["Gold", "Silver", "Bronze"].includes(f.name)).map((f) => f.hex));
const metal = (hex: string) => (METAL.has(hex.toLowerCase()) ? " metal" : "");
/** The colours a group can have, as swatches named after their filaments; `data` is each one's attributes. */
/**
 * The colours: the app's filaments (the Bambu project prints them as they are), then Bambu's PLA
 * Basic ones. Its colour pressed (whatever its case); one not among them (a file's own, picked
 * elsewhere) is shown too, pressed, at the end; one that isn't the app's filament says which it prints in.
 */
const colourSwatches = (now: string | undefined, data: (hex: string) => string) => {
  const cur = now?.toLowerCase(), bambu = PLA_BASIC.map((b) => b.hex.toLowerCase());
  const known = (GROUP_COLOURS as string[]).includes(cur ?? "") || bambu.includes(cur ?? "");
  const sw = (c: string) => `<button type="button" class="swatch${metal(c)}" style="--c: ${c}" ${data(c)} aria-pressed="${c === cur}" aria-label="${esc(colourName(c))}" title="${esc(colourName(c))}"></button>`;
  return GROUP_COLOURS.map(sw).join("")
    + `<small class="sw-head">Bambu PLA Basic</small>` + bambu.map(sw).join("") + (cur && !known ? sw(cur) : "")
    + (cur && !isFilament(cur) ? `<small class="sw-note">${esc(t("metal.prints", { name: filamentName(slotOf(cur as Hex)) }))}</small>` : "");
};

/**
 * The settings' Categories, a line each: its colour (a dot: the swatches open under it), its name,
 * how many tokens it has, and Remove (its tokens go to another, said first); then a new one.
 */
function renderOwnGroups() {
  const lang = uiLang();
  $("#ownGroupList").innerHTML = coll.groups.map((g) => `<div class="own-group">
    <details class="og-colour"><summary class="og-dot${metal(g.colour)}" style="--c: ${g.colour}" title="${esc(colourName(g.colour))}" aria-label="${esc(t("own.colour"))}: ${esc(colourName(g.colour))}"></summary>
      <span class="own-swatches og-menu">${colourSwatches(g.colour, (c) => `data-colour="${c}" data-for="${esc(g.id)}"`)}</span></details>
    <input class="text" value="${esc(nameIn(g.name, lang))}" data-gname="${esc(g.id)}" aria-label="${esc(t("own.groupNameLabel"))}">
    <small>${esc(t("own.groupCount", { n: coll.tokens.filter((tk) => tk.group === g.id).length }))}</small>
    ${coll.groups.length > 1 ? `<button class="link" type="button" data-gdel="${esc(g.id)}">${esc(t("own.deleteGroup"))}</button>` : "<span></span>"}
  </div>`).join("");
}

// ------------------------------------------------------------ a token of yours: made and changed in the designer
//
// A token of your collection is made and changed where it's designed: "+ Token" makes one at once
// (and it opens there), each token's pen opens it there. Its Token tab has what it is (its shape,
// name, group, colour, catalogs, linked tokens); each face's Composition, what it carries (its
// text, icon and other state). Its changes are the collection's, kept at once (the sheet redrawn a
// moment later). A collection you can't change (Clocktower's, a closed one) has its tokens' text
// and icon as your own changes over it instead (overrides).

/** Your collection's tokens as characters. */
function ownRoles() { return collectionRoles(coll, uiLang()); }
/** After the tokens' own changes are known: a token changed for its print only (as a version did), the token's own now. */
export function refreshOwnRoles() {
  if (!OWN || !state.lib) return;
  foldPrintChanges();
  state.lib.roles = ownRoles();
}
function foldPrintChanges() {
  let changed = false;
  for (const [k, v] of state.overrides) {
    if (!v.token || !k.startsWith("c:")) continue;
    const tk = READONLY ? undefined : coll.tokens.find((x) => x.id === k.slice(2)), p = v.token as Record<string, unknown>;
    if (tk) for (const f of ["text", "icon", "content", "flip"] as const) {
      if (!(f in p)) continue;
      if (f === "icon") tk.icon = (p.icon as TokenIcon | null) ?? null;
      else if (p[f] == null) delete tk[f];
      else (tk as unknown as Record<string, unknown>)[f] = p[f];
    }
    const { token: _token, ...rest } = v;
    if (Object.keys(rest).length) state.overrides.set(k, rest); else state.overrides.delete(k);
    changed = true;
  }
  if (changed) { saveColl(); storeOverrides(); }
}
/** The token of yours open in the designer. */
const editingOwn = (): OwnToken | undefined => (inlineId ? coll.tokens.find((x) => x.id === inlineId) : undefined);
const shapeOfToken = (tk: OwnToken): TokenShape => tk.shape;
let ownTimer: ReturnType<typeof setTimeout> | number = 0;
/** After a change to a token's content (its name, icon, group…): drawn at once; your collection's is kept, and the sheet redrawn, a moment later. */
function ownEdited() {
  state.lib!.roles = ownRoles();
  if (state.sel) { const r = roleById(state.sel.role.id); if (r) state.sel = { ...state.sel, role: r }; }
  { const tk = editingOwn(); if (tk) { renderPanelContent(tk, shapeOfToken(tk)); if (inlineWhere === "token") renderPanelShape(tk, shapeOfToken(tk)); } }
  if (state.step === 2 && state.sel) { renderWorkshop(); renderDesignStage(); }
  clearTimeout(ownTimer); ownTimer = setTimeout(collectionChanged, 400);
}

/** The pen on one of your tokens (the sheet's): it opens where it's designed, on its Token tab. */
export function editOwnToken(id: string) {
  if (!coll.tokens.some((x) => x.id === id) || READONLY || isLocked(coll, id)) return;
  editToken(`c:${id}`);
  openPartTab("token");
}
/**
 * "+ Token": a token made at once, picked, and open in the designer on its Token tab, its name ready to
 * be written. Its shape is the sheet's type's, its group the one the sheet shows, and it goes in the
 * catalog open; "+ Another token" makes one like the token open (its shape, type, group, catalogs).
 */
export function newToken(like?: OwnToken, seed?: { name?: string; icon?: TokenIcon }) {
  if (READONLY) return;
  const here = catalogOf(state.edition), shape = like ? shapeOfToken(like) : shapeOfView(state.edition) ?? "coin";
  const group = like?.group ?? (state.team !== "all" && coll.groups.some((g) => g.id === state.team) ? state.team : coll.groups[0].id);
  const tk: OwnToken = { id: newId("t"), shape, group, name: seed?.name ?? t("own.newName"), icon: seed?.icon ?? null, linked: [], content: "both" };   // its icon and its name, while it has them
  coll.tokens.push(tk);
  // the first real token: the placeholder the collection started with goes, if it's still as it came
  const starter = coll.tokens.find(isUntouchedStarter);
  if (starter) {
    coll.tokens = coll.tokens.filter((x) => x !== starter);
    for (const k of coll.catalogs) k.tokens = k.tokens.filter((id) => id !== starter.id);
    setPick(`c:${starter.id}`, false);
  }
  for (const k of coll.catalogs.filter((x) => !x.fixed)) if (like ? k.tokens.includes(like.id) : k.id === here?.id) k.tokens.push(tk.id);
  collectionChanged();
  if (posthogEnabled) posthog.capture("token_created", {
    token_shape: shape,
    linked_token_count: tk.linked.length,
    has_flip_side: Boolean(tk.flip),
    create_another: !!like,
  });
  setPick(`c:${tk.id}`, true);
  emit("picks");
  editOwnToken(tk.id);
  setTimeout(() => { const f = $<HTMLInputElement>("#ownTokName"); f.focus(); f.select(); }, 60);   // once it has drawn: its name, to write over
}
/** The token whose fields are in the designer (its Token tab, or a face's Composition), and where. */
let inlineId: string | null = null, inlineWhere: "comp" | "token" = "comp";
/**
 * A token of yours in the designer: its fields in its Token tab (what it is) or in a face's Composition
 * (what it carries). Null puts them away, and the token is no longer being changed.
 */
export function showContentInline(id: string | null, where: "comp" | "token" = "comp") {
  if (!id || READONLY || isLocked(coll, id) || !coll.tokens.some((x) => x.id === id)) {
    if (inlineId) { inlineId = null; state.editing = null; $("#tpHome").append($("#tpFields")); }
    return;
  }
  const host = where === "token" ? $("#crTok") : $("#crOwn");
  if (inlineId === id && inlineWhere === where && $("#tpFields").parentElement === host) return;
  if (inlineId !== id) panelFor = "";
  inlineId = id; inlineWhere = where; state.editing = id;
  $("#tpFields").dataset.where = where;
  host.append($("#tpFields"));
  renderTokenPanel();
  if (where === "token") renderPanelShape(editingOwn()!, shapeOfToken(editingOwn()!));
}
/**
 * Come from the front page's "Make a token" (?nueva): the new token's panel, open at once; with the name
 * and icon tried there (&n, &i), if any. The address loses them, so a reload doesn't open it again.
 */
async function arriveToMake() {
  const q = new URLSearchParams(location.search);
  if (!q.has("nueva") || READONLY) return;
  history.replaceState(history.state, "", location.pathname + location.hash);
  const name = q.get("n")?.trim().slice(0, 40) || undefined, path = q.get("i");
  let icon: TokenIcon | undefined;
  if (path && /^[\w-]+\/[\w-]+$/.test(path)) try { icon = { ...(await gameIcon(path)), id: path }; } catch { /* offline: without it */ }
  newToken(undefined, { name, icon });
}
/** A token of yours as a character with another content (what it carries): drawn so in the designer's layouts. */
export function roleWithContent(id: string, content: TokenContent): Role | null {
  const tk = coll.tokens.find((x) => x.id === id);
  return tk ? ownRole(coll, { ...tk, content }, uiLang()) : null;
}
/** What a token of yours carries, chosen in the designer (its layouts): the token's, as "What it shows" in its content. */
export function setOwnContent(id: string, content: TokenContent) {
  const tk = coll.tokens.find((x) => x.id === id); if (!tk || tk.content === content) return;
  tk.content = content;
  panelFor = "";
  ownEdited();
  if (editingOwn() === tk) renderTokenPanel();   // its fields say so
}
/** Its shape, chosen on its Token tab: its type follows (one of that shape, made if the collection has none). */
function chooseShape(shape: TokenShape) {
  const tk = editingOwn(); if (!tk || shapeOfToken(tk) === shape) return;
  tk.shape = shape;
  state.part[shape] = "token";   // the designer keeps a tab for each shape: still here, on its Token tab
  panelFor = "";
  ownEdited(); renderTokenPanel();
}

/** The panel's fields are filled when another token (or shape, or language) opens, so typing in them isn't undone by a redraw. */
let panelFor = "";
function renderTokenPanel() {
  const tk = editingOwn(); if (!tk) return;
  const shape = shapeOfToken(tk);
  renderPanelContent(tk, shape);
  renderTokenColour(tk);
  const carries = contentNow(tk, shape);
  $("#ownTokIconRow").hidden = !SHAPE_FEATURES[shape].icon;
  // a piece prints no text (its name, in Token, names it in your lists)
  $("#ownTokText").closest<HTMLElement>("label")!.hidden = shape === "piece";
  $("#ownTokNameHint").hidden = shape === "piece" || (carries !== "icon" && carries !== "none");
  $("#ownTokNameHint").textContent = t(carries === "none" && shape === "coin" ? "own.content.plain" : "own.content.iconName");
  renderIconChip("ownTok", tk.icon, carries === "text" && tk.icon ? t("own.iconNotPrinted") : "", shape === "piece" ? t("piece.noIconHelp") : "");
  renderTextHint(tk);
  renderOwnFlip(tk);
  const sig = [tk.id, shape, tokenLang(), uiLang()].join("|");
  if (sig === panelFor) return;
  panelFor = sig;
  searchOpen.ownTok = searchOpen.ownTokFlip = false;
  renderIconChip("ownTok", tk.icon, contentNow(tk, shape) === "text" && tk.icon ? t("own.iconNotPrinted") : "", shape === "piece" ? t("piece.noIconHelp") : "");
  $<HTMLInputElement>("#ownTokName").value = nameIn(tk.name, tokenLang());
  $<HTMLInputElement>("#ownTokText").value = nameIn(tk.text ?? tk.name, tokenLang());   // what it says: its name until it says something else
  $<HTMLInputElement>("#ownTokIq").value = ""; $("#ownTokHits").innerHTML = "";
  renderGroupPills(tk);
  const openCats = coll.catalogs.filter((x) => !x.fixed), inCat = (k: OwnCatalog) => k.tokens.includes(tk.id);
  $("#ownTokCats").innerHTML = openCats.map((k) => `<label class="check"><input type="checkbox" value="${esc(k.id)}"${inCat(k) ? " checked" : ""}> ${esc(nameIn(k.name, uiLang()))}</label>`).join("") || `<p class="hint">${esc(t("own.noCatalogs"))}</p>`;
  $("#ownTokCatsRow").hidden = !openCats.length;   // no catalogs of yours yet: nothing to put it in
  renderOwnLinked(tk);
  $("#contentFlip").hidden = !SHAPE_FEATURES[shape].flip;
  $<HTMLInputElement>("#ownTokFlipName").value = tk.flip ? nameIn(tk.flip.name, tokenLang()) : "";
  for (const id of ["ownTokIq", "ownTokFlipIq"]) $<HTMLInputElement>(`#${id}`).value = "";
  $("#ownTokHits").innerHTML = $("#ownTokFlipHits").innerHTML = "";
  renderOwnFlip(tk);
}
/**
 * Its shape, on its Token tab: each drawn with the token in the collection's design for it (a shape
 * any of them, whatever the collection's other tokens are.
 */
function renderPanelShape(tk: OwnToken, shape: TokenShape) {
  const name = printedText(tk);
  const as = (sh: TokenShape) => ownRole(coll, { ...tk, shape: sh }, uiLang());
  $("#tpShape").innerHTML = `<div class="field"><span>${esc(t("own.shape"))}</span><div class="shape-cards" role="radiogroup" aria-label="${esc(t("own.shape"))}">${SHAPES.map((sh) => {
    const spec = designOf(sh, defaultRef(sh))!.spec;
    return `<button type="button" role="radio" data-shape="${sh}" aria-checked="${sh === shape}">${tokenSvg(state.lib!, as(sh), { ...filled(spec), lang: tokenLang(), diameter: 45, back: "none", backMode: "design" }, { text: name })}<span>${esc(t(`own.shape.${sh}`))}</span></button>`;
  }).join("")}</div></div>`;
}
/** What a shape's token can carry: a coin, its icon and name, either alone, or nothing (Plain); a card, with or without its icon; a ring or a base, its name. */
const CONTENTS: Record<TokenShape, TokenContent[]> = { coin: ["both", "icon", "text", "none"], card: ["both", "icon", "text"], ring: [], base: ["text", "none"], piece: [] };
/** What the token carries now: its own choice, else what its design's layout shows (an icon-only or text-only coin). */
function contentNow(tk: OwnToken, shape: TokenShape): TokenContent {
  const opts = CONTENTS[shape];
  if (shape === "coin") { const c = coinContent(tk); if (c && c !== tk.content) return c; }   // what it lacks, it doesn't carry
  if (tk.content === "icon" && !tk.icon && shape !== "base") return "text";   // its icon alone, without one: its name
  if (tk.content && opts.includes(tk.content)) return tk.content;
  const role = roleById(tk.id), look = role ? lookOf(charKey(role)) : null;
  if (shape === "card") return look?.cardIcon === "only" ? "icon" : !look?.cardIcon || look.cardIcon === "none" ? "text" : "both";
  if (shape === "base") return "text";
  if (shape === "piece") return "icon";
  const style = shape === "coin" ? look?.style : null;
  return style === "solo" ? "icon" : style === "text" ? "text" : "both";
}
/**
 * Whether its name is printed: unticked, its icon alone (a base: its tray alone). Its icon, there or
 * not, is the icon's field (Remove: its name alone), so a token without one prints its name. Only in
 * the dialog (a token being made) and on a base: in the designer, the layout chooses it.
 */
function renderPanelContent(tk: OwnToken, shape: TokenShape) {
  const box = $("#tpContent"), opts = CONTENTS[shape];
  // in the designer, a coin's Layout (Symbol only, Text only) and a card's icon place already choose it; a base has no layout
  box.hidden = opts.length < 2 || (inlineId != null && shape !== "base");
  if (box.hidden) { box.innerHTML = ""; return; }
  const now = contentNow(tk, shape), printed = now !== "icon" && now !== "none", locked = printed && shape !== "base" && !tk.icon;
  box.innerHTML = `<label class="check tp-print"><input type="checkbox" id="ownTokPrint"${printed ? " checked" : ""}${locked ? " disabled" : ""}> <span>${esc(t(shape === "base" ? "own.printNameBase" : "own.printName"))}</span></label>`;
}
/** What a token's front says: its text, else its name (else a stand-in, while it has neither). */
const printedText = (tk: OwnToken) => (tk.text != null ? nameIn(tk.text, tokenLang()).trim() : nameIn(tk.name, tokenLang()).trim() || t("own.namePlaceholder"));
/** The front's text field: its name, while it says nothing else (it follows the name as that's written). */
function renderTextHint(tk: OwnToken) {
  const field = $<HTMLInputElement>("#ownTokText");
  field.placeholder = "";
  if (tk.text == null && document.activeElement !== field) field.value = nameIn(tk.name, tokenLang());
}
/** What a token carries once its icon changes: none left, its name alone; one given to a token printing only its name, both. */
function contentWithIcon(tk: OwnToken, shape: TokenShape, icon: TokenIcon | null): TokenContent | undefined {
  const now = contentNow(tk, shape);
  if (!icon && (now === "icon" || now === "both")) return "text";
  if (icon && !tk.icon && now === "text") return "both";
  if (icon && !tk.icon && now === "none" && shape === "coin") return "icon";   // plain, an icon given: it shows
  return tk.content;
}
/**
 * The token's own colour, over its group's (what "the group's colour" is in its design): a menu with
 * the group's first, then the colours a group can have.
 */
function renderTokenColour(tk: OwnToken) {
  const usual = t("own.colourGroup");   // its group's, even a collection's only one (there's no colour of the collection's)
  $("#ownTokColourHelp").textContent = t("own.colourHelp");
  const group = coll.groups.find((g) => g.id === tk.group)?.colour ?? GROUP_COLOURS[0], now = tk.colour ?? group;
  $("#ownTokColour summary").innerHTML = `<i class="${metal(now).trim()}" style="--c: ${now}"></i><span>${esc(tk.colour ? colourName(tk.colour) : usual)}</span><b aria-hidden="true">▾</b>`;
  $("#ownTokColour .tok-colour-menu").innerHTML = `<button class="pill group-pill" type="button" data-tcolour="" aria-pressed="${!tk.colour}" style="--c: ${group}"><i class="${metal(group).trim()}"></i>${esc(usual)}</button>`
    + `<span class="own-swatches">${colourSwatches(tk.colour, (c) => `data-tcolour="${c}"`)}</span>`;
}
/** The groups as their colours, the token's pressed, and a new one. */
function renderGroupPills(tk: OwnToken) {
  $("#ownTokGroups").innerHTML = coll.groups.map((g) => `<button class="pill group-pill" type="button" data-group="${esc(g.id)}" aria-pressed="${g.id === tk.group}" style="--c: ${g.colour}"><i class="${metal(g.colour).trim()}"></i>${esc(nameIn(g.name, uiLang()))}</button>`).join("")
    + `<button class="pill" type="button" data-group-new>${esc(t("own.groupNew"))}</button>`;
  renderGroupEdit(tk);
}
/** The token's group, changed right here: its name and its colour (every token in it follows). */
function renderGroupEdit(tk: OwnToken) {
  const g = coll.groups.find((x) => x.id === tk.group);
  $("#ownTokGroupEdit").innerHTML = !g ? "" : `<input class="text" id="ownTokGroupName" value="${esc(nameIn(g.name, uiLang()))}" data-geid="${esc(g.id)}" aria-label="${esc(t("own.groupNameLabel"))}" autocomplete="off">`
    + `<span class="own-swatches">${colourSwatches(g.colour, (c) => `data-gcolour="${c}"`)}</span>`
    + `<small class="hint">${esc(t("own.groupEditHelp"))}</small>`;
}
function renderOwnLinked(tk: OwnToken) {
  const lang = tokenLang();
  $("#ownTokLinked").innerHTML = tk.linked.map((w, i) => `<span class="own-link"><input class="text" value="${esc(nameIn(w, lang))}" data-li="${i}" aria-label="${esc(t("own.linked"))}"><button class="link" type="button" data-ldel="${i}" aria-label="${esc(t("own.remove"))}">✕</button></span>`).join("");
}
/** The back: like the other tokens' (its design's, named), or its other state, with its name and icon. */
/** Its back: another state (switched on: its name and icon), or the design's (off). */
function renderOwnFlip(tk: OwnToken) {
  $<HTMLInputElement>("#ownTokFlipOn").checked = !!tk.flip;
  $("#ownTokFlipBox").hidden = !tk.flip;
  renderIconChip("ownTokFlip", tk.flip?.icon ?? null);
}
/** Its other state's name and icon, written straight in (the switch says whether it has one, not they). */
function setFlip(tk: OwnToken, change: Partial<OwnFlip>) {
  tk.flip = { name: tk.flip?.name ?? "", icon: tk.flip?.icon ?? null, ...change };
  renderOwnFlip(tk); ownEdited();
}
/** An other state switched off, kept a while: switched on again, it's back as it was. */
const flipsOff = new Map<string, OwnFlip>();
/** Whether an icon's search is open, the token's and its other state's. */
const searchOpen: Record<string, boolean> = { ownTok: false, ownTokFlip: false };
/** An icon as it's chosen: drawn, its name and where it's from, with Change (the search) and Remove; none, Choose. */
function renderIconChip(id: string, icon: TokenIcon | null | undefined, note = "", empty = "") {
  const open = searchOpen[id];
  $(`#${id}Search`).hidden = !open;
  // none, where one does something (a piece): what it would do, and the button to choose one
  if (!icon && empty) { $(`#${id}Chip`).innerHTML = `<div class="tp-chip-empty"><p>${esc(empty)}</p><button class="pill add main" type="button" data-icon-change>${esc(t(open ? "icon.done" : "icon.chooseOne"))}</button></div>`; return; }
  const name = icon ? icon.name || icon.id.split("/").pop() || "" : t("own.noIcon");
  const from = note || (icon ? t(icon.source === "upload" ? "icon.from.upload" : "icon.from.game") : "");
  $(`#${id}Chip`).innerHTML = `<span class="tp-chip-ic">${icon ? `<svg viewBox="0 0 ${ICON_VIEW} ${ICON_VIEW}" aria-hidden="true"><g transform="${safeTransform(icon.g)}">${safeIconMarkup(icon.body)}</g></svg>` : ""}</span>`
    + `<span class="tp-chip-txt"><b>${esc(name)}</b>${from ? `<small>${esc(from)}</small>` : ""}</span>`
    + `<span class="tp-chip-acts"><button class="link" type="button" data-icon-change>${esc(t(open ? "icon.done" : icon ? "icon.change" : "icon.choose"))}</button>${icon ? `<button class="link" type="button" data-icon-none>${esc(t("icon.remove"))}</button>` : ""}</span>`;
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
  // another like it (its shape, type, group, catalogs), made at once
  $("#ownTokAnother").onclick = () => { const tk = editingOwn(); if (tk) newToken(tk); };
  $("#tpShape").onclick = (e) => { const b = hit(e, "[data-shape]"); if (b) chooseShape(b.dataset.shape as TokenShape); };
  $("#tpContent").onchange = (e) => {
    const tk = editingOwn(); if (!tk) return;
    const shape = shapeOfToken(tk), on = input(e).checked;
    tk.content = on ? (shape === "base" || !tk.icon ? "text" : "both") : shape === "base" ? "none" : "icon";
    ownEdited(); renderTokenPanel();
  };
  $("#ownTokName").oninput = (e) => { const tk = editingOwn(); if (tk) { tk.name = withName(tk.name, tokenLang(), input(e).value); ownEdited(); renderTextHint(tk); } };
  // what its front says: its name until changed; emptied, nothing (not its name again)
  $("#ownTokText").oninput = (e) => {
    const tk = editingOwn(); if (!tk) return;
    const from = tk.text ?? tk.name, names = typeof from === "string" ? { en: from, es: from } : { ...from };
    tk.text = withName(names, tokenLang(), input(e).value);
    ownEdited();
  };
  // The token's icon and its other state's are chosen alike: game-icons.net, an SVG of yours, or none.
  const iconPicker = (id: string, set: (icon: TokenIcon | null) => void) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const chosen = (icon: TokenIcon | null) => { searchOpen[id] = false; set(icon); };
    $(`#${id}Chip`).onclick = (e) => {
      if (hit(e, "[data-icon-none]")) { chosen(null); return; }
      if (!hit(e, "[data-icon-change]")) return;
      searchOpen[id] = !searchOpen[id];
      const tk = editingOwn(); renderIconChip(id, id === "ownTok" ? tk?.icon : tk?.flip?.icon);
      if (searchOpen[id]) $(`#${id}Iq`).focus();
    };
    $(`#${id}Iq`).oninput = (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const query = input(e).value.trim();
        let hits: string[];
        try { hits = query ? await searchGameIcons(query, 48) : []; } catch { $(`#${id}Hits`).innerHTML = `<p class="hint warn">${esc(t("icon.searchFailed"))}</p>`; return; }
        if (input(e).value.trim() !== query) return;
        $(`#${id}Hits`).innerHTML = hits.map((p) => `<button type="button" class="icon-hit" data-gi="${esc(p)}" title="${esc(p.replace("/", " · "))}"><img src="${gameIconPreview(p)}" alt="" loading="lazy"><span>${esc(p.split("/")[1])}</span></button>`).join("")
          || (query ? `<p class="hint">${esc(t("icon.none"))}</p>` : "");
      }, 200);
    };
    $(`#${id}Hits`).onclick = async (e) => {
      const b = hit(e, "[data-gi]"); if (!b) return;
      try { chosen({ ...(await gameIcon(b.dataset.gi!)), id: b.dataset.gi! }); } catch { /* offline: keep the old one */ }
    };
    $<HTMLInputElement>(`#${id}Svg`).onchange = async (e) => {
      const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
      try { chosen({ ...iconFromSvg(await f.text(), { source: "upload", name: f.name }), id: `upload:${newId("i")}` }); }
      catch { $(`#${id}Hits`).innerHTML = `<p class="hint warn">${esc(t("own.svgFailed"))}</p>`; }
    };
  };
  iconPicker("ownTok", (icon) => {
    const tk = editingOwn(); if (!tk) return;
    const content = contentWithIcon(tk, shapeOfToken(tk), icon);
    tk.icon = icon; if (content) tk.content = content;
    ownEdited(); renderTokenPanel();
  });
  iconPicker("ownTokFlip", (icon) => { const tk = editingOwn(); if (tk) setFlip(tk, { icon }); });
  // its group, as the groups' colours, or a new one
  $("#ownTokGroups").onclick = (e) => {
    const tk = editingOwn(); if (!tk) return;
    const g = hit(e, "[data-group]");
    if (g) { tk.group = g.dataset.group!; renderGroupPills(tk); renderTokenColour(tk); ownEdited(); return; }
    if (hit(e, "[data-group-new]")) {
      const used = new Set(coll.groups.map((x) => x.colour)), id = newId("g");
      coll.groups.push({ id, name: t("own.groupName", { n: coll.groups.length + 1 }), colour: GROUP_COLOURS.find((c) => !used.has(c)) ?? GROUP_COLOURS[0] });
      tk.group = id;
      collectionChanged(); renderGroupPills(tk); renderTokenColour(tk);
      const name = $<HTMLInputElement>("#ownTokGroupName"); name.focus(); name.select();   // named at once
    }
  };
  // the token's group, renamed and recoloured where it's chosen
  const editedGroup = () => coll.groups.find((x) => x.id === $<HTMLInputElement>("#ownTokGroupName")?.dataset.geid);
  $("#ownTokGroupEdit").oninput = (e) => {
    const g = editedGroup(), name = input(e).value; if (!g || !name.trim()) return;
    g.name = withName(g.name, uiLang(), name.trim());
    const pill = $(`#ownTokGroups [data-group="${CSS.escape(g.id)}"]`);
    pill.lastChild!.textContent = name.trim();
    ownEdited();
  };
  $("#ownTokGroupEdit").onchange = (e) => {   // left empty: its name as it was
    const g = editedGroup(); if (g && !input(e).value.trim()) input(e).value = nameIn(g.name, uiLang());
  };
  $("#ownTokGroupEdit").onclick = (e) => {
    const tk = editingOwn(), g = editedGroup(), b = hit(e, "[data-gcolour]"); if (!tk || !g || !b) return;
    g.colour = b.dataset.gcolour as Hex;
    collectionChanged(); renderGroupPills(tk); renderTokenColour(tk); ownEdited();
  };
  // its own colour, or its group's
  $("#ownTokColour").onclick = (e) => {
    const tk = editingOwn(), b = hit(e, "[data-tcolour]"); if (!tk || !b) return;
    if (b.dataset.tcolour) tk.colour = b.dataset.tcolour; else delete tk.colour;
    $<HTMLDetailsElement>("#ownTokColour").open = false;
    renderTokenColour(tk); ownEdited();
  };
  $("#ownTokCats").onchange = (e) => {
    const tk = editingOwn(), id = input(e).value, k = coll.catalogs.find((x) => x.id === id && !x.fixed); if (!tk || !k) return;
    const on = input(e).checked;
    k.tokens = on ? [...k.tokens.filter((x) => x !== tk.id), tk.id] : k.tokens.filter((x) => x !== tk.id); ownEdited();
  };
  // the other state: added, named (in the token language, like the name) and taken out
  $("#ownTokFlipOn").onchange = (e) => {
    const tk = editingOwn(); if (!tk) return;
    if (input(e).checked) tk.flip = flipsOff.get(tk.id) ?? { name: "", icon: null };
    else if (tk.flip) { flipsOff.set(tk.id, tk.flip); delete tk.flip; }
    $<HTMLInputElement>("#ownTokFlipName").value = tk.flip ? nameIn(tk.flip.name, tokenLang()) : "";
    renderOwnFlip(tk); ownEdited();
    if (tk.flip && !nameIn(tk.flip.name, tokenLang())) $("#ownTokFlipName").focus();
  };
  $("#ownTokFlipName").oninput = (e) => { const tk = editingOwn(); if (tk) setFlip(tk, { name: withName(tk.flip?.name ?? "", tokenLang(), input(e).value) }); };
  // linked tokens: one more, renamed in place, or taken out (an empty one goes when you leave it)
  $("#ownTokAddLinked").onclick = () => {
    const tk = editingOwn(); if (!tk) return;
    tk.linked.push(""); renderOwnLinked(tk);
    $<HTMLInputElement>(`[data-li="${tk.linked.length - 1}"]`).focus();
  };
  $("#ownTokLinked").oninput = (e) => { const tk = editingOwn(), i = input(e).dataset.li; if (tk && i != null) { tk.linked[+i] = withName(tk.linked[+i], tokenLang(), input(e).value); ownEdited(); } };
  const dropAt = (tk: OwnToken, i: number) => { dropLinked(tk.id, i); tk.linked.splice(i, 1); renderOwnLinked(tk); ownEdited(); };
  $("#ownTokLinked").onclick = (e) => { const tk = editingOwn(), b = hit(e, "[data-ldel]"); if (tk && b) dropAt(tk, +b.dataset.ldel!); };
  $("#ownTokLinked").addEventListener("focusout", (e) => {
    const tk = editingOwn(), i = (e.target as HTMLElement).dataset.li;
    if (tk && i != null && !nameIn(tk.linked[+i], tokenLang()).trim()) dropAt(tk, +i);
  });
  $("#ownTokDelete").onclick = () => {
    const tk = editingOwn(); if (!tk) return;
    if (coll.tokens.length <= 1) { alert(t("own.lastToken")); return; }
    if (!confirm(t("own.deleteTokenConfirm", { name: nameIn(tk.name, tokenLang()) }))) return;
    coll.tokens = coll.tokens.filter((x) => x.id !== tk.id);
    for (const k of coll.catalogs) k.tokens = k.tokens.filter((x) => x !== tk.id);
    showContentInline(null);
    collectionChanged();   // its picks and own changes go with it
    toast(t("own.deleted", { name: nameIn(tk.name, tokenLang()) }));
    if (!state.pick.size) goStep(1); else { selectToken(sortKeys(state.pick.keys())[0]); renderWorkshop(); renderDesignStage(); }
  };
}

// ------------------------------------------------------------ the collection's own look, loading line and About

/** The collection's colours on the whole app: Clocktower's own stylesheet for "botc", else its theme's. */
export function applyOwnTheme() {
  const root = document.documentElement, th = coll.theme ?? "faber";
  // "botc" is the stylesheet's own colours: nothing to set
  const colours: OwnTheme | null = th === "botc" ? null : typeof th === "string" ? THEMES[th] ?? THEMES.faber : th;
  root.dataset.theme = th === "botc" ? "botc" : "";
  const vars: Partial<Record<string, string>> = colours ? themeVars(colours) : {};
  for (const k of THEME_VARS) {
    if (vars[k]) root.style.setProperty(k, vars[k]!); else root.style.removeProperty(k);
  }
  paintTesserae(root);
}

/** The collection's mark: its logo on the top bar, the loading screen and the tab, and its name beside it. */
export function applyOwnBrand() {
  const own = coll.brand?.logo, name = nameIn(coll.name, uiLang());
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

// ------------------------------------------------------------ a collection's settings: a page (?ajustes)
//
// What's changed there is seen at once (its name on the top bar, its colours, its logo) and kept on
// Save; Discard, or leaving and saying so, puts the collection back as it was.

/** What the settings change, as it was when opened or last saved. */
const SETTINGS_KEYS = ["name", "brand", "theme", "loader", "ccc", "about", "groups", "tokens", "words"] as const;   // a category taken out moves its tokens
let settingsWas = "";
const settingsNow = () => JSON.stringify(SETTINGS_KEYS.map((k) => coll[k] ?? null));
const settingsDirty = () => state.step === 4 && settingsNow() !== settingsWas;

/** The page's fields, from the collection. */
function fillSettings() {
  const lang = uiLang();
  $<HTMLImageElement>("#osLogo").src = coll.brand?.logo || APP_LOGO;
  $("#osLogoNote").textContent = "";
  $<HTMLInputElement>("#osName").value = nameIn(coll.name, lang);
  $<HTMLInputElement>("#osLoader").value = nameIn(coll.loader?.text, lang);
  $<HTMLInputElement>("#osCcc").checked = hasCcc(coll);
  $(".os-ccc").hidden = !hasCcc(coll);   // Clocktower's mark: only where a collection already carries it
  $<HTMLTextAreaElement>("#osAbout").value = nameIn(coll.about?.text, lang);
  renderAboutPreview();
  renderOwnThemes();
  renderOwnGroups();
  renderWords();
  renderSettingsState();
}
function renderAboutPreview() {
  $("#osAboutPreview").dataset.label = t("own.mdPreview");
  $("#osAboutPreview").innerHTML = markdown($<HTMLTextAreaElement>("#osAbout").value);
}
/** Save: there when something's changed; and what's been done. */
function renderSettingsState(saved = false) {
  const dirty = settingsDirty(), note = $("#osState");
  $<HTMLButtonElement>("#osSave").disabled = !dirty;
  $<HTMLButtonElement>("#osCancel").hidden = !dirty;
  note.textContent = dirty ? t("own.unsaved") : saved ? t("own.saved") : "";
  note.toggleAttribute("data-dirty", dirty);
}
/** The collection as it was when the page opened (or was last saved), seen so again. */
function discardSettings() {
  const was = JSON.parse(settingsWas) as unknown[];
  SETTINGS_KEYS.forEach((k, i) => { if (was[i] == null) delete coll[k]; else (coll as unknown as Record<string, unknown>)[k] = was[i]; });
  applyOwnTheme(); applyOwnBrand(); applyGroups(); applyWords();
  if (state.step === 4) fillSettings();
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
  // the page is step 4 (src/app/queue.ts): there for a collection of yours
  settingsStep.can = () => !!OWN && !READONLY;
  settingsStep.enter = () => {
    if (ownTimer) collectionChanged();   // a token's change still waiting is kept first, not with these
    settingsWas = settingsNow();
    fillSettings();
  };
  settingsStep.leave = () => {
    if (!settingsDirty()) return true;
    if (!confirm(t("own.discardAsk"))) return false;
    discardSettings();
    return true;
  };
  addEventListener("beforeunload", (e) => { if (settingsDirty()) e.preventDefault(); });
  const changed = () => renderSettingsState();
  // its tabs
  $(".sp-tabs").onclick = (e) => {
    const b = hit(e, "[data-sp-tab]"); if (!b) return;
    for (const x of $$("[data-sp-tab]")) x.setAttribute("aria-selected", String(x === b));
    for (const p of $$("[data-sp]")) p.hidden = p.dataset.sp !== b.dataset.spTab;
  };
  // its name: on the top bar and the tab as it's written (empty: the one it had)
  $("#osName").oninput = (e) => {
    const v = input(e).value.trim(); if (!v) return;
    coll.name = withName(coll.name, uiLang(), v); applyOwnBrand(); changed();
  };
  $("#osName").onchange = (e) => { if (!input(e).value.trim()) input(e).value = nameIn(coll.name, uiLang()); };
  $("#osThemes").onclick = (e) => {
    const b = hit(e, "[data-theme-id]"); if (!b) return;
    const id = b.dataset.themeId!;
    if (id === "custom") { const cur = coll.theme ?? "faber"; coll.theme = { ...(typeof cur === "object" ? cur : THEMES[cur] ?? THEMES.faber!) }; }
    else coll.theme = id;
    applyOwnTheme(); renderOwnThemes(); changed();
  };
  $("#osCustom").oninput = () => {
    if (typeof coll.theme !== "object") return;
    for (const k of ["accent", "background", "surface", "text", "muted"] as const) coll.theme[k] = $<HTMLInputElement>(`#os-${k}`).value as Hex;
    coll.theme.glow = coll.theme.surface;
    coll.theme.font = $<HTMLSelectElement>("#osFont").value;
    applyOwnTheme(); changed();
  };
  $<HTMLInputElement>("#osLogoFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
    if (!okLogo(url)) { $("#osLogoNote").textContent = t("own.logoTooBig"); return; }
    coll.brand = { ...coll.brand, logo: url }; applyOwnBrand();
    $<HTMLImageElement>("#osLogo").src = url; $("#osLogoNote").textContent = ""; changed();
  };
  $("#osLogoReset").onclick = () => {
    if (coll.brand) { delete coll.brand.logo; if (!Object.keys(coll.brand).length) delete coll.brand; }
    applyOwnBrand(); $<HTMLImageElement>("#osLogo").src = APP_LOGO; changed();
  };
  $("#osLoader").oninput = (e) => {
    const v = input(e).value.trim();
    coll.loader = { ...coll.loader, text: withName(coll.loader?.text ?? "", uiLang(), v) };
    delete coll.loader.ccc;   // the mark has its own field now
    if (!v) delete coll.loader.text;
    if (!Object.keys(coll.loader).length) delete coll.loader;
    changed();
  };
  $("#osCcc").onchange = (e) => { if (input(e).checked) coll.ccc = true; else delete coll.ccc; changed(); };
  // About: written, and read beside it as it is
  $("#osAbout").oninput = (e) => {
    const about = foldAbout({ text: withName(coll.about?.text ?? "", uiLang(), input(e).value.trim()) });   // its other languages' as they were
    if (about) coll.about = about; else delete coll.about;
    renderAboutPreview(); changed();
  };
  $(".md-tabs").onclick = (e) => {
    const b = hit(e, "[data-md]"); if (!b) return;
    const show = b.dataset.md === "preview";
    $("#osAboutEdit").classList.toggle("show-preview", show);
    for (const x of $$(".md-tabs [data-md]")) x.setAttribute("aria-pressed", String((x.dataset.md === "preview") === show));
  };
  // its categories: named, coloured, made, taken out (its tokens to the first other one, said first)
  const groupsChanged = () => { applyGroups(); renderOwnGroups(); changed(); };
  $("#ownGroupAdd").onclick = () => {
    const used = new Set(coll.groups.map((g) => g.colour));
    coll.groups.push({ id: newId("g"), name: t("own.groupName", { n: coll.groups.length + 1 }), colour: GROUP_COLOURS.find((c) => !used.has(c)) ?? GROUP_COLOURS[0] });
    groupsChanged();
    $<HTMLInputElement>("#ownGroupList .own-group:last-child input").select();
  };
  $("#ownGroupList").onclick = (e) => {
    const sw = hit(e, "[data-colour]"), del = hit(e, "[data-gdel]");
    if (sw) { coll.groups.find((g) => g.id === sw.dataset.for)!.colour = sw.dataset.colour as Hex; groupsChanged(); }
    if (del) {
      const id = del.dataset.gdel!, g = coll.groups.find((x) => x.id === id)!, to = coll.groups.find((x) => x.id !== id)!;
      const n = coll.tokens.filter((tk) => tk.group === id).length, lang = uiLang();
      if (n && !confirm(t("own.deleteGroupAsk", { name: nameIn(g.name, lang), n, to: nameIn(to.name, lang) }))) return;
      coll.tokens.forEach((tk) => { if (tk.group === id) tk.group = to.id; });
      coll.groups = coll.groups.filter((x) => x.id !== id); groupsChanged();
    }
  };
  // a category's swatches: one open at a time, closed by a click elsewhere
  document.addEventListener("click", (e) => {
    for (const d of $$<HTMLDetailsElement>("#ownGroupList .og-colour[open]")) if (!d.contains(e.target as Node)) d.open = false;
  });
  $("#ownGroupList").addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.open) for (const x of $$<HTMLDetailsElement>("#ownGroupList .og-colour[open]")) if (x !== d) x.open = false;
  }, true);
  $("#ownGroupList").oninput = (e) => {
    const el = e.target as HTMLInputElement, g = coll.groups.find((x) => x.id === el.dataset.gname); if (!g || !el.value.trim()) return;
    g.name = withName(g.name, uiLang(), el.value.trim()); applyGroups(); changed();
  };
  // its names for the app's words: as they're written, the app says them
  const wordChanged = (e: Event) => {
    const el = e.target as HTMLInputElement, row = el.closest<HTMLElement>("[data-word]"); if (!row) return;
    const k = row.dataset.word as WordKind, lang = uiLang(), part = el.dataset.part as "one" | "many" | "fem";
    const w: OwnWord = { one: "", many: "", ...coll.words?.[k] };
    if (part === "fem") w.fem = el.value === "1"; else w[part] = withName(w[part], lang, el.value.trim());
    const written = [w.one, w.many].some((n) => (typeof n === "string" ? n : Object.values(n).join("")).trim());
    const words: OwnWords = { ...coll.words };
    if (written) words[k] = w; else Reflect.deleteProperty(words, k);   // nothing written: the app's
    if (Object.keys(words).length) coll.words = words; else Reflect.deleteProperty(coll, "words");
    applyWords(); renderOwnGroups(); changed();
  };
  $("#osWords").oninput = wordChanged;
  $("#osWords").onchange = wordChanged;
  $("#osSave").onclick = () => {
    collectionChanged();
    settingsWas = settingsNow();
    renderSettingsState(true);
  };
  $("#osCancel").onclick = () => { discardSettings(); renderSettingsState(); };
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
/** The front page's honeycomb of tokens, drawn once by the engine (tools/make-crear-art.mjs) in Spanish and in
 *  English: the one in the interface's language, inline, so its cells can be laid in turn. Again when the language changes. */
export function drawOwnComb() {
  const file = uiLang().startsWith("es") ? "/crear-hero.svg" : "/crear-hero-en.svg";
  fetch(file).then((r) => (r.ok ? r.text() : "")).then((svg) => { $("#ownComb").innerHTML = svg; $("#ownComb").classList.add("play"); }).catch(() => {});
}
/** The front page (/): what the app is, the ways in, and back to the last collection you had open. */
export async function renderOwnLanding() {
  showOwnPage("ownLanding");
  // the walk through what the app does, below the fold: its own module (three.js, the collections' tokens)
  void import("./landing-tour.ts").then((m) => m.startTour());
  drawOwnComb();
  const last = lastCollection(), lang = uiLang();
  if (!last) return;
  const { built, mine } = await collectionsByKind();
  const b = built.find((x) => x.b.id === last), m = mine.find((x) => x.id === last);
  const name = m?.name ?? (b ? nameIn(b.b.name, lang) : undefined), logo = m?.logo ?? b?.kept?.logo ?? b?.b.logo;
  if (!name) return;
  const r = $<HTMLAnchorElement>("#ownResume");
  r.href = openUrl(last, built.map((x) => x.b)); r.hidden = false;
  r.querySelector("img")!.src = logo || APP_LOGO_SMALL;
  r.querySelector("b")!.textContent = name;
  void lang;
}
/** /colecciones: the app's collections as covers, yours as a working list. */
export async function renderOwnHome() {
  showOwnPage("ownHome");
  if (OWN_VIEW !== "list") history.replaceState(null, "", LIST_URL);   // a collection that isn't there: its list
  const { built, mine } = await collectionsByKind(), lang = uiLang();
  const when = (ms: number) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(ms);
  const exp = (id: string) => `<button class="link" type="button" data-oh-export="${esc(id)}">${esc(t("own.export"))}</button>`;
  $("#ownHomeBuilt").innerHTML = built.map(({ b }) => `<article class="oh-cover" style="--acc:${esc(b.accent ?? "#c9963a")}${b.cover ? `;--cover:${esc(b.cover)}` : ""}">
      <a class="oh-cover-link" href="${b.href ?? collectionUrl(b.id)}">
        <span class="who"><img src="${esc(b.logo ?? APP_LOGO)}" alt=""><span><h3>${esc(nameIn(b.name, lang))}</h3><p>${esc(nameIn(b.text, lang))}</p></span></span>
        ${b.preview ? `<img class="strip" src="${esc(nameIn(b.preview, lang))}" alt="">` : ""}
        <span class="go"><span class="forge">${esc(t("own.open"))}</span>
          ${b.ccc ? `<img class="oh-ccc" src="/ccc-sleeve.png" alt="Community Created Content" width="172" height="68">` : ""}
          ${b.mark ? `<img class="oh-ccc oh-mark${b.mark.invert ? " invert" : ""}" src="${esc(b.mark.src)}" alt="${esc(b.mark.alt)}">` : ""}</span>
      </a>
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
  for (const b of $$("[data-own-new]")) b.onclick = () => { const id = addCollection(starterCollection(uiLang())); if (id) location.href = collectionUrl(id); else note("own.storageFull"); };
  // a token first, no collection to think of: it goes in the one you were last in, or in a new "My tokens"
  for (const b of $$("[data-tok-new]")) b.onclick = () => {
    const last = lastCollection(), mine = last && !builtIn(last) && listCollections().some((c) => c.id === last) ? last : null;
    const id = mine ?? addCollection({ ...starterCollection(uiLang()), name: t("own.quickName") });
    if (!id) { note("own.storageFull"); return; }
    const q = new URLSearchParams({ nueva: "" });
    if (b.dataset.tokNew === "maker") {   // the one tried on the front page
      const n = $<HTMLInputElement>("#tourName").value.trim(), i = $("#tourIcons [aria-pressed=true]")?.getAttribute("data-icon");
      if (n) q.set("n", n);
      if (i) q.set("i", i);
    }
    location.href = `${collectionUrl(id)}?${q}`;
  };
  $("#ownHomeImport").onclick = () => $("#ownHomeFile").click();
  $<HTMLInputElement>("#ownHomeFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    try {
      const c = await readCollectionFile(JSON.parse(await f.text()), (i, n) => note("own.importing", { i, n }));
      if (!c.tokens.length) throw new Error("empty");
      const id = addCollection(c);
      if (id) location.href = collectionUrl(id); else note("own.storageFull");
    } catch { note("own.importFailed"); }
  };
  $("#ownHome").onclick = (e) => {
    const ex = hit(e, "[data-oh-export]"), del = hit(e, "[data-oh-delete]"), cp = hit(e, "[data-oh-copy]");
    if (cp) {
      const b = builtIn(cp.dataset.ohCopy!); if (!b) return;
      cp.textContent = t("own.copying"); (cp as HTMLButtonElement).disabled = true;
      void copyBuiltIn(b.id, t("own.copyName", { name: nameIn(b.name, uiLang()) })).then((id) => { if (id) location.href = collectionUrl(id); else { note("own.storageFull"); renderOwnHome(); } });
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
