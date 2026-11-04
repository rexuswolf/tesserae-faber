import JSZip from "jszip";
import {
  loadLibrary, buildToken, createViewer, magnetLayout, MAGNET_SIZES, tokenSvg, roleName, addTokenToZip, saveFile, reminderSpec, layoutName,
  TEAMS, EDITIONS, FRAME_STYLES, BACK_STYLES, TOKEN_STYLES, FILAMENTS, DEFAULT_SPEC,
} from "./engine/token-engine.js";
import {
  onUser, signIn, signOutUser, isAdmin, loadRoles, uploadRoles, listAccountDesigns, deleteAccountDesign,
} from "./firebase.js";
import { buildBambuProject, planPlates, FILAMENT_SLOTS } from "./bambu/bambu3mf.js";
import { t, uiLang, setUiLang, LANGUAGES } from "./i18n.js";
import { TRANSLATIONS, VILLACUERVOS_URL, translationById, translationGroups } from "./translations.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const RANGES = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], windowDepth: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"] };
const MAX_SVG = 300000;
const QUEUE_KEY = "midnight-mint-queue";
const STYLE_KEY = "midnight-mint-style";
const OVERRIDES_KEY = "midnight-mint-overrides";
const DESIGNS_KEY = "midnight-mint-designs";
const TOKEN_LANG_KEY = "midnight-mint-token-lang";
const EDITION_ORDER = ["tb", "bmr", "snv", "carousel", "fabled", "loric"];
const TEAM_ORDER = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];
const TEAM_PLURAL = {
  es: { townsfolk: "Aldeanos", outsider: "Forasteros", minion: "Esbirros", demon: "Demonios", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos" },
  en: { townsfolk: "Townsfolk", outsider: "Outsiders", minion: "Minions", demon: "Demons", traveller: "Travellers", fabled: "Fabled", loric: "Loric" },
};
const PLATE_GROUP = { townsfolk: "good", outsider: "good", minion: "evil", demon: "evil", traveller: "traveller", fabled: "fabled", loric: "loric" };
const PLATE_LABEL = {
  es: { good: "Bien", evil: "Mal", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos" },
  en: { good: "Good", evil: "Evil", traveller: "Travellers", fabled: "Fabled", loric: "Loric" },
};

const state = {
  user: null, lib: null,
  edition: "tb", team: "all",
  sel: null,              // { key, role, reminder: index | null }
  tab: "set",
  // Default set style: "Impresión rápida" (black coin, team colour, thin team rim, no back).
  spec: loadJSON(STYLE_KEY, null) || {
    ...structuredClone(DEFAULT_SPEC), style: "classic", frame: "rim", frameWidth: 0.8, back: "none", depth: 0.2,
    colours: { ...DEFAULT_SPEC.colours, base: FILAMENTS.black, front: "team", frame: "team" },
  },
  overrides: new Map(Object.entries(loadJSON(OVERRIDES_KEY, {}))),   // key -> { text?, spec? }
  queue: [], designs: [],
};
// After a deploy, a page opened earlier may ask for code files that no longer
// exist (their names change with each version). Reload once to get the new ones.
window.addEventListener("vite:preloadError", (e) => {
  if (sessionStorage.getItem("mm-reloaded")) return;   // don't loop if it really is broken
  e.preventDefault();
  sessionStorage.setItem("mm-reloaded", "1");
  location.reload();
});
setTimeout(() => sessionStorage.removeItem("mm-reloaded"), 10000);

let viewer = null;

/** Filament colours offered for the coin, frame and back (all of them print on the A1). */
const COLOUR_CHOICES = ["Black", "White", "Gold", "Silver", "Bronze", "Blue", "Red", "Purple", "Yellow", "Green"]
  .map((name) => ({ id: name.toLowerCase(), hex: FILAMENT_SLOTS.find((f) => f.name === name).hex }));
let gateState = null;

/** Premade designs. Applying one replaces the style being edited (set or token). */
const PRESETS = [
  { id: "rapida", spec: { style: "classic", frame: "rim", frameWidth: 0.8, back: "none", depth: 0.2, magnet: "none",
    colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  { id: "marfil", spec: { style: "classic", frame: "rim", frameWidth: 1.0, back: "guilloche", depth: 0.4, magnet: "none",
    colours: { base: FILAMENTS.white, front: "team", frame: FILAMENTS.bronze, back: FILAMENTS.bronze } } },
  { id: "legible", spec: { style: "window", windowFinish: "flat", textSize: 6, frame: "none", back: "none", depth: 0.4, magnet: "none",
    colours: { base: FILAMENTS.white, front: "team", frame: "team", back: FILAMENTS.gold } } },
  // Magnets: an open pocket to glue into, or one sealed inside during a pause.
  { id: "iman", spec: { style: "classic", frame: "rim", frameWidth: 0.8, back: "none", depth: 0.2, magnet: "pocket", magnetSize: "6x2",
    colours: { base: FILAMENTS.black, front: "team", frame: "team", back: FILAMENTS.gold } } },
  { id: "oculto", spec: { style: "classic", frame: "fases", frameWidth: 0.8, back: "medianoche", depth: 0.4, magnet: "hidden", magnetSize: "6x2",
    colours: { base: FILAMENTS.black, front: "team", frame: FILAMENTS.gold, back: FILAMENTS.gold } } },
];
const presetSpec = (p) => ({ ...structuredClone(DEFAULT_SPEC), ...structuredClone(p.spec) });

function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function storeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }

// ------------------------------------------------------------ tokens: keys, text, style

const charKey = (role) => `c:${role.id}`;
const remKey = (role, i) => `r:${role.id}:${i}`;
const remindersOf = (role, lang = tokenLang()) => role.reminders?.[lang] || role.reminders?.en || [];
/** The character's name in the token language, in its feminine form when the token asks for it. */
const charName = (role, key = charKey(role), lang = tokenLang()) =>
  (state.overrides.get(key)?.fem && role.fem?.[lang]) || roleName(role, lang);

/** The style a token uses: its own, or the set's; reminders get the reminder layout. */
function specFor(key, isReminder) {
  const base = state.overrides.get(key)?.spec ?? state.spec;
  const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours }, lang: tokenLang() };
  return isReminder ? reminderSpec(spec) : spec;
}
/** The text printed on a token. */
function textFor(key, role, reminder) {
  const own = state.overrides.get(key)?.text;
  if (own != null && own !== "") return own;
  return reminder != null ? remindersOf(role)[reminder] : charName(role, key);
}
const filamentName = (slot) => t(`filament.${FILAMENT_SLOTS[slot].name}`);

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
}
function setLang(lang) {
  setUiLang(lang);
  renderLangMenus();
  renderTokenLang();
  if (state.lib) { buildChoices(); renderAll(); renderQueue(); renderDesigns(); }
  else if (gateState) gate(gateState());
}
document.addEventListener("click", (e) => {
  const pick = e.target.closest("[data-lang-menu] [data-lang]");
  if (pick) { pick.closest("details").open = false; setLang(pick.dataset.lang); return; }
  // Clicking anywhere else closes an open language menu.
  for (const m of $$("[data-lang-menu][open]")) if (!m.contains(e.target)) m.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const m of $$("[data-lang-menu][open]")) { m.open = false; m.querySelector("summary").focus(); }
});
setLang(uiLang());

