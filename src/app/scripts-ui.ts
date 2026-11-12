// Scripts (Clocktower): saving, sharing and opening them, and their homebrew characters.
import { idKey as scriptKey, loadScripts, saveScript, storeScripts, readLink, scriptLink } from "../scripts.ts";
import type { Script, ScriptJsonEntry, HomebrewEntry, NewScript } from "../scripts.ts";
import { state, $, esc } from "./context.ts";
import type { Team, Role, TokenOverride } from "../types.ts";
import { TEAMS, EDITIONS, tokenSvg } from "../engine/token-engine.ts";
import { roleById } from "./wiring.ts";
import { t } from "../i18n.ts";
import { tracedBefore, scriptEntryIcon, iconForScript } from "../icons.ts";
import { scheduleSheet } from "./design-sheet.ts";
import { charKey, ownIcon, specFor, charName } from "./tokens.ts";
import { storeOverrides } from "./designs.ts";
import { renderSpine, renderSheet } from "./sheet.ts";
import posthog, { posthogEnabled } from "../posthog.ts";

// ------------------------------------------------------------ scripts

/** A saved script that renames or re-icons official characters (older scripts: by their names). */
export const scriptHasOwn = (sc: Script | null) => !!sc && (sc.custom ?? Object.entries(sc.labels || {}).some(([id, label]) => {
  const role = state.lib!.roles.find((r) => scriptKey(r.id) === id || scriptKey(r.en) === id);
  return role && !isOwnName(role, label);
}));
/** The sheet shows an edition ("tb") or one of your scripts ("s:<id>"). */
export const scriptOf = (view: string | null | undefined): Script | null => (view?.startsWith("s:") ? loadScripts().find((x) => x.id === view.slice(2)) ?? null : null);

/**
 * A script entry that defines a character of its own (homebrew): a name and a team, usually
 * an ability and a picture too. Official characters only ever come as an id, so a definition
 * is the script's own character even when it shares a name with an official one. Returns its
 * team (the Script Tool's "traveler" is our "traveller"), or null.
 */
