// What's picked and the print queue: selection, steps, the drawer and steps 2 and 3.
import { on, emit } from "./events.ts";
import { loadJSON, PICK_KEY, QUEUE_KEY, storeJSON, state, PLATE_LABEL, PLATE_GROUP, $, esc, hit, TEAM_ORDER, TEAM_PLURAL, $$, coll } from "./context.ts";
import { roleById } from "./wiring.ts";
import { remKey, charKey, textFor, ownIcon, sortKeys, specFor, filamentName, remindersOf } from "./tokens.ts";
import { renderSheet, hasOwn, selectToken, ownPen } from "./sheet.ts";
import type { QueueEntry, Role, TokenSpec, PlateItem, PlanToken, PartName, Hex, PlatePlan, Volumes, MagnetLayout, Token } from "../types.ts";
import { lookOf } from "./designs.ts";
import { tokenLang } from "./token-language.ts";
import { shapeSpec, reminderSpec, DEFAULT_SPEC, roleName, shapeOf, SHAPE_FEATURES, partColours, backFaceOf, CARD, ringSize, isCard, buildToken, geometryVolume, SMALL_LETTERS_MM, tokenSvg, nameLetterHeight, magnetLayout, saveFile, cardPlan } from "../engine/token-engine.ts";
import { uiLang, t } from "../i18n.ts";
import { planPlates, printerOf, nozzleOf, FILAMENT_SLOTS, PRINTERS, NOZZLES } from "../bambu/plates.ts";
import { layoutCoins, PAGE, backX } from "../pdf/layout.ts";
import type { PaperSize, SheetSlot } from "../pdf/layout.ts";
import { plateFeatures } from "../bambu/estimate.ts";
import { drawer } from "./scripts-ui.ts";
import { renderWorkshop, viewTab, showTab } from "./workshop.ts";
import { dec1, colourNotes } from "./design-sheet.ts";
import posthog, { posthogEnabled } from "../posthog.ts";
import { posthogAppLogger } from "../posthog-logger.ts";
import { OWN, nameIn, builtIn, APP_NAME } from "../collection.ts";

/** The collection a download is of, by name (Clocktower's own page: Blood on the Clocktower); its files are named after it. */
const collectionName = () => nameIn(OWN ? coll.name : builtIn("botc")?.name, uiLang()) || APP_NAME;
const fileSlug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ------------------------------------------------------------ selection

