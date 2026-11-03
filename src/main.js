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

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const RANGES = { diameter: [0, " mm"], height: [1, " mm"], depth: [1, " mm"], iconScale: [2, "×"], textSize: [1, " mm"], spacing: [2, "×"], maxArc: [0, "°"], frameWidth: [1, " mm"] };
const TEAM_GROUPS = [["all", null], ["good", ["townsfolk", "outsider"]], ["evil", ["minion", "demon"]], ["traveller", ["traveller"]], ["fabled", ["fabled", "loric"]]];
const GROUP_LABEL = {
  es: { all: "Todos", good: "Bien", evil: "Mal", traveller: "Viajeros", fabled: "Fábulas y lóricos" },
  en: { all: "All", good: "Good", evil: "Evil", traveller: "Travellers", fabled: "Fabled & Loric" },
};
const MAX_SVG = 300000;

const QUEUE_KEY = "midnight-mint-queue";
const PLATE_GROUP = { townsfolk: "good", outsider: "good", minion: "evil", demon: "evil", traveller: "traveller", fabled: "fabled", loric: "loric" };
const PLATE_LABEL = {
  es: { good: "Bien", evil: "Mal", traveller: "Viajeros", fabled: "Fábulas", loric: "Lóricos" },
  en: { good: "Good", evil: "Evil", traveller: "Travellers", fabled: "Fabled", loric: "Loric" },
};

const state = {
  queue: [], selecting: false, picked: new Set(), preview: null,
  user: null, lib: null, role: null, custom: null, group: "all", designId: null, designs: [],
  spec: structuredClone(DEFAULT_SPEC),
};
state.spec.colours.frame = FILAMENTS.gold;
let viewer = null;

const printed = () => state.custom ?? (state.role ? roleName(state.role, state.spec.lang) : "");

// ------------------------------------------------------------ gate

function gate({ title, text = "", action, secondary }) {
  $("#app").hidden = true;
  $("#gate").hidden = false;
  $("#gateTitle").textContent = title;
  $("#gateText").textContent = text;
  for (const [el, cfg] of [[$("#gateAction"), action], [$("#gateSecondary"), secondary]]) {
    el.hidden = !cfg;
    if (cfg) { el.textContent = cfg.label; el.onclick = cfg.run; el.disabled = false; }
  }
}

