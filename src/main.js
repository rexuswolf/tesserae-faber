import JSZip from "jszip";
import {
  loadLibrary, buildToken, createViewer, tokenSvg, roleName, addTokenToZip, saveFile,
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
  queue: [], selecting: false, picked: new Set(),
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
    viewer.setToken(token);
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

function selectRole(role) {
  state.role = role; state.custom = null; state.designId = null;
  $("#printed").value = printed();
  $$("#tokens .tok").forEach((t) => t.setAttribute("aria-current", String(state.lib.roles[+t.dataset.i] === role)));
  render();
}

function setLang(lang) {
  state.spec.lang = lang; document.documentElement.lang = lang;
  $$(".langs .pill").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === lang)));
  state.custom = null; $("#printed").value = printed(); renderTray(); render();
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
    roles.forEach((r) => addToQueue(r, null));
    $("#exportNote").textContent = `Added ${roles.length} to the print queue with the current style.`;
    state.picked.clear(); state.selecting = false; renderTray();
    $("#queueBox").open = true;
  };
  $("#enqueue").onclick = () => { addToQueue(state.role, state.custom); $("#queueBox").open = true; $("#exportNote").textContent = `Added “${printed()}” to the print queue.`; };
  $("#queue").onclick = (e) => { const b = e.target.closest("[data-unqueue]"); if (b) { state.queue = state.queue.filter((q) => q.key !== b.dataset.unqueue); persistQueue(); renderQueue(); } };
  $("#queueClear").onclick = (e) => {
    if (e.target.dataset.confirm !== "1") { e.target.dataset.confirm = "1"; e.target.textContent = "Clear all?"; return; }
    e.target.dataset.confirm = ""; e.target.textContent = "Clear the queue";
    state.queue = []; persistQueue(); renderQueue();
  };
  $("#bambu").onclick = downloadBambu;
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
function addToQueue(role, text) {
  state.queue.push({ key: crypto.randomUUID(), roleId: role.id, text, spec: structuredClone(state.spec) });
  persistQueue();
  renderQueue();
}
const queueTitle = (q, role) => q.text ?? roleName(role, q.spec.lang);

/** Plate plan without building geometry: which parts exist and their colours. */
function queuePlan() {
  const items = state.queue.map((q) => {
    const role = state.lib.roles.find((r) => r.id === q.roleId);
    const spec = { ...DEFAULT_SPEC, ...q.spec, colours: { ...DEFAULT_SPEC.colours, ...q.spec.colours } };
    const team = TEAMS[role.team].colour, pick = (v) => (v === "team" ? team : v);
    const hasBack = spec.back !== "none" && (spec.back !== "custom" || spec.customSvg) && (spec.back !== "seal" || state.lib.sealSvg) && (spec.back !== "edition" || role.edition);
    return {
      title: queueTitle(q, role), group: PLATE_LABEL[spec.lang][PLATE_GROUP[role.team]],
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
    const pic = tokenSvg(state.lib, role, { ...q.spec, diameter: 45 }, { text: queueTitle(q, role) });
    return `<li><span class="q">${pic}<span>${esc(queueTitle(q, role))}</span></span><button class="del" type="button" data-unqueue="${q.key}" aria-label="Remove ${esc(queueTitle(q, role))}">Remove</button></li>`;
  }).join("") || `<li class="hint">Add tokens here, then download them all as one Bambu Studio project. Use “Choose several” in the tray to add many at once.</li>`;
  if (!n) { $("#queuePlan").textContent = ""; return; }
  try {
    const plan = queuePlan();
    const used = [...new Set(plan.plates.flatMap((p) => [...p.slots]))].map((s) => FILAMENT_SLOTS[s].name);
    $("#queuePlan").className = "hint";
    $("#queuePlan").textContent = `${plan.plates.length} plate${plan.plates.length > 1 ? "s" : ""} (up to ${plan.capacity} tokens, 4 filaments each). Filaments: ${used.join(", ")}.`;
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
      out.textContent = `Building ${i + 1} of ${state.queue.length}: ${queueTitle(q, role)}`;
      await new Promise((r) => setTimeout(r));
      items.push({ token: buildToken(state.lib, role, q.spec, queueTitle(q, role)), title: queueTitle(q, role), group: PLATE_LABEL[q.spec.lang][PLATE_GROUP[role.team]] });
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
