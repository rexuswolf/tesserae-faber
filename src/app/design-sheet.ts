// Choosing a design (the design sheet), and each shape's default design.
import { emit } from "./events.ts";
import type { TokenShape, TokenSpec, MyDesign, TokenOverride, Role, PatternSpec, ReliefPart, Token, TokenStyle, SpecColours, SpecInput, CardBack, TokenIcon, BackFace, BackSay, TokenContent, PieceShape } from "../types.ts";
import { DEFAULT_SPEC, reminderSpec, tokenSvg, SHAPE_FEATURES, shapeOf, roleName, shapeSpec, TOKEN_STYLES, FRAME_STYLES, ILLUSTRATIONS, isIllustration, illustrationPath, migrateBack, backShown, backLayoutContent, PATTERN_MIN, printsBack, cardBackOf, CARD_ICONS, CARD_JOINS, partColours, PATTERNS, patternDefaults, patternFilled, patternFixed, flipFace, reliefOf, hasRelief, FACE_FIELDS, ringBand, ringSize, baseSize, magnetLayout, pieceSpec, PIECE_SHAPES } from "../engine/token-engine.ts";
import { tokenLang } from "./token-language.ts";
import { iconFromSvg, GI_PLACE } from "../icons.ts";
import { ownIcon, roleIdOf, charKey, textFor, remindersOf, charName, specFor, filamentName } from "./tokens.ts";
import { isFilament, slotOf } from "../bambu/plates.ts";
import { ownChanged, myDesigns, myEntry, collEntry, inheritedRef, refOf, originalRef, defaultRef, designOf, collLabel, designFor, uniqueDesignName, lookOf, storeMyDesigns, storeOverrides, shapesHere, tokensOf, designOverridden, defaults, storeDefaults, savedSpecOf, unsavedFields, markSaved, savedPointOf, unsaved } from "./designs.ts";
import type { DesignEntry } from "./designs.ts";
import { appDesigns, APP_NAME, tallerUrl, newId, OWN, isLocked, nameIn } from "../collection.ts";
import type { OwnToken } from "../collection.ts";
import { state, collDesigns, $, esc, hit, $$, READONLY, coll, view3d, LAYOUT_TEXT, RANGES } from "./context.ts";
import type { Side, RangeKey, Part } from "./context.ts";
import { t, uiLang } from "../i18n.ts";
import type { Vars } from "../i18n.ts";
import { applyLook, prunedLook, withLookField, sameValue, setField, lookDiff, fieldOf } from "./looks.ts";
import { tokenRole, queueEntry, tokenRem, queueLabel, itemSpec, smallLetters, nozzleMm, renderDesignStage, toastTimer, setToastTimer } from "./queue.ts";
import { CHEVRON } from "./language.ts";
import { renderIconField, openPart, openPanel, sectionsOf, showTab, backTabsOf, frontTabsOf, twoSided, editContent, faceOf, hasOwnLook, backChanged, syncView, renderWorkshop, editLook, changeFace, editSide, designSwatch, partsOf } from "./workshop.ts";
import { TALLER, tallerMine, renderTaller } from "./taller.ts";
import { colourIssues, LIGHT_DEPTH } from "../colour-checks.ts";
import type { InlayPart } from "../colour-checks.ts";
import { roleById } from "./wiring.ts";
import { roleWithContent, showContentInline } from "./creator.ts";
/** Whether Composition's text and icon settings are unfolded (kept while designing). */
import { writeJSON, session, readJSON } from "../services.ts";

// ------------------------------------------------------------ choosing a design (the sheet)
//
// One sheet for a token's design (step 2) and for a shape's default in the collection (Pick):
// each design drawn large on the token it's for (in Pick, the shape's first token), with a line on
// it; the collection's and yours in two tabs, yours searchable when there are many. The
// collection's tab has its own first, then the app's (Tesserae Faber's), under their names. The token's
// default (in Pick, the collection's original) comes first, marked; the one in use is ringed.
// Choosing one is the same as it always was (setTokenDesign, setDefaults); the sheet just closes.

