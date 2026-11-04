import {
  loadLibrary, buildToken, magnetLayout, MAGNET_SIZES, tokenSvg, roleName, saveFile, reminderSpec, layoutName,
  TEAMS, EDITIONS, FRAME_STYLES, BACK_STYLES, TOKEN_STYLES, FILAMENTS, DEFAULT_SPEC,
} from "./engine/token-engine.js";
import {
  onUser, signIn, signOutUser, isAdmin, loadRoles, uploadRoles, listAccountDesigns, deleteAccountDesign,
} from "./firebase.js";
import { planPlates, FILAMENT_SLOTS, PRINTERS, printerOf } from "./bambu/plates.js";
import { PAGE, layoutCoins, backX } from "./pdf/layout.js";
import { t, uiLang, setUiLang, LANGUAGES } from "./i18n.js";
import { TRANSLATIONS, VILLACUERVOS_URL, translationById, translationGroups } from "./translations.js";
import { loadScripts, storeScripts, saveScript, scriptLink, readLink, scriptJson, idKey as scriptKey } from "./scripts.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const RANGES = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], windowDepth: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"] };
const MAX_SVG = 300000;
// The source code. Its links (sidebar footer and credits) stay hidden while the repository
// is private, so nobody lands on GitHub's 404: set REPO_PUBLIC to true once it is published.
const REPO_URL = "https://github.com/rexuswolf/midnight-mint";
const REPO_PUBLIC = false;
const QUEUE_KEY = "midnight-mint-queue";   // the old print queue, read once to carry it over
const PICK_KEY = "midnight-mint-picks";
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
  es: { good: "Aldeanos y forasteros", evil: "Esbirros y demonios", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos" },
  en: { good: "Townsfolk & outsiders", evil: "Minions & demons", traveller: "Travellers", fabled: "Fabled", loric: "Loric" },
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
  step: 1,
  pick: new Map(),         // token key ("c:imp", "r:imp:0") -> copies
  designs: [],
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

// The 3D preview loads on its own (WebGL and camera controls), so the sheet doesn't wait for
// it. Until it's ready, calls are remembered and replayed: the latest token, view and X-ray.
let viewer = null;
const viewerWaiting = {};
const view3d = (method, ...args) => { if (viewer) viewer[method](...args); else viewerWaiting[method] = args; };
function loadViewer() {
  import("./engine/viewer.js").then(({ createViewer }) => {
    viewer = createViewer($("#view"));
    view3d("setView", "angle");
    for (const m of ["setToken", "setXray", "setView"]) if (viewerWaiting[m]) viewer[m](...viewerWaiting[m]);
  }).catch((err) => console.error("3D preview failed to load", err));
}

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
/** Characters by team, then alphabetically by the name the token shows. */
// The token language is a translation id ("es-bumble3ee"); collation needs its language ("es").
const collators = new Map();
const collator = (lang = translationById(tokenLang()).lang) => collators.get(lang) ?? collators.set(lang, new Intl.Collator(lang, { sensitivity: "base" })).get(lang);
const byName = (a, b) => collator().compare(textFor(charKey(a), a, null), textFor(charKey(b), b, null));
const byTeamName = (a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || byName(a, b);
/** Token keys in sheet order: team, name, the character before its reminders. */
const sortKeys = (keys) => [...keys].sort((a, b) => byTeamName(tokenRole(a), tokenRole(b)) || (tokenRem(a) ?? -1) - (tokenRem(b) ?? -1));
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
  if (state.lib) { buildChoices(); renderAll(); renderQueue(); renderDesigns(); if ($("#scriptInvite").open) renderInvite(); }
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
  if (state.lib) { renderAll(); renderQueue(); if ($("#scriptInvite").open) renderInvite(); }
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
  $("#repoLink").hidden = !REPO_PUBLIC;
  $("#repoLink a").href = REPO_URL;
  $("#gate").hidden = true;
  $("#app").hidden = false;
  renderAccount();
  if (!started) {
    started = true;
    loadViewer();
    wire();
  }
  const first = state.lib.roles.find((r) => r.en === "Fortune Teller") || state.lib.roles[0];
  if (!state.sel) state.sel = { key: charKey(first), role: first, reminder: null };
  state.edition = state.sel.role.edition || "tb";
  buildChoices();
  state.pick = loadPicks();
  persistPicks();
  renderAll();
  goStep(1);
  refreshDesigns();
  openSharedScript();
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
      <span>${esc(EDITIONS[e].name[lang])}<small>${esc(t("ed.count", { c: roles.length, r: rem }))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("");
  const scripts = loadScripts();
  $("#scripts").innerHTML = scripts.map((sc) => {
    const { roles, missing } = scriptRoles(sc);
    return `<button class="ed" type="button" data-ed="s:${esc(sc.id)}" aria-current="${state.edition === `s:${sc.id}` && !searchQuery()}">
      <span>${esc(sc.name)}<small>${esc(t("script.count", { n: roles.length, m: missing.length }))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("") || `<p class="scripts-empty">${esc(t("script.empty"))} <button type="button" data-script-new>${esc(t("script.emptyAdd"))}</button></p>`;
}

/** How many tokens of these characters (with copies and reminders) are picked, as a badge. */
function pickedBadge(roles) {
  const ids = new Set(roles.map((r) => r.id));
  let n = 0;
  for (const [k, c] of state.pick) if (ids.has(k.split(":")[1])) n += c;
  return n ? `<span class="got" aria-label="${esc(t("pick.badge", { n }))}">${n}</span>` : "";
}

// ------------------------------------------------------------ scripts

/** The sheet shows an edition ("tb") or one of your scripts ("s:<id>"). */
const scriptOf = (view) => (view?.startsWith("s:") ? loadScripts().find((x) => x.id === view.slice(2)) ?? null : null);
/** A script's characters that are in the library, and the ids that aren't (with their names, when known). */
function scriptRoles(sc) {
  const byKey = new Map(state.lib.roles.flatMap((r) => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  const roles = [], missing = [];
  for (const id of sc.ids) {
    const r = byKey.get(id) || (sc.labels?.[id] && byKey.get(scriptKey(sc.labels[id])));
    if (r) { if (!roles.includes(r)) roles.push(r); } else missing.push(sc.labels?.[id] || id);
  }
  return { roles, missing };
}
/** Reads a script in the Script Tool's JSON format into a name and ids. */
function readScriptJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(t("import.badJson")); }
  if (!Array.isArray(data)) throw new Error(t("import.notList"));
  let name = null;
  const ids = [], labels = {};
  for (const entry of data) {
    const raw = typeof entry === "string" ? entry : entry?.id;
    if (!raw) continue;
    if (raw === "_meta") { name = entry.name || null; continue; }
    const id = scriptKey(raw);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    if (entry?.name) labels[id] = entry.name;
  }
  const script = { name: name?.trim() || t("script.unnamed"), ids, labels };
  if (!scriptRoles(script).roles.length) throw new Error(t("import.noneKnown"));
  return script;
}
function keepScript(data) {
  const { list, script } = saveScript(loadScripts(), data);
  storeScripts(list);
  goEdition(`s:${script.id}`);
  return script;
}
function openScriptDialog() {
  $("#scriptDialogText").value = ""; $("#scriptDialogNote").textContent = ""; $("#scriptDialogNote").className = "hint";
  drawer(false);
  $("#scriptDialog").showModal();
}
function saveFromDialog(text) {
  try {
    const script = keepScript(readScriptJson(text));
    $("#scriptDialog").close();
    $("#scriptNote").textContent = t("script.saved", { name: script.name });
  } catch (err) {
    $("#scriptDialogNote").className = "hint warn";
    $("#scriptDialogNote").textContent = t("import.failed", { message: err.message });
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
    $("#scriptInvite").close();
    const sc = keepScript({ ...invite, name: invite.name || t("script.unnamed") });
    $("#scriptNote").textContent = t("script.saved", { name: sc.name });
  };
  $("#scriptInvite").showModal();
}
/** The shared-script prompt's text and tokens, in the current languages (redrawn when they change). */
let invite = null;
function renderInvite() {
  if (!invite) return;
  const { roles, missing } = scriptRoles(invite);
  $("#scriptInviteText").textContent = t("script.inviteText", { name: invite.name || t("script.unnamed"), n: roles.length, m: missing.length });
  $("#scriptInviteTokens").innerHTML = roles.map((r) => `<span>${tokenSvg(state.lib, r, { ...specFor(charKey(r), false), diameter: 45, back: "none" }, { text: charName(r) })}${esc(charName(r))}</span>`).join("");
}
async function shareScript() {
  const sc = scriptOf(state.edition);
  if (!sc) return;
  const link = scriptLink(sc, location.origin + location.pathname);
  const note = $("#scriptNote");
  // Phones get the system share sheet; elsewhere the link goes to the clipboard.
  if (PHONE.matches && navigator.share) { try { await navigator.share({ title: sc.name, url: link }); return; } catch (err) { if (err.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(link); note.textContent = t("script.copied"); }
  catch {
    note.innerHTML = `${esc(t("script.copyBy"))} <input class="text" type="text" readonly value="${esc(link)}">`;
    note.querySelector("input").select();
  }
}

function goEdition(ed) {
  if (!ed) return;
  state.edition = ed; state.team = "all"; $("#search").value = "";
  renderSpine(); renderSheet(); $("#sheet").scrollTo({ top: 0 });
}

// On a phone the sidebar is a drawer: closed, it is out of reach of the keyboard too.
const PHONE = matchMedia("(max-width: 900px)");
function drawer(open) {
  const spine = $("#spine");
  spine.classList.toggle("open", open);
  $("#scrim").classList.toggle("on", open);
  $("#drawerOpen").setAttribute("aria-expanded", String(open));
  spine.inert = PHONE.matches && !open;
  // preventScroll: while the drawer slides in, focusing would scroll the page to reach it
  if (open) $(".spine-scroll [aria-current=true]")?.focus({ preventScroll: true });
  else if (PHONE.matches && spine.contains(document.activeElement)) $("#drawerOpen").focus({ preventScroll: true });
}

// ------------------------------------------------------------ sheet

const searchQuery = () => fold($("#search").value.trim());

function renderSheet() {
  const lang = uiLang(), q = searchQuery();
  if (state.edition.startsWith("s:") && !scriptOf(state.edition)) state.edition = "tb";   // a deleted script
  const ed = state.edition, sc = scriptOf(ed), inScript = sc && scriptRoles(sc);
  // header
  $("#edTitle").textContent = q ? t("sheet.results", { q: $("#search").value.trim() }) : sc ? sc.name : EDITIONS[ed].name[lang];
  $("#edLead").textContent = q ? t("sheet.leadSearch")
    : sc ? t("script.lead", { n: inScript.roles.length, eds: new Set(inScript.roles.map((r) => r.edition)).size })
      + (inScript.missing.length ? t("script.missing", { list: inScript.missing.join(", ") }) : "")
    : t(`edition.lead.${ed}`);
  $("#scriptActions").hidden = !sc || !!q;
  if (sc && $("#scriptActions").dataset.for !== sc.id) {   // a different script: fresh buttons
    $("#scriptActions").dataset.for = sc.id;
    $("#scriptNote").textContent = "";
    $("#scriptDelete").dataset.confirm = ""; $("#scriptDelete").textContent = t("script.delete");
  }
  $("#scriptShare").textContent = t(PHONE.matches && navigator.share ? "script.share" : "script.copy");

  // which characters
  let roles = q ? state.lib.roles : sc ? inScript.roles : state.lib.roles.filter((r) => r.edition === ed);
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

  // Pick everything shown: the characters on screen (edition, team filter, search), with or without reminders.
  state.shown = roles;
  const remKeys = roles.flatMap((r) => remindersOf(r).map((_, i) => remKey(r, i)));
  const allChars = roles.length > 0 && roles.every((r) => isPicked(charKey(r))), allRems = remKeys.every(isPicked);
  $("#pickAll").hidden = !roles.length;
  $("#pickChars").textContent = t("pick.chars", { n: roles.length });
  $("#pickChars").setAttribute("aria-pressed", String(allChars && !remKeys.some(isPicked)));
  $("#pickWithRems").textContent = t("pick.withRems", { n: roles.length + remKeys.length });
  $("#pickWithRems").setAttribute("aria-pressed", String(allChars && remKeys.length > 0 && allRems));
  $("#pickWithRems").hidden = !remKeys.length;
  $("#pickNone").hidden = !roles.some((r) => isPicked(charKey(r))) && !remKeys.some(isPicked);

  if (!roles.length) { $("#rows").innerHTML = `<p class="empty">${esc(t("sheet.noResults"))}</p>`; return; }
  $("#rows").innerHTML = TEAM_ORDER.map((team) => {
    const list = roles.filter((r) => r.team === team).sort(byName);
    if (!list.length) return "";
    const teamOn = list.every((r) => isPicked(charKey(r)));
    return `<div class="team-h"><i style="background:${TEAMS[team].colour}"></i><span>${esc(TEAM_PLURAL[lang][team])}</span><small>${list.length}</small>
      <button class="pick-team" type="button" data-pick-team="${team}">${esc(t(teamOn ? "pick.teamOff" : "pick.team"))}</button></div>` +
      list.map((r) => rowHtml(r, q, hits.get(r.id))).join("");
  }).join("");
}

/** Copies of a picked token: "+", or "− n +" from two copies on. With `removable`, one copy
 *  reads "bin 1 +", the bin taking the token out (step 2, where tapping a token opens it). */
const BIN = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.5h6.6l.7-8.5M6.8 7v3.5M9.2 7v3.5"/></svg>`;
function copyStepper(key, name, { removable = false } = {}) {
  const copies = state.pick.get(key) || 0;
  if (!copies) return "";
  const less = copies > 1 ? `<button type="button" data-less="${key}" aria-label="${esc(t("queue.lessCopy", { name }))}">−</button>`
    : removable ? `<button type="button" class="bin" data-drop="${key}" aria-label="${esc(t("queue.removeAria", { name }))}">${BIN}</button>` : "";
  return `<span class="cp">${less ? `${less}<b>${copies}</b>` : ""}<button type="button" data-more="${key}" aria-label="${esc(t("queue.moreCopy", { name }))}">+</button></span>`;
}
/** A click on a copy stepper: one more or one fewer. True when it was one. */
function onCopyStep(e) {
  const more = e.target.closest("[data-more]"), less = e.target.closest("[data-less]");
  if (more) { const k = more.dataset.more; state.pick.set(k, (state.pick.get(k) || 0) + 1); }
  else if (less) { const k = less.dataset.less, n = state.pick.get(k) || 0; if (n > 1) state.pick.set(k, n - 1); else state.pick.delete(k); }
  else return false;
  picksChanged();
  return true;
}

function rowHtml(r, q, remHits) {
  const lang = uiLang(), ck = charKey(r);
  // Each token is a toggle: picked tokens light up with a check, and show their copies.
  const thumb = (key, reminder) => {
    const isRem = reminder != null;
    const spec = { ...specFor(key, isRem), diameter: isRem ? reminderSpec(DEFAULT_SPEC).diameter : 45, back: "none" };
    const own = state.overrides.has(key), copies = state.pick.get(key) || 0;
    const name = textFor(key, r, reminder);
    // once picked, a small stepper adds copies; tapping the token still drops it
    return `<span class="tok-w"><button class="tok" type="button" data-pick="${key}" aria-pressed="${copies > 0}" aria-label="${esc(name)}">${tokenSvg(state.lib, r, spec, { text: name })}<span class="ck" aria-hidden="true">✓</span>${own ? `<span class="mark" title="${esc(t("sheet.own"))}">✎</span>` : ""}</button>${copyStepper(key, name)}</span>`;
  };
  const rems = remindersOf(r);
  const other = tokenLang() === "en" ? roleName(r, uiLang() === "en" ? "es" : uiLang()) : r.en;
  return `<div class="row" data-picked="${isPicked(ck)}">
    ${thumb(ck, null)}
    <div class="who" data-pick="${ck}"><b>${esc(textFor(ck, r, null))}</b>${other !== textFor(ck, r, null) ? `<small>${esc(other)}</small>` : ""}${q || state.edition.startsWith("s:") ? `<em>${esc(EDITIONS[r.edition]?.name[lang] || "")}</em>` : ""}</div>
    <div class="rems">${rems.length ? rems.map((_, i) => `<div class="rem${remHits?.has(i) ? " hit" : ""}">${thumb(remKey(r, i), i)}<span>${esc(textFor(remKey(r, i), r, i))}</span></div>`).join("") : `<span class="none">${esc(t("sheet.noReminders"))}</span>`}</div>
  </div>`;
}

/** The token the workshop shows (step 2). */
function selectToken(key) {
  const role = key && tokenRole(key);
  if (!role) return;
  const was = state.sel?.reminder;
  state.sel = { key, role, reminder: tokenRem(key) };
  if (state.sel.reminder != null && was == null) { view3d("setView", "top"); syncView("top"); }
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
    view3d("setToken", token);
    // X-ray only makes sense with a magnet inside.
    $("#xray").hidden = !token.magnet;
    if (!token.magnet && $("#xray").getAttribute("aria-pressed") === "true") { $("#xray").setAttribute("aria-pressed", "false"); view3d("setXray", false); }

    $("#name").textContent = text;
    $("#sub").textContent = [isRem ? textFor(charKey(role), role, null) : null, TEAMS[role.team].label[lang], EDITIONS[role.edition]?.name[lang],
      role.en !== text && !isRem ? role.en : null].filter(Boolean).join(" · ");

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
  // The window style's front is the window itself; its relief icon takes the coin's colour.
  $("#frontColourLabel").textContent = t(s.style === "window" ? "front.colourWindow" : "front.colour");
  // Reset buttons: shown where a field differs from its default (see baseSpec), never on a hidden field.
  const { spec: base, name } = baseSpec();
  for (const b of $$("[data-reset]")) {
    const k = b.dataset.reset, own = b.closest(".row") || b.previousElementSibling;
    b.hidden = JSON.stringify(fieldValue(s, k)) === JSON.stringify(fieldValue(base, k)) || !!own?.closest("[hidden]");
    b.title = name ? t("reset.toPreset", { name }) : t("reset.toSet");
    b.setAttribute("aria-label", b.title);
  }
}

/** A field of a spec by its key: "diameter", "frame" or "colours.base". */
function fieldValue(spec, key) {
  if (key.startsWith("colours.")) return { ...DEFAULT_SPEC.colours, ...spec.colours }[key.slice(8)];
  return spec[key] ?? DEFAULT_SPEC[key];
}
/** What a field resets to: the design (preset) it started from, else for a token its set's
 *  style and for the set "Fast print" (the starting style). `name` is the preset's, if any. */
function baseSpec() {
  const p = PRESETS.find((x) => x.id === editingSpec()?.preset);
  if (p) return { spec: presetSpec(p), name: t(`preset.${p.id}`) };
  if (state.tab === "token") return { spec: state.spec, name: null };
  return { spec: presetSpec(PRESETS[0]), name: t(`preset.${PRESETS[0].id}`) };
}
function resetField(key) {
  const { spec: base } = baseSpec(), v = structuredClone(fieldValue(base, key));
  changeStyle((s) => {
    if (key.startsWith("colours.")) s.colours = { ...DEFAULT_SPEC.colours, ...s.colours, [key.slice(8)]: v };
    else s[key] = v;
    if (key === "back" && v === "custom") s.customSvg = base.customSvg;
  });
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
function scheduleSheet() { clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { renderSheet(); renderSpine(); renderQueue(); }, 180); }
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
    // Every filament the Bambu export knows. The name and icon and the frame can take the team
    // colour; on the coin or the back it would show the team from behind.
    const opts = [...(["front", "frame"].includes(box.dataset.colour) ? [{ id: "team", hex: "team" }] : []), ...COLOUR_CHOICES];
    box.innerHTML = opts.map((o) => `<button type="button" class="${o.id === "team" ? "team" : ""}" data-v="${o.hex}" style="${o.id === "team" ? "" : `background:${o.hex}`}" aria-label="${esc(t(`metal.${o.id}`))}" title="${esc(t(`metal.${o.id}`))}"></button>`).join("");
  }
}

// ------------------------------------------------------------ wiring

function wire() {
  // spine and sheet
  $(".spine-scroll").onclick = (e) => {
    if (e.target.closest("[data-script-new]")) { openScriptDialog(); return; }
    const b = e.target.closest("[data-ed]"); if (!b) return;
    goEdition(b.dataset.ed);
    drawer(false);
  };
  // scripts
  $("#scriptNew").onclick = openScriptDialog;
  $("#scriptDialogCancel").onclick = () => $("#scriptDialog").close();
  $("#scriptDialogSave").onclick = () => saveFromDialog($("#scriptDialogText").value);
  $("#scriptDialogFile").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) saveFromDialog(await f.text()); };
  $("#scriptInviteSkip").onclick = () => $("#scriptInvite").close();
  $("#scriptShare").onclick = shareScript;
  $("#scriptJson").onclick = () => {
    const sc = scriptOf(state.edition); if (!sc) return;
    saveFile(new Blob([scriptJson(sc)], { type: "application/json" }), `${sc.name.replace(/[\\/:*?"<>|]+/g, "").trim() || "script"}.json`);
  };
  $("#scriptDelete").onclick = (e) => {
    const b = e.currentTarget, sc = scriptOf(state.edition); if (!sc) return;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("script.deleteConfirm"); return; }
    storeScripts(loadScripts().filter((x) => x.id !== sc.id));
    goEdition(EDITION_ORDER.find((x) => state.lib.roles.some((r) => r.edition === x)));
  };
  window.addEventListener("hashchange", openSharedScript);
  // phone: the top bar opens the sidebar as a drawer (step 1)
  $("#drawerOpen").onclick = () => drawer(true);
  $("#scrim").onclick = () => drawer(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#spine").classList.contains("open")) drawer(false); });
  PHONE.addEventListener("change", () => drawer(false));
  drawer(false);
  $("#search").oninput = () => { renderSpine(); renderSheet(); };
  $("#teamChips").onclick = (e) => { const b = e.target.closest("[data-team]"); if (b) { state.team = b.dataset.team; renderSheet(); } };
  // step 1: tap a token to pick it (or drop it); a team or everything shown at once
  $("#rows").onclick = (e) => {
    if (onCopyStep(e)) return;
    const pick = e.target.closest("[data-pick]"), team = e.target.closest("[data-pick-team]");
    if (pick) { const k = pick.dataset.pick; setPick(k, !isPicked(k)); picksChanged(); return; }
    if (team) {
      const list = (state.shown || []).filter((r) => r.team === team.dataset.pickTeam), on = !list.every((r) => isPicked(charKey(r)));
      list.forEach((r) => setPick(charKey(r), on)); picksChanged();
    }
  };
  $("#pickAll").onclick = (e) => {
    const b = e.target.closest("[data-pick-all]"); if (!b) return;
    const how = b.dataset.pickAll, roles = state.shown || [];
    const apply = () => { for (const r of roles) { setPick(charKey(r), how !== "none"); remindersOf(r).forEach((_, i) => setPick(remKey(r, i), how === "all")); } };
    if (how === "none") changePicks(apply, t("pick.cleared")); else { apply(); picksChanged(); }
  };
  // the steps
  $("#flowSteps").onclick = (e) => { const b = e.target.closest("[data-goto]"); if (b && !b.disabled) goStep(+b.dataset.goto); };
  $("#flowBack").onclick = () => goStep(state.step - 1);
  $("#flowNext").onclick = () => (state.step < 3 ? goStep(state.step + 1) : flow.way === "paper" ? downloadPdf() : downloadBambu());
  // step 2: your tokens; tap one to give it its own design
  $("#designGrid").onclick = (e) => {
    const drop = e.target.closest("[data-drop]");
    if (drop) { dropFromDesign(drop.dataset.drop); return; }
    if (onCopyStep(e)) return;
    const b = e.target.closest("[data-design]"); if (b) designToken(b.dataset.design);
  };
  $("#designStage").addEventListener("click", (e) => { const b = e.target.closest("[data-side]"); if (b) { flow.side = b.dataset.side; renderDesignStage(); } });
  // step 3: how to print
  $("#printPage").addEventListener("change", (e) => {
    if (e.target.id !== "paperBacks") return;
    flow.backs = e.target.checked; storeJSON(PAPER_BACKS_KEY, flow.backs);
    $("#printNote").textContent = ""; renderQueue();
  });
  $("#printPage").addEventListener("click", (e) => {
    const w = e.target.closest("[data-way]"), pr = e.target.closest("[data-printer]");
    if (w) { flow.way = w.dataset.way; storeJSON(PRINT_WAY_KEY, flow.way); }
    else if (pr) { flow.printer = printerOf(pr.dataset.printer).id; storeJSON(PRINTER_KEY, flow.printer); }
    else return;
    $("#printNote").textContent = ""; renderQueue();
  });

  // workshop
  $$(".turn .pill[data-view]").forEach((b) => b.onclick = () => { view3d("setView", b.dataset.view); syncView(b.dataset.view); });
  $("#xray").onclick = () => {
    const on = $("#xray").getAttribute("aria-pressed") !== "true";
    $("#xray").setAttribute("aria-pressed", String(on));
    view3d("setXray", on);
    if (on) { view3d("setView", "side"); syncView("side"); }
  };
  $$(".tabs [data-tab]").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; renderWorkshop(); });
  for (const key of ["style", "windowFinish", "frame", "back", "magnet", "magnetSize"]) {
    $(`[data-choice=${key}]`).onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (key === "back" && b.dataset.v === "custom" && !editingSpec()?.customSvg) { $("#upload").click(); return; }
      changeStyle((s) => { s[key] = b.dataset.v; });
      if (key === "back") { view3d("setView", "back"); syncView("back"); }
    };
  }
  for (const box of $$(".metal")) box.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    changeStyle((s) => { s.colours = { ...DEFAULT_SPEC.colours, ...s.colours, [box.dataset.colour]: b.dataset.v }; });
  };
  for (const id of Object.keys(RANGES)) $("#" + id).oninput = (e) => changeStyle((s) => { s[id] = +e.target.value; });
  // A reset button for every field: in a slider's row, after a group of choices or colours.
  const resetBtn = () => Object.assign(document.createElement("button"), { type: "button", className: "reset-f", hidden: true, textContent: "↺" });
  for (const id of Object.keys(RANGES)) { const b = resetBtn(); b.dataset.reset = id; $(`output[data-for=${id}]`).after(b); }
  for (const el of $$("#styleFields [data-choice], #styleFields .metal")) {
    const b = resetBtn(); b.classList.add("group"); b.dataset.reset = el.dataset.choice ?? `colours.${el.dataset.colour}`; el.after(b);
  }
  $("#styleFields").addEventListener("click", (e) => { const b = e.target.closest("[data-reset]"); if (b) resetField(b.dataset.reset); });
  $("#upload").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
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
    const b = e.target.closest("[data-preset]"); if (!b) return;
    const next = presetSpec(PRESETS.find((p) => p.id === b.dataset.preset));
    changeStyle((s) => { for (const k of Object.keys(next)) if (k !== "lang" && k !== "customSvg") s[k] = structuredClone(next[k]); s.preset = b.dataset.preset; });
  };
  // this token only
  $("#printed").oninput = (e) => {
    const own = { ...(state.overrides.get(state.sel.key) || {}), text: e.target.value };
    if (!own.text && !own.spec && !own.fem) state.overrides.delete(state.sel.key); else state.overrides.set(state.sel.key, own);
    storeOverrides(); renderWorkshop(); scheduleSheet();
  };
  $("#ownStyle").onchange = (e) => {
    const own = { ...(state.overrides.get(state.sel.key) || {}) };
    if (e.target.checked) { own.spec = structuredClone(state.spec); delete own.spec.preset; } else delete own.spec;   // resets go to the set's values
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
  $("#download").onclick = forge;
  $("#save").onclick = save;
  $("#saved").onclick = onSavedClick;

  // your selection: copies, reminders, clear
  $("#queueToggle").onclick = openQueue;
  $("#queueClose").onclick = () => $("#queueDrawer").close();
  $("#queueDrawer").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });   // backdrop
  $("#queue").onclick = onQueueClick;
  $("#queueToast button").onclick = $("#appToast button").onclick = undoPicks;
  $("#queueClear").onclick = (e) => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("queue.clearConfirm"); return; }
    b.dataset.confirm = ""; b.textContent = t("queue.clear");
    changePicks(() => state.pick.clear(), t("queue.cleared"));
  };

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
    const [{ default: JSZip }, { addTokenToZip }] = await Promise.all([import("jszip"), import("./engine/export.js")]);
    const zip = new JSZip();
    const folder = addTokenToZip(zip, state.token, role, textFor(key, role, reminder), { faceDown: true });
    await saveFile(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
    note(t("act.downloaded", { file: `${folder}.zip` }));
  } catch (err) {
    note(t("act.downloadFailed", { message: err?.message || err }));
  } finally { btn.disabled = false; }
}