onUser(async (user) => {
  state.user = user;
  if (!user) {
    return gate({
      title: "Print the characters of your grimoire",
      text: "Design coin tokens for your group in Spanish or English, turn them in 3D and download STLs for your printer. Midnight Mint is invite-only for now.",
      action: { label: "Sign in with Google", run: () => signIn().catch((e) => { if (e.code !== "auth/popup-closed-by-user") $("#gateText").textContent = `Sign-in failed: ${e.message}`; }) },
    });
  }
  gate({ title: "Opening the grimoire…" });
  try {
    if (!(await isInvited(user))) {
      return gate({
        title: "You're not on the list yet",
        text: `Midnight Mint is invite-only while we wait for The Pandemonium Institute's go-ahead. Ask ${ADMIN_EMAIL} to invite ${user.email}, then sign in again.`,
        action: { label: "Sign out", run: signOutUser },
      });
    }
    const roles = await loadRoles();
    if (!roles.length) {
      return gate(isAdmin(user)
        ? { title: "The library is empty", text: "Upload roles_data.json (in admin-data/) to add the 181 characters.", action: { label: "Open library and invites", run: openAdmin }, secondary: { label: "Sign out", run: signOutUser } }
        : { title: "The library is being set up", text: "No characters have been added yet. Try again a little later.", action: { label: "Sign out", run: signOutUser } });
    }
    state.lib = await loadLibrary(roles, { sealSvg: await loadSeal() });
    startApp();
  } catch (err) {
    gate({ title: "Couldn't open the grimoire", text: `${err.message}. Check your connection and reload the page.`, action: { label: "Reload", run: () => location.reload() } });
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
    for (const [id, [dp, unit]] of Object.entries(RANGES)) $(`output[data-for=${id}]`).textContent = (+$("#" + id).value).toFixed(dp) + unit;
    if (!state.lib || !state.role) return;
    const token = buildToken(state.lib, state.role, state.spec, printed());
    state.token = token;
    viewer.setToken(state.preview != null ? buildToken(state.lib, state.role, reminderSpec(state.spec), state.preview) : token);
    renderReminders();
    const lang = state.spec.lang;
    $("#ghost").textContent = printed();
    $("#name").textContent = printed() || " ";
    const edition = EDITIONS[state.role.edition]?.name[lang];
    $("#sub").textContent = [TEAMS[state.role.team].label[lang], edition, state.role.en !== printed() ? state.role.en : null].filter(Boolean).join(" · ");
    const n = token.name;
    $("#nameHint").className = "hint" + (n.letterHeight < 2.5 ? " warn" : "");
    $("#nameHint").textContent = `${n.total.toFixed(0)}° of the rim, letters ${n.letterHeight.toFixed(1)} mm${n.scale < 1 ? " (shrunk to fit)" : ""}.` + (n.letterHeight < 2.5 ? " Small for a 0.4 mm nozzle." : "");
    $("#nameSummary").textContent = `${n.letterHeight.toFixed(1)} mm`;
    $("#frameSummary").textContent = FRAME_STYLES.find((s) => s.id === state.spec.frame).label;
    $("#backSummary").textContent = BACK_STYLES.find((s) => s.id === state.spec.back).label;
    $("#coinSummary").textContent = `${state.spec.diameter} × ${state.spec.height} mm`;
    $$("[data-choice] button").forEach((b) => b.setAttribute("aria-pressed", String(state.spec[b.parentElement.dataset.choice] === b.dataset.v)));
    $$(".metal").forEach((box) => $$("button", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state.spec.colours[box.dataset.colour]))));
  });
}

function renderTray() {
  const lang = state.spec.lang;
  const q = $("#search")?.value ?? "";
  $("#teams").innerHTML = TEAM_GROUPS.map(([id]) => `<button class="pill" type="button" data-g="${id}" aria-pressed="${state.group === id}">${GROUP_LABEL[lang][id]}</button>`).join("") +
    `<button class="pill" type="button" id="selectMode" aria-pressed="${state.selecting}">${lang === "es" ? "Elegir varios" : "Choose several"}</button>` +
    `<input type="search" id="search" placeholder="${lang === "es" ? "Buscar personaje" : "Find a character"}" autocomplete="off" aria-label="${lang === "es" ? "Buscar personaje" : "Find a character"}">`;
  $("#search").value = q;
  $("#search").oninput = renderTokens;
  $("#selectMode").onclick = () => { state.selecting = !state.selecting; if (!state.selecting) state.picked.clear(); renderTray(); };
  $("#picker").hidden = !state.selecting;
  renderTokens();
}
function renderTokens() {
  const lang = state.spec.lang, teams = TEAM_GROUPS.find(([id]) => id === state.group)[1];
  const n = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const q = n($("#search").value.trim());
  const thumbSpec = { ...state.spec, diameter: 45, back: "none" };
  const list = state.lib.roles.map((r, i) => [r, i]).filter(([r]) => (!teams || teams.includes(r.team)) && (!q || n(r.en).includes(q) || n(r.es).includes(q)));
  state.shown = list.map(([r]) => r);
  $("#tokens").innerHTML = list.map(([r, i]) => `<button class="tok" type="button" data-i="${i}" aria-current="${r === state.role}" data-picked="${state.picked.has(r.id)}"${state.selecting ? ` aria-pressed="${state.picked.has(r.id)}"` : ""}>${tokenSvg(state.lib, r, thumbSpec)}<span>${esc(r[lang])}</span></button>`).join("")
    || `<p class="hint">${lang === "es" ? "Ningún personaje coincide." : "No character matches."}</p>`;
  renderPicker();
}
function renderPicker() {
  const n = state.picked.size, es = state.spec.lang === "es";
  $("#pickCount").textContent = n ? (es ? `${n} elegidos` : `${n} chosen`) : (es ? "Toca los personajes que quieras imprimir" : "Tap the characters you want to print");
  $("#pickAdd").disabled = !n;
  $("#pickAdd").textContent = es ? `Añadir ${n || ""} a imprimir`.replace("  ", " ") : `Add ${n || ""} to print`.replace("  ", " ");
}

