// The interface language.
import { emit } from "./events.ts";
import { $$, esc, $, state, gateState, hit } from "./context.ts";
import { t, LANGUAGES, uiLang, setUiLang } from "../i18n.ts";
import { renderLangButtons, drawLangDialog } from "./token-language.ts";
import { taller, renderTaller } from "./taller.ts";
import { APP_NAME, OWN } from "../collection.ts";
import { buildChoices } from "./workshop.ts";
import { gate } from "./boot.ts";
import { renderInvite } from "./scripts-ui.ts";
import { renderOwnHome, drawOwnComb } from "./creator.ts";
import { local } from "../services.ts";
import { toast } from "./design-sheet.ts";

// ------------------------------------------------------------ language

export const CHEVRON = '<svg class="chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
export const uiLanguage = (code = uiLang()) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
export function setLang(lang: string) {
  setUiLang(lang);
  renderLangMenus();
  renderLangButtons();
  if ($("#app").dataset.step === "taller") {   // the Taller has no sheet or spine: its own page, redrawn in the language
    if (!taller.from) $("#tallerBack b").textContent = t("own.homeTitle");
    document.title = `${t("taller.title")} · ${APP_NAME}`;
    buildChoices(); renderTaller();
  }
  else if (state.lib) { buildChoices(); emit("all"); if ($<HTMLDialogElement>("#scriptInvite").open) renderInvite(); }
  else if (OWN && !$("#ownHome").hidden) void renderOwnHome();   // the collections page draws its covers in the language
  else if (OWN && !$("#ownLanding").hidden) { drawOwnComb(); void import("./landing-tour.ts").then((m) => m.redrawTour()); }   // the front page's tokens, in the language
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
document.addEventListener("pointerup", endPeek);
document.addEventListener("pointercancel", () => { endPeek(); peek = null; });
// moving the finger (a scroll) before the hold lands isn't a hold
document.addEventListener("pointermove", (e) => { if (peek && !peek.shown && Math.hypot(e.clientX - peek.x, e.clientY - peek.y) > 10) { clearTimeout(peek.timer); peek = null; } }, { passive: true });
// the click that ends a hold isn't a pick
document.addEventListener("click", (e) => { if (peek?.shown) { e.stopPropagation(); e.preventDefault(); peek = null; } }, true);
document.addEventListener("contextmenu", (e) => { if (peekTarget(e.target)) e.preventDefault(); });
/** Once, on a touch screen with tokens that have a back on the sheet: how to see it. */
export function peekHint() {
  if (!matchMedia("(hover: none)").matches || !$(".tok-w.backed, .tok-w.two")) return;
  if (local.get(PEEK_HINT_KEY) || !local.set(PEEK_HINT_KEY, "1")) return;
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
