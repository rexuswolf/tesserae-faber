import JSZip from "jszip";
import {
  loadLibrary, buildToken, createViewer, tokenSvg, roleName, addTokenToZip, saveFile, reminderSpec, layoutName,
  TEAMS, EDITIONS, FRAME_STYLES, BACK_STYLES, FILAMENTS, DEFAULT_SPEC,
} from "./engine/token-engine.js";
import {
  onUser, signIn, signOutUser, isAdmin, isInvited, loadRoles, uploadRoles, loadSeal, uploadSeal,
  listInvites, addInvite, removeInvite, listDesigns, saveDesign, deleteDesign, ADMIN_EMAIL,
} from "./firebase.js";
import { buildBambuProject, planPlates, FILAMENT_SLOTS } from "./bambu/bambu3mf.js";
import { t, uiLang, setUiLang, applyStatic } from "./i18n.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const RANGES = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"] };
const MAX_SVG = 300000;
const QUEUE_KEY = "midnight-mint-queue";

// Tray filters
const TEAM_FILTERS = {
  all: null,
  good: ["townsfolk", "outsider"], townsfolk: ["townsfolk"], outsider: ["outsider"],
  evil: ["minion", "demon"], minion: ["minion"], demon: ["demon"],
  traveller: ["traveller"], fabled: ["fabled"], loric: ["loric"],
};
const TEAM_FILTER_LABEL = {
  es: { all: "Todos los equipos", good: "Bien (aldeanos y forasteros)", evil: "Mal (esbirros y demonios)" },
  en: { all: "All teams", good: "Good (townsfolk and outsiders)", evil: "Evil (minions and demons)" },
};
const EDITION_ORDER = ["tb", "bmr", "snv", "carousel", "fabled", "loric"];

// Plates
const PLATE_GROUP = { townsfolk: "good", outsider: "good", minion: "evil", demon: "evil", traveller: "traveller", fabled: "fabled", loric: "loric" };
const PLATE_LABEL = {
  es: { good: "Bien", evil: "Mal", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos" },
  en: { good: "Good", evil: "Evil", traveller: "Travellers", fabled: "Fabled", loric: "Loric" },
};

const state = {
  queue: [], selecting: false, picked: new Set(), preview: null,
  kind: "characters", edition: "all", team: "all", shown: [],
  user: null, lib: null, role: null, custom: null, designId: null, designs: [],
  spec: { ...structuredClone(DEFAULT_SPEC), lang: uiLang() },
};
state.spec.colours.frame = FILAMENTS.gold;
let viewer = null;
let gateState = null;   // re-renders the sign-in screen when the language changes

const printed = () => state.custom ?? (state.role ? roleName(state.role, state.spec.lang) : "");
const filamentName = (slot) => t(`filament.${FILAMENT_SLOTS[slot].name}`);

// ------------------------------------------------------------ language

/** One switch for both the interface and the names on the tokens. */
function setLang(lang) {
  setUiLang(lang);
  state.spec.lang = lang;
  $$(".langs .pill").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === lang)));
  state.custom = null; state.preview = null;
  if (state.lib) {
    $("#printed").value = printed();
    buildChoices();
    renderFilters();
    renderTray();
    render();
    renderQueue();
    renderDesigns();
  } else if (gateState) gate(gateState());
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
    state.lib = await loadLibrary(roles, { sealSvg: await loadSeal() });
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
  state.role = state.role && state.lib.roles.find((r) => r.id === state.role.id) || state.lib.roles.find((r) => r.en === "Fortune Teller") || state.lib.roles[0];
  $("#printed").value = printed();
  buildChoices();
  renderFilters();
  renderTray();
  render();
  refreshDesigns();
  loadQueue();
  renderQueue();
}

