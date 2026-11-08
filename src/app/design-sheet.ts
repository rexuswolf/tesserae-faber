// Choosing a design (the design sheet), and each shape's default design.
import { emit } from "./events.ts";
import type { TokenShape, TokenSpec, MyDesign, TokenOverride, Role, BackMode, PatternSpec, ReliefPart, Token, TokenStyle, SpecColours, SpecInput, CardBack, TokenIcon } from "../types.ts";
import { DEFAULT_SPEC, reminderSpec, tokenSvg, SHAPE_FEATURES, shapeOf, roleName, shapeSpec, TOKEN_STYLES, FRAME_STYLES, FILAMENTS, BACK_STYLES, PATTERN_MIN, printsBack, cardBackOf, CARD_ICONS, CARD_JOINS, partColours, PATTERNS, patternDefaults, patternFilled, patternFixed, flipFace, reliefOf, hasRelief, FACE_FIELDS, ringBand, ringSize, baseSize, magnetLayout } from "../engine/token-engine.ts";
import { tokenLang } from "./token-language.ts";
import { ownIcon, roleIdOf, charKey, textFor, remindersOf, charName } from "./tokens.ts";
import { myDesigns, myEntry, collEntry, inheritedRef, refOf, originalRef, defaultRef, designOf, collLabel, designFor, uniqueDesignName, lookOf, storeMyDesigns, storeOverrides, shapesHere, tokensOf, designOverridden, defaults, storeDefaults } from "./designs.ts";
import type { DesignEntry } from "./designs.ts";
import { appDesigns, APP_NAME, tallerUrl, newId, OWN, isLocked, nameIn } from "../collection.ts";
import type { OwnToken } from "../collection.ts";
import { state, collDesigns, $, esc, hit, $$, READONLY, coll, view3d, LAYOUT_TEXT, RELIEF_PARTS, RANGES } from "./context.ts";
import type { Side, RangeKey } from "./context.ts";
import { t, uiLang } from "../i18n.ts";
import type { Vars } from "../i18n.ts";
import { applyLook, prunedLook, withLookField, sameValue, lookFields, withoutLookField, setField, lookDiff, fieldOf } from "./looks.ts";
import { tokenRole, queueEntry, tokenRem, queueLabel, itemSpec, smallLetters, nozzleMm, renderDesignStage, toastTimer, setToastTimer } from "./queue.ts";
import { CHEVRON } from "./language.ts";
import { renderIconField, openPart, openPanel, sectionsOf, showTab, faceTabsOf, faceOf, hasOwnLook, ownStart, syncView, renderWorkshop, editLook, changeFace, editSide, designSwatch } from "./workshop.ts";
import { TALLER, tallerMine, renderTaller } from "./taller.ts";
import { colourIssues, LIGHT_DEPTH } from "../colour-checks.ts";
import type { InlayPart } from "../colour-checks.ts";
import { roleById } from "./wiring.ts";
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
  $("#styleQuick").innerHTML = `<div class="dstrip-h"><span class="dsel-l">${esc(t("design.label"))}</span><b>${esc(on?.d.name ?? "")}${look ? ` <i class="dq-own-i" title="${esc(t("design.custom"))}">✎</i>` : ""}</b><button type="button" class="link dstrip-all" data-dq-more>${esc(t("design.seeAll", { n: full.length }))} ›</button></div>`
    + `<div class="dstrip">${list.map(({ d, pick, on: o }) => `<button type="button" class="dq-s" data-dq-pick="${esc(pick)}" aria-pressed="${o}" title="${esc(d.name)}" aria-label="${esc(d.name)}">${tokenSvg(state.lib!, role, { ...specWith(applyLook(d.spec, look), key, reminder != null), back: "none", backMode: "design" }, { text })}</button>`).join("")}`
    + `<button type="button" class="dq-s dq-s-more" data-dq-more title="${esc(t("design.change"))}" aria-label="${esc(t("design.change"))}">${rest > 0 ? `+${rest}` : "+"}</button></div>`;
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
export function renderSays() {
  const { key, role, reminder } = state.sel!, shape = shapeOf(role), lang = uiLang();
  const tk = ownEditable(role) && reminder == null ? ownTokenOf(role.id)! : null;
  const own = state.overrides.get(key), name = textFor(key, role, reminder);
  const mine = !!(own?.text || own?.fem || own?.icon);
  $("#saysLine").innerHTML = tk
    ? `<span class="says-what"><b>${esc(name)}</b><small>${esc([coll.groups.length > 1 ? nameIn(coll.groups.find((g) => g.id === tk.group)?.name, lang) : "", coll.types.length < 2 ? "" : nameIn(coll.types.find((x) => x.id === tk.type)?.name, lang)].filter(Boolean).join(" · "))}</small></span>`
      + `<button class="pill" type="button" data-content-edit="${esc(tk.id)}">${esc(t("content.edit"))}</button>`
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
export function renderTabs(role: Role, spec: TokenSpec) {
  const shape = shapeOf(role), secs = sectionsOf(shape, !TALLER && ownTokenOf(role.id) ? role.content : undefined);
  const isOpen = (s: { part: string; face?: string }) => s.part === openPart() && (s.part !== "front" || s.face === openPanel());
  if (!secs.some(isOpen)) showTab({ part: secs[0].part, face: secs[0].face });   // one this token hasn't (a layout, for a token of one thing)
  const part = openPart(), panel = openPanel();
  // the sections in one row, the advanced ones after a word that says so
  $("#parts").innerHTML = secs.map((s, i) => (s.adv && !secs[i - 1]?.adv ? `<span class="sec-adv">${esc(t("sec.advanced"))}</span>` : "")
    + `<button type="button" role="tab" data-part="${s.part}"${s.face ? ` data-face="${s.face}"` : ""} aria-selected="${isOpen(s)}">${esc(s.face ? t(`face.${s.face}`) : s.part === "body" ? t(`part.body.${shape}`) : t(`part.${s.part}`))}</button>`).join("");
  const faceOpen = part === "back" && spec.backMode === "own" && shape !== "card";   // a back of its own: its face's tabs
  $("#faceTabs").hidden = !faceOpen;
  if (faceOpen) $("#faceTabs").innerHTML = faceTabsOf(shape, part === "back" ? "back" : "front").map((f) => `<button type="button" role="tab" data-face="${f}" aria-selected="${f === panel}">${esc(t(`face.${f}`))}</button>`).join("");
  renderBackModes(role, spec, part === "back" && shapeOf(role) !== "card");   // a card's back is always a design
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
export function setBackMode(mode: BackMode) {
  changeLook((s) => {
    s.backMode = mode;
    if (mode === "own" && !hasOwnLook(s.backFace)) s.backFace = { ...s.backFace, ...ownStart(faceOf(s, "front")) };
  });
  state.reliefAsk = null;
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
  const words = (p: InlayPart) => (p === "front" ? (shape === "ring" ? ["letters"] : SHAPE_FEATURES[shape].icon ? ["name", "icon"] : ["name"]) : [(shape === "ring" || shape === "base") && p === "frame" ? "lines" : p]);
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
      <p><button class="pill" type="button" data-deepen-all>${esc(t("print.deepenAll", { n: light.length, mm: dec1(LIGHT_DEPTH) }))}</button></p></div></div>` : "");
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

/** The layouts, each drawn on the token (the back's: on what its back shows) in the face's current colours. */
function renderStyleTiles(face: { role: Role; text: string }, spec: TokenSpec) {
  // without the background pattern: each would be cut anew (a tenth of a second each), and the tiles show the layout
  const s = { ...spec, diameter: 45, back: "none", backMode: "design" as const, frontPattern: null };
  // a token of yours: what it carries is the token's (Edit), the layouts here only how both are laid out
  const styles = !TALLER && ownTokenOf(face.role.id) ? TOKEN_STYLES.filter((st) => st.id !== "solo" && st.id !== "text") : TOKEN_STYLES;
  $("[data-choice=style]").innerHTML = styles.map((st) =>
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
    $("[data-choice=frame]").innerHTML = lineFrames(shape, s.frame).map(([v, label]) =>
      `<button class="back-tile frame-tile" type="button" data-v="${v}" aria-pressed="${s.frame === v}">${tokenSvg(state.lib!, role, { ...s, frame: v }, { text })}<span>${esc(label)}</span></button>`).join("");
    return;
  }
  const list = s.style === "window" ? FRAME_STYLES.filter((f) => f.id === "none" || f.id === "rim") : FRAME_STYLES;
  $("[data-choice=frame]").innerHTML = list.map((f) =>
    `<button class="back-tile frame-tile" type="button" data-v="${f.id}" aria-pressed="${(s.style === "window" && s.frame !== "none" ? "rim" : s.frame) === f.id}">${
      tokenSvg(state.lib!, role, { ...s, frame: f.id, frameWidth: f.id === "rim" || f.id === "double" ? Math.max(s.frameWidth, 0.8) : s.frameWidth }, { text })
    }<span>${esc(t(`frame.${f.id}`))}</span></button>`).join("");
}
/** A card's or a ring's frames (a line, or none; a card's also only its corners, or laurels), each with its name.
 *  "With" keeps whatever line design the spec has, so choosing it changes nothing else. */
function lineFrames(shape: TokenShape, frame: string): [string, string][] {
  const line = frame === "none" || frame === "corners" || frame === "laurel" ? "rim" : frame;
  return [["none", t("frame.none")], [line, t(`frame.line.${shape}`)], ...(SHAPE_FEATURES[shape].corners ? [["corners", t("frame.corners")], ["laurel", t("frame.laurelCard")]] as [string, string][] : [])];
}

/** A card's icon places and joins (in CARA's Icon tab), each drawn on the token as it would come out. */
function renderCardIconTiles(role: Role, text: string, spec: TokenSpec, hasIcon: boolean) {
  const tile = (key: "cardIcon" | "cardJoin", v: string) =>
    `<button class="back-tile" type="button" data-v="${v}" aria-pressed="${spec[key] === v}">${tokenSvg(state.lib!, role, { ...spec, [key]: v, ...(key === "cardJoin" && spec.cardIcon === "none" ? { cardIcon: "left" } : {}) }, { text })}<span>${esc(t(`${key}.${v}`))}</span></button>`;
  // a card of yours: what it carries is the token's; with both, only the side its icon goes
  const content = !TALLER && ownTokenOf(role.id) ? role.content : undefined;
  $("[data-choice=cardIcon]").innerHTML = CARD_ICONS.filter((v) => content !== "both" || v === "left" || v === "right").map((v) => tile("cardIcon", v)).join("");
  $("[data-choice=cardIcon]").hidden = ($("[data-choice=cardIcon]").previousElementSibling as HTMLElement).hidden = content === "icon" || content === "text";
  $("[data-choice=cardJoin]").innerHTML = CARD_JOINS.map((v) => tile("cardJoin", v)).join("");
  // the join for an icon beside the phrase, the size for any icon
  $("#cardJoinBox").hidden = spec.cardIcon === "none" || spec.cardIcon === "only";
  $("#cardIconSize").closest<HTMLElement>(".row")!.hidden = spec.cardIcon === "none";
  $("#cardIconHint").textContent = !hasIcon ? t("cardIcon.noIcon") : spec.cardJoin === "together" && spec.cardIcon !== "none" && spec.cardIcon !== "only" ? t("cardJoin.together.help") : "";
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
    `<button class="back-tile${key === "frame" ? " frame-tile" : ""}" type="button" data-v="${esc(v)}" aria-pressed="${b[key] === v}">${back({ [key]: v, ...(key === "cardJoin" && (b.cardIcon === "none" || b.cardIcon === "only") ? { cardIcon: "left" as const } : {}) })}<span>${esc(label)}</span></button>`;
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
    $$("button", box).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === b.colours[k])));
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
export function patternGroupHtml(side: PatSide) {
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
  const off = (k: ReliefPart) => shape === "coin" && ((k === "text" && f.style === "solo") || (k === "icon" && f.style === "text"));
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
export function setRelief(side: Side, part: ReliefPart, raised: boolean) {
  const s = editLook();
  const other = side === "front" ? (s.backMode === "match" || s.backMode === "own") && hasRelief(s.backFace ?? {}) : hasRelief(s);
  if (raised && other) { state.reliefAsk = { side, part }; renderWorkshop(); return; }
  state.reliefAsk = null;
  changeFace(side, (f) => { f.relief = { ...reliefOf(f), [part]: raised }; });
  view3d("setView", "side"); syncView("side");
}
/** The answer to the question: the other face flush, and the part asked for raised. */
export function swapRelief() {
  const ask = state.reliefAsk; if (!ask) return;
  state.reliefAsk = null;
  changeLook((s) => {
    if (ask.side === "front") { s.backFace = { ...s.backFace, relief: { text: false, frame: false, icon: false } }; s.relief = { ...reliefOf(s), [ask.part]: true }; }
    else { s.relief = { text: false, frame: false, icon: false }; s.backFace = { ...s.backFace, relief: { ...reliefOf(s.backFace ?? {}), [ask.part]: true } }; }
  });
  view3d("setView", "side"); syncView("side");
}

/** Puts a design's values into the controls: the face's (front or back) in a face's tabs, the token's elsewhere. */
export function syncControls(role: Role, spec: TokenSpec, token: Token) {
  const shape = shapeOf(role), f = SHAPE_FEATURES[shape], side = editSide(), panel = openPanel();
  const s = faceOf(spec, "front"), face = faceOf(spec, side), who = faceRole(role, side);
  const dec = uiLang() === "es" ? "," : ".";
  const FACE_RANGES = new Set<string>(FACE_FIELDS);
  for (const [id, [dp, unit]] of Object.entries(RANGES) as [RangeKey, [number, string]][]) {
    const v = (FACE_RANGES.has(id) ? face : s)[id] ?? 0;   // a bevel unset is none
    $<HTMLInputElement>("#" + id).value = String(v);
    $(`output[data-for=${id}]`).textContent = (+v).toFixed(dp).replace(".", dec) + unit;
  }
  const row = (id: string) => $("#" + id).closest<HTMLElement>(".row")!;
  // the many-coloured swatch: a collection of yours with one group, the collection's colour; else each token's group's
  const oneColour = OWN && !TALLER && coll.groups.length < 2, teamLabel = t(oneColour ? "metal.collection" : "metal.team");
  for (const b of $$(".metal button.team")) { b.title = teamLabel; b.setAttribute("aria-label", teamLabel); }
  $("#teamHint span").textContent = t(oneColour ? "metal.teamHintOne" : "metal.teamHint");
  // Layout: the coin's layouts, drawn on this face
  if (panel === "colours") {   // its colours together: the body's, the name's and icon's, the frame's
    $("#coloursBaseLabel").textContent = shapeText("coin.colour", shape);
    $("#coloursFrontLabel").textContent = shape === "coin" ? t(face.style === "window" && role.content !== "icon" && role.content !== "text" ? "front.colourWindow" : role.content === "text" ? "front.colourName" : "front.colour") : t("front.colourName");
  }
  if (panel === "layout") {
    const only = !TALLER && ownTokenOf(role.id) ? role.content : undefined;   // a token of yours that carries one thing: nothing to lay out
    $("[data-choice=style]").hidden = only === "icon" || only === "text";
    if (only === "icon" || only === "text") { $("[data-choice=style]").innerHTML = ""; $("#styleHint").textContent = t("style.onlyOne", { what: t(`own.content.${only}`).toLowerCase() }); }
    else { renderStyleTiles(who, face); $("#styleHint").textContent = t(`style.${face.style}.help`); }
  }
  // Text: the name; a ring's letters are as tall as asked only up to the band between its edge
  // lines (the slider stops there and shows the height they print at); a card's phrase is fitted.
  const textSize = $<HTMLInputElement>("#textSize");
  textSize.max = shape === "ring" ? String(Math.floor(ringBand(face).band * 10) / 10) : "6";
  if (shape === "ring") $("output[data-for=textSize]").textContent = (Math.min(face.textSize, +textSize.max)).toFixed(1).replace(".", dec) + " mm";
  const laid = role.content === "icon" ? "solo" : role.content === "text" ? "text" : face.style;   // a token of yours that carries one thing is laid out for it
  const coinStyle = (st: TokenStyle) => shape === "coin" && laid === st;
  row("textSize").hidden = !f.textSize || coinStyle("solo") || coinStyle("text");
  row("spacing").hidden = !f.spacing || coinStyle("window") || coinStyle("solo");
  row("maxArc").hidden = !f.maxArc || coinStyle("window") || coinStyle("solo") || coinStyle("text");
  // The window's front is the window itself; its icon takes the coin's colour. A card's or a
  // ring's front is only its name.
  $("#frontColourLabel").textContent = shape === "coin" ? t(face.style === "window" ? "front.colourWindow" : "front.colour") : t("front.colourName");
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
  const names = side === "back" ? [b] : [token.name, other && s.backMode !== "own" ? b : undefined];
  $("#nameHint").className = "hint" + (names.some((x) => x && x.letterHeight < smallLetters()) ? " warn" : "");
  $("#nameHint").textContent = side === "back" && b ? (other ? `${t("name.flip", { name: roleName(other, tokenLang()) })} ` : `${t("name.back")} `) + hint(b)
    : hint(token.name) + (names[1] && other ? ` ${t("name.flip", { name: roleName(other, tokenLang()) })} ${hint(names[1])}` : "");
  $("#iconColourHint").textContent = t(shape === "card" ? "icon.colourCard" : face.style === "window" ? "icon.colourWindow" : "icon.colourName");
  // Icon: a coin's size; a card's place, join and size, drawn on the card
  row("iconScale").hidden = shape === "card";
  $("#cardIconBox").hidden = shape !== "card";
  if (panel === "icon" && shape === "card") {
    const own = ownIcon(role.id), hasIcon = !!(own?.body || role.body || role.d?.length);
    renderCardIconTiles(who.role, who.text, { ...face, icon: own }, hasIcon);
  }
  if (panel === "cardBack") renderCardBack(role, who.text, { ...s, icon: ownIcon(role.id) });
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
  $("#edgeRow").hidden = shape !== "coin";
  if (shape === "base") { const bs = baseSize(s); $("#ringBaseHint").textContent = t("base.baseHelp", { inner: dec1(2 * bs.ri), outer: dec1(2 * bs.ro) }); }
  else { const rs = ringSize(s); $("#ringBaseHint").textContent = t("ring.baseHelp", { inner: dec1(2 * rs.inner), outer: dec1(2 * rs.outer) }); }
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
    const v = key === "magnet" && faceBack && s.magnet === "pocket" ? "hidden" : from[key] ?? DEFAULT_SPEC[key] ?? (key === "edge" ? "smooth" : undefined);
    b.setAttribute("aria-pressed", String(v === b.dataset.v));
  }
  $("[data-choice=magnet] [data-v=pocket]").hidden = faceBack;
  $$(".metal:not([data-side=cardback])").forEach((box) => {   // a card back's are renderCardBack's
    const k = box.dataset.colour as keyof SpecColours, from = box.dataset.side === "back" || (box.closest("[data-panel=text], [data-panel=frame], [data-panel=colours]") && side === "back") ? faceOf(spec, "back") : s;
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
export function resetField(field: string) {
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
export function changeLook(mutate: (s: TokenSpec) => void) {
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
export function scheduleSheet() { clearTimeout(sheetTimer); sheetTimer = setTimeout(() => emit("looks"), 180); }
/** A token's own text, feminine name, icon, design or look changes; with none left, it simply has its default design. */
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
const sampleRole = (shape: TokenShape) => state.lib!.roles.find((r) => shapeOf(r) === shape && r.id !== state.creating?.draft.id)!;
/** The shapes the design bar offers: those of the tokens on screen (set by renderSheet). */
export let barShapes: TokenShape[] | null = null;
export const setBarShapes = (shapes: TokenShape[] | null) => { barShapes = shapes; };
export function renderDesignBar() {
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