// What you picked: token keys ("c:imp", "r:imp:0") with how many copies, in the order picked.
// Picked tokens always use their style (with their own changes), so nothing goes stale.
export function loadPicks() {
  const saved = loadJSON<[string, number][] | null>(PICK_KEY, null);
  if (Array.isArray(saved)) return new Map(saved.filter(([k, n]) => tokenRole(k) && n > 0));
  // From the old print queue (entries with a role, a reminder and a frozen style): keep what and how many.
  const picks = new Map<string, number>();
  for (const q of loadJSON<({ roleId: string; ri?: number | null; reminder?: string | null } | null)[]>(QUEUE_KEY, [])) {
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
export function persistPicks() { storeJSON(PICK_KEY, [...state.pick]); }
/** The role and reminder index a token key stands for (the character is in the library: it's a key of the selection). */
export function tokenRole(key: string) { return roleById(key.split(":")[1])!; }
export const tokenRem = (key: string) => (key.startsWith("r:") ? +key.split(":")[2] : null);
export const isPicked = (key: string) => state.pick.has(key);
export function setPick(key: string, on: boolean) {
  if (on) { if (!state.pick.has(key)) state.pick.set(key, 1); }
  else state.pick.delete(key);
}
/** After any change to the selection: save it and redraw what shows it. */
// what's picked is kept, and the queue shows it (the sheet and spine listen too)
on("picks", persistPicks);
on("picks", renderQueue);
on("looks", renderQueue);
on("all", renderQueue);

/** The selection as queue entries, one per copy, in the current language and design. */
function queueNow() {
  const out: QueueEntry[] = [];
  for (const [key, n] of state.pick) {
    const role = tokenRole(key), ri = tokenRem(key);
    for (let i = 0; i < n; i++) out.push({ key: `${key}#${i}`, pick: key, ...queueEntry(role, ri) });
  }
  return out;
}
/** A queue entry as the sheet would draw it now: the token language, its style's look (with its own changes) and its text. */
export function queueEntry(role: Role, ri: number | null): QueueEntry {
  const isRem = ri != null, key = isRem ? remKey(role, ri) : charKey(role);
  return {
    roleId: role.id, ri: isRem ? ri : null,
    reminder: isRem ? textFor(key, role, ri) : null,
    text: isRem ? null : textFor(key, role, null),
    custom: hasOwn(key),
    spec: { ...structuredClone(lookOf(key)), lang: tokenLang(), icon: ownIcon(role.id) },
  };
}
const isReminder = (q: QueueEntry): q is QueueEntry & { reminder: string } => q.reminder != null;
// As its shape prints it (shapeSpec): a card's or ring's has no back or magnet to count, and its
// real size for a diameter (a ring's outer edge), which plates and paper go by.
export const itemSpec = (q: QueueEntry): TokenSpec => shapeSpec(roleById(q.roleId), isReminder(q) ? reminderSpec({ ...DEFAULT_SPEC, ...q.spec }) : q.spec);
const queueTitle = (q: QueueEntry, role: Role) => (isReminder(q) ? q.reminder : q.text ?? roleName(role, q.spec.lang));
export const queueLabel = (q: QueueEntry, role: Role) => (isReminder(q) ? `${roleName(role, q.spec.lang)}: ${q.reminder}` : queueTitle(q, role));
const queueGroup = (q: QueueEntry, role: Role) => PLATE_LABEL[uiLang()][PLATE_GROUP[role.team]] + (isReminder(q) ? t("queue.reminderSuffix") : "");

/** The queue in print order: good, evil, travellers, fabled, loric; characters before their reminders. */
export const PRINT_GROUPS: string[] = ["good", "evil", "traveller", "fabled", "loric", "info"];
const printOrder = () => queueNow().map((q): [QueueEntry, number] => [q, PRINT_GROUPS.indexOf(PLATE_GROUP[roleById(q.roleId)!.team] as typeof PRINT_GROUPS[number]) * 2 + (isReminder(q) ? 1 : 0)])
  .sort((a, b) => a[1] - b[1]).map(([q]) => q);   // a stable sort keeps the queue's order within a group

/** Plate plan without building geometry: which parts exist and their colours. */
/** A queued token on a plate: what the plan needs of it, without its geometry. */
type QueueItem = PlateItem<PlanToken & { spec: TokenSpec; colours: Record<PartName, Hex> }> & { q: QueueEntry };

export function queuePlan() {
  const items = printOrder().map((q): QueueItem => {
    const role = roleById(q.roleId)!;
    const base = itemSpec(q);
    const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours } };
    const shape = shapeOf(role), has = SHAPE_FEATURES[shape], c = partColours(role, spec);
    const hasBack = has.back && spec.back !== "none" && (spec.back !== "custom" || spec.customSvg) && (spec.back !== "seal" || state.lib!.sealSvg) && (spec.back !== "edition" || role.edition);
    // a back that is a face (itemSpec says so) is drawn like a front: its name, icon and frame
    const face = backFaceOf(role, spec, "")?.spec, iconColour = has.icon && spec.style !== "window" ? c.ink! : c.base;
    return {
      q, title: queueLabel(q, role), group: queueGroup(q, role),
      token: {
        spec,
        // a card's footprint is its own; a ring takes up its outer diameter but has no body in its hole
        ...(shape === "card" ? { foot: { w: CARD.w, h: CARD.h } } : shape === "ring" ? { hole: 2 * ringSize(spec).inner } : {}),
        // a card's parts as buildCard makes them: its icon, frame and line, and its back's plate, phrase and icon, and frame
        ...(shape === "card" ? cardPlan(state.lib!, role, spec) : {
          parts: { base: 1, front: 1, icon: has.icon ? 1 : null, frame: spec.frame !== "none" ? 1 : null, back: hasBack ? 1 : null,
            backIcon: face && has.icon ? 1 : null, backFrame: face && face.frame !== "none" ? 1 : null },
          // the window's icon is in the coin colour; the classic one in the name's (on a back face, in the back's)
          colours: { base: c.base, front: c.front, icon: iconColour, frame: c.frame, back: c.back,
            backIcon: face ? (face.style === "window" ? c.base : partColours(role, face).ink!) : iconColour, backFrame: c.backFrame },
        }),
      },
    };
  });
  return planPlates(items, { bed: printerOf(flow.printer).bed });
}

/**
 * The token to print first as a test: the one with the most colours (the most filament
 * changes to check), a character before a reminder or a card. An item of queuePlan().
 */
function testItem(plan: PlatePlan<QueueItem>) {
  const colours = (it: QueueItem) => new Set(Object.entries(it.token.parts).filter(([, v]) => v).map(([p]) => it.token.colours[p as PartName] ?? it.token.colours.base)).size;
  const rank = (it: QueueItem) => colours(it) * 4 - (isReminder(it.q) ? 2 : 0) - (isCardEntry(it.q) ? 1 : 0);
  return plan.plates.flatMap((p) => p.items).reduce<QueueItem | null>((best, it) => (!best || rank(it) > rank(best) ? it : best), null);
}
export let testQ: QueueEntry | null = null;   // the Print step's test token (a queue entry)

/** A queued token's footprint: a coin's diameter, or a card's size. */
const isCardEntry = (q: QueueEntry) => isCard(roleById(q.roleId));
const paperSize = (q: QueueEntry): PaperSize => (isCardEntry(q) ? CARD : itemSpec(q).diameter);