let raf = 0;
function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    for (const id of Object.keys(RANGES)) state.spec[id] = +$("#" + id).value;
    for (const [id, [dp, unit]] of Object.entries(RANGES)) $(`output[data-for=${id}]`).textContent = (+$("#" + id).value).toFixed(dp).replace(".", uiLang() === "es" ? "," : ".") + unit;
    if (!state.lib || !state.role) return;
    const token = buildToken(state.lib, state.role, state.spec, printed());
    state.token = token;
    viewer.setToken(state.preview != null ? buildToken(state.lib, state.role, reminderSpec(state.spec), state.preview) : token);
    renderReminders();
    const lang = state.spec.lang;
    $("#ghost").textContent = state.preview ?? printed();
    $("#name").textContent = state.preview ?? (printed() || " ");
    const edition = EDITIONS[state.role.edition]?.name[lang];
    $("#sub").textContent = [state.preview != null ? printed() : null, TEAMS[state.role.team].label[lang], edition, state.role.en !== printed() ? state.role.en : null].filter(Boolean).join(" · ");
    const n = token.name;
    $("#nameHint").className = "hint" + (n.letterHeight < 2.5 ? " warn" : "");
    $("#nameHint").textContent = t("name.hint", { arc: n.total.toFixed(0), mm: n.letterHeight.toFixed(1), shrunk: n.scale < 1, small: n.letterHeight < 2.5 });
    $("#nameSummary").textContent = `${n.letterHeight.toFixed(1)} mm`;
    $("#frameSummary").textContent = t(`frame.${state.spec.frame}`);
    $("#backSummary").textContent = t(`back.${state.spec.back}`);
    $("#coinSummary").textContent = `${state.spec.diameter} × ${state.spec.height} mm`;
    $$("[data-choice] button").forEach((b) => b.setAttribute("aria-pressed", String(state.spec[b.parentElement.dataset.choice] === b.dataset.v)));
    $$(".metal").forEach((box) => $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state.spec.colours[box.dataset.colour]))));
  });
}

// ------------------------------------------------------------ tray: filters