export const dz = { open: false, mode: "token" as "token" | "default", shape: "coin" as TokenShape, tab: "coll" as "coll" | "mine", q: "", opener: null as HTMLElement | null };
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
function sheetDesigns(mode = dz.mode, sh = dz.shape) {
  const mine = myDesigns[sh].map(myEntry), app = appDesigns(sh).map((x) => collEntry(sh, x, `a:${x.id}`));
  let first: string, cur: string;
  if (mode === "token") {
    const key = state.sel!.key;
    first = inheritedRef(key, sh); cur = refOf(key, sh);
  } else { first = originalRef(sh); cur = defaultRef(sh); }
  const own = collDesigns(sh).map((x) => collEntry(sh, x));
  for (const r of new Set([first, cur])) if (r.startsWith("c:") && !own.some((d) => d.ref === r)) own.push(designOf(sh, r)!);
  const lead = (list: DesignEntry[]) => [...list.filter((d) => d.ref === first), ...list.filter((d) => d.ref !== first)];
  const item = (d: DesignEntry) => ({ d, pick: mode === "token" && d.ref === first ? "" : d.ref, first: d.ref === first, on: d.ref === cur });
  return { own: lead(own).map(item), app: lead(app).map(item), coll: [...lead(own), ...lead(app)].map(item), mine: lead(mine).map(item), cur };
}
export function openDesignSheet(mode: "token" | "default", shape: TokenShape, opener: HTMLElement) {
  Object.assign(dz, { open: true, mode, shape, opener, q: "" });
  dz.tab = sheetDesigns().cur.startsWith("u:") ? "mine" : "coll";
  $<HTMLInputElement>("#dzSearch").value = "";
  renderDesignSheet();
  const dlg = $<HTMLDialogElement>("#designDlg");
  if (!dlg.open) dlg.showModal();
  ($<HTMLElement>("#dzCards [aria-pressed=true]") ?? $<HTMLElement>("#dzTabs [aria-selected=true]"))?.focus();
}
export function renderDesignSheet() {
  const sh = dz.shape, { own, app, coll, mine, cur } = sheetDesigns(), tokenMode = dz.mode === "token";
  const role = tokenMode ? state.sel!.role : sampleRole(sh), key = tokenMode ? state.sel!.key : charKey(role), reminder = tokenMode ? state.sel!.reminder : null;
  const look = tokenMode ? state.overrides.get(key)?.look : undefined, text = textFor(key, role, reminder);
  $("#dzTitle").textContent = t(tokenMode ? "dsheet.title" : `dsheet.title.${sh}`);
  $("#dzTabs").innerHTML = (["coll", "mine"] as const).map((tab) => `<button type="button" class="nav-item nav-item--tab" role="tab" data-dz-tab="${tab}" aria-selected="${dz.tab === tab}" tabindex="${dz.tab === tab ? 0 : -1}">${esc(t(`dsheet.${tab}`, { n: (tab === "coll" ? coll : mine).length }))}</button>`).join("");
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
  const card = ({ d, pick, first, on }: Item) => `<button class="choice dz-card" type="button" data-dz-pick="${esc(pick)}" aria-pressed="${on}">`
    + (() => {
      // the front, and beside it the back (what it shows when turned over), each named
      const spec = specWith(applyLook(d.spec, look), key, reminder != null), front = tokenSvg(state.lib!, role, spec, { text });
      const backs = SHAPE_FEATURES[shapeOf(role)].back && reminder == null && printsBack(role, spec);
      const badge = first ? `<i class="dz-badge">${esc(tag)}</i>` : "";
      if (!backs) return `<span class="dz-tok">${front}${badge}</span>`;
      return `<span class="dz-pair"><figure class="dz-tok">${front}<figcaption>${esc(t("part.front"))}</figcaption>${badge}</figure>`
        + `<figure class="dz-tok dz-back">${tokenSvg(state.lib!, role, spec, { side: "back" })}<figcaption>${esc(t("part.back"))}</figcaption></figure></span>`;
    })()
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
/**
 * The design step's quick choice: the token drawn in the first designs it can take (its default
 * first, the one in use ringed, then yours), a tap away; "More designs" opens the sheet with them all.
 */
const QUICK = 8;
let quickFor = "";
export function renderQuickDesigns() {
  const { key, role, reminder } = state.sel!, sh = shapeOf(role), look = state.overrides.get(key)?.look;
  const { coll: all, mine, cur } = sheetDesigns("token", sh);
  // the first designs it can take, the one it has among them; the rest, counted, in the gallery
  const full = [...all, ...mine], list = full.slice(0, QUICK);
  if (!list.some((x) => x.on)) { const on = full.find((x) => x.on); if (on) list[list.length - 1] = on; }
  const text = textFor(key, role, reminder), on = full.find((x) => x.on), rest = full.length - list.length;
  const sig = [key, cur, JSON.stringify(look ?? null), tokenLang(), uiLang(), text, list.map((x) => x.d.ref).join(), rest].join("|");
  if (sig === quickFor) return;
  quickFor = sig;
  $("#styleQuick").innerHTML = `<div class="dstrip-h"><span class="dsel-l">${esc(t("design.label"))}</span><b>${esc(on?.d.name ?? "")}${look ? ` <i class="dq-own-i" title="${esc(t("design.custom"))}">✎</i>` : ""}</b><button type="button" class="action action--quiet action--sm dstrip-all" data-dq-more>${esc(t("design.seeAll", { n: full.length }))} ›</button></div>`
    + `<div class="dstrip choice-group">${list.map(({ d, pick, on: o }) => `<button type="button" class="choice dq-s" data-dq-pick="${esc(pick)}" aria-pressed="${o}" title="${esc(d.name)}" aria-label="${esc(d.name)}">${tokenSvg(state.lib!, role, { ...specWith(applyLook(d.spec, look), key, reminder != null), back: "none", backMode: "design" }, { text })}</button>`).join("")}`
    + `<button type="button" class="action action--icon dq-s-more" data-dq-more title="${esc(t("design.change"))}" aria-label="${esc(t("design.change"))}">${rest > 0 ? `+${rest}` : "+"}</button></div>`;
}
/**
 * The editor's Design: the designs the token can take, as a list (its small token in each, the
 * collection's first), the one in use lit and its description over them. With changes of its own the
 * token is "Customised", on top and lit; another design then asks first, as it drops them (and its
 * own design, without them, asks to go back).
 */
let crAsk: { pick: string; back: boolean; name: string } | null = null;
let crAskFor = "";
export function renderEditorDesigns() {
  const { key, role, reminder } = state.sel!, sh = shapeOf(role), tweaked = ownChanged(key);
  if (crAskFor !== key) { crAsk = null; crAskFor = key; }
  const { coll: all, mine } = sheetDesigns("token", sh), full = [...all, ...mine], list = full.slice(0, QUICK);
  if (!list.some((x) => x.on)) { const on = full.find((x) => x.on); if (on) list[list.length - 1] = on; }
  const on = full.find((x) => x.on), text = textFor(key, role, reminder);
  const help = (d: DesignEntry) => {
    if (!d.mine) return d.help ?? "";
    const m = myDesigns[sh].find((x) => `u:${x.id}` === d.ref);
    return m?.from ? t("dsheet.from", { name: m.from.name }) : t("dsheet.yours");
  };
  const mini = (spec: TokenSpec) => tokenSvg(state.lib!, role, { ...spec, back: "none", backMode: "design" }, { text });
  const row = (body: string, attrs: string, selected: boolean) => `<button type="button" role="option" class="choice cr-opt" aria-selected="${selected}" ${attrs}>${body}</button>`;
  const askHtml = (a: NonNullable<typeof crAsk>) => `<div class="cr-ask" role="group"><p>${esc(t(a.back ? "editor.askBack" : "editor.askSwitch", { name: a.name }))}</p>
    <div><button type="button" class="action action--primary action--sm" data-cr-ask="go">${esc(t(a.back ? "design.dropTweaks" : "editor.switchDrop"))}</button><button type="button" class="action action--quiet action--sm" data-cr-ask="">${esc(t("editor.cancel"))}</button></div></div>`;
  const desc = tweaked || !on ? "" : help(on.d);
  $("#crDesigns").innerHTML = `<p class="cr-desc${desc ? "" : " cr-desc-none"}"><b>${esc(tweaked ? t("editor.customised") : on?.d.name ?? "")}</b>${esc(desc)}</p>
    <div class="cr-list" role="listbox" aria-label="${esc(t("editor.design"))}">`
    + (tweaked ? row(`<span class="cr-mini">${tokenSvg(state.lib!, role, { ...specFor(key, reminder != null), back: "none" }, { text })}</span><span>${esc(t("editor.customised"))}</span><small>${esc(t("editor.yours"))}</small>`, "data-cr-mine", true) : "")
    + list.map(({ d, pick, first, on: o }) =>
      row(`<span class="cr-mini">${mini(specWith(d.spec, key, reminder != null))}</span><span>${esc(d.name)}</span>${first ? `<small>${esc(t("editor.fromColl"))}</small>` : ""}`,
        `data-cr-pick="${esc(pick)}" data-name="${esc(d.name)}"${o ? " data-on" : ""}`, !tweaked && o)
      + (crAsk && crAsk.pick === pick ? askHtml(crAsk) : "")).join("")
    + `<button type="button" class="action action--quiet action--sm cr-more" data-cr-more>${esc(t("editor.seeAll"))} ›</button></div>`;
}
export function wireEditorDesigns() {
  $("#crDesigns").onclick = (e) => {
    const key = state.sel!.key, sh = shapeOf(state.sel!.role);
    if (hit(e, "[data-cr-more]")) { openDesignSheet("token", sh, hit(e, "[data-cr-more]")!); return; }
    const answer = hit(e, "[data-cr-ask]");
    if (answer) {
      const a = crAsk; crAsk = null;
      if (answer.dataset.crAsk && a) { if (a.back) dropLook(key); else setTokenDesign(key, a.pick); }
      else renderEditorDesigns();
      return;
    }
    const b = hit(e, "[data-cr-pick]");
    if (!b || b.getAttribute("aria-selected") === "true") return;
    const pick = b.dataset.crPick!;
    // changes of its own: another design drops them, so it asks first
    if (ownChanged(key)) { crAsk = { pick, back: b.hasAttribute("data-on"), name: b.dataset.name! }; renderEditorDesigns(); return; }
    setTokenDesign(key, pick);
  };
}
export function wireQuickDesigns() {
  $("#styleQuick").onclick = (e) => {
    if (hit(e, "[data-dq-more]")) { $("#styleChange").click(); return; }   // the gallery: every design, by where it comes from
    const b = hit(e, "[data-dq-pick]"); if (b && b.getAttribute("aria-pressed") !== "true") setTokenDesign(state.sel!.key, b.dataset.dqPick!);
  };
  // the design chosen for this token, for all the collection's tokens of its shape
  $("#styleAll").onclick = () => { const key = state.sel!.key, sh = shapeOf(state.sel!.role); void setDefaults({ [sh]: designFor(key, sh).ref }, key); };
}
export function wireDesignSheet() {
  wireQuickDesigns();
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
    if (mode === "token") {
      const key = state.sel!.key;
      // changes of its own: another design (or its own, without them) drops them, so it asks first
      if (!ownChanged(key)) { setTokenDesign(key, ref); return; }
      const back = (ref || inheritedRef(key, shape)) === refOf(key, shape), name = designOf(shape, ref || inheritedRef(key, shape))!.name;
      void ask(t(back ? "editor.askBack" : "editor.askSwitch", { name }), [{ id: "go", label: t(back ? "design.dropTweaks" : "editor.switchDrop"), main: true }])
        .then((go) => { if (go) setTokenDesign(key, ref); });
    }
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
export async function saveLookAsDesign(key: string) {
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
/** A token's design: kept on the token unless it's the one it has by default (none: back to that). Another design is a fresh start: the token's own changes go (the editor asks first). */
function setTokenDesign(key: string, ref: string) {
  const shape = shapeOf(tokenRole(key)), own: TokenOverride = { ...state.overrides.get(key) };
  if (!ref || ref === inheritedRef(key, shape)) delete own.style; else own.style = ref;
  delete own.look;
  state.flash = "";
  setOwn(key, own);
}

/** Your collection's token (or the one being made) whose content can be changed: not one of a built-in or closed collection. */
function ownEditable(role: Role) { return OWN && !READONLY && !!ownTokenOf(role.id) && !isLocked(coll, role.id); }
const ownTokenOf = (id: string): OwnToken | undefined => coll.tokens.find((x) => x.id === id);

/**
 * What the token says, over its design: one line. A token of your collection: its name, group and
 * type, and the way to its content (the panel, as from the sheet). Clocktower's, a closed
 * collection's and a linked token's: its printed text, feminine name and icon, kept with the token
 * like its design (an override), opened in place.
 */
export function renderSays() {
  const { key, role, reminder } = state.sel!, shape = shapeOf(role), lang = uiLang();
  const tk = ownEditable(role) && reminder == null ? ownTokenOf(role.id)! : null;
  const own = state.overrides.get(key), name = textFor(key, role, reminder);
  const mine = !!(own?.text || own?.fem || own?.icon);
  $("#saysLine").innerHTML = tk
    ? `<span class="says-what"><small class="says-l">${esc(t("content.says"))}</small><b>${esc(name)}</b><small>${esc([coll.groups.length > 1 ? nameIn(coll.groups.find((g) => g.id === tk.group)?.name, lang) : "", new Set(coll.tokens.map((x) => x.shape)).size < 2 ? "" : t(`own.shape.${tk.shape}`)].filter(Boolean).join(" · "))}</small></span>`
      + `<button class="action action--sm" type="button" data-content-edit="${esc(tk.id)}">${esc(t("content.edit"))}</button>`
    : `<button class="says-toggle" type="button" aria-expanded="${state.saysOpen}" aria-controls="contentClosed"><span class="says-l">${esc(t("content.says"))}</span><b>${esc(name)}${mine ? ` <i class="own-dot" title="${esc(t("sheet.own"))}">✎</i>` : ""}</b>${CHEVRON}</button>`;
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
export function renderTabs(role: Role, spec: TokenSpec) {
  const shape = shapeOf(role), secs = sectionsOf(shape, editContent());
  const isOpen = (s: { part: string; face?: string }) => s.part === openPart() && (s.part !== "front" || twoSided(shape) || s.face === openPanel());
  if (!secs.some(isOpen)) showTab({ part: secs[0].part, face: secs[0].face });   // one this token hasn't (a layout, for a token of one thing)
  const part = openPart(), panel = openPanel();
  // the sections in one list, the basic ones first
  const changedHere = changedParts(state.sel!, shape), marked = new Set<string>();
  const tab = (s: (typeof secs)[number]) => {
    const dot = changedHere.has(s.part) && !marked.has(s.part) && !!marked.add(s.part);   // a part in several sections: its first
    // a shape without layouts: its text is what its face carries, its Composition, as every other shape's
    const faceName = (f: string) => t(f === "text" && !SHAPE_FEATURES[shape].layout ? "face.layout" : `face.${f}`);
    return `<button type="button" class="nav-item" role="tab" data-part="${s.part}"${s.face ? ` data-face="${s.face}"` : ""} aria-selected="${isOpen(s)}">${esc(s.face ? faceName(s.face) : s.part === "body" ? t(`part.body.${shape}`) : t(`part.${s.part}`))}${dot ? `<i class="part-dot" title="${esc(t("part.changed"))}" aria-label="${esc(t("part.changed"))}"></i>` : ""}</button>`;
  };
  $("#parts").innerHTML = secs.map(tab).join("");
  // a token of yours: its Token tab over its design (what it is, then how it looks); among the tabs only inside a part on a phone
  const tokSec = secs.find((s) => s.part === "token");
  $("#partsTok").hidden = !tokSec;
  // a row like its design's: what it is, its name and shape (no picture of it: the token is beside it, large)
  const tk = tokSec && ownTokenOf(state.sel!.role.id);
  $("#partsTok").innerHTML = tk ? `<button type="button" class="nav-item cr-item" data-part="token" aria-selected="${isOpen(tokSec)}"><span class="cr-pic cr-pic-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h6M7 14h10"/></svg></span><span class="cr-lbl">${esc(t("part.token"))}</span><small class="cr-val">${esc([nameIn(tk.name, tokenLang()), t(`own.shape.${shape}`)].filter(Boolean).join(" · "))}</small></button>` : "";
  const undo = $<HTMLButtonElement>("#partUndo"), here = openPart();
  undo.hidden = !changedHere.has(here);
  undo.innerHTML = `<span aria-hidden="true">↺</span> ${esc(t("part.undo"))}`;
  undo.title = t("part.undoOf", { part: partLabel(here, shape) });
  undo.onclick = () => undoPart(here);
  // a two-sided shape's front and a coin's back: their tabs (a card's back is one panel)
  const faceOpen = (part === "back" && shape !== "card") || (part === "front" && twoSided(shape));
  $("#faceTabs").hidden = !faceOpen;
  if (faceOpen) $("#faceTabs").innerHTML = (part === "back" ? backTabsOf(shape) : frontTabsOf(shape, editContent())).map((f) => `<button type="button" class="nav-item nav-item--tab" role="tab" data-face="${f}" aria-selected="${f === panel}">${esc(t(`face.${f}`))}</button>`).join("");
  renderBackNote(role, spec, part === "back" && faceOpen ? panel : null);
  // Composition: its own panel, and the text's and the icon's under it; with no layouts, the text's panel is where the face's content goes
  const comp = panel === "layout";
  // a piece's icon has a size to set only on a shape, and only with an icon on it (a silhouette's is its outline's)
  const ps = shape === "piece" ? pieceSpec(spec) : null, iconBox = SHAPE_FEATURES[shape].icon && !(ps && (ps.pieceShape === "silhouette" || !ps.pieceIcon));
  $$(".ws-panel").forEach((p) => { const d = p.dataset.panel; p.hidden = !(d === panel || (comp && ((d === "text" && shape !== "piece") || (d === "icon" && iconBox)))); });
  document.querySelector(".ws-body")?.setAttribute("data-comp", String(comp));
  const host = comp ? $("[data-panel=layout]") : $("[data-panel=text]"), what = $("#compWhat");
  if (what.parentElement !== host) host.prepend(what);
  const side = part === "back" ? "back" : "front";
  what.dataset.side = side;
  // a token of yours: its fields here (its front's text and icon, or its back's other state)
  const sel = state.sel!, mine = !TALLER && sel.reminder == null && OWN && coll.tokens.some((x) => x.id === sel.role.id);
  showContentInline(mine && (part === "token" || ((part === "front" || part === "back") && (comp || panel === "text"))) ? sel.role.id : null, part === "token" ? "token" : "comp");
  $("#crOwn").dataset.side = side;
}

/** Where a look's change is: the back's, the relief's, the magnet's, the body's (its size, edge, base); the rest, the front's (a shape without a back: its colours their own). */
const PART_OF: Record<string, Part> = {
  back: "back", backMode: "back", backFace: "back", customSvg: "back", backPattern: "back", backText: "back", cardBack: "back", "colours.back": "back", "colours.backFrame": "back",
  relief: "relief", reliefHeight: "relief", reliefBevel: "relief",
  magnet: "magnet", magnetSize: "magnet",
  diameter: "body", height: "body", edge: "body", ringBase: "body", separator: "body", "colours.base": "body",
};
/** The token's parts that it changed (its look, from its design; a token of yours, what it carries for this print), for a mark in their menu. */
const partOfField = (f: string, two: boolean): Part => PART_OF[f] ?? (!two && f.startsWith("colours.") ? "colours" : "front");
function changedParts(sel: { key: string; role: Role }, shape: TokenShape): Set<Part> {
  const parts = new Set<Part>(), two = twoSided(shape);
  if (TALLER) return parts;
  for (const f of unsavedFields(sel.key)) parts.add(partOfField(f, two));
  return parts;
}
/** A part's changes since it was last saved undone: that part as it was saved. */
function undoPart(part: Part) {
  const { key, role } = state.sel!, two = twoSided(shapeOf(role)), own: TokenOverride = { ...state.overrides.get(key) };
  const saved = savedSpecOf(key);
  let look = own.look ?? {};
  for (const f of unsavedFields(key)) if (partOfField(f, two) === part) look = withLookField(look, f, fieldOf(saved, f));
  const kept = prunedLook(designFor(key).spec, look);
  if (kept) own.look = kept; else delete own.look;
  setOwn(key, own);
  toast(t("part.undone", { part: partLabel(part, shapeOf(role)) }));
}
const partLabel = (part: Part, shape: TokenShape) => (part === "body" ? t(`part.body.${shape}`) : t(`part.${part}`));
/** The token's other state, if the token being edited has one: its name (a back design doesn't reach it). */
function backReach() {
  const { key, role } = state.sel!, other = shapeOf(role) === "coin" ? selFlip(role) : null;
  return { flips: other ? [textFor(key, role, null)] : [], plain: !other };
}
/** Over a plain back's tabs (but its layout, where Plain is, and its pattern): that it's plain, with the way to put something on it. */
function renderBackNote(role: Role, spec: TokenSpec, panel: string | null) {
  const box = $("#backNote"), s = faceOf(spec, "front"), plain = s.backMode === "design" && !selFlip(role);
  box.hidden = !plain || !panel || panel === "pattern" || panel === "layout";
  box.innerHTML = box.hidden ? "" : `${esc(t("back.plainOn"))} <button class="action" type="button" data-back-face>${esc(t("back.putFace"))}</button>`;
}
/** Whether the token being edited has its back plain (a token without another state, nothing on its back). */
export const backDrawn = () => editLook().backMode === "design" && !selFlip(state.sel!.role);
/** The token behind, on the tokens without another state: the back is a face (its look what it changed, if anything). */
export function setBackFace() {
  changeLook((s) => { s.backMode = hasOwnLook(s.backFace) ? "own" : "match"; });
  view3d("setView", "back"); syncView("back");
}
/** Under the token's name: inlays the coin's colour, or light ones too shallow on a dark coin. */
export function renderColourWarn(role: Role, spec: TokenSpec) {
  // checked as the shape prints it: a card or a ring has no back to check
  const shape = shapeOf(role), { clash, light } = colourIssues(role, shapeSpec(role, spec));
  const box = $("#colourWarn");
  box.hidden = !clash.length && !light.length;
  if (box.hidden) return;
  // Each part in the shape's words: a coin's "front" is its name and its icon (two words in the
  // list, "the name, the icon and the frame"); a ring's are letters, and its frame two lines.
  const ownIcon = spec.style !== "window" && partColours(role, spec).ink !== partColours(role, spec).front;   // an icon in a colour of its own is a part of its own
  const words = (p: InlayPart) => (p === "front" ? (shape === "ring" ? ["letters"] : SHAPE_FEATURES[shape].icon && !ownIcon ? ["name", "icon"] : ["name"]) : [(shape === "ring" || shape === "base") && p === "frame" ? "lines" : p]);
  const parts = (list: InlayPart[]) => { const w = list.flatMap(words).map((x) => t(`colour.part.${x}`)); return w.length > 1 ? `${w.slice(0, -1).join(", ")}${t("colour.and")}${w.at(-1)}` : w[0]; };
  box.innerHTML = [
    clash.length ? `<p><span aria-hidden="true">⚠</span> ${esc(shapeText("colour.clash", shape, { parts: parts(clash), n: clash.length }))}</p>` : "",
    light.length ? `<p><span aria-hidden="true">◐</span> ${esc(shapeText("colour.light", shape, { parts: parts(light), n: light.length, mm: dec1(LIGHT_DEPTH) }))}
      <button class="action" type="button" data-deepen>${esc(t(TALLER ? "colour.deepenDesign" : "colour.deepenToken", { mm: dec1(LIGHT_DEPTH) }))}</button></p>` : "",
  ].join("");
}
/** A design text that names the token's body: the coin's, or the card's or ring's own version of it. */
const shapeText = (key: string, shape: TokenShape, vars?: Vars) => {
  const own = `${key}.${shape}`, text = t(own, vars);
  return text === own ? t(key, vars) : text;   // the coin's words where they fit any shape
};
/** One decimal in the interface's language. */
export const dec1 = (v: number) => v.toFixed(1).replace(".", uiLang() === "es" ? "," : ".");
/** The fix for light inlays: the depth that covers the coin (this token's, or in the Taller the design's). */
export function deepen() {
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
export function colourNotes(way: string) {
  const all = selectionColourIssues();
  const list = (xs: { k: string; label: string }[]) => `<ul>${xs.map((x) => `<li><button type="button" data-fix="${x.k}">${esc(x.label)}</button></li>`).join("")}</ul>`;
  const clash = all.filter((x) => x.clash.length), light = way === "3d" ? all.filter((x) => x.light.length) : [];
  return (clash.length ? `<div class="q-note warn small-text"><span aria-hidden="true">⚠</span><div>
      <p>${esc(t("print.clash", { n: clash.length }))}</p>${list(clash)}</div></div>` : "")
    + (light.length ? `<div class="q-note warn small-text"><span aria-hidden="true">◐</span><div>
      <p>${esc(t("print.light", { n: light.length, mm: dec1(LIGHT_DEPTH) }))}</p>${list(light)}
      <p><button class="action" type="button" data-deepen-all>${esc(t("print.deepenAll", { n: light.length, mm: dec1(LIGHT_DEPTH) }))}</button></p></div></div>` : "");
}
/**
 * Deepens every selected token with light inlays on a dark coin, each on its own (a change over its
 * design, like any made in the design step): the designs themselves are only changed in the Taller.
 */
export function deepenAll() {
  for (const x of selectionColourIssues().filter((x) => x.light.length)) {
    const own: TokenOverride = { ...state.overrides.get(x.k) }, look = prunedLook(designFor(x.k).spec, withLookField(own.look ?? {}, "depth", LIGHT_DEPTH));
    if (look) own.look = look; else delete own.look;
    state.overrides.set(x.k, own);
  }
  storeOverrides();
  if (state.sel) renderWorkshop();
  emit("looks");
}

/** A one-state token's back in each layout, as it would print: each with what that layout says and shows (backLayoutContent). */
function renderBackStyleTiles(role: Role, spec: TokenSpec, text: string, pressed: string | null) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45, backPattern: null };
  const b = s.backMode === "design" ? {} : s.backFace ?? {}, plain = { ...role, flip: undefined };
  $("[data-choice=style]").innerHTML = TOKEN_STYLES.map((st) => {
    // each at its own letter size but the one in use (as the front's tiles: a size doesn't carry over between layouts)
    const face = { ...b, style: st.id, ...backLayoutContent(st.id, b), ...(st.id !== pressed ? { textSize: LAYOUT_TEXT[st.id] } : {}) };
    return `<button class="choice back-tile" type="button" data-v="${st.id}" aria-pressed="${pressed === st.id}">${tokenSvg(state.lib!, plain, { ...s, backMode: "own", backFace: face }, { side: "back", text })}<span>${esc(t(`style.${st.id}`))}</span></button>`;
  }).join("")
    // and plain, nothing on it (a back design of none)
    + `<button class="choice back-tile" type="button" data-v="plain" aria-pressed="${s.backMode === "design"}">${tokenSvg(state.lib!, plain, { ...s, back: "none", backMode: "design" }, { side: "back" })}<span>${esc(t("back.none"))}</span></button>`;
}

/** A text in a text's place: the words a layout waits for. */
const SAMPLE_TEXT = "Lorem ipsum";
/**
 * The icon a layout waits for: game-icons.net's die with question marks ("perspective-dice-six-faces-random",
 * Delapouite, CC BY 3.0), as it is, so it's drawn just as a chosen icon would be.
 */
const ASK_ICON = (() => {
  const icon = iconFromSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/><path fill="#fff" d="M255.76 44.764c-6.176 0-12.353 1.384-17.137 4.152L85.87 137.276c-9.57 5.536-9.57 14.29 0 19.826l152.753 88.36c9.57 5.536 24.703 5.536 34.272 0l152.753-88.36c9.57-5.535 9.57-14.29 0-19.825l-152.753-88.36c-4.785-2.77-10.96-4.153-17.135-4.153zm-.824 53.11c9.013.097 17.117 2.162 24.31 6.192 4.92 2.758 8.143 5.903 9.666 9.438 1.473 3.507 1.56 8.13.26 13.865l-1.6 5.706c-1.06 4.083-1.28 7.02-.66 8.81.57 1.764 1.983 3.278 4.242 4.544l3.39 1.898-33.235 18.62-3.693-2.067c-4.118-2.306-6.744-4.912-7.883-7.82-1.188-2.935-.99-7.603.594-14.005l1.524-5.748c.887-3.423.973-6.23.26-8.418-.653-2.224-2.134-3.983-4.444-5.277-3.515-1.97-7.726-2.676-12.63-2.123-4.956.526-10.072 2.268-15.35 5.225-4.972 2.785-9.487 6.272-13.55 10.46-4.112 4.162-7.64 8.924-10.587 14.288L171.9 138.21c5.318-5.34 10.543-10.01 15.676-14.013 5.134-4 10.554-7.6 16.262-10.8 14.976-8.39 28.903-13.38 41.78-14.967 3.208-.404 6.315-.59 9.32-.557zm50.757 56.7l26.815 15.024-33.235 18.62-26.816-15.023 33.236-18.62zM75.67 173.84c-5.753-.155-9.664 4.336-9.664 12.28v157.696c0 11.052 7.57 24.163 17.14 29.69l146.93 84.848c9.57 5.526 17.14 1.156 17.14-9.895V290.76c0-11.052-7.57-24.16-17.14-29.688l-146.93-84.847c-2.69-1.555-5.225-2.327-7.476-2.387zm360.773.002c-2.25.06-4.783.83-7.474 2.385l-146.935 84.847c-9.57 5.527-17.14 18.638-17.14 29.69v157.7c0 11.05 7.57 15.418 17.14 9.89L428.97 373.51c9.57-5.527 17.137-18.636 17.137-29.688v-157.7c0-7.942-3.91-12.432-9.664-12.278zm-321.545 63.752c6.553 1.366 12.538 3.038 17.954 5.013 5.415 1.976 10.643 4.417 15.68 7.325 13.213 7.63 23.286 16.324 30.218 26.082 6.932 9.7 10.398 20.046 10.398 31.04 0 5.64-1.055 10.094-3.168 13.364-2.112 3.212-5.714 5.91-10.804 8.094l-5.2 1.92c-3.682 1.442-6.093 2.928-7.23 4.46-1.137 1.472-1.705 3.502-1.705 6.092v3.885l-29.325-16.933v-4.23c0-4.72.892-8.376 2.68-10.97 1.787-2.652 5.552-5.14 11.292-7.467l5.2-2.006c3.087-1.21 5.334-2.732 6.742-4.567 1.46-1.803 2.192-4.028 2.192-6.676 0-4.027-1.3-7.915-3.9-11.66-2.6-3.804-6.227-7.05-10.885-9.74-4.387-2.532-9.126-4.29-14.217-5.272-5.09-1.04-10.398-1.254-15.922-.645v-27.11zm269.54 8.607c1.522 0 2.932.165 4.232.493 6.932 1.696 10.398 8.04 10.398 19.034 0 5.64-1.056 11.314-3.168 17.023-2.112 5.65-5.714 12.507-10.804 20.568l-5.2 7.924c-3.682 5.695-6.093 9.963-7.23 12.807-1.137 2.785-1.705 5.473-1.705 8.063v3.885l-29.325 16.932v-4.23c0-4.72.894-9.41 2.68-14.067 1.79-4.715 5.552-11.55 11.292-20.504l5.2-8.01c3.087-4.776 5.334-8.894 6.742-12.354 1.46-3.492 2.192-6.562 2.192-9.21 0-4.028-1.3-6.414-3.898-7.158-2.6-.8-6.23.142-10.887 2.83-4.387 2.533-9.124 6.25-14.215 11.145-5.09 4.84-10.398 10.752-15.922 17.74v-27.11c6.553-6.2 12.536-11.44 17.95-15.718 5.417-4.278 10.645-7.87 15.68-10.777 10.738-6.2 19.4-9.302 25.99-9.307zm-252.723 94.515l29.326 16.93v30.736l-29.325-16.93v-30.735zm239.246 8.06v30.735l-29.325 16.93v-30.733l29.326-16.932z"/></svg>');
  return { body: icon.body, g: GI_PLACE, d: [], iconKey: "ask" };
})();
/** What a layout carries: Symbol only its icon, Text only its name, the others both. */
const contentOfStyle = (style: TokenStyle): TokenContent => (style === "solo" ? "icon" : style === "text" ? "text" : "both");
/** The layout a token's content makes of its design's: its icon alone, its name alone, or the design's (one with both). */
const styleOfContent = (content: TokenContent | undefined, style: TokenStyle): TokenStyle =>
  content === "icon" ? "solo" : content === "text" ? "text" : content === "both" && (style === "solo" || style === "text") ? "classic" : style;
/** The layouts, each drawn on the token (the back's: on what its back shows) in the face's current colours. */
function renderStyleTiles(face: { role: Role; text: string }, spec: TokenSpec) {
  // without the background pattern: each would be cut anew (a tenth of a second each), and the tiles show the layout
  const s = { ...spec, diameter: 45, back: "none", backMode: "design" as const, frontPattern: null };
  // a token of yours: what it carries is the token's, and a layout chooses it (Symbol only, its icon; Text only, its
  // name; the others, both): each tile drawn with what it would carry
  // (the front's only: a back's other state is drawn as it is, its own icon and text)
  const own = !TALLER && editSide() === "front" && ownTokenOf(face.role.id);
  let pressed: string = own ? (face.role.content === "none" ? "none" : styleOfContent(face.role.content, s.style)) : s.style;
  // a token of yours without an icon or a text: the layouts that show one wait for it (Plain never does), drawn as they'd be
  const noIcon = !!own && !ownTokenOf(face.role.id)?.icon, noText = !!own && !face.text.trim();
  // its text alone, emptied: it prints plain, and says so
  if (own && noText && pressed === "text") pressed = "none";
  const needs = (st: TokenStyle) => { const icon = noIcon && st !== "text", text = noText && st !== "solo"; return icon && text ? "style.needsBoth" : icon ? "style.needsIcon" : text ? "style.needsText" : ""; };
  $("[data-choice=style]").innerHTML = TOKEN_STYLES.map((st) => {
    const need = needs(st.id), waits = !!need;
    const drawn = own ? roleWithContent(face.role.id, need && st.id === "solo" ? "none" : contentOfStyle(st.id)) ?? face.role : face.role;
    // a layout that waits, drawn as it will be: the icon it waits for a die of question marks (its text, Lorem ipsum)
    const role = need ? { ...drawn, ...(noIcon && st.id !== "text" ? ASK_ICON : {}), content: contentOfStyle(st.id) } : drawn;
    return `<button class="choice back-tile" type="button" data-v="${st.id}" aria-pressed="${pressed === st.id}"${waits ? ` disabled title="${esc(t(need))}"` : ""}>${
      tokenSvg(state.lib!, role, { ...s, style: st.id, ...(st.id !== s.style ? { textSize: LAYOUT_TEXT[st.id] } : {}) }, { text: noText && st.id !== "solo" ? SAMPLE_TEXT : face.text })
    }<span>${esc(t(`style.${st.id}`))}</span>${waits ? `<small>${esc(t(need))}</small>` : ""}</button>`;
  }).join("")
    // a coin of yours can carry nothing: Plain (its frame, background and colours only)
    + (own && shapeOf(face.role) === "coin" ? `<button class="choice back-tile" type="button" data-v="none" aria-pressed="${pressed === "none"}">${
      tokenSvg(state.lib!, roleWithContent(face.role.id, "none") ?? face.role, s, { text: face.text })}<span>${esc(t("style.none"))}</span></button>` : "");
}

/** A frame's rim as it starts when chosen (the runes': fine, so the runes show), then changed with Width. */
export const FRAME_START_WIDTH: Record<string, number> = { runas: 0.5 };
/** The frame designs, each drawn on the token in the face's current colours. A card or a ring
 *  (whose shape has frames only as a line) gets two tiles, without and with, drawn on itself; a
 *  card a third, only its corners. */
function renderFrameTiles(face: { role: Role; text: string }, spec: TokenSpec) {
  const s = { ...spec, diameter: 45, back: "none", backMode: "design" as const, frontPattern: null }, shape = shapeOf(face.role), { role, text } = face;   // the pattern left out, as in the layouts
  if (SHAPE_FEATURES[shape].frame === "line") {
    $("[data-choice=frame]").innerHTML = lineFrames(shape, s.frame).map(([v, label]) =>
      `<button class="choice back-tile frame-tile" type="button" data-v="${v}" aria-pressed="${s.frame === v}">${tokenSvg(state.lib!, role, { ...s, frame: v }, { text })}<span>${esc(label)}</span></button>`).join("");
    return;
  }
  const list = s.style === "window" ? FRAME_STYLES.filter((f) => f.id === "none" || f.id === "rim") : FRAME_STYLES;
  $("[data-choice=frame]").innerHTML = list.map((f) =>
    `<button class="choice back-tile frame-tile" type="button" data-v="${f.id}" aria-pressed="${(s.style === "window" && s.frame !== "none" ? "rim" : s.frame) === f.id}">${
      tokenSvg(state.lib!, role, { ...s, frame: f.id, frameWidth: f.id === "rim" || f.id === "double" ? Math.max(s.frameWidth, 0.8) : f.id === "runas" ? FRAME_START_WIDTH.runas : s.frameWidth }, { text })
    }<span>${esc(t(`frame.${f.id}`))}</span></button>`).join("");
}
/** A card's or a ring's frames (a line, or none; a card's also only its corners, or laurels), each with its name.
 *  "With" keeps whatever line design the spec has, so choosing it changes nothing else. */
function lineFrames(shape: TokenShape, frame: string): [string, string][] {
  const line = frame === "none" || frame === "corners" || frame === "laurel" ? "rim" : frame;
  return [["none", t("frame.none")], [line, t(`frame.line.${shape}`)], ...(SHAPE_FEATURES[shape].corners ? [["corners", t("frame.corners")], ["laurel", t("frame.laurelCard")]] as [string, string][] : [])];
}

/** The shape a piece last had, of the simple ones: Shape brings it back (a circle, the first time). */
const pieceSimple: Record<string, string> = {};
/**
 * A piece's Composition: its icon's silhouette or a shape, each drawn as the piece comes out; under it the silhouette's
 * margin, or the shapes as outlines; then its icon, on top, on top and underneath, or none. A token without an icon
 * has no silhouette (its card waits for one) nor anything to put on top.
 */
function renderPieceTiles(face: { role: Role; text: string }, spec: TokenSpec) {
  const s = pieceSpec(spec), own = ownIcon(face.role.id), noIcon = !(own?.body || face.role.body || face.role.d?.length);
  const silhouette = s.pieceShape === "silhouette" && !noIcon, key = face.role.id;
  if (!silhouette && s.pieceShape !== "silhouette") pieceSimple[key] = s.pieceShape;
  const simple = (pieceSimple[key] ?? "circle") as PieceShape, draw = (look: SpecInput) => tokenSvg(state.lib!, face.role, { ...s, ...look }, { text: face.text });
  const meeple = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2 0 3 1.6 3 3.4 0 1.2-.5 2-1.2 2.6 2.8.6 6.2 1.8 6.2 3.4 0 1-1.7 1.4-3.6 1.6l3 6.5h-5.2L12 17l-2.2 3.5H4.6l3-6.5c-1.9-.2-3.6-.6-3.6-1.6 0-1.6 3.4-2.8 6.2-3.4C9.5 8.4 9 7.6 9 6.4 9 4.6 10 3 12 3z" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/></svg>`;
  $("#pieceKinds").innerHTML = `<button type="button" data-piece-kind="silhouette" aria-pressed="${silhouette}"${noIcon ? ' disabled class="waits"' : ""}>${noIcon ? meeple : draw({ pieceShape: "silhouette" })}<b>${esc(t("piece.kind.silhouette"))}</b><small>${esc(t(noIcon ? "style.needsIcon" : "piece.kind.silhouetteSub"))}</small></button>`
    + `<button type="button" data-piece-kind="shape" aria-pressed="${!silhouette}">${draw({ pieceShape: silhouette ? simple : s.pieceShape === "silhouette" ? simple : s.pieceShape })}<b>${esc(t("piece.kind.shape"))}</b><small>${esc(t(`piece.shape.${silhouette ? simple : s.pieceShape === "silhouette" ? simple : s.pieceShape}`))}</small></button>`;
  $("#pieceMarginRow").hidden = !silhouette;
  // the shapes as outlines only: the shape itself, not the drawing on it
  $("[data-choice=pieceShape]").innerHTML = silhouette ? "" : PIECE_SHAPES.filter((v) => v !== "silhouette").map((v) =>
    `<button type="button" data-v="${v}" aria-pressed="${s.pieceShape === v}">${draw({ pieceShape: v, pieceIcon: false })}${esc(t(`piece.shape.${v}`))}</button>`).join("");
  $("#pieceHint").textContent = t(noIcon ? "piece.hintBare" : silhouette ? "piece.hintSilhouette" : "piece.hintShape");
  const iconNow = !s.pieceIcon ? "off" : s.pieceBack ? "both" : "on";
  $("#pieceIconBox").hidden = noIcon;
  $("[data-choice=pieceIcon]").innerHTML = (["on", "both", "off"] as const).map((v) => `<button type="button" class="choice" data-v="${v}" aria-pressed="${iconNow === v}">${esc(t(`piece.icon.${v}`))}</button>`).join("");
  $("#pieceIconHint").textContent = t(`piece.iconHint.${iconNow}`);
}
/** Silhouette or shape: a shape is the one it last had, or a circle. */
export function setPieceKind(kind: "silhouette" | "shape") {
  const key = state.sel!.role.id;
  changeLook((s) => { s.pieceShape = kind === "silhouette" ? "silhouette" : ((pieceSimple[key] ?? "circle") as PieceShape); });
}
/** A card's icon places and joins (its Layout tab) and its icon's size (its Icon tab), the tiles drawn on the token as it would come out. */
function renderCardIconTiles(role: Role, text: string, spec: TokenSpec, hasIcon: boolean) {
  // a card of yours without an icon: the places for one wait for it (only None, its phrase alone, doesn't)
  const waits = (key: string, v: string) => key === "cardIcon" && v !== "none" && !!ownTokenOf(role.id) && !ownTokenOf(role.id)!.icon;
  const tile = (key: "cardIcon" | "cardJoin", v: string) =>
    `<button class="choice back-tile" type="button" data-v="${v}" aria-pressed="${spec[key] === v}"${waits(key, v) ? ` disabled title="${esc(t("style.needsIcon"))}"` : ""}>${tokenSvg(state.lib!, role, { ...spec, [key]: v, ...(key === "cardJoin" && spec.cardIcon === "none" ? { cardIcon: "left" } : {}) }, { text })}<span>${esc(t(`${key}.${v}`))}</span>${waits(key, v) ? `<small>${esc(t("style.needsIcon"))}</small>` : ""}</button>`;
  // a card of yours: where its icon goes chooses what it carries too (none, its phrase; alone, its icon; beside it, both)
  $("[data-choice=cardIcon]").innerHTML = CARD_ICONS.map((v) => tile("cardIcon", v)).join("");
  $("[data-choice=cardJoin]").innerHTML = CARD_JOINS.map((v) => tile("cardJoin", v)).join("");
  // the join for an icon beside the phrase, the size for any icon
  $("#cardJoinBox").hidden = spec.cardIcon === "none" || spec.cardIcon === "only";
  $("#cardIconSize").closest<HTMLElement>(".row")!.hidden = spec.cardIcon === "none";
  $("#cardLayoutHint").textContent = !hasIcon ? t("cardIcon.noIcon") : spec.cardJoin === "together" && spec.cardIcon !== "none" && spec.cardIcon !== "only" ? t("cardJoin.together.help") : "";
  $("#cardIconHint").textContent = !hasIcon ? t("cardIcon.noIcon") : "";
}

/**
 * A card's back (REVERSO), a face of its own: on or off, its phrase (or the collection's name), its
 * icon, where that goes and how it sits with the phrase, its frame, and its colours and background.
 * Its choices drawn on the back as it would come out.
 */
function renderCardBack(role: Role, text: string, spec: TokenSpec) {
  const b = cardBackOf(spec), on = b.on;
  $$("#cbOn button").forEach((x) => x.setAttribute("aria-pressed", String((x.dataset.v === "on") === on)));
  $("#cbFields").hidden = !on;
  if (!on) return;
  const text$ = $<HTMLInputElement>("#cbText");
  if (document.activeElement !== text$) text$.value = b.text;
  text$.disabled = b.name === "collection" && !!role.collectionName;
  $<HTMLInputElement>("#cbName").checked = b.name === "collection";
  $("#cbNameRow").hidden = !role.collectionName && b.name !== "collection";
  // its icon: which one, and the way to search, upload or take it away
  $("#cbIconReset").hidden = !b.icon;
  if (!$("#cbIconHint").classList.contains("warn")) $("#cbIconHint").textContent = b.icon ? t(b.icon.source === "game-icons" ? "icon.isGame" : "icon.isOwn", { name: b.icon.name || "SVG", author: b.icon.author || "" }) : t("cardBack.iconHelp");
  // its tiles, on the back: the card in its colours with each choice
  const back = (change: Partial<CardBack>) => tokenSvg(state.lib!, role, { ...spec, cardBack: { ...b, ...change } }, { side: "back", text });
  const tile = (key: "cardIcon" | "cardJoin" | "frame", v: string, label: string) =>
    `<button class="choice back-tile${key === "frame" ? " frame-tile" : ""}" type="button" data-v="${esc(v)}" aria-pressed="${b[key] === v}">${back({ [key]: v, ...(key === "cardJoin" && (b.cardIcon === "none" || b.cardIcon === "only") ? { cardIcon: "left" as const } : {}) })}<span>${esc(label)}</span></button>`;
  $("[data-cb-choice=cardIcon]").innerHTML = CARD_ICONS.map((v) => tile("cardIcon", v, t(`cardIcon.${v}`))).join("");
  $("[data-cb-choice=cardJoin]").innerHTML = CARD_JOINS.map((v) => tile("cardJoin", v, t(`cardJoin.${v}`))).join("");
  $("[data-cb-choice=frame]").innerHTML = lineFrames("card", b.frame).map(([v, label]) => tile("frame", v, label)).join("");
  $("#cbJoinBox").hidden = b.cardIcon === "none" || b.cardIcon === "only";
  $("#cbSizeRow").hidden = b.cardIcon === "none";
  $("#cbFrameWidthRow").hidden = b.frame === "none";
  const dec = (v: number, dp: number) => v.toFixed(dp).replace(".", uiLang() === "es" ? "," : ".");
  for (const [id, v, dp] of [["cbIconSize", b.cardIconSize, 0], ["cbFrameWidth", b.frameWidth, 1]] as const) {
    if (document.activeElement !== $(`#${id}`)) $<HTMLInputElement>(`#${id}`).value = String(v);
    $(`#${id}Out`).textContent = `${dec(v, dp)} mm`;
  }
  $$(".metal[data-side=cardback]").forEach((box) => {
    const k = box.dataset.cbColour as "text" | "frame";
    markColours(box, b.colours[k]);
  });
}
/** A change to a card's back (in the Taller the design's; in the design step the token's own, as any change to its look). */
export function changeCardBack(mutate: (b: ReturnType<typeof cardBackOf>) => void) {
  changeLook((s) => { const b = structuredClone(cardBackOf(s)); mutate(b); s.cardBack = b; });
  view3d("setView", "back"); syncView("back");
}
/** A card's back turned on (with what it had, or its defaults) or off (what it had kept, for turning it on again). */
export function setCardBack(on: boolean) { changeCardBack((b) => { b.on = on; }); }
/** A card back's own icon (null: none). */
export function setCardBackIcon(icon: TokenIcon | null) { changeCardBack((b) => { b.icon = icon; if (icon && b.cardIcon === "none") b.cardIcon = "only"; }); }


/** What a one-state token's back says (BackFace.say): its name, the edition's, words of its own, or nothing. */
const BACK_SAYS: BackSay[] = ["name", "edition", "phrase", "none"];
function renderBackSay(spec: TokenSpec) {
  // the icon alone (solo) says nothing
  const b = spec.backMode === "design" ? {} : spec.backFace ?? {}, say = (b.style ?? spec.style) === "solo" ? "none" : b.say ?? "name";
  $("#backSay").innerHTML = BACK_SAYS.map((v) => `<button class="choice" type="button" data-v="${v}" aria-pressed="${v === say}">${esc(t(`back.say.${v}`))}</button>`).join("");
  const phrase = $<HTMLInputElement>("#backPhrase");
  phrase.hidden = say !== "phrase";
  if (document.activeElement !== phrase) phrase.value = b.phrase ?? "";
}
/** What a one-state token's back shows (BackFace.art): its icon, an ornament, your SVG, or nothing; each as that back. */
function renderBackArt(role: Role, spec: TokenSpec, text: string) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45 };
  // the words alone (the text layout) show no icon
  const b = s.backMode === "design" ? {} : s.backFace ?? {}, art = (b.style ?? s.style) === "text" ? "none" : b.art ?? "token", plain = { ...role, flip: undefined };
  // each alone on the back (its words would only be small print here), in its frame and colours
  const tile = (v: string, label: string) => `<button class="choice back-tile" type="button" data-v="${v}" aria-pressed="${v === art}">${
    v === "custom" && !s.customSvg ? `<span class="upload-tile">SVG</span>` : tokenSvg(state.lib!, plain, { ...s, backMode: "own", backPattern: null, backFace: { ...b, style: "solo", say: "none", art: v } }, { side: "back", text })
  }<span>${esc(label)}</span></button>`;
  $("#backArt").innerHTML = [tile("token", t("back.art.token")), tile("custom", t("back.custom")), tile("none", t("back.art.none"))].join("");
}
/** The back's words or icon (BackFace.say, .phrase, .art): the back becomes a face if it was plain. */
export function changeBackContent(change: Partial<BackFace>) {
  changeLook((s) => {
    if (s.backMode === "design" || !s.backMode) s.backMode = hasOwnLook(s.backFace) ? "own" : "match";
    const b: BackFace = { ...s.backFace, ...change };
    // words again on an icon alone, or an icon again on words alone: the layout that has both
    const style = b.style ?? s.style;
    if ((style === "text" && change.art && change.art !== "none") || (style === "solo" && change.say && change.say !== "none")) b.style = s.style === "text" || s.style === "solo" ? "classic" : s.style;
    if (b.style === s.style) delete b.style;
    if (b.say === "name") delete b.say;
    if (b.say !== "phrase") delete b.phrase;
    if (b.art === "token") delete b.art;
    s.backFace = b;
    s.backMode = hasOwnLook(b) ? "own" : "match";
  });
  view3d("setView", "back"); syncView("back");
}

// A background pattern (the front's in its own tab, the back's under the back design): which one,
// drawn as small swatches in the token's colours, how big its rhombi are, how thick its lines (the
// gap between its cells), how far it keeps from what sits on it, and (the front's) whose colour it
// takes: the frame's or the name's, never a filament of its own.
type PatSide = "front" | "back";
const patKey = (side: PatSide) => (side === "front" ? "frontPattern" : "backPattern") as "frontPattern" | "backPattern";
/** A pattern as a small coin swatch: `fg` rhombi (lines or a checkerboard) on `bg`. */
function patternSwatch(id: string, bg: string, fg: string, clip: string) {
  if (isIllustration(id)) return `<svg viewBox="-10 -10 20 20" aria-hidden="true"><circle r="10" fill="${bg}" stroke="rgba(239,230,214,.25)" stroke-width="0.3"/><path d="${illustrationPath(id as PatternSpec["id"], 9.4)}" fill="${fg}" fill-rule="evenodd"/></svg>`;
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
export function patternGroupHtml(side: PatSide) {
  const range = (k: string, label: string, min: number, max: number, step: number) =>
    `<div class="row"><label for="pat-${side}-${k}" ${k === "line" ? "data-pat-line-label" : ""}>${esc(label)}</label><output data-pat-out="${k}"></output><input type="range" id="pat-${side}-${k}" data-pat-range="${k}" min="${min}" max="${max}" step="${step}"></div>`;
  return `<div class="choices choice-group pat-tiles" data-pat-choice role="group" aria-label="${esc(t("pattern.title"))}"></div>`
    + `<button type="button" class="action action--quiet action--sm reset-f group" hidden data-reset="${patKey(side)}">↺</button>`
    + `<div class="pat-opts">`
    + range("scale", t("pattern.scale"), 2.4, 8, 0.1)
    + range("line", t("pattern.line"), PATTERN_MIN, 1.2, 0.05)
    + range("halo", t("pattern.halo"), PATTERN_MIN, 1.2, 0.05)
    + (side === "front" ? `<p class="metal-label">${esc(t("pattern.colour"))}</p><div class="choices choice-group" data-pat-colour></div>` : "")
    + `<p class="hint" data-pat-hint></p></div>`;
}
/** Puts a face's pattern into its group: the swatches, the sliders' values, the colours and a line on what it does. */
function renderPattern(side: PatSide, role: Role, s: TokenSpec) {
  const box = $(`[data-pat-side=${side}]`), p = s[patKey(side)] ?? null, pc = partColours(role, shapeSpec(role, s));
  // the back's: in the drawing's colour under a drawing, else (a face) in its frame's
  const colour = side === "back" ? (s.backMode === "design" && !selFlip(role) ? pc.back : pc.backFrame) : (p?.colour ?? "frame") === "front" ? pc.front : pc.frame;
  const dec = uiLang() === "es" ? "," : ".";
  // the patterns, then the illustrations (one drawing filling what the frame leaves)
  const tiles: [string, string][] = [["none", t("pattern.none")], ...PATTERNS.map((x) => [x.id, t(`pattern.${x.id}`)] as [string, string]), ...ILLUSTRATIONS.map((id) => [id, t(`back.${id.slice(4)}`)] as [string, string])];
  $("[data-pat-choice]", box).innerHTML = tiles.map(([id, label]) =>
    `<button class="choice back-tile" type="button" data-pat="${id}" aria-pressed="${(p?.id ?? "none") === id}">${patternSwatch(id, pc.base, colour, `patclip-${side}-${id}`)}<span>${esc(label)}</span></button>`).join("");
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
  $("[data-pat-range=line]", box).closest<HTMLElement>(".row")!.hidden = isIllustration(p.id);   // a drawing: as drawn
  const colours = $("[data-pat-colour]", box);
  if (colours) colours.innerHTML = (["frame", "front"] as const).map((c) =>
    `<button class="choice group-pill" type="button" data-pat-col="${c}" aria-pressed="${(p.colour ?? "frame") === c}" style="--c: ${pc[c]}"><i></i>${esc(t(`pattern.colour.${c}`))}</button>`).join("");
  // the back's: behind its drawing, or (a face) behind its icon, name and frame, like the front's
  const drawn = side === "back" && s.backMode === "design" && !selFlip(role), face = faceOf(s, side);
  $("[data-pat-hint]", box).textContent = !drawn && face.style === "window" ? t("pattern.window")
    : t(side === "front" ? "pattern.help" : drawn ? "pattern.helpBack" : "pattern.helpBackFace");
}
/** A change to a face's pattern: another one (keeping its size, thickness, halo and colour; from none, its defaults) or one of its fields. */
export function changePattern(side: PatSide, change: { id?: string; field?: "scale" | "line" | "halo" | "colour"; value?: number | string }) {
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

/** Which face stands out: only one can (the other lies on the bed); none, with nothing raised. */
const raisedFace = (s: TokenSpec): Side | null => (hasRelief(s) ? "front" : s.backMode !== "design" && hasRelief(s.backFace ?? {}) ? "back" : null);
/** A face's parts that can stand out: the shape's, but the name in the solo layout and the icon in the text one (they aren't there). */
function reliefParts(shape: TokenShape, face: TokenSpec): ReliefPart[] {
  const off = (k: ReliefPart) => shape === "coin" && ((k === "text" && face.style === "solo") || (k === "icon" && face.style === "text"));
  return (["text", "icon", "frame"] as ReliefPart[]).filter((k) => SHAPE_FEATURES[shape].relief.includes(k) && !off(k));
}
/**
 * Relief, a section of its own: which face stands out (a coin's front or back; a plain back has
 * nothing to raise), which of that face's parts, how high and how bevelled (the whole token's), and
 * how it prints.
 */
function renderRelief(role: Role, shape: TokenShape, spec: TokenSpec, back: TokenSpec) {
  const s = faceOf(spec, "front"), on = raisedFace(s), twoFaces = shape === "coin";
  const plainBack = s.backMode === "design" && !selFlip(role);
  if (shape === "piece") {
    // a piece: flat or its icon raised (a piece without an icon, or with one underneath too, has nothing to raise)
    const p = pieceSpec(s), can = p.pieceIcon && !p.pieceBack;
    $("#reliefFaceBox").hidden = false; $("#reliefPartsBox").hidden = true; $("#reliefHeightBox").hidden = !on;
    $("#reliefFaceBox .metal-label").textContent = t("relief.pieceLabel");
    $("#reliefFace").innerHTML = (["none", "front"] as const).map((v) =>
      `<button type="button" class="choice" data-relief-face="${v}" aria-pressed="${(on ?? "none") === v}"${v === "front" && !can ? " disabled" : ""}>${esc(t(`relief.piece.${v}`))}</button>`).join("");
    $("#reliefHint").textContent = on ? t("relief.raisedHelp.piece", { total: dec1(s.height + s.reliefHeight) }) : !p.pieceIcon ? t("relief.pieceNoIcon") : p.pieceBack ? t("relief.pieceBack") : shapeText("relief.flatHelp", shape);
    return;
  }
  $("#reliefFaceBox").hidden = !twoFaces;
  $("#reliefFaceBox .metal-label").textContent = t("relief.faceLabel");
  $("#reliefFace").innerHTML = (["none", "front", "back"] as const).map((v) =>
    `<button type="button" class="choice" data-relief-face="${v}" aria-pressed="${(on ?? "none") === v}"${v === "back" && plainBack ? " disabled" : ""}>${esc(t(`relief.face.${v}`))}</button>`).join("");
  // a one-faced shape: its front's parts, raised or not; a coin: the raised face's (none: nothing to pick)
  const side: Side = twoFaces ? on ?? "front" : "front", face = side === "back" ? back : s, relief = reliefOf(face);
  $("#reliefPartsBox").hidden = twoFaces && !on;
  $("#reliefParts").innerHTML = reliefParts(shape, face).map((k) =>
    `<button class="choice" type="button" data-relief-part="${k}" aria-pressed="${relief[k]}">${esc(shape === "coin" ? t(`face.${k}`) : shapeText(`relief.${k}.help`, shape))}</button>`).join("");
  $("#reliefHeightBox").hidden = !on;
  const total = dec1(s.height + s.reliefHeight);
  $("#reliefHint").textContent = !on ? shapeText("relief.flatHelp", shape) : t(on === "front" ? "relief.raisedHelp" : "relief.raisedBackHelp", { total });
}
/**
 * The face that stands out: the other made flush, its raised parts carried over (the face's own, if
 * any were kept; else all it can raise). None: both flush.
 */
export function setReliefFace(to: Side | "none") {
  const role = state.sel!.role, shape = shapeOf(role), FLAT = { text: false, frame: false, icon: false };
  changeLook((s) => {
    const f = faceOf(s, "front"), b = faceOf(s, "back"), was = raisedFace(f);
    const carried = was ? reliefOf(was === "front" ? f : b) : null;
    const shownBack = shape === "coin" && !selFlip(role) && s.backMode !== "design" ? backShown(role, b, textFor(state.sel!.key, role, state.sel!.reminder)).spec : b;
    const target = to === "back" ? shownBack : f, parts = reliefParts(shape, target);
    const want = { ...FLAT, ...Object.fromEntries(parts.map((k) => [k, carried ? carried[k] : true])) };
    if (!parts.some((k) => want[k])) for (const k of parts) want[k] = true;
    s.relief = to === "front" ? want : FLAT;
    s.backFace = { ...s.backFace, relief: to === "back" ? want : FLAT };
  });
  const view = to === "back" ? "back" : "side";
  view3d("setView", view); syncView(view);
}
/** A part of the raised face up or flush (on a one-faced shape, its front's); with none left up, nothing stands out. */
export function toggleReliefPart(part: ReliefPart) {
  const side = raisedFace(faceOf(editLook(), "front")) ?? "front";
  changeFace(side, (f) => { const r = reliefOf(f); f.relief = { ...r, [part]: !r[part] }; });
  view3d("setView", "side"); syncView("side");
}

/** Puts a design's values into the controls: the face's (front or back) in a face's tabs, the token's elsewhere. */
export function syncControls(role: Role, spec: TokenSpec, token: Token) {
  const shape = shapeOf(role), f = SHAPE_FEATURES[shape], side = editSide(), panel = openPanel();
  const s = faceOf(spec, "front"), face = faceOf(spec, side), who = faceRole(role, side);
  // the tiles of a one-state token's back: what it says and shows (its words, an ornament…), as the back draws them
  const oneBack = side === "back" && shape === "coin" && !selFlip(role);
  const shown = oneBack && s.backMode !== "design" ? backShown(who.role, face, who.text) : null;
  // (a two-state token's back is its other state, with its own icon only, as backFaceOf draws it)
  const tileWho = shown ? { role: shown.role, text: shown.text } : who, tileFace = shown ? shown.spec : side === "back" && selFlip(role) ? { ...face, icon: undefined } : face;
  const dec = uiLang() === "es" ? "," : ".";
  const FACE_RANGES = new Set<string>(FACE_FIELDS);
  for (const [id, [dp, unit]] of Object.entries(RANGES) as [RangeKey, [number, string]][]) {
    const v = (FACE_RANGES.has(id) ? face : s)[id] ?? 0;   // a bevel unset is none
    $<HTMLInputElement>("#" + id).value = String(v);
    $(`output[data-for=${id}]`).textContent = (+v).toFixed(dp).replace(".", dec) + unit;
  }
  const row = (id: string) => $("#" + id).closest<HTMLElement>(".row")!;
  // the many-coloured swatch: each token's team's (a collection of yours: its group's, even its only one)
  const teamLabel = t("metal.team");
  for (const b of $$(".metal button.team")) { b.title = teamLabel; b.setAttribute("aria-label", teamLabel); }
  $("#teamHint span").textContent = t("metal.teamHint");
  if (panel === "colours") {   // its colours together: the body's, the name's and icon's, the frame's
    $("#coloursBaseLabel").textContent = shapeText("coin.colour", shape);
    // a piece has no name nor frame: its front colour is its icon's
    $("#coloursFrameLabel").hidden = shape === "piece"; $("[data-panel=colours] .metal[data-colour=frame]").hidden = shape === "piece";
    $("#coloursFrontLabel").textContent = shape === "piece" ? t("piece.iconColour") : shape === "coin" ? t(face.style === "window" && role.content !== "icon" && role.content !== "text" ? "front.colourWindow" : role.content === "text" ? "front.colourName" : "front.colour") : t("front.colourName");
  }
  // Layout: a coin's layouts, drawn on this face; a card's, where its icon goes and how it sits with the phrase
  $("#cardLayoutBox").hidden = shape !== "card";
  $("#pieceLayoutBox").hidden = shape !== "piece";
  $("#compLayoutH").hidden = shape === "piece";
  if (panel === "layout" && (shape === "card" || shape === "piece")) { $("[data-choice=style]").hidden = true; $("#styleHint").textContent = ""; }
  if (panel === "layout" && shape === "piece") renderPieceTiles(tileWho, face);
  if (panel === "layout" && shape !== "card" && shape !== "piece") {
    $("[data-choice=style]").hidden = false;
    if (oneBack) { renderBackStyleTiles(role, s, who.text, shown?.spec.style ?? null); $("#styleHint").textContent = shown ? t(`style.${shown.spec.style}.help`) : t("back.plainHelp"); }
    else {
      renderStyleTiles(tileWho, tileFace);
      const laidOut = side === "front" && !TALLER && ownTokenOf(role.id) ? styleOfContent(role.content, face.style) : face.style;
      $("#styleHint").textContent = side === "front" && !TALLER && ownTokenOf(role.id) && role.content === "none" ? t("style.none.help") : t(`style.${laidOut}.help`);
    }
  }
  // Text: the name; a ring's letters are as tall as asked only up to the band between its edge
  // lines (the slider stops there and shows the height they print at); a card's phrase is fitted.
  const textSize = $<HTMLInputElement>("#textSize");
  textSize.max = shape === "ring" ? String(Math.floor(ringBand(face).band * 10) / 10) : "6";
  if (shape === "ring") $("output[data-for=textSize]").textContent = (Math.min(face.textSize, +textSize.max)).toFixed(1).replace(".", dec) + " mm";
  const laid = role.content === "icon" || role.content === "none" ? "solo" : role.content === "text" ? "text" : shown?.spec.style ?? face.style;   // a token of yours that carries one thing is laid out for it
  const coinStyle = (st: TokenStyle) => shape === "coin" && laid === st;
  row("frameInset").hidden = $("#frameInsetHint").hidden = shape !== "coin" || s.frame === "none";   // a coin's frame, apart from its edge
  row("textSize").hidden = !f.textSize || coinStyle("solo") || coinStyle("text");
  row("spacing").hidden = !f.spacing || coinStyle("window") || coinStyle("solo");
  row("maxArc").hidden = !f.maxArc || coinStyle("window") || coinStyle("solo") || coinStyle("text");
  // The window's front is the window itself; its icon takes the coin's colour. A card's or a
  // ring's front is only its name.
  $("#frontColourLabel").textContent = shape === "coin" && face.style === "window" ? t("front.colourWindow") : t("front.colourName");
  // how the name came out: this face's (a two-state token's front also names its other state's when it's drawn alike)
  const hint = (n: Token["name"]) => {
    const small = n.letterHeight < smallLetters(), mm = (Math.floor(n.letterHeight * 10) / 10).toFixed(1);
    return !Number.isFinite(n.letterHeight) ? t("name.hintSolo")
      : n.tab ? t("name.hintBase", { mm, shrunk: n.scale < 1, small, nozzle: nozzleMm() })
      : n.repeats ? t("name.hintRing", { n: n.repeats, mm, shrunk: n.scale < 1, small, nozzle: nozzleMm() })
      : n.total == null ? t("name.hintWindow", { lines: n.lines, mm, small, nozzle: nozzleMm() })
      : t("name.hint", { arc: n.total.toFixed(0), mm, shrunk: n.scale < 1, small, nozzle: nozzleMm() });
  };
  const other = selFlip(role), b = token.backName;
  const names = side === "back" ? [b] : [token.name, other && !backChanged(s) ? b : undefined];
  $("#nameHint").className = "hint" + (names.some((x) => x && x.letterHeight < smallLetters()) ? " warn" : "");
  $("#nameHint").textContent = side === "back" && b ? (other ? `${t("name.flip", { name: roleName(other, tokenLang()) })} ` : `${t("name.back")} `) + hint(b)
    : hint(token.name) + (names[1] && other ? ` ${t("name.flip", { name: roleName(other, tokenLang()) })} ${hint(names[1])}` : "");
  // a coin's icon has a colour of its own (unset, the name's); on the window, a card or a ring it hasn't
  const iconInk = (shape === "coin" && face.style !== "window") || shape === "piece";
  $("#iconColourLabel").hidden = !iconInk; $(".metal[data-colour=icon]").hidden = !iconInk;
  $("#iconColourHint").hidden = iconInk;
  $("#iconColourHint").textContent = iconInk ? "" : t(shape === "card" ? "icon.colourCard" : "icon.colourWindow");
  // a shape with a Colours section of its own has every colour there: not in its text's, icon's or frame's too
  if (partsOf(shape).includes("colours")) {
    $("#frontColourLabel").hidden = $("[data-panel=text] .metal[data-colour=front]").hidden = true;
    $("#iconColourLabel").hidden = $(".metal[data-colour=icon]").hidden = $("#iconColourHint").hidden = true;
    $("[data-panel=frame] .metal[data-colour=frame]").hidden = true;
  } else { $("#frontColourLabel").hidden = $("[data-panel=text] .metal[data-colour=front]").hidden = $("[data-panel=frame] .metal[data-colour=frame]").hidden = false; }
  // Icon: a coin's size, a card's (where it goes and how it sits with the phrase are its Layout)
  row("iconScale").hidden = shape === "card" || coinStyle("text") || (shape === "piece" && face.pieceShape === "silhouette");   // a silhouette's icon is its outline's
  $("#cardIconBox").hidden = shape !== "card";
  if ((panel === "icon" || panel === "layout") && shape === "card") {
    const own = ownIcon(role.id), hasIcon = !!(own?.body || role.body || role.d?.length);
    renderCardIconTiles(who.role, who.text, { ...face, icon: own }, hasIcon);
  }
  if (panel === "cardBack") renderCardBack(role, who.text, { ...s, icon: ownIcon(role.id) });
  // Frame: a coin's designs, or for a card or a ring only with or without (any design is a line there)
  if (panel === "frame") renderFrameTiles(tileWho, tileFace);
  // The back's drawing: the token behind (a face) or a design, with its colour and pattern, for the
  // tokens without another state: one with another state shows that instead (the note says so).
  $("[data-pat-side=front]").hidden = side !== "front"; $("[data-pat-side=back]").hidden = side !== "back";
  if (panel === "pattern") renderPattern(side, role, s);
  // a coin's back: in its layout, or plain; in its text, what it says; in its icon, what it shows. A token
  // with another state shows that instead (in the Taller, its sample is shown so and the choices stay)
  const coinBack = side === "back" && shape === "coin", flipped = coinBack ? selFlip(role) : null;
  const flipNote = (key: string) => (flipped ? t(TALLER ? "flip.sample" : key, { name: roleName(flipped, tokenLang()) }) : "");
  $("#backSayBox").hidden = !(panel === "layout" && coinBack && (!flipped || TALLER));
  if (!$("#backSayBox").hidden) renderBackSay(s);
  // a token of yours: its own back (its text and icon) is above; these are its design's, for all its coins
  $("#compDesignH").hidden = $("#backSayBox").hidden || !$("#crOwn").childElementCount;
  $("#sayNote").hidden = !(panel === "layout" && flipped && TALLER);
  $("#sayNote").textContent = flipNote("flip.sayMine");
  $("#backArtBox").hidden = !(panel === "layout" && coinBack && (!flipped || TALLER));
  if (!$("#backArtBox").hidden) renderBackArt(role, s, textFor(state.sel!.key, role, state.sel!.reminder));
  $("#artNote").hidden = !(panel === "layout" && flipped && TALLER);
  $("#artNote").textContent = flipNote("flip.artMine");
  // Body: its colour, size (a coin's diameter, a ring's base, a card's fixed), thickness and colour depth
  $("#diameterRow").hidden = !f.diameter;
  // a piece is smaller and may be thicker than a coin
  const dia = $<HTMLInputElement>("#diameter"), hgt = $<HTMLInputElement>("#height");
  dia.min = shape === "piece" ? "15" : "30"; hgt.min = shape === "piece" ? "2" : "1.2"; hgt.max = shape === "piece" ? "12" : "4";
  $("label[for=diameter]").textContent = shapeText("range.diameter", shape);
  $("#ringBaseRow").hidden = !f.ringBase;
  $("#separatorRow").hidden = !f.separator;
  $("#cardSizeHint").hidden = shape !== "card";
  $("#edgeRow").hidden = shape !== "coin";
  if (shape === "base") { const bs = baseSize(s); $("#ringBaseHint").textContent = t("base.baseHelp", { inner: dec1(2 * bs.ri), outer: dec1(2 * bs.ro) }); }
  else { const rs = ringSize(s); $("#ringBaseHint").textContent = t("ring.baseHelp", { inner: dec1(2 * rs.inner), outer: dec1(2 * rs.outer) }); }
  $("#baseColourLabel").textContent = shapeText("coin.colour", shape);
  // a shape with a Colours section of its own has its colour there, not here too
  $("#baseColourLabel").hidden = $("[data-panel=body] .metal[data-colour=base]").hidden = partsOf(shape).includes("colours");
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
    // the back's layout and its drawing: one or the other is chosen (a drawing, on a token without another state)
    const drawn = s.backMode === "design" && !selFlip(role);
    if (key === "style" && (oneBack || side === "front")) continue;   // the tiles say it (renderBackStyleTiles, renderStyleTiles)
    if (key === "pieceIcon" || key === "pieceShape") continue;   // renderPieceTiles says it
    if ((key === "back" && !drawn) || (key === "style" && side === "back" && drawn)) { b.setAttribute("aria-pressed", "false"); continue; }
    const v = key === "magnet" && faceBack && s.magnet === "pocket" ? "hidden" : from[key] ?? DEFAULT_SPEC[key] ?? (key === "edge" ? "smooth" : undefined);
    b.setAttribute("aria-pressed", String(String(v) === b.dataset.v));
  }
  $("[data-choice=magnet] [data-v=pocket]").hidden = faceBack;
  $$(".metal:not([data-side=cardback])").forEach((box) => {   // a card back's are renderCardBack's
    const k = box.dataset.colour as keyof SpecColours, from = box.dataset.side === "back" || (box.closest("[data-panel=text], [data-panel=icon], [data-panel=frame], [data-panel=colours]") && side === "back") ? faceOf(spec, "back") : s;
    const v = from.colours[k] ?? (k === "icon" ? from.colours.front : undefined);   // an icon without a colour of its own: the name's
    markColours(box, v);
  });
  // Relief: its own section, for the whole token
  // the back as it prints: a one-state token's with what it says and shows (its layout follows them)
  if (panel === "relief") renderRelief(role, shape, spec, shape === "coin" && !selFlip(role) && s.backMode !== "design" ? backShown(role, faceOf(spec, "back"), textFor(state.sel!.key, role, state.sel!.reminder)).spec : faceOf(spec, "back"));
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
  const { key } = state.sel!;
  return unsavedFields(key).includes(field) ? { spec: savedSpecOf(key), title: t("reset.toSaved") } : null;
}
export function resetField(field: string) {
  const base = resetBase(field); if (!base) return;
  if (!TALLER) {   // the change since it was saved goes: the value it was saved with
    const key = state.sel!.key, o = { ...state.overrides.get(key) }, look = prunedLook(designFor(key).spec, withLookField(o.look ?? {}, field, fieldOf(base.spec, field)));
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
export function changeLook(mutate: (s: TokenSpec) => void) {
  if (TALLER) {
    const d = tallerMine(); if (!d) return;
    const next = migrateBack(structuredClone(d.spec));
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
export function scheduleSheet() { clearTimeout(sheetTimer); sheetTimer = setTimeout(() => emit("looks"), 180); }
/** A token's own text, feminine name, icon, design or look changes; with none left, it simply has its default design. */
/** Its changes since it was saved undone: as it was saved. */
export function undoChanges(key: string) {
  const own: TokenOverride = { ...state.overrides.get(key) }, saved = savedPointOf(key).look;
  if (saved) own.look = structuredClone(saved); else delete own.look;
  setOwn(key, own);
  state.flash = t("design.undoDone");
  renderWorkshop();
}
/** The token being designed has changes not saved, and something would leave it. */
export const leavingUnsaved = () => !TALLER && state.step === 2 && !!state.sel && unsaved(state.sel.key);
/** Leaving a token with changes not saved: asked first, to save them or undo them. False: stay where you are. */
export async function settleToken(): Promise<boolean> {
  const sel = state.sel; if (!leavingUnsaved() || !sel) return true;
  const name = textFor(sel.key, sel.role, sel.reminder);
  const a = await ask(t("design.leaveAsk", { name }), [{ id: "undo", label: t("design.dropTweaks") }, { id: "save", label: t("design.saveChanges"), main: true }]);
  if (a === "save") { markSaved(sel.key); renderWorkshop(); return true; }
  if (a === "undo") { undoChanges(sel.key); return true; }
  return false;
}
/** Back to its design as it is: its customisation goes (asked first, where it's picked). */
export function dropLook(key: string) {
  const own: TokenOverride = { ...state.overrides.get(key) };
  delete own.look;
  setOwn(key, own); markSaved(key);
  state.flash = t("design.dropDone", { name: designFor(key).name });
  renderWorkshop();
}
/** Back to the original: the text, icon and look you gave it go (its design stays the one picked). */
export function dropOwn(key: string) {
  const own: TokenOverride = { ...state.overrides.get(key) };
  delete own.text; delete own.fem; delete own.icon; delete own.look;
  setOwn(key, own); markSaved(key);
  state.flash = t("design.originalDone");
  renderWorkshop();
}
export function setOwn(key: string, own: TokenOverride) {
  if (!own.text && !own.fem && !own.icon && !own.style && !own.look) state.overrides.delete(key); else state.overrides.set(key, own);
  storeOverrides(); renderWorkshop(); scheduleSheet();
}

// ------------------------------------------------------------ each shape's default design (Pick)
//
// Over the sheet, the collection's default design for each shape it has ("Coins: Steel ▾"): the
// one its tokens print with unless one was chosen for them. Any of the collection's designs or
// yours can be the default, and "Original design" sets them back to the collection's own. Tokens
// with a design of their own or changes to it are asked about first: kept as they are, or given
// the new default too.

/** A token of a shape to draw designs on: the first of the collection's. */
const sampleRole = (shape: TokenShape) => state.lib!.roles.find((r) => shapeOf(r) === shape)!;
/** The shapes the design bar offers: those of the tokens on screen (set by renderSheet). */
export let barShapes: TokenShape[] | null = null;
export const setBarShapes = (shapes: TokenShape[] | null) => { barShapes = shapes; };
export function renderDesignBar() {
  const all = shapesHere(), shapes = (barShapes ?? all).filter((sh) => all.includes(sh));
  const changed = shapes.filter((sh) => defaultRef(sh) !== originalRef(sh));
  $(".design-bar-wrap").hidden = !shapes.length;
  // each shape's chip opens all its designs (the collection's and yours, in their tabs): no way to the Taller beside them
  $("#designBar").innerHTML = shapes.map((sh) => {
      const d = designOf(sh, defaultRef(sh))!;
      return `<button class="input input--select db-chip" type="button" data-default-shape="${sh}" aria-haspopup="dialog" aria-label="${esc(t("bar.chipAria", { shape: t(`type.${sh}.many`), name: d.name }))}">${designSwatch(d.spec, sampleRole(sh))}<span><small>${esc(t(`type.${sh}.many`))}</small><b>${esc(d.name)}</b></span>${CHEVRON}</button>`;
    }).join("")
    + (changed.length ? `<button class="action action--quiet action--sm db-original" type="button" data-default-original>${esc(t("bar.original"))}</button>` : "");
  if (dz.open && dz.mode === "default") renderDesignSheet();
}
/**
 * New defaults for some shapes (the original: none kept). Tokens of those shapes with a design of
 * their own or changes to it are asked about: kept as they are, or given the new default too.
 */
async function setDefaults(next: Partial<Record<TokenShape, string>>, from?: string) {
  const shapes = (Object.keys(next) as TokenShape[]).filter((sh) => next[sh] !== defaultRef(sh));
  if (!shapes.length) return;
  // `from`: the token whose design becomes everyone's (it then simply follows the default, its changes kept)
  const touched = shapes.flatMap((sh) => tokensOf(sh).filter(designOverridden)).filter((k) => k !== from);
  let clear = false;
  if (touched.length) {
    const name = shapes.length === 1 ? designOf(shapes[0], next[shapes[0]])!.name : t("bar.originalName");
    const a = await ask(t("bar.ask", { n: touched.length, name }), [{ id: "clear", label: t("bar.clear", { name }) }, { id: "keep", label: t("bar.keep"), main: true }]);
    if (!a) return;
    clear = a === "clear";
  }
  for (const sh of shapes) { if (next[sh] === originalRef(sh)) delete defaults[sh]; else defaults[sh] = next[sh]; }
  if (from) { const o = { ...state.overrides.get(from) }; delete o.style; if (Object.keys(o).length) state.overrides.set(from, o); else state.overrides.delete(from); }
  if (clear) for (const k of touched) { const o = { ...state.overrides.get(k) }; delete o.style; delete o.look; if (Object.keys(o).length) state.overrides.set(k, o); else state.overrides.delete(k); }
  storeDefaults(); storeOverrides();
  toast(shapes.length === 1 ? t("bar.done", { shape: t(`type.${shapes[0]}.many`).toLowerCase(), name: designOf(shapes[0], defaultRef(shapes[0]))!.name }) : t("bar.doneOriginal"));
  emit("looks");
  if (state.step === 2) { renderWorkshop(); renderDesignStage(); }
}
export function wireDesignBar() {
  $("#designBar").onclick = (e) => {
    const chip = hit(e, "[data-default-shape]");
    if (chip) { openDesignSheet("default", chip.dataset.defaultShape as TokenShape, chip); return; }
    if (hit(e, "[data-default-original]")) { void setDefaults(Object.fromEntries(shapesHere().filter((sh) => !barShapes || barShapes.includes(sh)).map((sh) => [sh, originalRef(sh)]))); return; }
    if (hit(e, "[data-to-taller]")) rememberReturn();
  };
}

/** A question with its answers as buttons (a dialog of the app's, not the browser's): the answer's id, or null when closed. */
export function ask(text: string, choices: { id: string; label: string; main?: boolean }[]): Promise<string | null> {
  const dlg = $<HTMLDialogElement>("#askDlg");
  $("#askText").textContent = text;
  $("#askActions").innerHTML = `<button class="action" type="button" data-ask="">${esc(t("script.cancel"))}</button>`
    + choices.map((c) => `<button class="${c.main ? "action action--primary" : "action"}" type="button" data-ask="${esc(c.id)}">${esc(c.label)}</button>`).join("");
  dlg.showModal();
  $<HTMLElement>("#askActions .action--primary")?.focus();
  return new Promise((done) => {
    dlg.onclick = (e) => { const b = hit(e, "[data-ask]"); if (b) { dlg.close(); done(b.dataset.ask || null); } };
    dlg.onclose = () => done(null);   // Escape: as Cancel (a second answer is ignored)
  });
}
/** A line at the bottom of the page for a moment ("Steel is now the coins' design"). */
export function toast(message: string) {
  const el = $("#appToast");
  $("span", el).textContent = message;
  $("button", el).hidden = true;
  el.hidden = false;
  clearTimeout(toastTimer);
  setToastTimer(setTimeout(() => { el.hidden = true; }, 4500));
}
/** Going to the Taller from the design step: coming back opens it again, on the same token. */
export function rememberReturn() {
  writeJSON(RETURN_KEY, { path: location.pathname, step: state.step, sel: state.sel?.key ?? null }, session);
}
const RETURN_KEY = "tesserae-return";
/** Back from the Taller: the step and token it was opened from, once. */
export function takeReturn(): { step: number; sel: string | null } | null {
  const v = readJSON<{ path?: string; step: number; sel: string | null } | null>(RETURN_KEY, null, session);
  session.remove(RETURN_KEY);
  return v && v.path === location.pathname ? v : null;
}

/**
 * A row of colours as it is now: the one it is pressed; a colour of your own (none of them), the
 * picker pressed and showing it, with the filament it prints in when it isn't one.
 */
function markColours(box: HTMLElement, v: string | undefined) {
  const own = !!v && v !== "team" && !$$("button", box).some((b) => b.dataset.v === v);
  $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  const pick = $("label.pick", box), input = $<HTMLInputElement>("input", box), note = $("small.metal-note", box);
  if (!pick) return;
  pick.classList.toggle("on", own);
  pick.style.background = own ? v! : "";
  if (own && document.activeElement !== input) input.value = v!;
  note.hidden = !own || isFilament(v!);
  if (!note.hidden) note.textContent = t("metal.prints", { name: filamentName(slotOf(v as never)) });
}