// ------------------------------------------------------------ token language

// The language printed on the tokens, apart from the interface language. Until one is
// picked it follows the interface (Spanish → Rovortox's translation, English → English).
function tokenLang() {
  let saved = null;
  try { saved = localStorage.getItem(TOKEN_LANG_KEY); } catch { /* no storage */ }
  return TRANSLATIONS.some((x) => x.id === saved) ? saved : uiLang() === "en" ? "en" : "es";
}
/** The menu label for a translation: "Español · Rovortox" when its language has several. */
function isGrouped(x) { return translationGroups().find((g) => g.name === x.name).items.length > 1; }
function tlName(x) { return x.version ? `${x.name} · ${x.version}` : x.name; }
function tlCredit(x) { return x.pack ? (x.by ? t("tlang.by", { by: x.by }) : t("tlang.community")) : t("tlang.official"); }

/** The header button: the flag and name of the language the tokens are printed in. */
function renderTokenLang() {
  const cur = translationById(tokenLang());
  const btn = $("#tokenLangBtn");
  btn.innerHTML = `<img src="${cur.flag}" alt="" width="30" height="30"><span><small>${esc(t("tlang.label"))}</small><b>${esc(tlName(cur))}</b></span>${CHEVRON}`;
  btn.setAttribute("aria-label", t("tlang.open", { name: tlName(cur) }));
}
function setTokenLang(id) {
  try { localStorage.setItem(TOKEN_LANG_KEY, id); } catch { /* no storage */ }
  renderTokenLang();
  if (state.lib) { renderAll(); renderQueue(); }
}

