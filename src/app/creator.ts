// Collections of your own: the creator, a token's panel, the collection's look and the list.
import { emit } from "./events.ts";
import { paintTesserae } from "./tesserae.ts";
import { OWN, catalogsOf, nameIn, storeCollection, OWN_ID, builtIn, tallerUrl, readTokenList, newId, withName, copyBuiltIn, collectionUrl, collectionFile, readCollectionFile, addCollection, GROUP_COLOURS, SHAPES, collectionRoles, tokenRole as ownRole, isLocked, THEMES, APP_LOGO, APP_LOGO_SMALL, APP_ICON, APP_NAME, hasCcc, THEME_FONTS, okLogo, builtInCollections, listCollections, lastCollection, openUrl, OWN_VIEW, LIST_URL, starterCollection, loadCollection, deleteCollection, isUntouchedStarter } from "../collection.ts";
import type { OwnCatalog, OwnSection, OwnToken, OwnTheme, CollectionEntry } from "../collection.ts";
import { coll, TEAM_ORDER, TEAM_PLURAL, PLATE_LABEL, PLATE_GROUP, $$, stickyNotice, state, $, esc, READONLY, hit, input, BUILT, COLOUR_CHOICES } from "./context.ts";
import type { Creating } from "./context.ts";
import type { Role, Team, Hex, TokenShape, TokenIcon, TokenContent } from "../types.ts";
import { uiLang, t } from "../i18n.ts";
import { PRINT_GROUPS, persistPicks, renderDesignStage, setPick, goStep } from "./queue.ts";
import { TEAMS, saveFile, SHAPE_FEATURES, tokenSvg, shapeOf, ICON_VIEW } from "../engine/token-engine.ts";
import { safeIconMarkup, safeTransform } from "../engine/safe-svg.ts";
import { UI_ICONS, TEAM_ICONS, uiIcon, SHAPE_ICONS } from "../ui-icons.ts";
import { renderLangButtons, closeOnBackdrop, tokenLang } from "./token-language.ts";
import { storeOverrides, designOf, defaultRef, designFor, designOverridden, lookOf } from "./designs.ts";
import { roleById } from "./wiring.ts";
import { charKey, remindersOf, specFor, remKey, sortKeys } from "./tokens.ts";
import { searchQuery, pickedBadge, selectToken } from "./sheet.ts";
import { rememberReturn, toast } from "./design-sheet.ts";
import { drawer, PHONE } from "./scripts-ui.ts";
import { renderWorkshop } from "./workshop.ts";
import { filled } from "./looks.ts";
import { searchGameIcons, gameIconPreview, gameIcon, iconFromSvg } from "../icons.ts";

// ------------------------------------------------------------ Tesserae Faber, the generic creator
//
// Your own collection (collection.ts) stands in for Clocktower's library: each token is a
// character whose team is its colour group and whose reminders are its linked tokens. The
// sidebar has a fixed entry per type ("t:<id>", like "All characters" and "Grimoire"), then the
// sections with their catalogs ("k:<id>", like the editions and scripts). Everything after
// picking (design, queue, print) is the same app.

export const catalogOf = (view: string | null | undefined): OwnCatalog | null =>
  (OWN && view?.startsWith("k:") ? catalogsOf(coll).find(({ k }) => k.id === view.slice(2))?.k ?? null : null);
export const typeOfView = (view: string | null | undefined) => (OWN && view?.startsWith("t:") ? coll.types.find((x) => x.id === view.slice(2)) ?? null : null);
export const typeOfToken = (id: string) => coll.tokens.find((x) => x.id === id)?.type;
/** The closed catalog a token came in ("Trouble Brewing"), shown under its name like an edition. */
export const ownHomeCatalog = (id: string) => coll.sections.find((s) => !s.open && s.catalogs.some((k) => k.tokens.includes(id)))?.catalogs.find((k) => k.tokens.includes(id)) ?? null;
export const ownHome = (r: Role) => { const k = ownHomeCatalog(r.id); return k ? nameIn(k.name, uiLang()) : ""; };
const sectionOf = (k: OwnCatalog) => coll.sections.find((s) => s.catalogs.includes(k))!;

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
  for (const el of $$(".coll-name")) el.textContent = nameIn(coll.brand?.title, uiLang()) || nameIn(coll.name, uiLang());
  applyOwnTheme(); applyOwnBrand();
  renderLangButtons();
}