// ------------------------------------------------------------ selection

// What you picked: token keys ("c:imp", "r:imp:0") with how many copies, in the order picked.
// Picked tokens always use the set's design (or the token's own), so nothing goes stale.
function loadPicks() {
  const saved = loadJSON(PICK_KEY, null);
  if (Array.isArray(saved)) return new Map(saved.filter(([k, n]) => tokenRole(k) && n > 0));
  // From the old print queue (entries with a role, a reminder and a frozen style): keep what and how many.
  const picks = new Map();
  for (const q of loadJSON(QUEUE_KEY, [])) {
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
/** The role and reminder index a token key stands for. */
function tokenRole(key) { return roleById(key.split(":")[1]); }
const tokenRem = (key) => (key.startsWith("r:") ? +key.split(":")[2] : null);
const isPicked = (key) => state.pick.has(key);
function setPick(key, on) {
  if (on) { if (!state.pick.has(key)) state.pick.set(key, 1); }
  else state.pick.delete(key);
}
/** After any change to the selection: save it and redraw what shows it. */
function picksChanged() { persistPicks(); renderSpine(); renderSheet(); renderQueue(); }

/** The selection as queue entries, one per copy, in the current language and design. */
function queueNow() {
  const out = [];
  for (const [key, n] of state.pick) {
    const role = tokenRole(key), ri = tokenRem(key);
    for (let i = 0; i < n; i++) out.push({ key: `${key}#${i}`, pick: key, ...queueEntry(role, ri) });
  }
  return out;
}
/** A queue entry as the sheet would draw it now: the token language, the set's style (or the token's own) and its text. */
function queueEntry(role, ri) {
  const isRem = ri != null, key = isRem ? remKey(role, ri) : charKey(role);
  const own = state.overrides.get(key);
  return {
    roleId: role.id, ri: isRem ? ri : null,
    reminder: isRem ? textFor(key, role, ri) : null,
    text: isRem ? null : textFor(key, role, null),
    custom: !!own,
    spec: { ...structuredClone(own?.spec ?? state.spec), lang: tokenLang() },
  };
}
const isReminder = (q) => q.reminder != null;
const itemSpec = (q) => (isReminder(q) ? reminderSpec({ ...DEFAULT_SPEC, ...q.spec }) : { ...DEFAULT_SPEC, ...q.spec });
const queueTitle = (q, role) => (isReminder(q) ? q.reminder : q.text ?? roleName(role, q.spec.lang));
const queueLabel = (q, role) => (isReminder(q) ? `${roleName(role, q.spec.lang)}: ${q.reminder}` : queueTitle(q, role));
const queueGroup = (q, role) => PLATE_LABEL[uiLang()][PLATE_GROUP[role.team]] + (isReminder(q) ? t("queue.reminderSuffix") : "");

/** The queue in print order: good, evil, travellers, fabled, loric; characters before their reminders. */
const PRINT_GROUPS = ["good", "evil", "traveller", "fabled", "loric"];
const printOrder = () => queueNow().map((q) => [q, PRINT_GROUPS.indexOf(PLATE_GROUP[roleById(q.roleId).team]) * 2 + (isReminder(q) ? 1 : 0)])
  .sort((a, b) => a[1] - b[1]).map(([q]) => q);   // a stable sort keeps the queue's order within a group

/** Plate plan without building geometry: which parts exist and their colours. */
function queuePlan() {
  const items = printOrder().map((q) => {
    const role = roleById(q.roleId);
    const base = itemSpec(q);
    const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours } };
    const team = TEAMS[role.team].colour, pick = (v) => (v === "team" ? team : v);
    const hasBack = spec.back !== "none" && (spec.back !== "custom" || spec.customSvg) && (spec.back !== "seal" || state.lib.sealSvg) && (spec.back !== "edition" || role.edition);
    return {
      q, title: queueLabel(q, role), group: queueGroup(q, role),
      token: { spec, parts: { base: 1, front: 1, icon: spec.style === "window" && spec.windowFinish === "flat" ? 1 : null, frame: spec.frame !== "none" ? 1 : null, back: hasBack ? 1 : null },
        colours: { base: pick(spec.colours.base), front: pick(spec.colours.front), icon: pick(spec.colours.base), frame: pick(spec.colours.frame), back: pick(spec.colours.back) } },
    };
  });
  return planPlates(items, { bed: printerOf(flow.printer).bed });
}