// The dialog: languages on the left (one with several versions folds open), and on the
// right the selected character, its reminders and a few of the characters on screen,
// drawn in the set's style in whichever language is picked or pointed at.
const tl = { pick: null, open: new Set() };
function openTokenLang() {
  tl.pick = tokenLang();
  tl.open = new Set([translationById(tl.pick).name]);
  drawTokenLang();
  $("#tlangDialog").showModal();
  const sel = $("#tlangList [aria-selected=true]");
  sel?.scrollIntoView({ block: "nearest" }); sel?.focus();
}
function drawTokenLang() {
  const item = (x, label, sub) => `<button class="tl-item" type="button" role="option" aria-selected="${x.id === tl.pick}" data-id="${x.id}">
    ${isGrouped(x) ? "" : `<img src="${x.flag}" alt="">`}<b>${esc(label)}</b><small>${esc(sub)}</small>${x.id === tl.pick ? '<i class="dot"></i>' : ""}</button>`;
  $("#tlangList").innerHTML = translationGroups().map((g) => {
    if (g.items.length === 1) return item(g.items[0], g.name, tlCredit(g.items[0]));
    const open = tl.open.has(g.name), here = g.items.find((x) => x.id === tl.pick);
    return `<div class="tl-group" data-current="${!!here}">
      <button class="tl-item" type="button" aria-expanded="${open}" data-group="${esc(g.name)}"><img src="${g.flag}" alt="">
        <b>${esc(g.name)}</b><small>${esc(t("tlang.versions", { n: g.items.length }))}${here ? ` · ${esc(here.version)}` : ""}</small>${CHEVRON}</button>
      ${open ? `<div class="tl-versions" role="group" aria-label="${esc(g.name)}">${g.items.map((x) => item(x, x.version, tlCredit(x))).join("")}</div>` : ""}</div>`;
  }).join("");
  drawTokenLangStage(tl.pick);
  $("#tlangUse").textContent = t("tlang.use", { name: tlName(translationById(tl.pick)) });
}
function drawTokenLangStage(id) {
  if (!state.lib || !state.sel) return;
  const x = translationById(id), hero = state.sel.role;
  const pic = (role, reminder = null) => {
    const key = reminder == null ? charKey(role) : remKey(role, reminder);
    const spec = { ...specFor(key, reminder != null), lang: id };
    const text = reminder == null ? charName(role, key, id) : remindersOf(role, id)[reminder];
    return { svg: tokenSvg(state.lib, role, spec, { text }), text };
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
  const g = e.target.closest("[data-group]"), b = e.target.closest("[data-id]");
  if (g) { const n = g.dataset.group; tl.open.has(n) ? tl.open.delete(n) : tl.open.add(n); drawTokenLang(); $(`#tlangList [data-group="${CSS.escape(n)}"]`).focus(); return; }
  if (b) { tl.pick = b.dataset.id; drawTokenLang(); $(`#tlangList [data-id="${CSS.escape(tl.pick)}"]`).focus(); }
};
// Pointing at a language previews it without choosing; a language group previews its first version.
$("#tlangList").addEventListener("pointerover", (e) => {
  const b = e.target.closest("[data-id]"), g = e.target.closest("[data-group]");
  if (b) drawTokenLangStage(b.dataset.id);
  else if (g) { const grp = translationGroups().find((x) => x.name === g.dataset.group); drawTokenLangStage((grp.items.find((x) => x.id === tl.pick) ?? grp.items[0]).id); }
});
$("#tlangList").addEventListener("pointerleave", () => drawTokenLangStage(tl.pick));
$("#tlangList").addEventListener("keydown", (e) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const items = $$("#tlangList .tl-item"), i = items.indexOf(document.activeElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
  items[next].focus();
  if (items[next].dataset.id) drawTokenLangStage(items[next].dataset.id);
});
$("#tlangCancel").onclick = () => $("#tlangDialog").close();
$("#tlangUse").onclick = () => { $("#tlangDialog").close(); if (tl.pick !== tokenLang()) setTokenLang(tl.pick); };
$("#tlangDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });   // backdrop

// ------------------------------------------------------------ gate

function gate(cfg) {
  const { title, text = "", action, secondary } = typeof cfg === "function" ? cfg() : cfg;
  $("#app").hidden = true;
  $("#gate").hidden = false;
  $("#gateTitle").textContent = title;
  $("#gateText").textContent = text;
  // The language switch only matters once there's something to read or do.
  $(".gate-langs").hidden = !action && !secondary;
  for (const [el, c] of [[$("#gateAction"), action], [$("#gateSecondary"), secondary]]) {
    el.hidden = !c;
    if (c) { el.textContent = c.label; el.onclick = c.run; el.disabled = false; }
  }
}
function showGate(make) { gateState = make; gate(make()); }

// Anyone can use the app without signing in. Only the admin signs in (to upload the
// library); the sign-in button shows when the page is opened with ?admin.
const ADMIN_ENTRY = new URLSearchParams(location.search).has("admin");
const adminSignIn = () => signIn().catch((e) => { if (e.code !== "auth/popup-closed-by-user") $("#gateText").textContent = t("gate.signInFailed", { message: e.message }); });

async function boot() {
  showGate(() => ({ title: t("gate.opening") }));
  try {
    const roles = await loadRoles();
    const broken = !roles.length ? "empty" : roles.some((r) => !r.body) ? "oldLibrary" : null;
    if (broken) return libraryGate(broken);
    state.lib = await loadLibrary(roles);
    gateState = null;
    startApp();
  } catch (err) {
    showGate(() => ({ title: t("gate.error.title"), text: t("gate.error.text", { message: err.message }), action: { label: t("gate.reload"), run: () => location.reload() } }));
  }
}
/** The library is missing or out of date: the admin can fix it, everyone else waits. */
function libraryGate(kind) {
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
    viewer = createViewer($("#view"));
    viewer.setView("angle");
    wire();
  }
  const first = state.lib.roles.find((r) => r.en === "Fortune Teller") || state.lib.roles[0];
  if (!state.sel) state.sel = { key: charKey(first), role: first, reminder: null };
  state.edition = state.sel.role.edition || "tb";
  buildChoices();
  loadQueue();
  renderAll();
  renderQueue();
  refreshDesigns();
}

/** The account corner: the admin's menu when signed in, a sign-in button only on ?admin. */
function renderAccount() {
  const admin = isAdmin(state.user);
  $(".me").hidden = !admin;
  $("#adminSignIn").hidden = admin || !ADMIN_ENTRY;
  if (admin) { $("#avatar").src = state.user.photoURL || ""; $("#meEmail").textContent = state.user.email; }
}

function renderAll() { renderSpine(); renderSheet(); renderWorkshop(); }

// ------------------------------------------------------------ spine

function renderSpine() {
  const lang = uiLang();
  $("#editions").innerHTML = EDITION_ORDER.filter((e) => state.lib.roles.some((r) => r.edition === e)).map((e) => {
    const roles = state.lib.roles.filter((r) => r.edition === e);
    const rem = roles.reduce((n, r) => n + remindersOf(r).length, 0);
    return `<button class="ed" type="button" data-ed="${e}" aria-current="${state.edition === e && !searchQuery()}">
      <span class="logo"><b>${esc(EDITIONS[e].mark)}</b></span>
      <span>${esc(EDITIONS[e].name[lang])}<small>${esc(t("ed.count", { c: roles.length, r: rem }))}</small></span></button>`;
  }).join("");
}

// ------------------------------------------------------------ sheet

const searchQuery = () => fold($("#search").value.trim());

function renderSheet() {
  const lang = uiLang(), q = searchQuery();
  const ed = state.edition;
  // header
  $("#edTitle").textContent = q ? t("sheet.results", { q: $("#search").value.trim() }) : EDITIONS[ed].name[lang];
  $("#edLead").textContent = q ? t("sheet.leadSearch") : t(`edition.lead.${ed}`);

  // which characters
  let roles = q ? state.lib.roles : state.lib.roles.filter((r) => r.edition === ed);
  const teamsHere = TEAM_ORDER.filter((tm) => roles.some((r) => r.team === tm));
  if (state.team !== "all" && !teamsHere.includes(state.team)) state.team = "all";
  $("#teamChips").innerHTML = [["all", t("team.all")], ...teamsHere.map((tm) => [tm, TEAM_PLURAL[lang][tm]])]
    .map(([id, label]) => `<button class="pill" type="button" data-team="${id}" aria-pressed="${state.team === id}">${esc(label)}</button>`).join("");
  if (state.team !== "all") roles = roles.filter((r) => r.team === state.team);

  // search matches the name (English, Spanish or the token language) or any reminder text
  const hits = new Map();
  if (q) {
    roles = roles.filter((r) => {
      const remHits = remindersOf(r).map((text, i) => [text, r.reminders?.en?.[i]].some((s) => s && fold(s).includes(q)) ? i : -1).filter((i) => i >= 0);
      const nameHit = [r.en, r.es, roleName(r, tokenLang()), r.fem?.[tokenLang()]].some((s) => s && fold(s).includes(q));
      if (remHits.length) hits.set(r.id, new Set(remHits));
      return nameHit || remHits.length;
    });
  }

  // "Add everything shown": the characters on screen (edition, team filter, search).
  state.shown = roles;
  const remCount = roles.reduce((n, r) => n + remindersOf(r).length, 0);
  $("#takeAll").hidden = !roles.length;
  $("#addShownChars").textContent = t("sheet.addShownChars", { n: roles.length });
  $("#addShownAll").textContent = t("sheet.addShownAll", { n: roles.length + remCount });
  $("#addShownAll").hidden = !remCount;

  if (!roles.length) { $("#rows").innerHTML = `<p class="empty">${esc(t("sheet.noResults"))}</p>`; return; }
  $("#rows").innerHTML = TEAM_ORDER.map((team) => {
    const list = roles.filter((r) => r.team === team);
    if (!list.length) return "";
    return `<div class="team-h"><i style="background:${TEAMS[team].colour}"></i><span>${esc(TEAM_PLURAL[lang][team])}</span><small>${list.length}</small></div>` +
      list.map((r) => rowHtml(r, q, hits.get(r.id))).join("");
  }).join("");
}

function rowHtml(r, q, remHits) {
  const lang = uiLang(), ck = charKey(r);
  const thumb = (key, reminder) => {
    const isRem = reminder != null;
    const spec = { ...specFor(key, isRem), diameter: isRem ? reminderSpec(DEFAULT_SPEC).diameter : 45, back: "none" };
    const own = state.overrides.has(key);
    return `<button class="tok" type="button" data-key="${key}" aria-current="${state.sel?.key === key}" aria-label="${esc(textFor(key, r, reminder))}">${tokenSvg(state.lib, r, spec, { text: textFor(key, r, reminder) })}${own ? `<span class="mark" title="${esc(t("sheet.own"))}">✎</span>` : ""}</button>`;
  };
  const rems = remindersOf(r);
  const other = tokenLang() === "en" ? roleName(r, uiLang() === "en" ? "es" : uiLang()) : r.en;
  return `<div class="row" data-current="${state.sel?.role === r}">
    ${thumb(ck, null)}
    <div class="who" data-key="${ck}"><b>${esc(textFor(ck, r, null))}</b>${other !== textFor(ck, r, null) ? `<small>${esc(other)}</small>` : ""}${q ? `<em>${esc(EDITIONS[r.edition]?.name[lang] || "")}</em>` : ""}</div>
    <div class="rems">${rems.length ? rems.map((_, i) => `<div class="rem${remHits?.has(i) ? " hit" : ""}">${thumb(remKey(r, i), i)}<span>${esc(textFor(remKey(r, i), r, i))}</span></div>`).join("") : `<span class="none">${esc(t("sheet.noReminders"))}</span>`}</div>
    <div class="take"><button class="pill" type="button" data-add="${r.id}">${esc(t("sheet.addChar"))}</button>${rems.length ? `<button class="pill" type="button" data-addall="${r.id}">${esc(t("sheet.addAll"))}</button>` : ""}</div>
  </div>`;
}

function select(key) {
  const [kind, id, idx] = key.split(":");
  const role = state.lib.roles.find((r) => r.id === id);
  if (!role) return;
  state.sel = { key, role, reminder: kind === "r" ? +idx : null };
  $$("#rows .tok").forEach((b) => b.setAttribute("aria-current", String(b.dataset.key === key)));
  $$("#rows .row").forEach((row) => row.dataset.current = String(!!row.querySelector(`[data-key="${key}"]`)));
  if (state.sel.reminder != null) { viewer.setView("top"); syncView("top"); }
  $("#workshop").classList.add("open");
  renderWorkshop();
}

// ------------------------------------------------------------ workshop

/** The spec the style controls edit: the set's, or the selected token's own. */
function editingSpec() {
  if (state.tab === "token") return state.overrides.get(state.sel.key)?.spec ?? null;
  return state.spec;
}

let raf = 0;
function renderWorkshop() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const { key, role, reminder } = state.sel;
    const isRem = reminder != null;
    const lang = uiLang();
    const spec = specFor(key, isRem);
    const text = textFor(key, role, reminder);
    const token = buildToken(state.lib, role, spec, text);
    state.token = token;
    viewer.setToken(token);
    // X-ray only makes sense with a magnet inside.
    $("#xray").hidden = !token.magnet;
    if (!token.magnet && $("#xray").getAttribute("aria-pressed") === "true") { $("#xray").setAttribute("aria-pressed", "false"); viewer.setXray(false); }

    $("#name").textContent = text;
    $("#sub").textContent = [isRem ? textFor(charKey(role), role, null) : null, TEAMS[role.team].label[lang], EDITIONS[role.edition]?.name[lang],
      role.en !== text && !isRem ? role.en : null].filter(Boolean).join(" · ");
    $("#enqueue").textContent = t(isRem ? "act.addReminder" : "act.addChar");

    // tabs
    $$(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    $("#styleControls").hidden = state.tab === "saved";
    $("#savedPanel").hidden = state.tab !== "saved";
    const own = state.overrides.get(key);
    $("#tokenOnly").hidden = state.tab !== "token";
    $("#printed").value = own?.text ?? "";
    $("#printed").placeholder = isRem ? remindersOf(role)[reminder] : charName(role, key);
    const femName = !isRem && role.fem?.[tokenLang()];
    $("#femRow").hidden = !femName;
    if (femName) { $("#fem").checked = !!own?.fem; $("#femLabel").textContent = t("ws.fem", { name: femName }); }
    $("#ownStyle").checked = !!own?.spec;
    $("#resetToken").hidden = !own;
    $("#styleScope").textContent = state.tab === "set" ? t("ws.scopeSet") : own?.spec ? t("ws.scopeTokenOn") : t("ws.scopeTokenOff");
    const editing = editingSpec();
    $("#styleFields").disabled = !editing;
    renderPresets(role, editing);
    renderBackTiles(role, editing ?? state.spec);
    renderFrameTiles(role, editing ?? state.spec);
    syncControls(editing ?? state.spec);

    $("#depthHint").className = "hint" + (token.depthClamped ? " warn" : "");
    $("#depthHint").textContent = token.depthClamped
      ? t("depth.clamped", { max: token.depthClamped.toFixed(1), core: "0.4" })
      : t("depth.help");
    const n = token.name;
    $("#nameHint").className = "hint" + (n.letterHeight < 2.5 ? " warn" : "");
    $("#nameHint").textContent = n.total == null
      ? t("name.hintWindow", { lines: n.lines, mm: n.letterHeight.toFixed(1), small: n.letterHeight < 2.5 })
      : t("name.hint", { arc: n.total.toFixed(0), mm: n.letterHeight.toFixed(1), shrunk: n.scale < 1, small: n.letterHeight < 2.5 });
    $("#nameSummary").textContent = `${n.letterHeight.toFixed(1)} mm`;
  });
}

