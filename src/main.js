import JSZip from "jszip";
import {
  loadLibrary, buildToken, createViewer, tokenSvg, roleName, addTokenToZip, saveFile, reminderSpec, layoutName,
  TEAMS, EDITIONS, FRAME_STYLES, BACK_STYLES, FILAMENTS, DEFAULT_SPEC,
} from "./engine/token-engine.js";
import {
  onUser, signIn, signOutUser, isAdmin, isInvited, loadRoles, uploadRoles,
  listInvites, addInvite, removeInvite, listDesigns, saveDesign, deleteDesign, ADMIN_EMAIL,
} from "./firebase.js";
import { buildBambuProject, planPlates, FILAMENT_SLOTS } from "./bambu/bambu3mf.js";
import { t, uiLang, setUiLang } from "./i18n.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const RANGES = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"] };
const MAX_SVG = 300000;
const QUEUE_KEY = "midnight-mint-queue";
const STYLE_KEY = "midnight-mint-style";
const OVERRIDES_KEY = "midnight-mint-overrides";
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
  spec: loadJSON(STYLE_KEY, null) || { ...structuredClone(DEFAULT_SPEC), colours: { ...DEFAULT_SPEC.colours, frame: FILAMENTS.gold } },
  overrides: new Map(Object.entries(loadJSON(OVERRIDES_KEY, {}))),   // key -> { text?, spec? }
  queue: [], designs: [],
};
let viewer = null;
let gateState = null;

function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function storeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }

// ------------------------------------------------------------ tokens: keys, text, style

const charKey = (role) => `c:${role.id}`;
const remKey = (role, i) => `r:${role.id}:${i}`;
const remindersOf = (role, lang = uiLang()) => role.reminders?.[lang] || role.reminders?.en || [];

/** The style a token uses: its own, or the set's; reminders get the reminder layout. */
function specFor(key, isReminder) {
  const base = state.overrides.get(key)?.spec ?? state.spec;
  const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours }, lang: uiLang() };
  return isReminder ? reminderSpec(spec) : spec;
}
/** The text printed on a token. */
function textFor(key, role, reminder) {
  const own = state.overrides.get(key)?.text;
  if (own != null && own !== "") return own;
  return reminder != null ? remindersOf(role)[reminder] : roleName(role, uiLang());
}
const filamentName = (slot) => t(`filament.${FILAMENT_SLOTS[slot].name}`);

// ------------------------------------------------------------ language

function setLang(lang) {
  setUiLang(lang);
  $$(".langs .pill").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === lang)));
  if (state.lib) { buildChoices(); renderAll(); renderQueue(); renderDesigns(); }
  else if (gateState) gate(gateState());
}
$$(".langs .pill").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
setLang(uiLang());

// ------------------------------------------------------------ gate

function gate(cfg) {
  const { title, text = "", action, secondary } = typeof cfg === "function" ? cfg() : cfg;
  $("#app").hidden = true;
  $("#gate").hidden = false;
  $("#gateTitle").textContent = title;
  $("#gateText").textContent = text;
  for (const [el, c] of [[$("#gateAction"), action], [$("#gateSecondary"), secondary]]) {
    el.hidden = !c;
    if (c) { el.textContent = c.label; el.onclick = c.run; el.disabled = false; }
  }
}
function showGate(make) { gateState = make; gate(make()); }