/** Each part's volume (mm³) for a queued token, from its real geometry; cached by what shapes it. */
const volumeCache = new Map<string, Volumes>();
function tokenVolumes(q: QueueEntry) {
  const role = roleById(q.roleId)!, spec = itemSpec(q), text = queueTitle(q, role);
  const k = JSON.stringify([q.roleId, text, spec]);
  if (!volumeCache.has(k)) {
    const { parts, above } = buildToken(state.lib!, role, spec, text);
    volumeCache.set(k, { ...Object.fromEntries(Object.entries(parts).map(([p, g]) => [p, geometryVolume(g)])), above: above ?? {} } as Volumes);
    if (volumeCache.size > 500) volumeCache.delete(volumeCache.keys().next().value!);
  }
  return volumeCache.get(k)!;
}
/** Filament and time per plate of the plan (estimates; Bambu Studio gives the exact figures). */
export const plateEstimates = (plan: PlatePlan<QueueItem>) => plan.plates.map((p) => plateFeatures(p.items.map((it) => ({ token: it.token, vol: tokenVolumes(it.q) })), flow.nozzle));


// ------------------------------------------------------------ steps

export const PRINT_WAY_KEY = "midnight-mint-print-way", PRINTER_KEY = "midnight-mint-printer", NOZZLE_KEY = "midnight-mint-nozzle", PAPER_BACKS_KEY = "midnight-mint-paper-backs";
export const flow: { way: string; printer: string; nozzle: string; backs: boolean; undo: Map<string, number> | null } = { way: ((w) => (w === "paper" || w === "3d" ? w : ""))(loadJSON<string>(PRINT_WAY_KEY, "")),   // "": not chosen yet (asked first)
  printer: printerOf(loadJSON(PRINTER_KEY, "a1")).id,
  nozzle: nozzleOf(loadJSON(NOZZLE_KEY, "0.4")).id,   // 3D: the printer's nozzle, 0.4 mm (standard) or 0.2 mm
  backs: loadJSON<boolean>(PAPER_BACKS_KEY, true) !== false,   // paper: print the backs too (double-sided)
  undo: null };
/** Letters smaller than this (mm) may not print cleanly: the 3D nozzle's limit; on paper, the 0.4 mm one's. */
export const smallLetters = () => (flow.way === "3d" ? nozzleOf(flow.nozzle).smallLetters : SMALL_LETTERS_MM);
export const nozzleMm = () => String(flow.way === "3d" ? nozzleOf(flow.nozzle).mm : 0.4).replace(".", uiLang() === "es" ? "," : ".");
const queuePic = (q: QueueEntry, role = roleById(q.roleId)!) => tokenSvg(state.lib!, role, itemSpec(q), { text: queueTitle(q, role) });

/** The step in the address: ?disenar=<the token> (Redesign), ?imprimir (Print), ?ajustes (a collection's settings); none, the tokens. */
const STEP_WORDS: Record<number, string> = { 2: "disenar", 3: "imprimir", 4: "ajustes" };
/**
 * The settings page (4) is a collection of yours' (src/app/creator.ts): whether it's there to open,
 * what opening it does, and whether it can be left (unsaved changes, kept or not, asked first).
 */
export const settingsStep = { can: () => false, enter: () => {}, leave: () => true };
/** A token's key as an address may carry it: a character's (c:<id>) or one of its linked tokens' (r:<id>:<n>). */
const TOKEN_KEY = /^(c:[\w-]+|r:[\w-]+:\d+)$/;
export function stepInUrl(): { step: number; key: string | null } {
  const q = new URLSearchParams(location.search), key = q.get(STEP_WORDS[2]);
  if (q.has(STEP_WORDS[4])) return { step: 4, key: null };
  return q.has(STEP_WORDS[3]) ? { step: 3, key: null } : q.has(STEP_WORDS[2]) ? { step: 2, key: key && TOKEN_KEY.test(key) ? key : null } : { step: 1, key: null };
}
function stepUrl(step: number) {
  const q = new URLSearchParams(location.search);
  for (const w of Object.values(STEP_WORDS)) q.delete(w);
  const rest = q.toString().replace(/=(&|$)/g, "$1");   // ?admin stays ?admin
  const word = step === 2 && state.sel ? `${STEP_WORDS[2]}=${encodeURIComponent(state.sel.key).replace(/%3A/g, ":")}` : STEP_WORDS[step];
  const query = [rest, word].filter(Boolean).join("&");
  return location.pathname + (query ? `?${query}` : "") + location.hash;
}
/** Designing, another token: the address says it, in the same history entry. */
export function syncStepUrl() {
  if (state.step !== 2) return;
  const url = stepUrl(2);
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
}
/**
 * Moves to step 1 (pick), 2 (design) or 3 (print). Steps 2 and 3 need something picked. The address
 * says it, a new entry in the history (so Back goes back a step), or the same one ("replace": arriving,
 * "keep": come to by Back or Forward).
 */