/** The character's reminder tokens (in the token language). */
const remindersOf = (role, lang = state.spec.lang) => role.reminders?.[lang] || role.reminders?.en || [];

function renderReminders() {
  const list = remindersOf(state.role), es = state.spec.lang === "es";
  $("#remindersSummary").textContent = list.length ? String(list.length) : (es ? "ninguno" : "none");
  $("#reminderChips").innerHTML = list.map((r, i) => `<button class="pill" type="button" data-r="${i}" aria-pressed="${state.preview === r}">${esc(r)}</button>`).join("");
  $("#addReminders").hidden = !list.length;
  if (!list.length) { $("#reminderHint").textContent = es ? "Este personaje no usa recordatorios." : "This character has no reminder tokens."; return; }
  const sample = buildTokenInfo(list.reduce((a, b) => (b.length > a.length ? b : a)));
  $("#reminderHint").className = "hint" + (sample.letterHeight < 2 ? " warn" : "");
  $("#reminderHint").textContent = (state.preview != null ? (es ? "Vista previa del recordatorio. Tócalo otra vez para volver al personaje. " : "Previewing the reminder. Tap it again to go back to the character. ") : (es ? "Toca uno para verlo. " : "Tap one to preview it. ")) +
    `${reminderSpec(state.spec).diameter} mm` + (sample.letterHeight < 2 ? (es ? `; el más largo queda a ${sample.letterHeight.toFixed(1)} mm, pequeño para imprimir.` : `; the longest ends up ${sample.letterHeight.toFixed(1)} mm tall, small to print.`) : ".");
}
/** Letter layout only (cheap): how big the reminder word ends up. */
function buildTokenInfo(text) {
  return layoutName(state.lib, text, { ...DEFAULT_SPEC, ...reminderSpec(state.spec) });
}

function selectRole(role) {
  state.role = role; state.custom = null; state.designId = null; state.preview = null;
  $("#printed").value = printed();
  $$("#tokens .tok").forEach((t) => t.setAttribute("aria-current", String(state.lib.roles[+t.dataset.i] === role)));
  render();
}

function setLang(lang) {
  state.spec.lang = lang; document.documentElement.lang = lang;
  $$(".langs .pill").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === lang)));
  state.custom = null; state.preview = null; $("#printed").value = printed(); renderTray(); render();
}

function syncView(v) { $$(".turn .pill").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v))); }