/** The frame designs, each drawn on the selected character in the current colours. */
function renderFrameTiles(role, spec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45 };
  const text = textFor(charKey(role), role, null);
  const list = s.style === "window" ? FRAME_STYLES.filter((f) => f.id === "none" || f.id === "rim") : FRAME_STYLES;
  $("[data-choice=frame]").innerHTML = list.map((f) =>
    `<button class="back-tile frame-tile" type="button" data-v="${f.id}" aria-pressed="${(s.style === "window" && s.frame !== "none" ? "rim" : s.frame) === f.id}">${
      tokenSvg(state.lib, role, { ...s, frame: f.id, frameWidth: f.id === "rim" || f.id === "double" ? Math.max(s.frameWidth, 0.8) : s.frameWidth }, { text })
    }<span>${esc(t(`frame.${f.id}`))}</span></button>`).join("");
}

/** The back designs as small coin backs, in the colours of the style being edited. */
function renderBackTiles(role, spec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, diameter: 45 };
  if (s.colours.back === "team") s.colours.back = FILAMENTS.gold;
  $("[data-choice=back]").innerHTML = BACK_STYLES.filter((b) => b.id !== "seal").map((b) =>
    `<button class="back-tile" type="button" data-v="${b.id}" aria-pressed="${s.back === b.id}">${
      b.id === "custom" && !s.customSvg ? `<span class="upload-tile">SVG</span>` : tokenSvg(state.lib, role, { ...s, back: b.id }, { side: "back" })
    }<span>${esc(t(`back.${b.id}`))}</span></button>`).join("");
}

/** The premade designs, each previewed with the selected character. */
function renderPresets(role, editing) {
  $("#presetsBox").hidden = !editing;
  if (!editing) return;
  const same = (p) => Object.entries(p.spec).every(([k, v]) => JSON.stringify(k === "colours" ? { ...DEFAULT_SPEC.colours, ...editing.colours, ...v } : v) === JSON.stringify(k === "colours" ? { ...DEFAULT_SPEC.colours, ...editing.colours } : editing[k] ?? DEFAULT_SPEC[k]));
  $("#presets").innerHTML = PRESETS.map((p) =>
    `<button class="preset" type="button" data-preset="${p.id}" aria-pressed="${same(p)}">${tokenSvg(state.lib, role, { ...presetSpec(p), diameter: 45 }, { text: textFor(charKey(role), role, null) })}<span>${esc(t(`preset.${p.id}`))}</span><small>${esc(t(`preset.${p.id}.help`))}</small></button>`).join("");
}