export function goStep(step: number, address: "push" | "replace" | "keep" = "push") {
  if (step === 3 && !state.pick.size) step = 1;   // printing needs a selection
  if (step === 2 && !state.sel) step = 1;          // designing, a token
  if (step === 4 && !settingsStep.can()) step = 1;   // settings: a collection of yours
  // leaving the settings with changes not saved: asked first; kept, it stays (Back too: the address again)
  if (state.step === 4 && step !== 4 && !settingsStep.leave()) { if (address === "keep") history.pushState(history.state, "", stepUrl(4)); return; }
  state.step = step;
  const url = stepUrl(step);
  if (address !== "keep" && url !== location.pathname + location.search + location.hash) history[address === "push" ? "pushState" : "replaceState"](history.state, "", url);
  $("#app").dataset.step = String(step);
  drawer(false);
  if (step === 2) {
    renderWorkshop(); renderDesignStage();
    revealPicked();
  }
  if (step === 3) { $("#printNote").textContent = ""; renderPrintStep(); $("#printPage").scrollTo({ top: 0 }); }
  if (step === 1) renderSheet();
  if (step === 4) settingsStep.enter();
  renderQueue();
}

/** The top bar's steps and the bottom bar: the selection, back and on. */
export function renderQueue() {
  if (!state.lib) return;
  const queue = queueNow(), n = queue.length, step = state.step;
  const chars = new Set([...state.pick.keys()].filter((k) => k.startsWith("c:"))).size, rems = queue.filter(isReminder).length;
  // no steps to follow: the tokens are home. Anywhere else (designing one, printing), the top bar has the way back
  $("#flowSteps").innerHTML = step > 1 ? `<button class="top-back" type="button" data-goto="1"><span aria-hidden="true">‹</span> ${esc(t("flow.step1"))}</button>` : "";
  // the bottom bar only where it does something: on the tokens once some are picked, and printing (Download)
  $("#queuebar").hidden = step === 2 || step === 4 || (step === 1 && !n);
  $("#queueCount").textContent = n ? t("queue.count", { n }) : t("pick.nothing");
  $("#queueStack").innerHTML = [...state.pick.keys()].slice(-5).map((k) => queuePic({ pick: k, ...queueEntry(tokenRole(k), tokenRem(k)) })).join("");
  $<HTMLButtonElement>("#queueToggle").disabled = !n;
  // what the count doesn't say already (linked tokens, copies), else what to do next
  $("#queueSummary").textContent = !n ? t("pick.help") : rems || chars !== n ? t("queue.summary", { c: chars, r: rems }) : step === 1 ? t("pick.next") : "";
  $("#flowBack").hidden = true;   // the top bar's "‹ Tokens" is the way back
  // on a phone only the chevron shows; the step's name stays as the label
  $("#flowBack").innerHTML = step > 1 ? `<span aria-hidden="true">‹</span> <span class="fb-l">${esc(t("flow.step1"))}</span>` : "";
  $("#flowBack").setAttribute("aria-label", step > 1 ? t("flow.step1") : "");
  const next = $<HTMLButtonElement>("#flowNext");
  next.textContent = step < 3 ? `${t("flow.step3")} ›` : (!flow.way ? t("print.chooseFirst") : flow.way === "paper" ? t("queue.downloadPdf") : t("queue.download", { printer: `Bambu ${printerOf(flow.printer).short}` }));
  next.disabled = !n || (step === 3 && !flow.way);
  if ($<HTMLDialogElement>("#queueDrawer").open) renderQueueList();
  if (step === 2) renderDesignStage();
  if (step === 3) renderPrintStep();
}

// ------------------------------------------------------------ your selection (the drawer)

export function openQueue() {
  if (!state.pick.size) return;
  const dlg = $<HTMLDialogElement>("#queueDrawer");
  if (!dlg.open) dlg.showModal();
  renderQueueList();
}
/** Changes the selection with "Undo" for a few seconds. */
export let toastTimer: ReturnType<typeof setTimeout> | undefined;   // the Undo toast's
export const setToastTimer = (t: ReturnType<typeof setTimeout> | undefined) => { toastTimer = t; };
export function changePicks(mutate: () => void, message: string) {
  const before = new Map(state.pick);
  mutate();
  emit("picks");
  flow.undo = before;
  const toast = $<HTMLDialogElement>("#queueDrawer").open ? $("#queueToast") : $("#appToast");   // a modal drawer hides the page
  $("span", toast).textContent = message;
  $("button", toast).hidden = false;
  toast.hidden = false;
  clearTimeout(toastTimer);
  (toast.id === "appToast" ? $("#queueToast") : $("#appToast")).hidden = true;
  toastTimer = setTimeout(() => { toast.hidden = true; flow.undo = null; }, 5000);
}
export function undoPicks() {
  if (flow.undo) { state.pick = flow.undo; emit("picks"); }
  flow.undo = null; $("#queueToast").hidden = $("#appToast").hidden = true;
}
export function onQueueClick(e: Event) {
  const pen = hit(e, "[data-edit]");
  if (pen) { editToken(pen.dataset.edit!); return; }
  const plus = hit(e, "[data-plus]"), minus = hit(e, "[data-minus]"), rm = hit(e, "[data-unpick]");
  if (plus) { const k = plus.dataset.plus!; state.pick.set(k, (state.pick.get(k) || 0) + 1); emit("picks"); }
  else if (minus) {
    const k = minus.dataset.minus!, n = state.pick.get(k) || 0, role = tokenRole(k);
    const ri = tokenRem(k), name = ri != null ? `${textFor(charKey(role), role, null)}: ${textFor(k, role, ri)}` : textFor(k, role, null);
    if (n > 1) { state.pick.set(k, n - 1); emit("picks"); }
    else changePicks(() => state.pick.delete(k), t("queue.removed", { name }));
  } else if (rm) {
    const k = rm.dataset.unpick!, role = tokenRole(k);
    changePicks(() => state.pick.delete(k), t("queue.removed", { name: `${textFor(charKey(role), role, null)}: ${textFor(k, role, tokenRem(k))}` }));
  }
}