/** After any change to the collection: keep it, redraw, and drop picks and designs of tokens that are gone. */
/** Saves the collection; if it doesn't fit, a notice at the top says so until a save fits again. */
function saveColl() {
  const ok = storeCollection(coll), full = !ok && !!OWN_ID && !builtIn(OWN_ID);
  stickyNotice("storage", full ? t("own.storageFull") : null);
  return ok;
}
function collectionChanged() {
  clearTimeout(ownTimer);
  saveColl();
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
  emit("all");
}

/** "all" in a collection of more than one type: every token, coins, cards and rings together. */
export const ownAllView = (view: string) => OWN && view === "all" && coll.types.length > 1;
export function renderOwnSpine() {
  if (!ownAllView(state.edition) && !catalogOf(state.edition) && !typeOfView(state.edition)) state.edition = `t:${coll.types[0].id}`;
  const q = searchQuery(), lang = uiLang();
  const rolesOf = (ids: string[]) => ids.map(roleById).filter((r): r is Role => !!r);
  const sub = (roles: Role[], card: boolean) => card ? t("ed.countInfo", { n: roles.length }) : t("own.count", { n: roles.length, l: roles.reduce((n, r) => n + remindersOf(r).length, 0) });
  // everything the collection has, of every type, at the top: where there's more than one type
  const everything = coll.types.length > 1 ? `<button class="ed" type="button" data-ed="all" aria-current="${state.edition === "all" && !q}">${uiIcon("stack")}
      <span>${esc(t("own.everything"))}<small>${esc(t("own.everythingCount", { n: state.lib!.roles.length }))}</small></span>${pickedBadge(state.lib!.roles)}</button>` : "";
  $("#library").innerHTML = everything + coll.types.map((ty) => {
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
      void copyBuiltIn(BUILT.id, t("own.copyName", { name: nameIn(BUILT.name, uiLang()) })).then((id) => { if (id) location.href = collectionUrl(id); else n.textContent = t("own.storageFull"); });
      return;
    }
    if (what === "settings") openOwnSettings();
    if (what === "groups") { renderOwnGroups(); $<HTMLDialogElement>("#ownGroupsDlg").showModal(); }
    if (what === "export") saveFile(new Blob([JSON.stringify(collectionFile(coll), null, 2)], { type: "application/json" }), `${nameIn(coll.name, "en").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "collection"}.json`);
    if (what === "import") $("#ownImportFile").click();
  });
  wireOwnSettings();
  $("#ownNewTok").onclick = () => startCreate();
  setTimeout(() => void arriveToMake(), 0);   // once the sheet is up
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
  { const tk = editingOwn(); if (tk) renderPanelContent(tk, shapeOfToken(tk)); }
  renderPanelToken();
  if (state.step === 2 && state.sel) { renderWorkshop(); renderDesignStage(); }
  if (!state.creating) { clearTimeout(ownTimer); ownTimer = setTimeout(collectionChanged, 400); }
}