/** Puts a spec's values into the style controls. */
function syncControls(spec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours } };
  const dec = uiLang() === "es" ? "," : ".";
  for (const [id, [dp, unit]] of Object.entries(RANGES)) {
    $("#" + id).value = s[id];
    $(`output[data-for=${id}]`).textContent = (+s[id]).toFixed(dp).replace(".", dec) + unit;
  }
  $("#styleSummary").textContent = t(`style.${s.style}`);
  $("#styleHint").textContent = t(`style.${s.style}.help`);
  $("#windowFinishRow").hidden = s.style !== "window";
  $("#windowDepthRow").hidden = s.style !== "window" || s.windowFinish === "flat";
  $("#styleHint").textContent = t(s.style === "window" ? `windowFinish.${s.windowFinish}.help` : `style.${s.style}.help`);
  // The curved-name controls don't apply to the window style.
  for (const id of ["spacing", "maxArc"]) $("#" + id).closest(".row").hidden = s.style === "window";
  $("#frameSummary").textContent = t(`frame.${s.frame}`);
  $("#backSummary").textContent = t(`back.${s.back}`);
  // Magnet: the hole, the pause and how thick the coin has to be.
  const m = magnetLayout(s), dec2 = (v) => String(v).replace(".", dec);
  $("#magnetSizeRow").hidden = !m;
  $("#magnetSummary").textContent = m ? `${t(`magnet.${m.kind}`)} · ${m.md}×${m.mt}` : t("magnet.none");
  $("#magnetHint").textContent = !m ? t("magnet.none.help")
    : t(`magnet.${m.kind}.help`, { d: dec2((m.radius * 2).toFixed(1)), size: `${m.md} × ${m.mt}`, z: dec2(m.pauseZ) })
      + (s.height < m.minHeight ? " " + t("magnet.taller", { from: dec2(s.height), to: dec2(m.minHeight) }) : "");
  $("#coinSummary").textContent = `${s.diameter} × ${dec2(Math.max(s.height, m?.minHeight ?? 0))} mm`;
  $$("[data-choice] button").forEach((b) => b.setAttribute("aria-pressed", String(s[b.parentElement.dataset.choice] === b.dataset.v)));
  $$(".metal").forEach((box) => $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === s.colours[box.dataset.colour]))));
}

/** Applies a style change to whatever the controls are editing. */
function changeStyle(mutate) {
  const target = editingSpec();
  if (!target) return;
  mutate(target);
  if (state.tab === "set") storeJSON(STYLE_KEY, state.spec); else storeOverrides();
  renderWorkshop();
  scheduleSheet();
}
let sheetTimer = 0;
function scheduleSheet() { clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { renderSheet(); renderQueue(); }, 180); }
function storeOverrides() { storeJSON(OVERRIDES_KEY, Object.fromEntries(state.overrides)); }

function syncView(v) { $$(".turn .pill[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v))); }

function buildChoices() {
  const make = (key, list) => {
    $(`[data-choice=${key}]`).innerHTML = list.map((s) => `<button class="pill" type="button" data-v="${s.id}">${esc(t(`${key}.${s.id}`))}</button>`).join("");
  };
  make("style", TOKEN_STYLES);
  make("windowFinish", [{ id: "relief" }, { id: "flat" }]);
  make("magnet", [{ id: "none" }, { id: "pocket" }, { id: "hidden" }]);
  $("[data-choice=magnetSize]").innerHTML = MAGNET_SIZES.map((v) => `<button class="pill" type="button" data-v="${v}">${v.replace("x", " × ")} mm</button>`).join("");
  // Frames are drawn as coin tiles by renderFrameTiles().
  // Backs are drawn as coin tiles by renderBackTiles().
  for (const box of $$(".metal")) {
    // Every filament the Bambu export knows. Only the frame can take the team colour:
    // on the coin or the back it would show the team from behind.
    const opts = [...(box.dataset.colour === "frame" ? [{ id: "team", hex: "team" }] : []), ...COLOUR_CHOICES];
    box.innerHTML = opts.map((o) => `<button type="button" class="${o.id === "team" ? "team" : ""}" data-v="${o.hex}" style="${o.id === "team" ? "" : `background:${o.hex}`}" aria-label="${esc(t(`metal.${o.id}`))}" title="${esc(t(`metal.${o.id}`))}"></button>`).join("");
  }
}

// ------------------------------------------------------------ wiring

function wire() {
  // spine and sheet
  $("#editions").onclick = (e) => {
    const b = e.target.closest("[data-ed]"); if (!b) return;
    state.edition = b.dataset.ed; state.team = "all"; $("#search").value = "";
    renderSpine(); renderSheet(); $("#sheet").scrollTo({ top: 0 });
  };
  $("#search").oninput = () => { renderSpine(); renderSheet(); };
  $("#teamChips").onclick = (e) => { const b = e.target.closest("[data-team]"); if (b) { state.team = b.dataset.team; renderSheet(); } };
  $("#rows").onclick = (e) => {
    const add = e.target.closest("[data-add]"), all = e.target.closest("[data-addall]"), pick = e.target.closest("[data-key]");
    if (add) { const r = roleById(add.dataset.add); const n = addCharacter(r); note(t("act.queued", { name: textFor(charKey(r), r, null), n })); return; }
    if (all) {
      const r = roleById(all.dataset.addall);
      addToQueue(r, null); remindersOf(r).forEach((_, i) => addToQueue(r, i));
      note(t("act.queued", { name: textFor(charKey(r), r, null), n: remindersOf(r).length }));
      return;
    }
    if (pick) select(pick.dataset.key);
  };

  $("#addShownChars").onclick = () => addShown(false);
  $("#addShownAll").onclick = () => addShown(true);

  // workshop
  $("#wsClose").onclick = () => $("#workshop").classList.remove("open");
  $$(".turn .pill[data-view]").forEach((b) => b.onclick = () => { viewer.setView(b.dataset.view); syncView(b.dataset.view); });
  $("#xray").onclick = () => {
    const on = $("#xray").getAttribute("aria-pressed") !== "true";
    $("#xray").setAttribute("aria-pressed", String(on));
    viewer.setXray(on);
    if (on) { viewer.setView("side"); syncView("side"); }
  };
  $$(".tabs [data-tab]").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; renderWorkshop(); });
  for (const key of ["style", "windowFinish", "frame", "back", "magnet", "magnetSize"]) {
    $(`[data-choice=${key}]`).onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (key === "back" && b.dataset.v === "custom" && !editingSpec()?.customSvg) { $("#upload").click(); return; }
      changeStyle((s) => { s[key] = b.dataset.v; });
      if (key === "back") { viewer.setView("back"); syncView("back"); }
    };
  }
  for (const box of $$(".metal")) box.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    changeStyle((s) => { s.colours = { ...DEFAULT_SPEC.colours, ...s.colours, [box.dataset.colour]: b.dataset.v }; });
  };
  for (const id of Object.keys(RANGES)) $("#" + id).oninput = (e) => changeStyle((s) => { s[id] = +e.target.value; });
  $("#upload").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    const hint = $("#uploadHint");
    hint.hidden = false;
    if (f.size > MAX_SVG) { hint.className = "hint warn"; hint.textContent = t("upload.tooBig", { file: f.name, kb: (f.size / 1024).toFixed(0), max: MAX_SVG / 1000 }); return; }
    const svg = await f.text();
    changeStyle((s) => { s.customSvg = svg; s.back = "custom"; });
    hint.className = "hint"; hint.textContent = t("upload.using", { file: f.name });
    viewer.setView("back"); syncView("back");
  };
  $("#presets").onclick = (e) => {
    const b = e.target.closest("[data-preset]"); if (!b) return;
    const next = presetSpec(PRESETS.find((p) => p.id === b.dataset.preset));
    changeStyle((s) => { for (const k of Object.keys(next)) if (k !== "lang" && k !== "customSvg") s[k] = structuredClone(next[k]); });
  };
  // this token only
  $("#printed").oninput = (e) => {
    const own = { ...(state.overrides.get(state.sel.key) || {}), text: e.target.value };
    if (!own.text && !own.spec && !own.fem) state.overrides.delete(state.sel.key); else state.overrides.set(state.sel.key, own);
    storeOverrides(); renderWorkshop(); scheduleSheet();
  };
  $("#ownStyle").onchange = (e) => {
    const own = { ...(state.overrides.get(state.sel.key) || {}) };
    if (e.target.checked) own.spec = structuredClone(state.spec); else delete own.spec;
    if (!own.text && !own.spec && !own.fem) state.overrides.delete(state.sel.key); else state.overrides.set(state.sel.key, own);
    storeOverrides(); renderWorkshop(); scheduleSheet();
  };
  $("#fem").onchange = (e) => {
    const own = { ...(state.overrides.get(state.sel.key) || {}) };
    if (e.target.checked) own.fem = true; else delete own.fem;
    if (!own.text && !own.spec && !own.fem) state.overrides.delete(state.sel.key); else state.overrides.set(state.sel.key, own);
    storeOverrides(); renderWorkshop(); scheduleSheet();
  };
  $("#resetToken").onclick = () => { state.overrides.delete(state.sel.key); storeOverrides(); renderWorkshop(); scheduleSheet(); };
  $("#enqueue").onclick = () => {
    const { role, reminder } = state.sel;
    if (reminder != null) { addToQueue(role, reminder); note(t("reminders.added", { n: 1, name: textFor(charKey(role), role, null) })); }
    else { const n = addCharacter(role); note(t("act.queued", { name: textFor(charKey(role), role, null), n })); }
  };
  $("#download").onclick = forge;
  $("#save").onclick = save;
  $("#saved").onclick = onSavedClick;

  // queue
  $("#queueToggle").onclick = () => {
    const open = $("#queuePanel").hidden;
    $("#queuePanel").hidden = !open; $("#queueToggle").setAttribute("aria-expanded", String(open));
  };
  $("#queue").onclick = (e) => { const b = e.target.closest("[data-unqueue]"); if (b) { state.queue = state.queue.filter((q) => q.key !== b.dataset.unqueue); persistQueue(); renderQueue(); } };
  $("#queueClear").onclick = (e) => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("queue.clearConfirm"); return; }
    b.dataset.confirm = ""; b.textContent = t("queue.clear");
    state.queue = []; persistQueue(); renderQueue();
  };
  $("#bambu").onclick = downloadBambu;
  $("#pdf").onclick = downloadPdf;
  $("#scriptFile").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importScript(await f.text()); };
  $("#pasteToggle").onclick = () => { const box = $("#pasteBox"); box.hidden = !box.hidden; $("#pasteToggle").setAttribute("aria-expanded", String(!box.hidden)); if (!box.hidden) $("#scriptText").focus(); };
  $("#pasteImport").onclick = () => importScript($("#scriptText").value);

  // account
  $("#signOut").onclick = () => { $(".me").open = false; signOutUser(); };
  $("#openAdmin").onclick = () => { $(".me").open = false; openAdmin(); };
  $("#adminSignIn").onclick = adminSignIn;
}