/**
 * The drawer: the characters, then the reminders, each with how many tokens they make and
 * each token's copies (− n +). One copy less than one takes it out, with Undo.
 */
function renderQueueList() {
  const lang = uiLang(), n = queueNow().length;
  $("#queueTitle").innerHTML = `${esc(t("queue.title"))}${n ? `<small>${esc(t("queue.count", { n }))}</small>` : ""}`;
  $("#queueClear").hidden = !n;
  if (!n) { $("#queue").innerHTML = `<div class="q-empty"><h3>${esc(t("pick.nothing"))}</h3><p>${esc(t("pick.help"))}</p></div>`; return; }
  const keys = sortKeys(state.pick.keys()), chars = keys.filter((k) => tokenRem(k) == null), rems = keys.filter((k) => tokenRem(k) != null);
  const copies = (list: string[]) => list.reduce((s, k) => s + (state.pick.get(k) || 0), 0);
  const qty = (k: string, name: string) => `<span class="qty"><button type="button" data-minus="${k}" aria-label="${esc(t("queue.lessCopy", { name }))}">−</button><span>${state.pick.get(k) || 0}</span><button type="button" data-plus="${k}" aria-label="${esc(t("queue.moreCopy", { name }))}">+</button></span>`;
  const item = (k: string) => {
    const r = tokenRole(k), ri = tokenRem(k), isRem = ri != null, name = textFor(k, r, ri), char = textFor(charKey(r), r, null);
    const pic = tokenSvg(state.lib!, r, { ...specFor(k, isRem), back: "none" }, { text: name });
    return `<div class="q-item${isRem ? " r" : ""}"><span class="pic">${pic}</span>
      <span class="q-name"><b>${esc(name)}${hasOwn(k) ? ` ${ownPen(k, name)}` : ""}</b>${isRem ? `<small>${esc(char)}</small>` : ""}</span>
      ${qty(k, isRem ? `${char}: ${name}` : name)}</div>`;
  };
  const section = (title: string, list: string[], byTeam: boolean) => !list.length ? "" : `<section class="q-sec"><h3 class="q-sec-h">${esc(title)}<small>${esc(t("queue.count", { n: copies(list) }))}</small></h3>`
    + (byTeam ? TEAM_ORDER.map((team) => { const here = list.filter((k) => tokenRole(k).team === team); return here.length ? `<h4 class="q-team">${esc(TEAM_PLURAL[lang][team])}</h4>${here.map(item).join("")}` : ""; }).join("") : list.map(item).join(""))
    + `</section>`;
  $("#queue").innerHTML = section(t("queue.chars"), chars, true) + section(t("queue.rems"), rems, false);
}

// ------------------------------------------------------------ step 2: your tokens in their styles

export function renderDesignStage() {
  // the coins on the side the 3D view shows: from behind when it's turned over
  // the token being designed and its linked tokens (each designed on its own); alone, no strip
  const r0 = state.sel?.role, side = state.view === "back" ? "back" : "front";
  const keys = r0 ? [charKey(r0), ...remindersOf(r0).map((_, i) => remKey(r0, i))] : [];
  $("#designGrid").hidden = keys.length < 2;
  $("#designGrid").innerHTML = keys.map((k) => {
    const role = tokenRole(k), ri = tokenRem(k), text = textFor(k, role, ri);
    const spec = specFor(k, ri != null);
    const label = ri != null ? `${textFor(charKey(role), role, null)}: ${text}` : text;
    // the copies stepper sits beside the button (a button can't hold buttons), over the coin's foot
    return `<div class="ds-item${ri != null ? " r" : ""}"><button class="ds-cell${ri != null ? " r" : ""}${isCard(role) ? " card" : ""}" type="button" data-design="${k}" aria-current="${state.sel?.key === k}" title="${esc(t("design.tap"))}">${tokenSvg(state.lib!, role, spec, { text, side: shapeOf(role) === "coin" ? side : "front" })}${hasOwn(k) ? `<span class="mark" title="${esc(t("sheet.own"))}">✎</span>` : ""}<span>${esc(label)}</span></button></div>`;
  }).join("");
}
/** Takes a token out of the selection from step 2, with Undo. The workshop moves on to another
 *  picked token if it showed this one; with nothing left, back to step 1. */