function wire() {
  const make = (key, list) => {
    const box = $(`[data-choice=${key}]`);
    box.innerHTML = list.map((s) => `<button class="pill" type="button" data-v="${s.id}">${s.label}</button>`).join("");
    box.onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (key === "back" && b.dataset.v === "custom" && !state.spec.customSvg) { $("#upload").click(); return; }
      state.spec[key] = b.dataset.v;
      if (key === "back") { viewer.setView("back"); syncView("back"); }
      render();
    };
  };
  make("frame", FRAME_STYLES);
  make("back", BACK_STYLES.filter((s) => s.id !== "seal" || state.lib.sealSvg));
  for (const box of $$(".metal")) {
    const opts = ["team", "gold", "silver", "bronze", "white"];
    box.innerHTML = opts.map((o) => `<button type="button" class="${o === "team" ? "team" : ""}" data-v="${o === "team" ? "team" : FILAMENTS[o]}" style="${o === "team" ? "" : `background:${FILAMENTS[o]}`}" aria-label="${o === "team" ? "Team colour" : o}" title="${o === "team" ? "Team colour" : o}"></button>`).join("");
    box.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; state.spec.colours[box.dataset.colour] = b.dataset.v; render(); };
  }
  $("#upload").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    const hint = $("#uploadHint");
    hint.hidden = false;
    if (f.size > MAX_SVG) { hint.className = "hint warn"; hint.textContent = `${f.name} is ${(f.size / 1024).toFixed(0)} KB. Use an SVG under ${MAX_SVG / 1000} KB.`; return; }
    state.spec.customSvg = await f.text();
    state.spec.back = "custom";
    hint.className = "hint"; hint.textContent = `Using ${f.name}. Pick "Your SVG" again to replace it.`;
    viewer.setView("back"); syncView("back"); render();
  };
  $$(".turn .pill").forEach((b) => b.onclick = () => { viewer.setView(b.dataset.view); syncView(b.dataset.view); });
  $$(".langs .pill").forEach((b) => b.onclick = () => setLang(b.dataset.lang));
  $("#teams").onclick = (e) => { const b = e.target.closest("button[data-g]"); if (b) { state.group = b.dataset.g; renderTray(); } };
  $("#tokens").onclick = (e) => {
    const b = e.target.closest("button[data-i]"); if (!b) return;
    const role = state.lib.roles[+b.dataset.i];
    if (state.selecting) {
      state.picked.has(role.id) ? state.picked.delete(role.id) : state.picked.add(role.id);
      b.dataset.picked = String(state.picked.has(role.id)); b.setAttribute("aria-pressed", b.dataset.picked);
      renderPicker();
    }
    selectRole(role);
  };
  $("#pickAll").onclick = () => { state.shown.forEach((r) => state.picked.add(r.id)); renderTokens(); };
  $("#pickNone").onclick = () => { state.picked.clear(); renderTokens(); };
  $("#pickAdd").onclick = () => {
    const roles = state.lib.roles.filter((r) => state.picked.has(r.id));
    const extra = roles.reduce((n, r) => n + addCharacter(r, null), 0);
    $("#exportNote").textContent = `Added ${roles.length} to the print queue${extra ? ` with ${extra} reminders` : ""}, in the current style.`;
    state.picked.clear(); state.selecting = false; renderTray();
    $("#queueBox").open = true;
  };
  $("#enqueue").onclick = () => {
    const n = addCharacter(state.role, state.custom);
    $("#queueBox").open = true;
    $("#exportNote").textContent = `Added “${printed()}”${n ? ` and ${n} reminder${n > 1 ? "s" : ""}` : ""} to the print queue.`;
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
    $("#exportNote").textContent = `Added ${list.length} reminder${list.length > 1 ? "s" : ""} for “${printed()}” to the print queue.`;
  };
  $("#queue").onclick = (e) => { const b = e.target.closest("[data-unqueue]"); if (b) { state.queue = state.queue.filter((q) => q.key !== b.dataset.unqueue); persistQueue(); renderQueue(); } };
  $("#queueClear").onclick = (e) => {
    if (e.target.dataset.confirm !== "1") { e.target.dataset.confirm = "1"; e.target.textContent = "Clear all?"; return; }
    e.target.dataset.confirm = ""; e.target.textContent = "Clear the queue";
    state.queue = []; persistQueue(); renderQueue();
  };
  $("#bambu").onclick = downloadBambu;
  $("#scriptFile").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importScript(await f.text()); };
  $("#pasteToggle").onclick = () => { const box = $("#pasteBox"); box.hidden = !box.hidden; $("#pasteToggle").setAttribute("aria-expanded", String(!box.hidden)); if (!box.hidden) $("#scriptText").focus(); };
  $("#pasteImport").onclick = () => importScript($("#scriptText").value);
  $("#printed").oninput = (e) => { state.custom = e.target.value; render(); };
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
    const folder = addTokenToZip(zip, state.token, state.role, printed(), { faceDown: true });
    await saveFile(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
    note.textContent = `Downloaded ${folder}.zip.`;
  } catch (err) {
    note.textContent = `Couldn't build the download: ${err?.message || err}`;
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
const queueGroup = (q, role) => PLATE_LABEL[q.spec.lang][PLATE_GROUP[role.team]] + (isReminder(q) ? (q.spec.lang === "es" ? " · recordatorios" : " reminders") : "");

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
  const n = state.queue.length;
  $("#queueSummary").textContent = n ? String(n) : "";
  $("#queueClear").hidden = !n;
  $("#bambu").disabled = !n;
  $("#queue").innerHTML = state.queue.map((q) => {
    const role = state.lib.roles.find((r) => r.id === q.roleId);
    const pic = tokenSvg(state.lib, role, itemSpec(q), { text: queueTitle(q, role) });
    return `<li><span class="q">${pic}<span>${esc(queueLabel(q, role))}</span></span><button class="del" type="button" data-unqueue="${q.key}" aria-label="Remove ${esc(queueLabel(q, role))}">Remove</button></li>`;
  }).join("") || `<li class="hint">Add tokens here, then download them all as one Bambu Studio project. Use “Choose several” in the tray to add many at once.</li>`;
  if (!n) { $("#queuePlan").textContent = ""; return; }
  try {
    const plan = queuePlan();
    const used = [...new Set(plan.plates.flatMap((p) => [...p.slots]))].map((s) => FILAMENT_SLOTS[s].name);
    $("#queuePlan").className = "hint";
    $("#queuePlan").textContent = `${plan.plates.length} plate${plan.plates.length > 1 ? "s" : ""}: ${plan.plates.map((p) => `${p.name} (${p.items.length})`).join(", ")}. Filaments: ${used.join(", ")}.`;
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
      out.textContent = `Building ${i + 1} of ${state.queue.length}: ${queueLabel(q, role)}`;
      await new Promise((r) => setTimeout(r));
      items.push({ token: buildToken(state.lib, role, itemSpec(q), queueTitle(q, role)), title: queueLabel(q, role), group: queueGroup(q, role) });
    }
    const { blob, plan, filaments } = await buildBambuProject(items, { onProgress: (d, t) => { out.textContent = `Writing the project: ${d} of ${t}`; } });
    const name = `midnight-mint-${items.length}-tokens.3mf`;
    await saveFile(blob, name);
    out.textContent = `Downloaded ${name}: ${plan.plates.length} plate${plan.plates.length > 1 ? "s" : ""}, filaments ${filaments.map((f) => f.name).join(", ")}. Open it in Bambu Studio and match each filament to an AMS slot.`;
  } catch (err) {
    out.className = "hint warn";
    out.textContent = `Couldn't build the project: ${err.message}`;
  } finally { btn.disabled = false; }
}