const roleById = (id) => state.lib.roles.find((r) => r.id === id);
function note(text) { $("#exportNote").textContent = text; }

async function forge() {
  const btn = $("#download");
  btn.disabled = true;
  try {
    const { role, reminder, key } = state.sel;
    const zip = new JSZip();
    const folder = addTokenToZip(zip, state.token, role, textFor(key, role, reminder), { faceDown: true });
    await saveFile(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
    note(t("act.downloaded", { file: `${folder}.zip` }));
  } catch (err) {
    note(t("act.downloadFailed", { message: err?.message || err }));
  } finally { btn.disabled = false; }
}

// ------------------------------------------------------------ print queue

function loadQueue() {
  state.queue = loadJSON(QUEUE_KEY, []).filter((q) => q && state.lib.roles.some((r) => r.id === q.roleId) && q.spec);
}
function persistQueue() { storeJSON(QUEUE_KEY, state.queue); }

/**
 * Queues a character (reminder = null) or one of its reminders, with the style
 * and text it has right now.
 */
function addToQueue(role, reminder, { save = true } = {}) {
  const key = reminder != null ? remKey(role, reminder) : charKey(role);
  const own = state.overrides.get(key);
  state.queue.push({
    key: crypto.randomUUID(), roleId: role.id,
    reminder: reminder != null ? textFor(key, role, reminder) : null,
    text: reminder == null ? textFor(key, role, null) : null,
    custom: !!own,
    spec: { ...structuredClone(own?.spec ?? state.spec), lang: tokenLang() },
  });
  if (save) { persistQueue(); renderQueue(); }
}

/** Queues every character shown on the sheet, optionally with all their reminders. */
function addShown(withReminders) {
  const roles = state.shown || [];
  let rems = 0;
  for (const r of roles) {
    addToQueue(r, null, { save: false });
    if (withReminders) remindersOf(r).forEach((_, i) => { addToQueue(r, i, { save: false }); rems++; });
  }
  persistQueue(); renderQueue();
  note(t("act.queuedMany", { n: roles.length, rems }));
}
/** Queues a character and, if "Include reminder tokens" is ticked, its reminders. Returns how many reminders. */
function addCharacter(role) {
  addToQueue(role, null);
  if (!$("#withReminders").checked) return 0;
  const list = remindersOf(role);
  list.forEach((_, i) => addToQueue(role, i));
  return list.length;
}
const isReminder = (q) => q.reminder != null;
const itemSpec = (q) => (isReminder(q) ? reminderSpec({ ...DEFAULT_SPEC, ...q.spec }) : { ...DEFAULT_SPEC, ...q.spec });
const queueTitle = (q, role) => (isReminder(q) ? q.reminder : q.text ?? roleName(role, q.spec.lang));
const queueLabel = (q, role) => (isReminder(q) ? `${roleName(role, q.spec.lang)}: ${q.reminder}` : queueTitle(q, role));
const queueGroup = (q, role) => PLATE_LABEL[uiLang()][PLATE_GROUP[role.team]] + (isReminder(q) ? t("queue.reminderSuffix") : "");

/** Plate plan without building geometry: which parts exist and their colours. */
function queuePlan() {
  const items = state.queue.map((q) => {
    const role = roleById(q.roleId);
    const base = itemSpec(q);
    const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours } };
    const team = TEAMS[role.team].colour, pick = (v) => (v === "team" ? team : v);
    const hasBack = spec.back !== "none" && (spec.back !== "custom" || spec.customSvg) && (spec.back !== "seal" || state.lib.sealSvg) && (spec.back !== "edition" || role.edition);
    return {
      title: queueLabel(q, role), group: queueGroup(q, role),
      token: { spec, parts: { base: 1, front: 1, icon: spec.style === "window" && spec.windowFinish === "flat" ? 1 : null, frame: spec.frame !== "none" ? 1 : null, back: hasBack ? 1 : null },
        colours: { base: pick(spec.colours.base), front: pick(spec.colours.front), icon: pick(spec.colours.base), frame: pick(spec.colours.frame), back: pick(spec.colours.back) } },
    };
  });
  return planPlates(items);
}