export function dropFromDesign(key: string) {
  const role = tokenRole(key), ri = tokenRem(key);
  const name = ri != null ? `${textFor(charKey(role), role, null)}: ${textFor(key, role, ri)}` : textFor(key, role, null);
  changePicks(() => state.pick.delete(key), t("queue.removed", { name }));
  if (!state.pick.size) { goStep(1); return; }
  if (!state.sel || !isPicked(state.sel.key)) { selectToken(sortKeys(state.pick.keys())[0]); renderWorkshop(); renderDesignStage(); }
}
/** Tapping one of your tokens: the workshop shows it. */
export function designToken(key: string) {
  const was = state.sel && shapeOf(state.sel.role);
  selectToken(key);
  // another type: its design opens where it was left, the 3D view turned to it
  if (was && was !== shapeOf(state.sel!.role)) viewTab();
  renderWorkshop(); renderDesignStage();
  revealPicked();
}
/** Keeps the selected token in view in the strip. */
function revealPicked() { $("#designGrid .ds-cell[aria-current=true]")?.scrollIntoView({ inline: "nearest", block: "nearest" }); }
/** "Design" on a token (its row, or the pen on one with its own changes): its design, picked or not. */
export function editToken(key: string) {
  if ($<HTMLDialogElement>("#queueDrawer").open) $<HTMLDialogElement>("#queueDrawer").close();
  selectToken(key);
  showTab({ part: "front" });
  goStep(2);
  revealPicked();
}

// ------------------------------------------------------------ step 3: how to print