/** "Edit" on one of your tokens (the sheet's, or the design step's "Edit content"): its panel. */
export function openTokenPanel(id: string) {
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
function startCreate(like?: { shape: TokenShape; type: string; group: string; cats: string[] }, seed?: { name?: string; icon?: TokenIcon; content?: TokenContent }) {
  dropDraft();
  state.editing = null;
  const here = catalogOf(state.edition), shape = like?.shape ?? typeOfView(state.edition)?.shape ?? "coin";
  const group = like?.group ?? (state.team !== "all" && coll.groups.some((g) => g.id === state.team) ? state.team : coll.groups[0].id);
  const draft: OwnToken = { id: newId("t"), type: like?.type ?? typeFor(shape), group, name: seed?.name ?? "", icon: seed?.icon ?? null, linked: [], content: seed?.content ?? "both" };   // a new token shows its icon and its name until told otherwise, whatever the design
  state.creating = { draft, shape, cats: like?.cats ?? (here ? [here.id] : []) };
  state.lib!.roles = ownRoles();
  panelFor = "";
  if (!like) $("#tpFlash").textContent = "";
  renderTokenPanel();
  showTokenPanel();
  setTimeout(() => $("#ownTokName").focus(), 60);   // once the panel has drawn
}
function showTokenPanel() {
  // the fields are the dialog's again (the designer's Content may have had them)
  inlineId = null; $(".tp-body").append($("#tpFields"));
  const d = $<HTMLDialogElement>("#tokenPanel"); if (!d.open) d.showModal();
}
/** The token whose content is open in the designer (Content), its fields there; null when they're the dialog's. */
let inlineId: string | null = null;
/**
 * A token of yours in the designer: its content's fields inside Content (the token large beside them,
 * the menu a step away), not a dialog over it. Null puts them back, and the token is no longer being changed.
 */
export function showContentInline(id: string | null) {
  if ($<HTMLDialogElement>("#tokenPanel").open) return;   // the dialog has them (a token being made, or Edit from the list)
  if (!id || READONLY || isLocked(coll, id) || !coll.tokens.some((x) => x.id === id)) {
    if (inlineId) { inlineId = null; state.editing = null; $(".tp-body").append($("#tpFields")); }
    return;
  }
  if (inlineId === id) return;
  dropDraft();
  inlineId = id; state.editing = id; panelFor = "";
  $("#crOwn").append($("#tpFields"));
  renderTokenPanel();
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
  startCreate(undefined, { name, icon });
}
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
  else if (made) emit("looks");
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
  if (contentNow(d, c.shape) === "icon" && !d.icon) { $("#tpFlash").textContent = t("create.needIcon"); $("#ownTokIq").focus(); return; }
  const flip = SHAPE_FEATURES[c.shape].flip ? d.flip : undefined;
  if (flip && !nameIn(flip.name, lang).trim()) { $("#tpFlash").textContent = t("create.needFlipName"); $("#ownTokFlipName").focus(); return; }
  let type = coll.types.find((x) => x.id === d.type && x.shape === c.shape);
  if (!type) { const name = t(`type.${c.shape}.many`); type = { id: newId("y"), name, title: name, shape: c.shape }; coll.types.push(type); }
  const { flip: _flip, ...rest } = d;
  const tk: OwnToken = { ...rest, type: type.id, linked: d.linked.filter((w) => nameIn(w, lang).trim()), ...(flip ? { flip } : {}) };
  coll.tokens.push(tk);
  // the first real token: the placeholder the collection started with goes, if it's still as it came
  const starter = coll.tokens.find(isUntouchedStarter);
  if (starter) {
    coll.tokens = coll.tokens.filter((x) => x !== starter);
    for (const k of coll.sections.flatMap((x) => x.catalogs)) k.tokens = k.tokens.filter((id) => id !== starter.id);
    setPick(`c:${starter.id}`, false);
  }
  for (const k of coll.sections.filter((x) => x.open).flatMap((x) => x.catalogs)) if (c.cats.includes(k.id)) k.tokens.push(tk.id);
  const key = `c:${tk.id}`, name = nameIn(tk.name, lang);
  state.creating = null;
  collectionChanged();
  setPick(key, true); tk.linked.forEach((_, i) => setPick(`r:${tk.id}:${i}`, true));
  emit("picks");
  if (more) { startCreate({ shape: c.shape, type: type.id, group: tk.group, cats: c.cats }, { content: tk.content }); $("#tpFlash").textContent = t("create.doneMore", { name }); return; }
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
  renderPanelContent(tk, shape);
  renderPanelToken();
  renderTokenColour(tk);
  const carries = contentNow(tk, shape);
  $("#ownTokIconRow").hidden = !SHAPE_FEATURES[shape].icon || carries === "text";
  $("#ownTokNameHint").hidden = carries !== "icon";
  renderIconChip("ownTok", tk.icon);
  renderOwnFlip(tk);
  const sig = [tk.id, shape, tokenLang(), uiLang()].join("|");
  if (sig === panelFor) return;
  panelFor = sig;
  // the rest opens by itself only on a token that already uses it
  $<HTMLDetailsElement>("#tpMoreOpts").open = !!(tk.linked.length || tk.colour);
  // a new token without an icon: the search open, to choose one
  searchOpen.ownTok = !!c && !tk.icon; searchOpen.ownTokFlip = false;
  renderIconChip("ownTok", tk.icon);
  $<HTMLInputElement>("#ownTokName").value = nameIn(tk.name, tokenLang());
  $<HTMLInputElement>("#ownTokIq").value = ""; $("#ownTokHits").innerHTML = "";
  renderGroupPills(tk);
  $("#ownTokGroupRow").hidden = coll.groups.length < 2;   // one group (a new collection's): nothing to choose, nor to explain yet
  const openCats = coll.sections.filter((x) => x.open).flatMap((x) => x.catalogs), inCat = (k: OwnCatalog) => (c ? c.cats.includes(k.id) : k.tokens.includes(tk.id));
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
 * Its shape. A token being made chooses it, each shape drawn with the token in its default design;
 * one the collection doesn't use yet makes its type when the token is created. A token's shape is
 * its type's, said, with the other types of that shape when there are some to move it to.
 */
function renderPanelShape(tk: OwnToken, shape: TokenShape) {
  const c = state.creating, types = coll.types.filter((x) => x.shape === shape);
  const typePick = types.length > 1 ? `<label class="field tp-type"><span>${esc(t("own.type"))}</span><select class="text" data-type-pick>${types.map((x) => `<option value="${esc(x.id)}"${x.id === tk.type ? " selected" : ""}>${esc(nameIn(x.name, uiLang()))}</option>`).join("")}</select></label>` : "";
  if (!c) {
    $("#tpShape").innerHTML = typePick;
    $("#tpShape").hidden = !typePick;
    return;
  }
  const name = nameIn(c.draft.name, tokenLang()).trim() || t("own.namePlaceholder");
  $("#tpShape").hidden = false;
  $("#tpShape").innerHTML = `<div class="field"><span>${esc(t("own.shape"))}</span><div class="shape-cards" role="radiogroup" aria-label="${esc(t("own.shape"))}">${SHAPES.map((sh) => {
    const r = draftRole(c, sh), spec = designOf(sh, defaultRef(sh))!.spec;
    return `<button type="button" role="radio" data-shape="${sh}" aria-checked="${sh === c.shape}">${tokenSvg(state.lib!, r, { ...filled(spec), lang: tokenLang(), diameter: 45, back: "none", backMode: "design" }, { text: name })}<span>${esc(t(`own.shape.${sh}`))}</span></button>`;
  }).join("")}</div></div>${typePick}`;
}
/** What a shape's token can carry: a coin, its icon and name, either alone; a card, with or without its icon; a ring or a base, its name. */
const CONTENTS: Record<TokenShape, TokenContent[]> = { coin: ["both", "icon", "text"], card: ["both", "icon", "text"], ring: [], base: [] };
/** What the token carries now: its own choice, else what its design's layout shows (an icon-only or text-only coin). */
function contentNow(tk: OwnToken, shape: TokenShape): TokenContent {
  const opts = CONTENTS[shape];
  if (tk.content && opts.includes(tk.content)) return tk.content;
  const role = roleById(tk.id), look = role ? lookOf(charKey(role)) : null;
  if (shape === "card") return look?.cardIcon === "only" ? "icon" : !look?.cardIcon || look.cardIcon === "none" ? "text" : "both";
  const style = shape === "coin" ? look?.style : null;
  return style === "solo" ? "icon" : style === "text" ? "text" : "both";
}
/** The token as it would be with each content, in its design: a tap chooses. */
function renderPanelContent(tk: OwnToken, shape: TokenShape) {
  const box = $("#tpContent"), opts = CONTENTS[shape], role = roleById(tk.id);
  box.hidden = opts.length < 2 || !role;
  if (box.hidden || !role) { box.innerHTML = ""; return; }
  // beside the name, small: the token on the left shows what each gives
  const now = contentNow(tk, shape);
  box.innerHTML = `<div class="field"><span>${esc(t("own.content"))}</span><span class="seg2 tp-carries" role="group" aria-label="${esc(t("own.content"))}">${opts.map((c) =>
    `<button type="button" data-content="${c}" aria-pressed="${c === now}">${esc(t(`own.content.${c}`))}</button>`).join("")}</span></div>`;
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
  const one = coll.groups.length < 2, usual = t(one ? "own.colourUsual" : "own.colourGroup");   // one group: the collection's colour, groups unsaid
  $("#ownTokColourHelp").textContent = t(one ? "own.colourHelpOne" : "own.colourHelp");
  const group = coll.groups.find((g) => g.id === tk.group)?.colour ?? GROUP_COLOURS[0], now = tk.colour ?? group;
  const name = (hex: string) => { const c = COLOUR_CHOICES.find((x) => x.hex === hex.toLowerCase()); return c ? t(`metal.${c.id}`) : hex; };
  $("#ownTokColour summary").innerHTML = `<i style="--c: ${now}"></i><span>${esc(tk.colour ? name(tk.colour) : usual)}</span><b aria-hidden="true">▾</b>`;
  $("#ownTokColour .tok-colour-menu").innerHTML = `<button class="pill group-pill" type="button" data-tcolour="" aria-pressed="${!tk.colour}" style="--c: ${group}"><i></i>${esc(usual)}</button>`
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
/** The back: like the other tokens' (its design's, named), or its other state, with its name and icon. */
function renderOwnFlip(tk: OwnToken) {
  for (const b of $$("#ownTokFlipSeg [data-flip]")) b.setAttribute("aria-pressed", String((b.dataset.flip === "1") === !!tk.flip));
  $("#ownTokFlipBox").hidden = !tk.flip;
  const role = roleById(tk.id), design = role ? designFor(charKey(role), shapeOfToken(tk)).name : "";
  $("#ownTokBackHint").textContent = tk.flip ? t("own.backFlipHelp") : t("own.backUsualHelp", { design });
  if (tk.flip) renderIconChip("ownTokFlip", tk.flip.icon);
}
/** Whether an icon's search is open, the token's and its other state's. */
const searchOpen: Record<string, boolean> = { ownTok: false, ownTokFlip: false };
/** An icon as it's chosen: drawn, its name and where it's from, with Change (the search) and Remove; none, Choose. */
function renderIconChip(id: string, icon: TokenIcon | null | undefined) {
  const open = searchOpen[id];
  $(`#${id}Search`).hidden = !open;
  const name = icon ? icon.name || icon.id.split("/").pop() || "" : t("own.noIcon");
  const from = icon ? t(icon.source === "upload" ? "icon.from.upload" : "icon.from.game") : "";
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
  const panel = $<HTMLDialogElement>("#tokenPanel");
  // Escape, the ×, Cancel and Done all close it the same way (a draft is dropped, changes kept)
  panel.addEventListener("cancel", (e) => { e.preventDefault(); closeTokenPanel(); });
  $("#tpClose").onclick = $("#tpCancel").onclick = closeTokenPanel;
  $("#tpMore").onclick = () => createToken(true);
  $("#tpDone").onclick = () => (state.creating ? createToken(false) : closeTokenPanel());
  $("#tpShape").onclick = (e) => { const b = hit(e, "[data-shape]"); if (b) chooseShape(b.dataset.shape as TokenShape); };
  $("#tpContent").onclick = (e) => {
    const b = hit(e, "[data-content]"), tk = editingOwn(); if (!b || !tk) return;
    tk.content = b.dataset.content as TokenContent;
    ownEdited(); renderTokenPanel();
  };
  $("#tpShape").onchange = (e) => {
    const el = e.target as HTMLSelectElement, tk = editingOwn();
    if (tk && el.dataset.typePick != null) { tk.type = el.value; ownEdited(); }
  };
  $("#ownTokName").oninput = (e) => { const tk = editingOwn(); if (tk) { tk.name = withName(tk.name, tokenLang(), input(e).value); ownEdited(); } };
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
  $("#ownTokFlipSeg").onclick = (e) => {
    const tk = editingOwn(), b = hit(e, "[data-flip]"); if (!tk || !b) return;
    const on = b.dataset.flip === "1"; if (on === !!tk.flip) return;
    if (on) { tk.flip = { name: "", icon: null }; searchOpen.ownTokFlip = true; $<HTMLInputElement>("#ownTokFlipName").value = ""; } else delete tk.flip;
    renderOwnFlip(tk); ownEdited();
    if (on) $("#ownTokFlipName").focus();
  };
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
export function applyOwnTheme() {
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
  paintTesserae(root);
}

/** The collection's mark: its logo on the top bar, the loading screen and the tab, and its name beside it. */
export function applyOwnBrand() {
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
  $<HTMLInputElement>("#osBrandTitle").placeholder = nameIn(coll.name, lang);   // empty: the collection's name
  $("#osLogoNote").textContent = "";
  $<HTMLInputElement>("#osName").value = nameIn(coll.name, lang);
  $<HTMLInputElement>("#osLoader").value = nameIn(coll.loader?.text, lang);
  $<HTMLInputElement>("#osCcc").checked = hasCcc(coll);
  $(".os-ccc").hidden = !hasCcc(coll);   // Clocktower's mark: only where a collection already carries it
  $<HTMLTextAreaElement>("#osAbout").value = nameIn(coll.about?.text, lang);
  $<HTMLTextAreaElement>("#osCredits").value = nameIn(coll.about?.credits, lang);
  $<HTMLTextAreaElement>("#osLinks").value = (coll.about?.links ?? []).map((l) => `${nameIn(l.label, lang)} | ${l.url}`).join("\n");
  osTok = null;
  renderTokColour();
  renderOwnThemes();
  $<HTMLDialogElement>("#ownSettings").showModal();
}
/** The tokens' colour being chosen in the settings (kept on Save): the one group's. */
let osTok: string | null = null;
function renderTokColour() {
  $("#osTokColourRow").hidden = coll.groups.length > 1;   // more groups: each has its own (Types and groups)
  const now = osTok ?? coll.groups[0]?.colour, name = (hex: string) => { const c = COLOUR_CHOICES.find((x) => x.hex === hex.toLowerCase()); return c ? t(`metal.${c.id}`) : hex; };
  $("#osTokColour").innerHTML = GROUP_COLOURS.map((c) => `<button type="button" style="background:${c}" data-tokc="${c}" aria-pressed="${c === now}" aria-label="${esc(name(c))}" title="${esc(name(c))}"></button>`).join("");
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
    saveColl(); applyOwnTheme(); renderOwnThemes();
  };
  $("#osCustom").oninput = () => {
    if (typeof coll.theme !== "object") return;
    for (const k of ["accent", "background", "surface", "text", "muted"] as const) coll.theme[k] = $<HTMLInputElement>(`#os-${k}`).value as Hex;
    coll.theme.glow = coll.theme.surface;
    coll.theme.font = $<HTMLSelectElement>("#osFont").value;
    saveColl(); applyOwnTheme();
  };
  $<HTMLInputElement>("#osLogoFile").onchange = async (e) => {
    const f = input(e).files?.[0]; input(e).value = ""; if (!f) return;
    const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
    if (!okLogo(url)) { $("#osLogoNote").textContent = t("own.logoTooBig"); return; }
    coll.brand = { ...coll.brand, logo: url }; saveColl(); applyOwnBrand();
    $<HTMLImageElement>("#osLogo").src = url; $("#osLogoNote").textContent = "";
  };
  $("#osLogoReset").onclick = () => { if (coll.brand) delete coll.brand.logo; saveColl(); applyOwnBrand(); $<HTMLImageElement>("#osLogo").src = APP_LOGO; };
  $("#osCancel").onclick = () => dlg.close();
  $("#osTokColour").onclick = (e) => { const b = hit(e, "[data-tokc]"); if (b) { osTok = b.dataset.tokc!; renderTokColour(); } };
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
    if (osTok && coll.groups.length === 1) coll.groups[0].colour = osTok as Hex;
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
export async function renderOwnLanding() {
  showOwnPage("ownLanding");
  // the walk through what the app does, below the fold: its own module (three.js, the collections' tokens)
  void import("./landing-tour.ts").then((m) => m.startTour());
  // the honeycomb of tokens, drawn once by the engine (tools/make-crear-art.mjs); inline, so its cells can be laid in turn
  fetch("/crear-hero.svg").then((r) => (r.ok ? r.text() : "")).then((svg) => { $("#ownComb").innerHTML = svg; $("#ownComb").classList.add("play"); }).catch(() => {});
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
        ${b.preview ? `<img class="strip" src="${esc(b.preview)}" alt="">` : ""}
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