// ------------------------------------------------------------ script import

const idKey = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Reads a script in the official Script Tool format: an array whose entries are
 * character ids ("washerwoman") or objects ({"id": "washerwoman"}), with an
 * optional {"id": "_meta", "name": …} entry. Ids are matched loosely
 * ("fortune_teller", "fortuneteller" and "Fortune Teller" all work).
 */
function parseScript(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("that isn't valid JSON. Export the script from the Script Tool as JSON and try again"); }
  if (!Array.isArray(data)) throw new Error("a script is a JSON list of characters, starting with [");
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
  if (!roles.length) throw new Error("none of the characters in that script are in the library");
  return { name, roles, skipped };
}

function importScript(text) {
  const note = $("#importNote");
  try {
    const { name, roles, skipped } = parseScript(text);
    const extra = roles.reduce((n, r) => n + addCharacter(r, null), 0);
    note.className = "hint";
    note.textContent = `Added ${roles.length} characters${extra ? ` and ${extra} reminders` : ""}${name ? ` from “${name}”` : ""}.` +
      (skipped.length ? ` Skipped ${skipped.length} not in the library (homebrew?): ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""}.` : "");
    $("#pasteBox").hidden = true; $("#pasteToggle").setAttribute("aria-expanded", "false"); $("#scriptText").value = "";
  } catch (err) {
    note.className = "hint warn";
    note.textContent = `Couldn't import the script: ${err.message}.`;
  }
}

// ------------------------------------------------------------ saved designs