onUser(async (user) => {
  state.user = user;
  if (!user) {
    return showGate(() => ({
      title: t("gate.signedOut.title"), text: t("gate.signedOut.text"),
      action: { label: t("gate.signIn"), run: () => signIn().catch((e) => { if (e.code !== "auth/popup-closed-by-user") $("#gateText").textContent = t("gate.signInFailed", { message: e.message }); }) },
    }));
  }
  showGate(() => ({ title: t("gate.opening") }));
  try {
    if (!(await isInvited(user))) {
      return showGate(() => ({
        title: t("gate.notInvited.title"), text: t("gate.notInvited.text", { admin: ADMIN_EMAIL, email: user.email }),
        action: { label: t("gate.signOut"), run: signOutUser },
      }));
    }
    const roles = await loadRoles();
    if (!roles.length) {
      return showGate(() => (isAdmin(user)
        ? { title: t("gate.empty.title"), text: t("gate.empty.text"), action: { label: t("gate.empty.open"), run: openAdmin }, secondary: { label: t("gate.signOut"), run: signOutUser } }
        : { title: t("gate.settingUp.title"), text: t("gate.settingUp.text"), action: { label: t("gate.signOut"), run: signOutUser } }));
    }
    if (roles.some((r) => !r.body)) {
      // The library still has the old official artwork: an admin must upload the new one.
      return showGate(() => (isAdmin(user)
        ? { title: t("gate.oldLibrary.title"), text: t("gate.oldLibrary.text"), action: { label: t("gate.empty.open"), run: openAdmin }, secondary: { label: t("gate.signOut"), run: signOutUser } }
        : { title: t("gate.settingUp.title"), text: t("gate.settingUp.text"), action: { label: t("gate.signOut"), run: signOutUser } }));
    }
    state.lib = await loadLibrary(roles);
    gateState = null;
    startApp();
  } catch (err) {
    showGate(() => ({ title: t("gate.error.title"), text: t("gate.error.text", { message: err.message }), action: { label: t("gate.reload"), run: () => location.reload() } }));
  }
});

// ------------------------------------------------------------ app

let started = false;
function startApp() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  $("#avatar").src = state.user.photoURL || "";
  $("#meEmail").textContent = state.user.email;
  $("#openAdmin").hidden = !isAdmin(state.user);
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

  // search matches the name (both languages) or any reminder text
  const hits = new Map();
  if (q) {
    roles = roles.filter((r) => {
      const remHits = remindersOf(r).map((text, i) => [text, r.reminders?.en?.[i]].some((s) => s && fold(s).includes(q)) ? i : -1).filter((i) => i >= 0);
      const nameHit = fold(r.en).includes(q) || fold(r.es).includes(q);
      if (remHits.length) hits.set(r.id, new Set(remHits));
      return nameHit || remHits.length;
    });
  }

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
  const other = lang === "es" ? r.en : r.es;
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
    $("#printed").placeholder = isRem ? remindersOf(role)[reminder] : roleName(role, lang);
    $("#ownStyle").checked = !!own?.spec;
    $("#resetToken").hidden = !own;
    $("#styleScope").textContent = state.tab === "set" ? t("ws.scopeSet") : own?.spec ? t("ws.scopeTokenOn") : t("ws.scopeTokenOff");
    const editing = editingSpec();
    $("#styleFields").disabled = !editing;
    syncControls(editing ?? state.spec);

    $("#depthHint").className = "hint" + (token.depthClamped ? " warn" : "");
    $("#depthHint").textContent = token.depthClamped
      ? t("depth.clamped", { max: token.depthClamped.toFixed(1), core: "0.4" })
      : t("depth.help");
    const n = token.name;
    $("#nameHint").className = "hint" + (n.letterHeight < 2.5 ? " warn" : "");
    $("#nameHint").textContent = t("name.hint", { arc: n.total.toFixed(0), mm: n.letterHeight.toFixed(1), shrunk: n.scale < 1, small: n.letterHeight < 2.5 });
    $("#nameSummary").textContent = `${n.letterHeight.toFixed(1)} mm`;
  });
}

/** Puts a spec's values into the style controls. */
function syncControls(spec) {
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours } };
  const dec = uiLang() === "es" ? "," : ".";
  for (const [id, [dp, unit]] of Object.entries(RANGES)) {
    $("#" + id).value = s[id];
    $(`output[data-for=${id}]`).textContent = (+s[id]).toFixed(dp).replace(".", dec) + unit;
  }
  $("#frameSummary").textContent = t(`frame.${s.frame}`);
  $("#backSummary").textContent = t(`back.${s.back}`);
  $("#coinSummary").textContent = `${s.diameter} × ${s.height} mm`;
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

