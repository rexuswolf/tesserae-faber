// The language the tokens' names print in, and its dialog.
import { local } from "../services.ts";
import { TOKEN_LANG_KEY, coll, $$, esc, state, $, hit } from "./context.ts";
import { TRANSLATIONS, VILLACUERVOS_URL } from "../translations.ts";
import type { Translation } from "../translations.ts";
import { uiLang, t, LANGUAGES, tIn } from "../i18n.ts";
import { OWN, hasCcc, OWN_VIEW } from "../collection.ts";
import { uiLanguage, CHEVRON, setLang } from "./language.ts";
import { renderAll } from "./boot.ts";
import { renderQueue } from "./queue.ts";
import { renderInvite, drawer } from "./scripts-ui.ts";
import type { Role } from "../types.ts";
import { charKey, remKey, specFor, charName, remindersOf } from "./tokens.ts";
import { tokenSvg } from "../engine/token-engine.ts";

// ------------------------------------------------------------ token language

// The language printed on the tokens, apart from the interface language. Saved as "same" (follow the
// interface) or a translation's id; nothing saved is "same", which prints what the app always did for
// someone who never chose (Spanish → Rovortox's translation, English → English). A choice saved
// before "same" existed is a translation's id, so it stays as it was.
const SAME = "same";
function tokenLangChoice(): string {
  return local.get(TOKEN_LANG_KEY) || SAME;
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
export function tokenLang(): string {
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
export function langById(id: string | null) { const ok = langOptions(); return ok.find((x) => x.id === id) ?? ok[0]; }
function langGroups() {
  const out: { name: string; flag: string; items: Translation[] }[] = [];
  for (const x of langOptions()) { let g = out.find((l) => l.name === x.name); if (!g) out.push(g = { name: x.name, flag: x.flag, items: [] }); g.items.push(x); }
  return out;
}
/** The menu label for a translation: "Español · Rovortox" when its language has several. */
function isGrouped(x: Translation) { return langGroups().find((g) => g.name === x.name)!.items.length > 1; }
export function tlName(x: Translation) { return x.version ? `${x.name} · ${x.version}` : x.name; }
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
export function renderLangButtons() {
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
  local.set(TOKEN_LANG_KEY, choice);
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
export function drawLangDialog() {
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
  if (g) { const n = g.dataset.group!; if (tl.open.has(n)) tl.open.delete(n); else tl.open.add(n); drawLangDialog(); $(`#tlangList [data-group="${CSS.escape(n)}"]`).focus(); return; }
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
export function closeOnBackdrop(dlg: HTMLDialogElement) {
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
}
closeOnBackdrop($<HTMLDialogElement>("#credits"));