function renderQueue() {
  if (!state.lib) return;
  const n = state.queue.length;
  $("#queueCount").textContent = n ? t("queue.count", { n }) : t("queue.emptyShort");
  $("#queueClear").hidden = !n;
  $("#bambu").disabled = !n;
  $("#pdf").disabled = !n;
  const pics = state.queue.map((q) => {
    const role = roleById(q.roleId);
    return { q, role, pic: tokenSvg(state.lib, role, itemSpec(q), { text: queueTitle(q, role) }) };
  });
  $("#queueStack").innerHTML = pics.slice(-5).map((p) => p.pic).join("");
  $("#queue").innerHTML = pics.map(({ q, role, pic }) => {
    const label = queueLabel(q, role);
    return `<li><span class="open">${pic}<span>${esc(label)}${q.custom ? " ✎" : ""}</span></span><button class="del" type="button" data-unqueue="${q.key}" aria-label="${esc(t("queue.removeAria", { name: label }))}">${esc(t("queue.remove"))}</button></li>`;
  }).join("") || `<li class="hint">${esc(t("queue.empty"))}</li>`;
  const plan = $("#queuePlan");
  if (!n) { plan.className = "hint"; plan.textContent = t("queue.barHint"); return; }
  try {
    const p = queuePlan();
    const used = [...new Set(p.plates.flatMap((x) => [...x.slots]))].map(filamentName);
    plan.className = "hint";
    plan.textContent = t("queue.plan", { n: p.plates.length, plates: p.plates.map((x) => `${x.name} (${x.items.length})`).join(", "), filaments: used.join(", ") });
  } catch (err) {
    plan.className = "hint warn";
    plan.textContent = err.message;
  }
}

async function downloadBambu() {
  const btn = $("#bambu"), out = $("#queuePlan");
  btn.disabled = true;
  try {
    const items = [];
    for (const [i, q] of state.queue.entries()) {
      const role = roleById(q.roleId);
      out.textContent = t("queue.building", { i: i + 1, n: state.queue.length, name: queueLabel(q, role) });
      await new Promise((r) => setTimeout(r));
      items.push({ token: buildToken(state.lib, role, itemSpec(q), queueTitle(q, role)), title: queueLabel(q, role), group: queueGroup(q, role) });
    }
    const { blob, plan, filaments, pauses } = await buildBambuProject(items, { onProgress: (d, total) => { out.textContent = t("queue.writing", { i: d, n: total }); } });
    const file = `midnight-mint-${items.length}-tokens.3mf`;
    await saveFile(blob, file);
    out.className = "hint";
    out.textContent = t("queue.done", { file, n: plan.plates.length, filaments: filaments.map((f) => t(`filament.${f.name}`)).join(", ") })
      + (pauses.length ? " " + t("queue.pauses", { z: pauses.map((z) => String(z).replace(".", uiLang() === "es" ? "," : ".")).join(", ") }) : "");
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.failed", { message: err.message });
  } finally { btn.disabled = false; }
}

/** The queue as an A4 PDF of paper tokens: fronts and backs on alternate pages, for duplex printing. */
async function downloadPdf() {
  const btn = $("#pdf"), out = $("#queuePlan");
  btn.disabled = true;
  try {
    out.className = "hint"; out.textContent = t("queue.pdfLoading");
    const { buildPrintPdf } = await import("./pdf/print-pdf.js");   // jsPDF only loads when asked for
    const entries = state.queue.map((q) => { const role = roleById(q.roleId); return { role, spec: itemSpec(q), text: queueTitle(q, role) }; });
    const { blob, sheets } = await buildPrintPdf(state.lib, entries, {
      labels: { front: t("queue.pdfFront"), back: t("queue.pdfBack") },
      onProgress: (i, n) => { out.textContent = t("queue.pdfWriting", { i, n }); },
    });
    const file = `midnight-mint-${entries.length}-tokens.pdf`;
    await saveFile(blob, file);
    out.textContent = t("queue.pdfDone", { file, n: sheets });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.pdfFailed", { message: err.message });
  } finally { btn.disabled = !state.queue.length; }
}

// ------------------------------------------------------------ script import

const idKey = (s) => fold(s).replace(/[^a-z0-9]/g, "");

/**
 * Reads a script in the official Script Tool format: an array whose entries are
 * character ids ("washerwoman") or objects ({"id": "washerwoman"}), with an
 * optional {"id": "_meta", "name": …} entry. Ids are matched loosely.
 */
function parseScript(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(t("import.badJson")); }
  if (!Array.isArray(data)) throw new Error(t("import.notList"));
  const byKey = new Map(state.lib.roles.flatMap((r) => [[idKey(r.en), r], [idKey(r.id), r]]));
  let name = null;
  const roles = [], skipped = [];
  for (const entry of data) {
    const id = typeof entry === "string" ? entry : entry?.id;
    if (!id) continue;
    if (id === "_meta") { name = entry.name || null; continue; }
    const role = byKey.get(idKey(id)) || (entry?.name && byKey.get(idKey(entry.name)));
    if (role) { if (!roles.includes(role)) roles.push(role); }
    else skipped.push(entry?.name || id);
  }
  if (!roles.length) throw new Error(t("import.noneKnown"));
  return { name, roles, skipped };
}

function importScript(text) {
  const out = $("#importNote");
  try {
    const { name, roles, skipped } = parseScript(text);
    const extra = roles.reduce((n, r) => n + addCharacter(r), 0);
    out.className = "hint";
    out.textContent = t("import.done", { n: roles.length, extra, name }) +
      (skipped.length ? t("import.skipped", { n: skipped.length, list: skipped.slice(0, 6).join(", ") + (skipped.length > 6 ? "…" : "") }) : "");
    $("#pasteBox").hidden = true; $("#pasteToggle").setAttribute("aria-expanded", "false"); $("#scriptText").value = "";
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("import.failed", { message: err.message });
  }
}