function homebrewTeam(e: ScriptJsonEntry | string | null | undefined): Team | null {
  if (!e || typeof e !== "object" || e.id === "_meta" || typeof e.name !== "string" || !e.name.trim()) return null;
  const team = (e.team === "traveler" ? "traveller" : e.team) as Team;
  return team !== "info" && TEAMS[team] ? team : null;
}
/** A homebrew character's role id: its script and its own id ("hb_1a2b3c4d_engineer"). */
const homebrewId = (sc: { id?: string }, id: string) => `hb_${sc.id}_${id}`;
/** Where a character comes from: its edition, or for a homebrew one, its script's name. */
export const editionName = (role: Role, lang: string) => EDITIONS[role.edition]?.name[lang] || (role.kind === "homebrew" ? scriptOf(role.edition)?.name : "") || "";
/** A script's homebrew characters as roles, drawn and printed like the library's. */
const homebrewRoles = (sc: Script): Role[] => (sc.homebrew || []).map((h) => ({
  id: homebrewId(sc, h.id), kind: "homebrew", en: h.name, es: h.name, names: {}, fem: {}, team: h.team,
  edition: `s:${sc.id}`, editionName: sc.name, reminders: { en: h.reminders || [] }, ability: h.ability,
  loading: !h.icon && !h.noIcon && !!(h.def?.image || h.def?.icon),   // its icon is on its way
  g: h.icon?.g ?? "translate(0 0) scale(1)", body: h.icon?.body ?? "",
}));
/** Puts every saved script's homebrew characters in the library, replacing the ones there. */
export function syncHomebrew() {
  for (const r of state.lib!.roles) if (r.kind === "homebrew") state.lib!.icons.delete(r.id);
  const roles = state.lib!.roles.filter((r) => r.kind !== "homebrew");
  state.lib!.roles.splice(0, Infinity, ...roles, ...loadScripts().flatMap(homebrewRoles));
}
/** A script's characters that are in the library, and the ids that aren't (with their names, when known). */
export function scriptRoles(sc: { id?: string; ids: string[]; labels?: Record<string, string>; homebrew?: HomebrewEntry[] }) {
  const byKey = new Map(state.lib!.roles.filter((r) => r.kind !== "homebrew").flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  const own = new Set((sc.homebrew || []).map((h) => h.id));
  const roles: Role[] = [], missing: string[] = [];
  for (const id of sc.ids) {
    const r = own.has(id) ? roleById(homebrewId(sc, id)) : byKey.get(id) || (sc.labels?.[id] && byKey.get(scriptKey(sc.labels[id])));
    if (r) { if (!roles.includes(r)) roles.push(r); } else missing.push(sc.labels?.[id] || id);
  }
  return { roles, missing };
}
/** True when a name is one of the character's own (in any language). */
const isOwnName = (role: Role, name: string) => [role.en, role.es, ...Object.values(role.names || {})].some((x) => x && scriptKey(x) === scriptKey(name));
/**
 * True when Script Tool JSON gives official characters names or icons of its own. Those show on
 * the tokens, but not on the character sheet or night order from the official site.
 */
export function scriptCustomizes(data: unknown) {
  if (!Array.isArray(data)) return false;
  const byKey = new Map(state.lib!.roles.flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  return data.some((e) => {
    if (typeof e !== "object" || !e?.id || e.id === "_meta" || homebrewTeam(e)) return false;   // homebrew shows as it is
    const role = byKey.get(scriptKey(e.id)) || (e.name && byKey.get(scriptKey(e.name)));
    return !!role && (!!(e.icon || e.image) || (!!e.name && !isOwnName(role, e.name)));
  });
}
/**
 * Reads a script in the Script Tool's JSON format into a name, ids, and the characters it
 * defines itself (homebrew: kept with the script, their icons traced later by traceHomebrew).
 */
function readScriptJson(text: string): NewScript {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error(t("import.badJson")); }
  if (!Array.isArray(data)) throw new Error(t("import.notList"));
  let name: string | null = null;
  const ids: string[] = [], labels: Record<string, string> = {}, homebrew: HomebrewEntry[] = [];
  for (const entry of data) {
    const raw = typeof entry === "string" ? entry : entry?.id;
    if (!raw) continue;
    if (raw === "_meta") { name = entry.name || null; continue; }
    const id = scriptKey(raw);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    const team = homebrewTeam(entry);
    if (team) {
      const reminders = Array.isArray(entry.reminders) ? entry.reminders.filter((x: unknown) => typeof x === "string" && x.trim()) : [];
      homebrew.push({ id, name: entry.name.trim(), team, ability: typeof entry.ability === "string" ? entry.ability : "", reminders, def: entry });
    } else if (entry?.name) labels[id] = entry.name;
  }
  const script = { name: name?.trim() || t("script.unnamed"), ids, labels, homebrew, custom: scriptCustomizes(data) };
  if (!homebrew.length && !scriptRoles(script).roles.length) throw new Error(t("import.noneKnown"));
  return script;
}
function keepScript(data: NewScript) {
  const { list, script } = saveScript(loadScripts(), data);
  storeScripts(list);
  syncHomebrew();
  goEdition(`s:${script.id}`);
  return script;
}
/**
 * Gives a script's homebrew characters the icons their entries bring: a game-icons.net link,
 * an SVG, or a picture traced into shapes. One at a time, the sheet redrawn as each lands.
 * Characters whose picture can't be read keep a name-only token. Returns { got, failed }.
 */
const tracing = new Set<string>();   // scripts whose icons are being prepared
async function traceHomebrew(scId: string, onProgress: (i: number, n: number) => void = () => {}) {
  if (tracing.has(scId)) return { got: 0, failed: 0 };
  tracing.add(scId);
  try { return await traceEach(scId, onProgress); } finally { tracing.delete(scId); }
}
/** A homebrew character still to get its icon, or whose picture was traced the old way. */
const needsIcon = (h: HomebrewEntry) => !h.noIcon && !!(h.def?.image || h.def?.icon) && (!h.icon || tracedBefore(h.icon));
/**
 * Icons left to prepare when the app was closed during an import, and pictures traced before
 * tracing improved: carry on in the background (a re-traced token keeps its icon meanwhile).
 */
export function resumeHomebrew() {
  for (const sc of loadScripts()) if (sc.homebrew?.some(needsIcon)) traceHomebrew(sc.id);
}
async function traceEach(scId: string, onProgress: (i: number, n: number) => void) {
  const todo = (loadScripts().find((x) => x.id === scId)?.homebrew || []).filter(needsIcon);
  let got = 0, failed = 0;
  for (const [i, h] of todo.entries()) {
    onProgress(i, todo.length);
    const icon = await scriptEntryIcon(h.def).catch(() => null);
    const list = loadScripts(), own = list.find((x) => x.id === scId)?.homebrew?.find((x) => x.id === h.id);
    if (!own) return { got, failed };   // the script was deleted meanwhile
    if (icon) { own.icon = icon; got++; } else if (!own.icon) { own.noIcon = true; failed++; }   // a re-trace that fails keeps the old icon
    storeScripts(list);
    syncHomebrew(); scheduleSheet();
  }
  return { got, failed };
}
export function openScriptDialog() {
  $<HTMLTextAreaElement>("#scriptDialogText").value = ""; $("#scriptDialogNote").textContent = ""; $("#scriptDialogNote").className = "hint";
  $("#scriptDialogWarn").hidden = true;
  drawer(false);
  $<HTMLDialogElement>("#scriptDialog").showModal();
}
/**
 * A script's own names for official characters ({"id": "gambler", "name": "Sondeainfiernos"})
 * become those tokens' printed text, unless you've already given them one. A name that's just
 * the character's own (in any language) only helps find it, so it's left alone. Returns how
 * many tokens got a name.
 */
function applyScriptNames(script: Pick<Script, "labels">) {
  const byKey = new Map(state.lib!.roles.flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  let n = 0;
  for (const [id, label] of Object.entries(script.labels || {})) {
    const role = byKey.get(id);
    if (!role || isOwnName(role, label)) continue;
    const key = charKey(role), own: TokenOverride = state.overrides.get(key) ?? {};
    if (own.text) continue;
    state.overrides.set(key, { ...own, text: label });
    n++;
  }
  if (n) { storeOverrides(); scheduleSheet(); }
  return n;
}
/**
 * A script's icons for official characters (its "image": a game-icons.net link, an SVG, or a
 * picture to trace; or our older "icon": "author/name") become those characters' own icons,
 * unless they already have one. Returns how many did; icons that can't be read are skipped.
 */
async function applyScriptIcons(text: string) {
  let data: unknown; try { data = JSON.parse(text); } catch { return 0; }
  const byKey = new Map(state.lib!.roles.flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  let n = 0;
  for (const entry of Array.isArray(data) ? data : []) {
    if (typeof entry !== "object" || !entry?.id || entry.id === "_meta" || (!entry.icon && !entry.image) || homebrewTeam(entry)) continue;
    const role = byKey.get(scriptKey(entry.id)) || (entry.name && byKey.get(scriptKey(entry.name)));
    if (!role || ownIcon(role.id)) continue;
    try {
      const icon = await scriptEntryIcon(entry);
      if (!icon) continue;
      const key = charKey(role);
      state.overrides.set(key, { ...(state.overrides.get(key) || {}), icon });
      n++;
    } catch { /* not an SVG we can print, or not reachable: keep the character's icon */ }
  }
  if (n) { storeOverrides(); scheduleSheet(); }
  return n;
}
/**
 * The script as Script Tool JSON, with the names and icons you've given its characters. Its
 * homebrew characters go out as they came in, with your name and icon for them.
 */
export function scriptJsonWithOwn(sc: Script) {
  const { roles } = scriptRoles(sc);
  const byKey = new Map(roles.filter((r) => r.kind !== "homebrew").flatMap((r): [string, Role][] => [[scriptKey(r.en), r], [scriptKey(r.id), r]]));
  const entries = sc.ids.map((id) => {
    const h = sc.homebrew?.find((x) => x.id === id);
    if (h) {
      const own = state.overrides.get(`c:${homebrewId(sc, id)}`);
      const def: ScriptJsonEntry = { ...(h.def || { id: h.id, name: h.name, team: h.team, ability: h.ability, reminders: h.reminders }) };
      if (own?.text) def.name = own.text;
      if (own?.icon) { delete def.icon; Object.assign(def, iconForScript(own.icon)); }
      return def;
    }
    const r = byKey.get(id) || (sc.labels?.[id] && byKey.get(scriptKey(sc.labels[id])));
    const own = r ? state.overrides.get(charKey(r)) : undefined;
    if (!own?.text && !own?.icon) return sc.labels?.[id] ? { id, name: sc.labels[id] } : id;
    return { id, ...(own.text ? { name: own.text } : {}), ...(own.icon ? iconForScript(own.icon) : {}) };
  });
  return JSON.stringify([{ id: "_meta", name: sc.name }, ...entries], null, 2);
}
export async function saveFromDialog(text: string) {
  try {
    const script = keepScript(readScriptJson(text));
    if (posthogEnabled) posthog.capture("script_saved", {
      import_source: "json",
      character_count: script.ids.length,
      homebrew_count: script.homebrew?.length ?? 0,
      customizations_present: Boolean(script.custom),
    });
    const named = applyScriptNames(script);
    $<HTMLDialogElement>("#scriptDialog").close();
    $("#scriptNote").textContent = t("script.saved", { name: script.name }) + (named ? ` ${t("script.named", { n: named })}` : "");
    const iconed = await applyScriptIcons(text);
    if (iconed) $("#scriptNote").textContent += ` ${t("script.iconed", { n: iconed })}`;
    if (script.homebrew?.length) {
      const said = $("#scriptNote").textContent, show = (x: string) => { if (scriptOf(state.edition)?.id === script.id) $("#scriptNote").textContent = `${said} ${x}`; };
      show(t("script.homebrew", { n: script.homebrew.length }));
      const { got, failed } = await traceHomebrew(script.id, (i, n) => show(t("script.tracing", { i: i + 1, n })));
      show([t("script.homebrew", { n: script.homebrew.length }), got ? t("script.traced", { n: got }) : "", failed ? t("script.untraced", { n: failed }) : ""].filter(Boolean).join(" "));
    }
  } catch (err) {
    $("#scriptDialogNote").className = "hint warn";
    $("#scriptDialogNote").textContent = t("import.failed", { message: (err as Error).message });
  }
}
/** A link with a script in it (#s=…): show what it holds and offer to keep it. */
export function openSharedScript() {
  const shared = readLink(location.hash);
  if (!shared) return;
  history.replaceState(null, "", location.pathname + location.search);   // don't offer it again on reload
  invite = { name: shared.name || null, ids: shared.ids };
  if (!scriptRoles(invite).roles.length) { invite = null; return; }
  renderInvite();
  $("#scriptInviteSave").onclick = () => {
    $<HTMLDialogElement>("#scriptInvite").close();
    const sc = keepScript({ ...invite!, name: invite!.name || t("script.unnamed") });
    if (posthogEnabled) posthog.capture("script_saved", {
      import_source: "shared_link",
      character_count: sc.ids.length,
      homebrew_count: sc.homebrew?.length ?? 0,
      customizations_present: Boolean(sc.custom),
    });
    $("#scriptNote").textContent = t("script.saved", { name: sc.name });
  };
  $<HTMLDialogElement>("#scriptInvite").showModal();
}
/** The shared-script prompt's text and tokens, in the current languages (redrawn when they change). */
let invite: { name: string | null; ids: string[] } | null = null;
export function renderInvite() {
  if (!invite) return;
  const { roles, missing } = scriptRoles(invite);
  $("#scriptInviteText").textContent = t("script.inviteText", { name: invite.name || t("script.unnamed"), n: roles.length, m: missing.length });
  $("#scriptInviteTokens").innerHTML = roles.map((r) => `<span>${tokenSvg(state.lib!, r, { ...specFor(charKey(r), false), diameter: 45, back: "none" }, { text: charName(r) })}${esc(charName(r))}</span>`).join("");
}
export async function shareScript() {
  const sc = scriptOf(state.edition);
  if (!sc) return;
  const link = scriptLink(sc, location.origin + location.pathname);
  const note = $("#scriptNote");
  // Phones get the system share sheet; elsewhere the link goes to the clipboard.
  if (PHONE.matches && (navigator as Partial<Navigator>).share) {
    try {
      await navigator.share({ title: sc.name, url: link });
      if (posthogEnabled) posthog.capture("script_shared", { share_method: "native" });
      return;
    } catch (err) { if ((err as Error).name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(link);
    note.textContent = t("script.copied");
    if (posthogEnabled) posthog.capture("script_shared", { share_method: "clipboard" });
  }
  catch {
    note.innerHTML = `${esc(t("script.copyBy"))} <input class="input" type="text" readonly value="${esc(link)}">`;
    note.querySelector("input")!.select();
  }
}

export function goEdition(ed: string | undefined) {
  if (!ed) return;
  // which list people look for (the editions, a script, a category); a script's or a category's own id stays out
  if (posthogEnabled && ed !== state.edition) posthog.capture("edition_selected", {
    edition_kind: ed === "all" ? "all" : ed.startsWith("s:") ? "script" : ed.startsWith("k:") ? "category" : ed.startsWith("f:") ? "shape" : "edition",
    edition: /^[sk]:/.test(ed) ? null : ed, from_edition_kind: state.edition === "all" ? "all" : state.edition.slice(0, 2),
  });
  state.edition = ed; state.team = "all"; $<HTMLInputElement>("#search").value = "";
  renderSpine(); renderSheet(); $("#sheet").scrollTo({ top: 0 });
}

// On a phone the sidebar is a drawer: closed, it is out of reach of the keyboard too.
export const PHONE = matchMedia("(max-width: 900px)");
export function drawer(open: boolean) {
  const spine = $("#spine");
  spine.classList.toggle("open", open);
  $("#scrim").classList.toggle("on", open);
  $("#drawerOpen").setAttribute("aria-expanded", String(open));
  spine.inert = PHONE.matches && !open;
  // preventScroll: while the drawer slides in, focusing would scroll the page to reach it
  if (open) $(".spine-scroll [aria-current=true]")?.focus({ preventScroll: true });
  else if (PHONE.matches && spine.contains(document.activeElement)) $("#drawerOpen").focus({ preventScroll: true });
}