async function refreshDesigns() {
  try {
    state.designs = await listDesigns(state.user.uid);
    renderDesigns();
  } catch (err) {
    $("#saved").innerHTML = `<li class="hint warn">Couldn't load your tokens: ${esc(err.message)}</li>`;
  }
}
function renderDesigns() {
  $("#savedSummary").textContent = state.designs.length ? String(state.designs.length) : "";
  $("#saved").innerHTML = state.designs.map((d) => {
    const role = state.lib.roles.find((r) => r.id === d.roleId);
    if (!role) return "";
    const pic = tokenSvg(state.lib, role, { ...DEFAULT_SPEC, ...d.spec, diameter: 45, colours: { ...DEFAULT_SPEC.colours, ...d.spec.colours } }, { text: d.text ?? roleName(role, d.spec.lang) });
    return `<li><button type="button" data-open="${d.id}">${pic}<span>${esc(d.title)}</span></button><button class="del" type="button" data-del="${d.id}" aria-label="Delete ${esc(d.title)}">Delete</button></li>`;
  }).join("") || `<li class="hint">Tokens you save appear here, on any device you sign in on.</li>`;
}
async function save() {
  const btn = $("#save"), note = $("#exportNote");
  btn.disabled = true;
  const title = printed() || state.role.en;
  try {
    state.designId = await saveDesign(state.user.uid, { roleId: state.role.id, text: state.custom, spec: state.spec, title }, state.designId);
    note.textContent = `Saved “${title}” to My tokens.`;
    await refreshDesigns();
  } catch (err) {
    note.textContent = `Couldn't save: ${err.message}`;
  } finally { btn.disabled = false; }
}
async function onSavedClick(e) {
  const open = e.target.closest("[data-open]"), del = e.target.closest("[data-del]");
  if (open) {
    const d = state.designs.find((x) => x.id === open.dataset.open);
    const role = state.lib.roles.find((r) => r.id === d.roleId);
    state.spec = { ...structuredClone(DEFAULT_SPEC), ...d.spec, colours: { ...DEFAULT_SPEC.colours, ...d.spec.colours } };
    for (const id of Object.keys(RANGES)) $("#" + id).value = state.spec[id];
    state.role = role; state.custom = d.text ?? null; state.designId = d.id;
    setLang(state.spec.lang);
    state.custom = d.text ?? null; $("#printed").value = printed();
    render();
    $("#exportNote").textContent = `Opened “${d.title}”. Saving updates it.`;
  }
  if (del) {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Delete?"; return; }
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
  $("#libraryState").textContent = roles ? `${roles} characters in the library. Uploading again replaces matching characters.` : "The library is empty.";
  renderInvites();
}
async function renderInvites() {
  try {
    const list = await listInvites();
    $("#invites").innerHTML = list.map((i) => `<li><span>${esc(i.email)}</span><button type="button" data-remove="${esc(i.email)}">Remove</button></li>`).join("") || `<li class="hint">Nobody invited yet.</li>`;
  } catch (err) { $("#invites").innerHTML = `<li class="hint warn">${esc(err.message)}</li>`; }
}
$("#invites").onclick = async (e) => {
  const b = e.target.closest("[data-remove]"); if (!b) return;
  if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Remove?"; return; }
  await removeInvite(b.dataset.remove); renderInvites();
};
$("#inviteForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const address = await addInvite($("#inviteEmail").value);
    $("#inviteHint").textContent = `Invited ${address}. Send them the link; they sign in with that Google account.`;
    $("#inviteEmail").value = ""; renderInvites();
  } catch (err) { $("#inviteHint").textContent = err.message; }
};
$("#sealFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  const out = $("#libraryState");
  try {
    const svg = await f.text();
    if (!svg.includes("<svg")) throw new Error("that file isn't an SVG");
    await uploadSeal(svg);
    out.textContent = "Uploaded the seal. Reloading…";
    setTimeout(() => location.reload(), 800);
  } catch (err) { out.textContent = `Upload failed: ${err.message}`; }
};
$("#libraryFile").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  const out = $("#libraryState");
  try {
    const roles = JSON.parse(await f.text());
    const count = await uploadRoles(roles, (done, total) => { out.textContent = `Uploading ${done} of ${total}…`; });
    out.textContent = `Uploaded ${count} characters. Reloading…`;
    setTimeout(() => location.reload(), 800);
  } catch (err) { out.textContent = `Upload failed: ${err.message}`; }
};