/** Step 3: how to print. A 3D printer shows the plates and filaments; paper shows the A4 sheets (fronts and backs). */
function renderPrintStep() {
  const queue = queueNow(), way = flow.way, detail = $("#printDetail");
  $("#printLead").textContent = t("print.lead", { n: queue.length });
  $$("#printPage [data-way]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.way === way)));
  const swatches = (slots: number[]) => `<span class="sws">${slots.map((sl) => `<i class="sw" style="background:${FILAMENT_SLOTS[sl].hex}" title="${esc(filamentName(sl))}"></i>`).join("")}</span>`;
  let plan: PlatePlan<QueueItem> | null = null, planError: string | null = null, sheets: SheetSlot[][] = [];
  try { plan = queuePlan(); } catch (err) { planError = (err as Error).message; }
  try { sheets = layoutCoins(queue.map(paperSize)); } catch { /* shown below */ }
  const printer = printerOf(flow.printer);
  $("#way3dSub").textContent = plan ? t("queue.way3dSub", { printer: printer.name, n: plan.plates.length }) : t("queue.way3dError", { printer: printer.name });
  $("#wayPaperSub").textContent = t("queue.wayPaperSub", { n: sheets.length, backs: flow.backs });
  // not chosen yet: what each way needs, before any of their settings
  if (!way) { $<HTMLButtonElement>("#flowNext").disabled = true; detail.innerHTML = `<p class="q-note way-ask"><span aria-hidden="true">?</span><span>${esc(t("print.wayAsk"))}</span></p>`; return; }
  if (way === "3d") {
    $<HTMLButtonElement>("#flowNext").disabled = !plan;
    // which printer: the A1 or the A1 mini (same AMS lite, a smaller bed)
    const printers = `<h3 class="q-h">${esc(t("print.printer"))}</h3>
      <div class="printers" role="radiogroup" aria-label="${esc(t("print.printer"))}">${Object.values(PRINTERS).map((pr) => `<button class="pill" type="button" role="radio" data-printer="${pr.id}" aria-checked="${pr.id === printer.id}">${esc(pr.name)}<small>${esc(t("print.bed", { mm: pr.bed }))}</small></button>`).join("")}</div>
      <h3 class="q-h">${esc(t("print.nozzle"))}</h3>
      <div class="printers" role="radiogroup" aria-label="${esc(t("print.nozzle"))}">${Object.values(NOZZLES).map((nz) => `<button class="pill" type="button" role="radio" data-nozzle="${nz.id}" aria-checked="${nz.id === flow.nozzle}">${esc(`${String(nz.mm).replace(".", uiLang() === "es" ? "," : ".")} mm`)}<small>${esc(t(nz.id === "0.4" ? "print.nozzle04" : "print.nozzle02"))}</small></button>`).join("")}</div>`;
    if (!plan) { detail.innerHTML = `${printers}<p class="q-note warn">${esc(planError)}</p>`; return; }
    // Names too small to print cleanly, smallest first, each opening its token in step 2.
    const smalls = [...state.pick.keys()].map((k) => {
      const q = { pick: k, ...queueEntry(tokenRole(k), tokenRem(k)) }, role = roleById(q.roleId)!;
      return { k, mm: nameLetterHeight(state.lib!, itemSpec(q), queueTitle(q, role), role), label: queueLabel(q, role) };
    }).filter((x) => x.mm < smallLetters()).sort((a, b) => a.mm - b.mm);
    const smallNote = smalls.length ? `<div class="q-note warn small-text"><span aria-hidden="true">⚠</span><div>
      <p>${esc(t("print.small", { n: smalls.length, mm: dec1(smallLetters()) }))}</p>
      <ul>${smalls.map((x) => `<li><button type="button" data-fix="${x.k}">${esc(x.label)}</button> <small>${esc(dec1(Math.floor(x.mm * 10) / 10))} mm</small></li>`).join("")}</ul></div></div>` : "";
    const slots = [...new Set(plan.plates.flatMap((p) => [...p.slots]))].sort((a, b) => a - b);
    // Estimates: grams per filament and minutes per plate (Bambu Studio has the exact figures).
    const est = plateEstimates(plan), gramsBy = new Map<number, number>();
    for (const e of est) for (const [sl, g] of e.grams) gramsBy.set(sl, (gramsBy.get(sl) || 0) + g);
    const nb = (s: string) => s.replace(/ /g, "\u00a0");   // a figure never breaks across lines
    const fmtG = (g: number) => nb(`≈ ${g < 10 ? g.toFixed(1).replace(".", dec) : Math.round(g)} g`);
    const fmtT = (m: number) => { m = Math.max(5, Math.round(m / 5) * 5); return nb(`≈ ${m >= 60 ? `${Math.floor(m / 60)} h ` : ""}${m % 60 ? `${m % 60} min` : ""}`.trim()); };
    const totalMin = est.reduce((a, e) => a + e.minutes, 0);
    const dec = uiLang() === "es" ? "," : ".";
    const pauses = [...new Set(queue.map((q) => magnetLayout(itemSpec(q))).filter((m): m is MagnetLayout => m?.kind === "hidden").map((m) => m.pauseZ!))].sort((a, b) => a - b);
    // A test token first: one coin with the most colours, on its own plate, before hours of plates.
    const test = queue.length > 1 ? testItem(plan) : null;
    testQ = test?.q ?? null;
    const testNote = test ? `<div class="q-note test-print"><span aria-hidden="true">✓</span><div>
      <p>${esc(t("print.test", { name: test.title, time: fmtT(plateFeatures([{ token: test.token, vol: tokenVolumes(test.q) }], flow.nozzle).minutes) }))}</p>
      <button class="pill" type="button" data-test>${esc(t("print.testBtn"))}</button></div></div>` : "";
    detail.innerHTML = `${printers}${smallNote}${colourNotes("3d")}<h3 class="q-h">${esc(t("queue.filaments"))}</h3>
      <p class="q-note">${swatches(slots)}<span>${esc(t("queue.filamentsNote", { list: slots.map((sl) => `${filamentName(sl)} ${fmtG(gramsBy.get(sl) || 0)}`).join(", ") }))}</span></p>
      <p class="q-note"><span aria-hidden="true">⏱</span><span>${esc(t("print.estimate", { time: fmtT(totalMin), n: plan.plates.length }))}</span></p>
      ${testNote}
      ${pauses.length ? `<p class="q-note"><span aria-hidden="true">⏸</span><span>${esc(t("queue.pauses", { z: pauses.map((z) => String(z).replace(".", dec)).join(", ") }))}</span></p>` : ""}
      <h3 class="q-h">${esc(t("queue.platesH", { n: plan.plates.length }))}</h3>
      <div class="q-plates">${plan.plates.map((p, i) => `<article class="q-plate"><header><h3>${esc(t("queue.plateName", { i: i + 1, name: p.name }))}<small>${esc(t("queue.plateFill", { n: p.items.length, cap: p.capacity }))}</small></h3>${swatches([...p.slots].sort((a, b) => a - b))}
        <span class="q-fill"><i style="width:${Math.round(100 * p.items.length / p.capacity)}%"></i></span>
        <p class="q-est">${esc(fmtG(est[i].grams.reduce((a, [, g]) => a + g, 0)))} · ${esc(fmtT(est[i].minutes))}</p></header>
        <div class="q-coins">${p.items.map((it) => `<span class="${isReminder(it.q) ? "r" : ""}" title="${esc(it.title)}">${queuePic(it.q)}</span>`).join("")}</div></article>`).join("")}</div>`;
  } else {
    $<HTMLButtonElement>("#flowNext").disabled = !sheets.length;
    // Each sheet as the PDF prints it: the front, and the back with every coin's reverse at the
    // mirrored x (printed double-sided on the long edge, it lands behind its front). Paper has no magnets.
    // Positions and sizes in % of the sheet, so the preview matches whatever width the CSS gives it.
    const pctW = (mm: number) => `${(100 * mm / PAGE.w).toFixed(3)}%`, pctH = (mm: number) => `${(100 * mm / PAGE.h).toFixed(3)}%`;
    const coinAt = (q: QueueEntry, side: "front" | "back", x: number, c: SheetSlot) => {
      const role = roleById(q.roleId)!, spec = { ...itemSpec(q), magnet: "none" as const };
      return tokenSvg(state.lib!, role, spec, { side, text: queueTitle(q, role) })
        .replace("<svg", `<svg style="left:${pctW(x)};top:${pctH(c.y)};width:${pctW(c.w)};height:${pctH(c.h)}"`);
    };
    const face = (page: SheetSlot[], side: "front" | "back") => `<figure><div class="q-sheet">${page.map((c) => coinAt(queue[c.index], side, side === "front" ? c.x : backX(c.x), c)).join("")}</div>
      <figcaption>${esc(t(side === "front" ? "queue.pdfFront" : "queue.pdfBack"))}</figcaption></figure>`;
    const backs = flow.backs;
    detail.innerHTML = `${colourNotes("paper")}<label class="switch"><input type="checkbox" id="paperBacks" ${backs ? "checked" : ""}> <span>${esc(t("print.backs"))}</span></label>
      <h3 class="q-h">${esc(t("queue.sheetsH", { n: sheets.length, backs }))}</h3>
      ${sheets.map((page, i) => `<div class="q-pair"><h4>${esc(t("queue.sheetN", { i: i + 1, n: sheets.length }))}</h4><div class="q-sheets">${face(page, "front")}${backs ? face(page, "back") : ""}</div></div>`).join("")}
      <ol class="q-howto"><li>${esc(t(backs ? "queue.howto1" : "queue.howto1Single"))}</li><li>${esc(t("queue.howto2"))}</li><li>${esc(t("queue.howto3"))}</li></ol>`;
  }
}

/** Downloads the selection as a Bambu project, or only `one` queue entry (the test token). */
export async function downloadBambu(one: QueueEntry | null = null, btn = $<HTMLButtonElement>("#flowNext")) {
  const out = $("#printNote");
  btn.disabled = true;
  try {
    const { buildBambuProject } = await import("../bambu/bambu3mf.ts");   // JSZip and the printer template load only now
    const items: PlateItem<Token>[] = [];
    const order = one ? [one] : printOrder();
    for (const [i, q] of order.entries()) {
      const role = roleById(q.roleId)!;
      out.className = "hint"; out.textContent = t("queue.building", { i: i + 1, n: order.length, name: queueLabel(q, role) });
      await new Promise((r) => setTimeout(r));
      items.push({ token: buildToken(state.lib!, role, itemSpec(q), queueTitle(q, role)), title: queueLabel(q, role), group: queueGroup(q, role) });
    }
    const printer = printerOf(flow.printer);
    const nozzle = nozzleOf(flow.nozzle);
    const { blob, plan, filaments } = await buildBambuProject(items, { printer: printer.id, nozzle: nozzle.id, title: collectionName(), onProgress: (d, total) => { out.textContent = t("queue.writing", { i: d, n: total }); } });
    const what = one ? `test-${fileSlug(items[0].title)}` : `${items.length}-tokens`;
    const file = `${fileSlug(collectionName()) || "tesserae-faber"}-${what}-${printer.short.toLowerCase().replace(/\s+/g, "-")}${nozzle.id === "0.4" ? "" : `-${nozzle.id}mm`}.3mf`;
    await saveFile(blob, file);
    if (posthogEnabled) posthog.capture("print_exported", {
      export_format: "3mf",
      token_count: items.length,
      plate_count: plan.plates.length,
      printer: printer.id,
      nozzle_mm: nozzle.mm,
      is_test_export: Boolean(one),
    });
    posthogAppLogger.info("print export completed", {
      export_format: "3mf",
      token_count: items.length,
      plate_count: plan.plates.length,
      is_test_export: Boolean(one),
    });
    out.textContent = t("queue.done", { file, n: plan.plates.length, filaments: filaments.map((f) => t(`filament.${f.name}`)).join(", ") });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.failed", { message: (err as Error).message });
  } finally { btn.disabled = false; }
}

/** The queue as an A4 PDF of paper tokens: fronts and backs on alternate pages, for duplex printing. */
export async function downloadPdf() {
  const btn = $<HTMLButtonElement>("#flowNext"), out = $("#printNote");
  btn.disabled = true;
  try {
    out.className = "hint"; out.textContent = t("queue.pdfLoading");
    const { buildPrintPdf } = await import("../pdf/print-pdf.ts");   // jsPDF only loads when asked for
    const entries = queueNow().map((q) => { const role = roleById(q.roleId)!; return { role, spec: itemSpec(q), text: queueTitle(q, role) }; });
    const { blob, sheets } = await buildPrintPdf(state.lib!, entries, {
      labels: { front: t("queue.pdfFront"), back: t("queue.pdfBack") }, backs: flow.backs, title: collectionName(),
      onProgress: (i, n) => { out.textContent = t("queue.pdfWriting", { i, n }); },
    });
    const file = `${fileSlug(collectionName()) || "tesserae-faber"}-${entries.length}-tokens${flow.backs ? "" : "-fronts"}.pdf`;
    await saveFile(blob, file);
    if (posthogEnabled) posthog.capture("print_exported", {
      export_format: "pdf",
      token_count: entries.length,
      page_count: sheets,
      includes_backs: flow.backs,
    });
    posthogAppLogger.info("print export completed", {
      export_format: "pdf",
      token_count: entries.length,
      page_count: sheets,
      includes_backs: flow.backs,
    });
    out.textContent = t(flow.backs ? "queue.pdfDone" : "queue.pdfDoneSingle", { file, n: sheets });
  } catch (err) {
    out.className = "hint warn";
    out.textContent = t("queue.pdfFailed", { message: (err as Error).message });
  } finally { btn.disabled = !state.pick.size; }
}