function renderFilters() {
  const lang = state.spec.lang;
  const editions = EDITION_ORDER.filter((e) => state.lib.roles.some((r) => r.edition === e));
  $("#editionFilter").innerHTML = `<option value="all">${esc(t("tray.allEditions"))}</option>` +
    editions.map((e) => `<option value="${e}">${esc(EDITIONS[e].name[lang])}</option>`).join("");
  $("#editionFilter").value = editions.includes(state.edition) ? state.edition : "all";
  $("#teamFilter").innerHTML = Object.keys(TEAM_FILTERS).map((k) =>
    `<option value="${k}">${esc(TEAM_FILTER_LABEL[lang][k] || TEAMS[k].label[lang])}</option>`).join("");
  $("#teamFilter").value = state.team;
  $$("#kindSeg .pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === state.kind)));
  $("#selectMode").setAttribute("aria-pressed", String(state.selecting));
  $("#picker").hidden = !state.selecting;
}

const remindersOf = (role, lang = state.spec.lang) => role.reminders?.[lang] || role.reminders?.en || [];

/** What the tray shows: characters, or every reminder token, after the filters. */
function trayItems() {
  const teams = TEAM_FILTERS[state.team];
  const q = fold($("#search").value.trim());
  const roles = state.lib.roles.filter((r) => (!teams || teams.includes(r.team)) && (state.edition === "all" || r.edition === state.edition));
  if (state.kind === "characters") {
    return roles.filter((r) => !q || fold(r.en).includes(q) || fold(r.es).includes(q))
      .map((r) => ({ key: `c:${r.id}`, role: r, label: r[state.spec.lang] }));
  }
  const out = [];
  for (const r of roles) {
    remindersOf(r).forEach((text, i) => {
      const enText = r.reminders?.en?.[i] ?? text;
      if (q && ![r.en, r.es, text, enText].some((s) => fold(s).includes(q))) return;
      out.push({ key: `r:${r.id}:${i}`, role: r, reminder: text, label: text, sub: r[state.spec.lang] });
    });
  }
  return out;
}

function renderTray() {
  const items = trayItems();
  state.shown = items;
  const charSpec = { ...state.spec, diameter: 45, back: "none" };
  const remSpec = reminderSpec(charSpec);
  $("#tokens").innerHTML = items.map((it, i) => {
    const current = it.role === state.role && (it.reminder ?? null) === state.preview;
    const picked = state.picked.has(it.key);
    const pic = it.reminder != null ? tokenSvg(state.lib, it.role, remSpec, { text: it.reminder }) : tokenSvg(state.lib, it.role, charSpec);
    return `<button class="tok${it.reminder != null ? " rem" : ""}" type="button" data-i="${i}" aria-current="${current}" data-picked="${picked}"${state.selecting ? ` aria-pressed="${picked}"` : ""}>${pic}<span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</button>`;
  }).join("") || `<p class="hint">${esc(t(state.kind === "characters" ? "tray.noMatch" : "tray.noReminders"))}</p>`;
  $("#trayCount").textContent = t(state.kind === "characters" ? "tray.countCharacters" : "tray.countReminders", { n: items.length });
  renderPicker();
}

function renderPicker() {
  const n = state.picked.size;
  $("#pickCount").textContent = n ? t("pick.count", { n }) : t("pick.prompt");
  $("#pickAdd").disabled = !n;
  $("#pickAdd").textContent = t("pick.add", { n });
}

// ------------------------------------------------------------ reminders section

function renderReminders() {
  const list = remindersOf(state.role);
  $("#remindersSummary").textContent = list.length ? String(list.length) : t("reminders.none");
  $("#reminderChips").innerHTML = list.map((r, i) => `<button class="pill" type="button" data-r="${i}" aria-pressed="${state.preview === r}">${esc(r)}</button>`).join("");
  $("#addReminders").hidden = !list.length;
  const hint = $("#reminderHint");
  if (!list.length) { hint.className = "hint"; hint.textContent = t("reminders.noneHint"); return; }
  const longest = list.reduce((a, b) => (b.length > a.length ? b : a));
  const size = layoutName(state.lib, longest, { ...DEFAULT_SPEC, ...reminderSpec(state.spec) }).letterHeight;
  hint.className = "hint" + (size < 2 ? " warn" : "");
  hint.textContent = `${t(state.preview != null ? "reminders.previewHint" : "reminders.tapHint")} ${t("reminders.size", { mm: reminderSpec(state.spec).diameter })}` +
    (size < 2 ? t("reminders.small", { mm: size.toFixed(1) }) : "");
}

function selectRole(role, reminder = null) {
  state.role = role; state.custom = null; state.designId = null; state.preview = reminder;
  $("#printed").value = printed();
  if (reminder != null) { viewer.setView("top"); syncView("top"); }
  $$("#tokens .tok").forEach((tok) => {
    const it = state.shown[+tok.dataset.i];
    tok.setAttribute("aria-current", String(it.role === role && (it.reminder ?? null) === reminder));
  });
  render();
}

function syncView(v) { $$(".turn .pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v))); }

// ------------------------------------------------------------ wiring

function buildChoices() {
  const make = (key, list) => {
    const box = $(`[data-choice=${key}]`);
    box.innerHTML = list.map((s) => `<button class="pill" type="button" data-v="${s.id}">${esc(t(`${key}.${s.id}`))}</button>`).join("");
  };
  make("frame", FRAME_STYLES);
  make("back", BACK_STYLES.filter((s) => s.id !== "seal" || state.lib.sealSvg));
  for (const box of $$(".metal")) {
    const opts = ["team", "gold", "silver", "bronze", "white"];
    box.innerHTML = opts.map((o) => `<button type="button" class="${o === "team" ? "team" : ""}" data-v="${o === "team" ? "team" : FILAMENTS[o]}" style="${o === "team" ? "" : `background:${FILAMENTS[o]}`}" aria-label="${esc(t(`metal.${o}`))}" title="${esc(t(`metal.${o}`))}"></button>`).join("");
  }
}

function wire() {
  for (const key of ["frame", "back"]) {
    $(`[data-choice=${key}]`).onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (key === "back" && b.dataset.v === "custom" && !state.spec.customSvg) { $("#upload").click(); return; }
      state.spec[key] = b.dataset.v;
      if (key === "back") { viewer.setView("back"); syncView("back"); }
      render();
    };
  }
  for (const box of $$(".metal")) box.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.spec.colours[box.dataset.colour] = b.dataset.v; render(); };
  $("#upload").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    const hint = $("#uploadHint");
    hint.hidden = false;
    if (f.size > MAX_SVG) { hint.className = "hint warn"; hint.textContent = t("upload.tooBig", { file: f.name, kb: (f.size / 1024).toFixed(0), max: MAX_SVG / 1000 }); return; }
    state.spec.customSvg = await f.text();
    state.spec.back = "custom";
    hint.className = "hint"; hint.textContent = t("upload.using", { file: f.name });
    viewer.setView("back"); syncView("back"); render();
  };
  $$(".turn .pill").forEach((b) => b.onclick = () => { viewer.setView(b.dataset.view); syncView(b.dataset.view); });

  // tray
  $$("#kindSeg .pill").forEach((b) => b.onclick = () => { state.kind = b.dataset.kind; renderFilters(); renderTray(); });
  $("#editionFilter").onchange = (e) => { state.edition = e.target.value; renderTray(); };
  $("#teamFilter").onchange = (e) => { state.team = e.target.value; renderTray(); };
  $("#search").oninput = renderTray;
  $("#selectMode").onclick = () => { state.selecting = !state.selecting; if (!state.selecting) state.picked.clear(); renderFilters(); renderTray(); };
  $("#tokens").onclick = (e) => {
    const b = e.target.closest("button[data-i]"); if (!b) return;
    const it = state.shown[+b.dataset.i];
    if (state.selecting) {
      state.picked.has(it.key) ? state.picked.delete(it.key) : state.picked.add(it.key);
      b.dataset.picked = String(state.picked.has(it.key)); b.setAttribute("aria-pressed", b.dataset.picked);
      renderPicker();
    }
    selectRole(it.role, it.reminder ?? null);
  };
  $("#pickAll").onclick = () => { state.shown.forEach((it) => state.picked.add(it.key)); renderTray(); };
  $("#pickNone").onclick = () => { state.picked.clear(); renderTray(); };
  $("#pickAdd").onclick = () => {
    let chars = 0, extra = 0;
    for (const key of state.picked) {
      const [kind, id, idx] = key.split(":");
      const role = state.lib.roles.find((r) => r.id === id);
      if (!role) continue;
      if (kind === "c") { chars++; extra += addCharacter(role, null); }
      else { const text = remindersOf(role)[+idx]; if (text != null) { addToQueue(role, null, text); extra++; } }
    }
    $("#exportNote").textContent = t("act.queuedMany", { n: chars, extra });
    state.picked.clear(); state.selecting = false; renderFilters(); renderTray();
    $("#queueBox").open = true;
  };

  // drawer
  $("#enqueue").onclick = () => {
    if (state.preview != null) {
      addToQueue(state.role, null, state.preview);
      $("#exportNote").textContent = t("reminders.added", { n: 1, name: printed() });
    } else {
      const n = addCharacter(state.role, state.custom);
      $("#exportNote").textContent = t("act.queued", { name: printed(), n });
    }
    $("#queueBox").open = true;
  };
  $("#reminderChips").onclick = (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    const r = remindersOf(state.role)[+b.dataset.r];
    state.preview = state.preview === r ? null : r;
    viewer.setView("top"); syncView("top"); render();
  };
  $("#addReminders").onclick = () => {
    const list = remindersOf(state.role);
    list.forEach((r) => addToQueue(state.role, null, r));
    $("#queueBox").open = true;
    $("#exportNote").textContent = t("reminders.added", { n: list.length, name: printed() });
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
  $("#printed").oninput = (e) => { state.custom = e.target.value; state.preview = null; render(); };
  for (const id of Object.keys(RANGES)) $("#" + id).oninput = render;
  $("#signOut").onclick = () => { $(".me").open = false; signOutUser(); };
  $("#openAdmin").onclick = () => { $(".me").open = false; openAdmin(); };
  $("#download").onclick = forge;
  $("#save").onclick = save;
  $("#saved").onclick = onSavedClick;
}

async function forge() {
  const btn = $("#download"), note = $("#exportNote");
  btn.disabled = true;
  try {
    const zip = new JSZip();
    const reminder = state.preview;
    const token = reminder != null ? buildToken(state.lib, state.role, reminderSpec(state.spec), reminder) : state.token;
    const folder = addTokenToZip(zip, token, state.role, reminder ?? printed(), { faceDown: true });
    await saveFile(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
    note.textContent = t("act.downloaded", { file: `${folder}.zip` });
  } catch (err) {
    note.textContent = t("act.downloadFailed", { message: err?.message || err });
  } finally { btn.disabled = false; }
}

// ------------------------------------------------------------ print queue

function loadQueue() {
  try { state.queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]").filter((q) => state.lib.roles.some((r) => r.id === q.roleId)); }
  catch { state.queue = []; }
}
function persistQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(state.queue)); } catch { /* storage unavailable: the queue lasts this visit */ }
}
/** Queues a token; `reminder` makes it that character's reminder token. */
function addToQueue(role, text, reminder = null) {
  state.queue.push({ key: crypto.randomUUID(), roleId: role.id, text, reminder, spec: structuredClone(state.spec) });
  persistQueue();
  renderQueue();
}
/** Queues a character and, if "Include reminder tokens" is ticked, its reminders. Returns how many reminders. */
function addCharacter(role, text) {
  addToQueue(role, text);
  if (!$("#withReminders").checked) return 0;
  const list = remindersOf(role);
  list.forEach((r) => addToQueue(role, null, r));
  return list.length;
}
const isReminder = (q) => q.reminder != null;
const itemSpec = (q) => (isReminder(q) ? reminderSpec(q.spec) : q.spec);
/** Text printed on the token. */
const queueTitle = (q, role) => (isReminder(q) ? q.reminder : q.text ?? roleName(role, q.spec.lang));
/** Name in lists and in Bambu Studio. */
const queueLabel = (q, role) => (isReminder(q) ? `${roleName(role, q.spec.lang)}: ${q.reminder}` : queueTitle(q, role));
const queueGroup = (q, role) => PLATE_LABEL[uiLang()][PLATE_GROUP[role.team]] + (isReminder(q) ? t("queue.reminderSuffix") : "");