// ------------------------------------------------------------ saved designs

// Saved designs live in this browser (localStorage), newest first.
const readDesigns = () => loadJSON(DESIGNS_KEY, []).filter((d) => d && d.id && d.roleId && d.spec);
const writeDesigns = (list) => storeJSON(DESIGNS_KEY, list);
function refreshDesigns() { state.designs = readDesigns(); renderDesigns(); }

/** Moves designs saved to an account (before sign-in was dropped) into this browser. */
async function importAccountDesigns(user) {
  const remote = await listAccountDesigns(user.uid);
  if (!remote.length) return;
  const list = readDesigns();
  for (const d of remote) {
    if (list.some((x) => x.id === d.id)) continue;
    const { updatedAt, ...rest } = d;
    list.push({ ...rest, updatedAt: updatedAt?.toMillis?.() ?? Date.now() });
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
    const pic = tokenSvg(state.lib, role, { ...DEFAULT_SPEC, ...d.spec, diameter: 45, colours: { ...DEFAULT_SPEC.colours, ...d.spec.colours } }, { text: d.text || (d.fem && role.fem?.[d.spec.lang]) || roleName(role, d.spec.lang) });
    return `<li><button class="open" type="button" data-open="${d.id}">${pic}<span>${esc(d.title)}</span></button><button class="del" type="button" data-del="${d.id}" aria-label="${esc(t("saved.deleteAria", { name: d.title }))}">${esc(t("saved.delete"))}</button></li>`;
  }).join("") || `<li class="hint">${esc(t("saved.empty"))}</li>`;
}
async function save() {
  const btn = $("#save");
  btn.disabled = true;
  const { key, role, reminder } = state.sel;
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
    $("#saveNote").textContent = t("saved.failed", { message: err.message });
  } finally { btn.disabled = false; }
}
async function onSavedClick(e) {
  const open = e.target.closest("[data-open]"), del = e.target.closest("[data-del]");
  if (open) {
    // A saved design becomes that token's own style and name.
    const d = state.designs.find((x) => x.id === open.dataset.open);
    const role = roleById(d.roleId);
    const { lang, ...spec } = d.spec;
    state.overrides.set(charKey(role), { text: d.text || null, spec, ...(d.fem ? { fem: true } : {}) });
    storeOverrides();
    if (role.edition) state.edition = role.edition;
    $("#search").value = "";
    state.tab = "token";
    renderSpine(); renderSheet(); select(charKey(role));
    $("#saveNote").textContent = t("saved.opened", { name: d.title });
  }
  if (del) {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = t("saved.deleteConfirm"); return; }
    writeDesigns(readDesigns().filter((d) => d.id !== del.dataset.del));
    refreshDesigns();
  }
}

// ------------------------------------------------------------ credits

const AUTHOR_NAMES = {
  lorc: "Lorc", delapouite: "Delapouite", "caro-asercion": "Caro Asercion", skoll: "Skoll", "carl-olsen": "Carl Olsen",
  "lord-berandas": "Lord Berandas", "various-artists": "Various artists", cathelineau: "Cathelineau", zajkonur: "Zajkonur",
  aussiesim: "AussieSim", faithtoken: "Faithtoken", starseeker: "Starseeker", willdabeast: "Willdabeast",
};
const authorName = (a) => AUTHOR_NAMES[a] || a.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Credits: the game, the translators (the translation in use first), the icon authors
 * (CC BY 3.0 asks for author credit) and the fonts and libraries.
 */
function openCredits() {
  const cur = tokenLang();
  const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${esc(text)}</a>`;
  const translations = [...TRANSLATIONS].sort((a, b) => (b.id === cur) - (a.id === cur)).map((x) => `<li${x.id === cur ? ' aria-current="true"' : ""}>
    <b>${esc(tlName(x))}</b><span>${esc(x.pack ? x.by ?? t("credits.community") : t("credits.official"))}${x.fem ? ` <small>· ${esc(t("credits.feminine"))}</small>` : ""}</span>
    ${x.id === cur ? `<em>${esc(t("credits.inUse"))}</em>` : ""}</li>`).join("");

  const byAuthor = new Map();
  for (const r of state.lib?.roles || []) {
    if (!r.icon) continue;
    if (!byAuthor.has(r.author)) byAuthor.set(r.author, new Set());
    byAuthor.get(r.author).add(r.icon);
  }
  const icons = [...byAuthor].sort((a, b) => b[1].size - a[1].size).map(([a, set]) => `<li><details>
    <summary><b>${esc(authorName(a))}</b> <small>${esc(t("credits.count", { n: set.size }))}</small></summary>
    <p>${[...set].sort().map((i) => link(`https://game-icons.net/1x1/${encodeURIComponent(a)}/${encodeURIComponent(i)}.html`, i)).join(", ")}</p></details></li>`).join("");

  $("#creditsBody").innerHTML = `<p class="hint">${esc(t("credits.intro"))}</p>
    <section><h3>${esc(t("credits.translations"))}</h3>
      <p class="hint">${esc(t("credits.translationsIntro")).replace("Villacuervos", link(VILLACUERVOS_URL, "Villacuervos"))}</p>
      <ul class="credit-grid">${translations}</ul></section>
    <section><h3>${esc(t("credits.icons"))}</h3>
      <p class="hint">${esc(t("credits.iconsIntro")).replace("game-icons.net", link("https://game-icons.net", "game-icons.net"))}</p>
      <ul class="credit-icons">${icons}</ul></section>
    <section><h3>${esc(t("credits.more"))}</h3>
      <p class="hint">${esc(t("credits.moreText"))}</p>
      <p class="hint">${esc(t("credits.code"))}: ${link("https://github.com/rexuswolf/midnight-mint", "GitHub")} · PolyForm Noncommercial 1.0.0</p></section>`;
  $("#credits").showModal();
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-credits]")) { e.preventDefault(); openCredits(); } });

// ------------------------------------------------------------ admin

async function openAdmin() {
  const dlg = $("#admin");
  if (!dlg.open) dlg.showModal();
  const roles = state.lib?.roles.length ?? (await loadRoles()).length;
  $("#libraryState").textContent = roles ? t("admin.libraryState", { n: roles }) : t("admin.libraryEmpty");
}
$("#libraryFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  const out = $("#libraryState");
  try {
    const roles = JSON.parse(await f.text());
    const count = await uploadRoles(roles, (done, total) => { out.textContent = t("admin.uploading", { i: done, n: total }); });
    out.textContent = t("admin.uploaded", { n: count });
    setTimeout(() => location.reload(), 800);
  } catch (err) { out.textContent = t("admin.uploadFailed", { message: err.message }); }
};