function syncView(v) { $$(".turn .pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v))); }

function buildChoices() {
  const make = (key, list) => {
    $(`[data-choice=${key}]`).innerHTML = list.map((s) => `<button class="pill" type="button" data-v="${s.id}">${esc(t(`${key}.${s.id}`))}</button>`).join("");
  };
  make("frame", FRAME_STYLES);
  make("back", BACK_STYLES.filter((s) => s.id !== "seal" || state.lib?.sealSvg));
  for (const box of $$(".metal")) {
    const opts = ["team", "gold", "silver", "bronze", "white"];
    box.innerHTML = opts.map((o) => `<button type="button" class="${o === "team" ? "team" : ""}" data-v="${o === "team" ? "team" : FILAMENTS[o]}" style="${o === "team" ? "" : `background:${FILAMENTS[o]}`}" aria-label="${esc(t(`metal.${o}`))}" title="${esc(t(`metal.${o}`))}"></button>`).join("");
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

  // workshop
  $("#wsClose").onclick = () => $("#workshop").classList.remove("open");
  $$(".turn .pill").forEach((b) => b.onclick = () => { viewer.setView(b.dataset.view); syncView(b.dataset.view); });
  $$(".tabs [data-tab]").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; renderWorkshop(); });
  for (const key of ["frame", "back"]) {
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
  // this token only
  $("#printed").oninput = (e) => {
    const own = { ...(state.overrides.get(state.sel.key) || {}), text: e.target.value };
    if (!own.text && !own.spec) state.overrides.delete(state.sel.key); else state.overrides.set(state.sel.key, own);
    storeOverrides(); renderWorkshop(); scheduleSheet();
  };
  $("#ownStyle").onchange = (e) => {
    const own = { ...(state.overrides.get(state.sel.key) || {}) };
    if (e.target.checked) own.spec = structuredClone(state.spec); else delete own.spec;
    if (!own.text && !own.spec) state.overrides.delete(state.sel.key); else state.overrides.set(state.sel.key, own);
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
  $("#scriptFile").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importScript(await f.text()); };
  $("#pasteToggle").onclick = () => { const box = $("#pasteBox"); box.hidden = !box.hidden; $("#pasteToggle").setAttribute("aria-expanded", String(!box.hidden)); if (!box.hidden) $("#scriptText").focus(); };
  $("#pasteImport").onclick = () => importScript($("#scriptText").value);

  // account
  $("#signOut").onclick = () => { $(".me").open = false; signOutUser(); };
  $("#openAdmin").onclick = () => { $(".me").open = false; openAdmin(); };
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
function addToQueue(role, reminder) {
  const key = reminder != null ? remKey(role, reminder) : charKey(role);
  const own = state.overrides.get(key);
  state.queue.push({
    key: crypto.randomUUID(), roleId: role.id,
    reminder: reminder != null ? textFor(key, role, reminder) : null,
    text: reminder == null ? textFor(key, role, null) : null,
    custom: !!own,
    spec: { ...structuredClone(own?.spec ?? state.spec), lang: uiLang() },
  });
  persistQueue();
  renderQueue();
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
      token: { spec, parts: { base: 1, front: 1, frame: spec.frame !== "none" ? 1 : null, back: hasBack ? 1 : null },
        colours: { base: pick(spec.colours.base), front: pick(spec.colours.front), frame: pick(spec.colours.frame), back: pick(spec.colours.back) } },
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
    const { blob, plan, filaments } = await buildBambuProject(items, { onProgress: (d, total) => { out.textContent = t("queue.writing", { i: d, n: total }); } });
    const file = `midnight-mint-${items.length}-tokens.3mf`;
    await saveFile(blob, file);
    out.className = "hint";
    out.textContent = t("queue.done", { file, n: plan.plates.length, filaments: filaments.map((f) => t(`filament.${f.name}`)).join(", ") });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.failed", { message: err.message });
  } finally { btn.disabled = false; }
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

async function refreshDesigns() {
  try {
    state.designs = await listDesigns(state.user.uid);
    renderDesigns();
  } catch (err) {
    $("#saved").innerHTML = `<li class="hint warn">${esc(t("saved.loadFailed", { message: err.message }))}</li>`;
  }
}
function renderDesigns() {
  if (!state.lib) return;
  $("#savedSummary").textContent = state.designs.length ? String(state.designs.length) : "";
  $("#saved").innerHTML = state.designs.map((d) => {
    const role = roleById(d.roleId);
    if (!role) return "";
    const pic = tokenSvg(state.lib, role, { ...DEFAULT_SPEC, ...d.spec, diameter: 45, colours: { ...DEFAULT_SPEC.colours, ...d.spec.colours } }, { text: d.text || roleName(role, d.spec.lang) });
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
    await saveDesign(state.user.uid, { roleId: role.id, text: state.overrides.get(key)?.text || null, spec, title });
    $("#saveNote").textContent = t("saved.saved", { name: title });
    await refreshDesigns();
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
    state.overrides.set(charKey(role), { text: d.text || null, spec });
    storeOverrides();
    if (role.edition) state.edition = role.edition;
    $("#search").value = "";
    state.tab = "token";
    renderSpine(); renderSheet(); select(charKey(role));
    $("#saveNote").textContent = t("saved.opened", { name: d.title });
  }
  if (del) {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = t("saved.deleteConfirm"); return; }
    await deleteDesign(state.user.uid, del.dataset.del);
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

/** Credits for the game-icons.net icons in the library (CC BY 3.0 asks for author credit). */
function openCredits() {
  const byAuthor = new Map();
  for (const r of state.lib?.roles || []) {
    if (!r.icon) continue;
    if (!byAuthor.has(r.author)) byAuthor.set(r.author, new Set());
    byAuthor.get(r.author).add(r.icon);
  }
  $("#creditsList").innerHTML = [...byAuthor].sort((a, b) => b[1].size - a[1].size).map(([a, icons]) =>
    `<li><b>${esc(authorName(a))}</b> <small>${esc(t("credits.count", { n: icons.size }))}</small><p>${[...icons].sort().map((i) =>
      `<a href="https://game-icons.net/1x1/${encodeURIComponent(a)}/${encodeURIComponent(i)}.html" target="_blank" rel="noopener">${esc(i)}</a>`).join(", ")}</p></li>`).join("");
  $("#credits").showModal();
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-credits]")) { e.preventDefault(); openCredits(); } });

// ------------------------------------------------------------ admin

async function openAdmin() {
  const dlg = $("#admin");
  if (!dlg.open) dlg.showModal();
  const roles = state.lib?.roles.length ?? (await loadRoles()).length;
  $("#libraryState").textContent = roles ? t("admin.libraryState", { n: roles }) : t("admin.libraryEmpty");
  renderInvites();
}
async function renderInvites() {
  try {
    const list = await listInvites();
    $("#invites").innerHTML = list.map((i) => `<li><span>${esc(i.email)}</span><button type="button" data-remove="${esc(i.email)}">${esc(t("admin.remove"))}</button></li>`).join("") || `<li class="hint">${esc(t("admin.nobody"))}</li>`;
  } catch (err) { $("#invites").innerHTML = `<li class="hint warn">${esc(err.message)}</li>`; }
}
$("#invites").onclick = async (e) => {
  const b = e.target.closest("[data-remove]"); if (!b) return;
  if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("admin.removeConfirm"); return; }
  await removeInvite(b.dataset.remove); renderInvites();
};
$("#inviteForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const address = await addInvite($("#inviteEmail").value);
    $("#inviteHint").textContent = t("admin.invitedOne", { email: address });
    $("#inviteEmail").value = ""; renderInvites();
  } catch (err) { $("#inviteHint").textContent = err.message; }
};
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