/** Plate plan without building geometry: which parts exist and their colours. */
function queuePlan() {
  const items = state.queue.map((q) => {
    const role = state.lib.roles.find((r) => r.id === q.roleId);
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
  $("#queueSummary").textContent = n ? String(n) : "";
  $("#queueClear").hidden = !n;
  $("#bambu").disabled = !n;
  $("#queue").innerHTML = state.queue.map((q) => {
    const role = state.lib.roles.find((r) => r.id === q.roleId);
    const pic = tokenSvg(state.lib, role, itemSpec(q), { text: queueTitle(q, role) });
    const label = queueLabel(q, role);
    return `<li><span class="q">${pic}<span>${esc(label)}</span></span><button class="del" type="button" data-unqueue="${q.key}" aria-label="${esc(t("queue.removeAria", { name: label }))}">${esc(t("queue.remove"))}</button></li>`;
  }).join("") || `<li class="hint">${esc(t("queue.empty"))}</li>`;
  if (!n) { $("#queuePlan").textContent = ""; return; }
  try {
    const plan = queuePlan();
    const used = [...new Set(plan.plates.flatMap((p) => [...p.slots]))].map(filamentName);
    $("#queuePlan").className = "hint";
    $("#queuePlan").textContent = t("queue.plan", { n: plan.plates.length, plates: plan.plates.map((p) => `${p.name} (${p.items.length})`).join(", "), filaments: used.join(", ") });
  } catch (err) {
    $("#queuePlan").className = "hint warn";
    $("#queuePlan").textContent = err.message;
  }
}

async function downloadBambu() {
  const btn = $("#bambu"), out = $("#queuePlan");
  btn.disabled = true;
  try {
    const items = [];
    for (const [i, q] of state.queue.entries()) {
      const role = state.lib.roles.find((r) => r.id === q.roleId);
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
 * optional {"id": "_meta", "name": …} entry. Ids are matched loosely
 * ("fortune_teller", "fortuneteller" and "Fortune Teller" all work).
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
  const note = $("#importNote");
  try {
    const { name, roles, skipped } = parseScript(text);
    const extra = roles.reduce((n, r) => n + addCharacter(r, null), 0);
    note.className = "hint";
    note.textContent = t("import.done", { n: roles.length, extra, name }) +
      (skipped.length ? t("import.skipped", { n: skipped.length, list: skipped.slice(0, 6).join(", ") + (skipped.length > 6 ? "…" : "") }) : "");
    $("#pasteBox").hidden = true; $("#pasteToggle").setAttribute("aria-expanded", "false"); $("#scriptText").value = "";
  } catch (err) {
    note.className = "hint warn";
    note.textContent = t("import.failed", { message: err.message });
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
    const role = state.lib.roles.find((r) => r.id === d.roleId);
    if (!role) return "";
    const pic = tokenSvg(state.lib, role, { ...DEFAULT_SPEC, ...d.spec, diameter: 45, colours: { ...DEFAULT_SPEC.colours, ...d.spec.colours } }, { text: d.text ?? roleName(role, d.spec.lang) });
    return `<li><button type="button" data-open="${d.id}">${pic}<span>${esc(d.title)}</span></button><button class="del" type="button" data-del="${d.id}" aria-label="${esc(t("saved.deleteAria", { name: d.title }))}">${esc(t("saved.delete"))}</button></li>`;
  }).join("") || `<li class="hint">${esc(t("saved.empty"))}</li>`;
}
async function save() {
  const btn = $("#save"), note = $("#exportNote");
  btn.disabled = true;
  const title = printed() || state.role.en;
  try {
    state.designId = await saveDesign(state.user.uid, { roleId: state.role.id, text: state.custom, spec: state.spec, title }, state.designId);
    note.textContent = t("saved.saved", { name: title });
    await refreshDesigns();
  } catch (err) {
    note.textContent = t("saved.failed", { message: err.message });
  } finally { btn.disabled = false; }
}
async function onSavedClick(e) {
  const open = e.target.closest("[data-open]"), del = e.target.closest("[data-del]");
  if (open) {
    const d = state.designs.find((x) => x.id === open.dataset.open);
    const role = state.lib.roles.find((r) => r.id === d.roleId);
    state.spec = { ...structuredClone(DEFAULT_SPEC), ...d.spec, colours: { ...DEFAULT_SPEC.colours, ...d.spec.colours } };
    for (const id of Object.keys(RANGES)) $("#" + id).value = state.spec[id];
    state.role = role;
    setLang(state.spec.lang);
    state.custom = d.text ?? null; state.designId = d.id; $("#printed").value = printed();
    render();
    $("#exportNote").textContent = t("saved.opened", { name: d.title });
  }
  if (del) {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = t("saved.deleteConfirm"); return; }
    await deleteDesign(state.user.uid, del.dataset.del);
    if (state.designId === del.dataset.del) state.designId = null;
    refreshDesigns();
  }
}

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
$("#sealFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  const out = $("#libraryState");
  try {
    const svg = await f.text();
    if (!svg.includes("<svg")) throw new Error(t("admin.notSvg"));
    await uploadSeal(svg);
    out.textContent = t("admin.sealUploaded");
    setTimeout(() => location.reload(), 800);
  } catch (err) { out.textContent = t("admin.uploadFailed", { message: err.message }); }
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