// ------------------------------------------------------------ steps

const PRINT_WAY_KEY = "midnight-mint-print-way", PRINTER_KEY = "midnight-mint-printer", PAPER_BACKS_KEY = "midnight-mint-paper-backs";
const flow = { way: loadJSON(PRINT_WAY_KEY, "3d") === "paper" ? "paper" : "3d", printer: printerOf(loadJSON(PRINTER_KEY, "a1")).id,
  backs: loadJSON(PAPER_BACKS_KEY, true) !== false,   // paper: print the backs too (double-sided)
  side: "front", undo: null };
const queuePic = (q, role = roleById(q.roleId)) => tokenSvg(state.lib, role, itemSpec(q), { text: queueTitle(q, role) });

/** Moves to step 1 (pick), 2 (design) or 3 (print). Steps 2 and 3 need something picked. */
function goStep(step) {
  if (step > 1 && !state.pick.size) step = 1;
  state.step = step;
  $("#app").dataset.step = String(step);
  drawer(false);
  if (step === 2) {
    // the workshop shows a picked token, preferably the one already selected
    if (!state.sel || !isPicked(state.sel.key)) { const k = state.pick.keys().next().value; selectToken(k); }
    renderWorkshop(); renderDesignStage();
    $("#designStage").scrollTo?.({ top: 0 });
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
  $("#queueToggle").disabled = !n;
  $("#queueSummary").textContent = n ? t("queue.summary", { c: chars, r: rems }) : t("pick.help");
  $("#flowBack").hidden = step === 1;
  // on a phone only the chevron shows; the step's name stays as the label
  $("#flowBack").innerHTML = step > 1 ? `<span aria-hidden="true">‹</span> <span class="fb-l">${esc(t(`flow.step${step - 1}`))}</span>` : "";
  $("#flowBack").setAttribute("aria-label", step > 1 ? t(`flow.step${step - 1}`) : "");
  const next = $("#flowNext");
  next.textContent = step === 1 ? `${t("flow.step2")} ›` : step === 2 ? `${t("flow.step3")} ›` : (flow.way === "paper" ? t("queue.downloadPdf") : t("queue.download", { printer: `Bambu ${printerOf(flow.printer).short}` }));
  next.disabled = !n;
  if ($("#queueDrawer").open) renderQueueList();
  if (step === 2) renderDesignStage();
  if (step === 3) renderPrintStep();
}

// ------------------------------------------------------------ your selection (the drawer)

function openQueue() {
  if (!state.pick.size) return;
  const dlg = $("#queueDrawer");
  if (!dlg.open) dlg.showModal();
  renderQueueList();
}
/** Changes the selection with "Undo" for a few seconds. */
function changePicks(mutate, message) {
  const before = new Map(state.pick);
  mutate();
  picksChanged();
  flow.undo = before;
  const toast = $("#queueDrawer").open ? $("#queueToast") : $("#appToast");   // a modal drawer hides the page
  $("span", toast).textContent = message;
  toast.hidden = false;
  clearTimeout(changePicks.timer);
  (toast.id === "appToast" ? $("#queueToast") : $("#appToast")).hidden = true;
  changePicks.timer = setTimeout(() => { toast.hidden = true; flow.undo = null; }, 5000);
}
function undoPicks() {
  if (flow.undo) { state.pick = flow.undo; picksChanged(); }
  flow.undo = null; $("#queueToast").hidden = $("#appToast").hidden = true;
}
function onQueueClick(e) {
  const plus = e.target.closest("[data-plus]"), minus = e.target.closest("[data-minus]"), rm = e.target.closest("[data-unpick]");
  if (plus) { const k = plus.dataset.plus; state.pick.set(k, (state.pick.get(k) || 0) + 1); picksChanged(); }
  else if (minus) {
    const k = minus.dataset.minus, n = state.pick.get(k) || 0, role = tokenRole(k);
    changePicks(() => { if (n > 1) state.pick.set(k, n - 1); else state.pick.delete(k); }, t("queue.removed", { name: textFor(k, role, null) }));
  } else if (rm) {
    const k = rm.dataset.unpick, role = tokenRole(k);
    changePicks(() => state.pick.delete(k), t("queue.removed", { name: `${textFor(charKey(role), role, null)}: ${textFor(k, role, tokenRem(k))}` }));
  }
}

/** The drawer: one row per character (copies with − +), its picked reminders beside it as chips. */
function renderQueueList() {
  const lang = uiLang(), n = queueNow().length;
  $("#queueTitle").innerHTML = `${esc(t("queue.title"))}${n ? `<small>${esc(t("queue.count", { n }))}</small>` : ""}`;
  $("#queueClear").hidden = !n;
  if (!n) { $("#queue").innerHTML = `<div class="q-empty"><h3>${esc(t("pick.nothing"))}</h3><p>${esc(t("pick.help"))}</p></div>`; return; }
  const ids = [...new Set([...state.pick.keys()].map((k) => k.split(":")[1]))];
  $("#queue").innerHTML = TEAM_ORDER.map((team) => {
    const rows = ids.map(roleById).filter((r) => r.team === team).sort(byName);
    if (!rows.length) return "";
    return `<h3 class="q-team">${esc(TEAM_PLURAL[lang][team])}</h3>` + rows.map((r) => {
      const ck = charKey(r), copies = state.pick.get(ck) || 0;
      const rems = remindersOf(r).map((_, i) => remKey(r, i)).filter(isPicked);
      const name = textFor(ck, r, null);
      const pic = tokenSvg(state.lib, r, { ...specFor(ck, false), back: "none" }, { text: name });
      return `<div class="q-item"><span class="pic">${pic}</span>
        <b>${esc(name)}${state.overrides.has(ck) ? ` <small title="${esc(t("sheet.own"))}">✎</small>` : ""}</b>
        <span class="qty"><button type="button" data-minus="${ck}" ${copies ? "" : "disabled"} aria-label="${esc(t("queue.lessCopy", { name }))}">−</button><span>${copies}</span><button type="button" data-plus="${ck}" aria-label="${esc(t("queue.moreCopy", { name }))}">+</button></span>
        ${rems.length ? `<div class="q-rems">${rems.map((k) => { const ri = tokenRem(k), w = textFor(k, r, ri); return `<span class="q-rem">${tokenSvg(state.lib, r, specFor(k, true), { text: w })}${esc(w)}${(state.pick.get(k) || 1) > 1 ? ` ×${state.pick.get(k)}` : ""}<button type="button" data-unpick="${k}" aria-label="${esc(t("queue.removeAria", { name: `${name}: ${w}` }))}">×</button></span>`; }).join("")}</div>` : ""}
      </div>`;
    }).join("");
  }).join("");
}

// ------------------------------------------------------------ step 2: your tokens in the set's design

function renderDesignStage() {
  const keys = sortKeys(state.pick.keys()), total = queueNow().length;
  $("#designHint").textContent = t("design.hint", { n: total });
  $$("#designStage [data-side]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.side === flow.side)));
  $("#designGrid").innerHTML = keys.map((k) => {
    const role = tokenRole(k), ri = tokenRem(k), text = textFor(k, role, ri);
    const spec = { ...specFor(k, ri != null), ...(flow.side === "back" ? { magnet: "none" } : {}) };
    const label = ri != null ? `${textFor(charKey(role), role, null)}: ${text}` : text;
    // the copies stepper sits beside the button (a button can't hold buttons), over the coin's foot
    return `<div class="ds-item${ri != null ? " r" : ""}"><button class="ds-cell${ri != null ? " r" : ""}" type="button" data-design="${k}" aria-current="${state.sel?.key === k}" title="${esc(t("design.tap"))}">${tokenSvg(state.lib, role, spec, { text, side: flow.side })}${state.overrides.has(k) ? `<span class="mark" title="${esc(t("sheet.own"))}">✎</span>` : ""}<span>${esc(label)}</span></button>${copyStepper(k, label, { removable: true })}</div>`;
  }).join("");
}
/** Takes a token out of the selection from step 2, with Undo. The workshop moves on to another
 *  picked token if it showed this one; with nothing left, back to step 1. */
function dropFromDesign(key) {
  const role = tokenRole(key), ri = tokenRem(key);
  const name = ri != null ? `${textFor(charKey(role), role, null)}: ${textFor(key, role, ri)}` : textFor(key, role, null);
  changePicks(() => state.pick.delete(key), t("queue.removed", { name }));
  if (!state.pick.size) { goStep(1); return; }
  if (!isPicked(state.sel?.key)) { selectToken(sortKeys(state.pick.keys())[0]); renderWorkshop(); renderDesignStage(); }
}
/** Tapping one of your tokens: the workshop shows it, ready to give it its own design. */
function designToken(key) {
  selectToken(key);
  state.tab = "token";
  renderWorkshop(); renderDesignStage();
  if (PHONE.matches) $("#workshop").scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------ step 3: how to print

/** Step 3: how to print. A 3D printer shows the plates and filaments; paper shows the A4 sheets (fronts and backs). */
function renderPrintStep() {
  const queue = queueNow(), way = flow.way, detail = $("#printDetail");
  $("#printLead").textContent = t("print.lead", { n: queue.length });
  $$("#printPage [data-way]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.way === way)));
  const swatches = (slots) => `<span class="sws">${slots.map((sl) => `<i class="sw" style="background:${FILAMENT_SLOTS[sl].hex}" title="${esc(filamentName(sl))}"></i>`).join("")}</span>`;
  let plan = null, planError = null, sheets = [];
  try { plan = queuePlan(); } catch (err) { planError = err.message; }
  try { sheets = layoutCoins(queue.map((q) => itemSpec(q).diameter)); } catch { /* shown below */ }
  const printer = printerOf(flow.printer);
  $("#way3dSub").textContent = plan ? t("queue.way3dSub", { printer: printer.name, n: plan.plates.length }) : t("queue.way3dError", { printer: printer.name });
  $("#wayPaperSub").textContent = t("queue.wayPaperSub", { n: sheets.length, backs: flow.backs });
  if (way === "3d") {
    $("#flowNext").disabled = !plan;
    // which printer: the A1 or the A1 mini (same AMS lite, a smaller bed)
    const printers = `<h3 class="q-h">${esc(t("print.printer"))}</h3>
      <div class="printers" role="radiogroup" aria-label="${esc(t("print.printer"))}">${Object.values(PRINTERS).map((pr) => `<button class="pill" type="button" role="radio" data-printer="${pr.id}" aria-checked="${pr.id === printer.id}">${esc(pr.name)}<small>${esc(t("print.bed", { mm: pr.bed }))}</small></button>`).join("")}</div>`;
    if (!plan) { detail.innerHTML = `${printers}<p class="q-note warn">${esc(planError)}</p>`; return; }
    const slots = [...new Set(plan.plates.flatMap((p) => [...p.slots]))].sort((a, b) => a - b);
    const dec = uiLang() === "es" ? "," : ".";
    const pauses = [...new Set(queue.map((q) => magnetLayout(itemSpec(q))).filter((m) => m?.kind === "hidden").map((m) => m.pauseZ))].sort((a, b) => a - b);
    detail.innerHTML = `${printers}<h3 class="q-h">${esc(t("queue.filaments"))}</h3>
      <p class="q-note">${swatches(slots)}<span>${esc(t("queue.filamentsNote", { list: slots.map(filamentName).join(", ") }))}</span></p>
      ${pauses.length ? `<p class="q-note"><span aria-hidden="true">⏸</span><span>${esc(t("queue.pauses", { z: pauses.map((z) => String(z).replace(".", dec)).join(", ") }))}</span></p>` : ""}
      <h3 class="q-h">${esc(t("queue.platesH", { n: plan.plates.length }))}</h3>
      <div class="q-plates">${plan.plates.map((p, i) => `<article class="q-plate"><header><h3>${esc(t("queue.plateName", { i: i + 1, name: p.name }))}<small>${esc(t("queue.plateFill", { n: p.items.length, cap: p.capacity }))}</small></h3>${swatches([...p.slots].sort((a, b) => a - b))}
        <span class="q-fill"><i style="width:${Math.round(100 * p.items.length / p.capacity)}%"></i></span></header>
        <div class="q-coins">${p.items.map((it) => `<span class="${isReminder(it.q) ? "r" : ""}" title="${esc(it.title)}">${queuePic(it.q)}</span>`).join("")}</div></article>`).join("")}</div>`;
  } else {
    $("#flowNext").disabled = !sheets.length;
    // Each sheet as the PDF prints it: the front, and the back with every coin's reverse at the
    // mirrored x (printed double-sided on the long edge, it lands behind its front). Paper has no magnets.
    // Positions and sizes in % of the sheet, so the preview matches whatever width the CSS gives it.
    const pctW = (mm) => `${(100 * mm / PAGE.w).toFixed(3)}%`, pctH = (mm) => `${(100 * mm / PAGE.h).toFixed(3)}%`;
    const coinAt = (q, side, x, c) => {
      const role = roleById(q.roleId), spec = { ...itemSpec(q), magnet: "none" };
      return tokenSvg(state.lib, role, spec, { side, text: queueTitle(q, role) })
        .replace("<svg", `<svg style="left:${pctW(x)};top:${pctH(c.y)};width:${pctW(c.d)};height:${pctH(c.d)}"`);
    };
    const face = (page, side) => `<figure><div class="q-sheet">${page.map((c) => coinAt(queue[c.index], side, side === "front" ? c.x : backX(c.x), c)).join("")}</div>
      <figcaption>${esc(t(side === "front" ? "queue.pdfFront" : "queue.pdfBack"))}</figcaption></figure>`;
    const backs = flow.backs;
    detail.innerHTML = `<label class="switch"><input type="checkbox" id="paperBacks" ${backs ? "checked" : ""}> <span>${esc(t("print.backs"))}</span></label>
      <h3 class="q-h">${esc(t("queue.sheetsH", { n: sheets.length, backs }))}</h3>
      ${sheets.map((page, i) => `<div class="q-pair"><h4>${esc(t("queue.sheetN", { i: i + 1, n: sheets.length }))}</h4><div class="q-sheets">${face(page, "front")}${backs ? face(page, "back") : ""}</div></div>`).join("")}
      <ol class="q-howto"><li>${esc(t(backs ? "queue.howto1" : "queue.howto1Single"))}</li><li>${esc(t("queue.howto2"))}</li><li>${esc(t("queue.howto3"))}</li></ol>`;
  }
}

async function downloadBambu() {
  const btn = $("#flowNext"), out = $("#printNote");
  btn.disabled = true;
  try {
    const { buildBambuProject } = await import("./bambu/bambu3mf.js");   // JSZip and the printer template load only now
    const items = [];
    const order = printOrder();
    for (const [i, q] of order.entries()) {
      const role = roleById(q.roleId);
      out.className = "hint"; out.textContent = t("queue.building", { i: i + 1, n: order.length, name: queueLabel(q, role) });
      await new Promise((r) => setTimeout(r));
      items.push({ token: buildToken(state.lib, role, itemSpec(q), queueTitle(q, role)), title: queueLabel(q, role), group: queueGroup(q, role) });
    }
    const printer = printerOf(flow.printer);
    const { blob, plan, filaments } = await buildBambuProject(items, { printer: printer.id, onProgress: (d, total) => { out.textContent = t("queue.writing", { i: d, n: total }); } });
    const file = `midnight-mint-${items.length}-tokens-${printer.short.toLowerCase().replace(/\s+/g, "-")}.3mf`;
    await saveFile(blob, file);
    out.textContent = t("queue.done", { file, n: plan.plates.length, filaments: filaments.map((f) => t(`filament.${f.name}`)).join(", ") });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.failed", { message: err.message });
  } finally { btn.disabled = false; }
}

/** The queue as an A4 PDF of paper tokens: fronts and backs on alternate pages, for duplex printing. */
async function downloadPdf() {
  const btn = $("#flowNext"), out = $("#printNote");
  btn.disabled = true;
  try {
    out.className = "hint"; out.textContent = t("queue.pdfLoading");
    const { buildPrintPdf } = await import("./pdf/print-pdf.js");   // jsPDF only loads when asked for
    const entries = queueNow().map((q) => { const role = roleById(q.roleId); return { role, spec: itemSpec(q), text: queueTitle(q, role) }; });
    const { blob, sheets } = await buildPrintPdf(state.lib, entries, {
      labels: { front: t("queue.pdfFront"), back: t("queue.pdfBack") }, backs: flow.backs,
      onProgress: (i, n) => { out.textContent = t("queue.pdfWriting", { i, n }); },
    });
    const file = `midnight-mint-${entries.length}-tokens${flow.backs ? "" : "-fronts"}.pdf`;
    await saveFile(blob, file);
    out.textContent = t(flow.backs ? "queue.pdfDone" : "queue.pdfDoneSingle", { file, n: sheets });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.pdfFailed", { message: err.message });
  } finally { btn.disabled = !state.pick.size; }
}

// The UI test server drives the flow through these.
window.__mm = { goStep, designToken };

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
      <p class="hint">${esc(t("credits.code"))}: ${REPO_PUBLIC ? `${link(REPO_URL, "GitHub")} · ` : ""}PolyForm Noncommercial 1.0.0</p></section>`;
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
