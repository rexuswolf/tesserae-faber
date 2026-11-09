// The sheet of tokens: the spine (editions, filters), the add menu and the sheet itself.
import { on, emit } from "./events.ts";
import { state, esc, $, EDITION_ORDER, TEAM_PLURAL, fold, coll, TEAM_ORDER, storeJSON, VIEW_KEY, hit, READONLY, view3d } from "./context.ts";
import { isCard, EDITIONS, TEAMS, roleName, shapeOf, reminderSpec, DEFAULT_SPEC, SHAPE_FEATURES, tokenSvg, flipFace, printsBack } from "../engine/token-engine.ts";
import { OWN, catalogsOf, nameIn, SHAPES, isLocked, isUntouchedStarter } from "../collection.ts";
import { renderOwnSpine, catalogOf, typeOfView, typeOfToken, ownHome, ownHomeCatalog , ownAllView} from "./creator.ts";
import { uiLang, t } from "../i18n.ts";
import type { Role, Team } from "../types.ts";
import { uiIcon, TEAM_ICONS } from "../ui-icons.ts";
import { remindersOf, charKey, remKey, textFor, collator, catalogText, specFor, catalogSpec } from "./tokens.ts";
import { loadScripts } from "../scripts.ts";
import { scriptRoles, scriptOf, scriptHasOwn, PHONE, editionName } from "./scripts-ui.ts";
import { isPicked, setPick, changePicks, tokenRole, tokenRem } from "./queue.ts";
import { roleById } from "./wiring.ts";
import { tokenLang } from "./token-language.ts";
import { renderDesignBar, setBarShapes } from "./design-sheet.ts";
import { peekHint, CHEVRON } from "./language.ts";
import { designOverridden } from "./designs.ts";
import { syncView } from "./workshop.ts";

// ------------------------------------------------------------ spine

/** Every official character, in every edition: the "All characters" view. */
const allCharacters = () => state.lib!.roles.filter((r) => !isCard(r) && r.kind !== "homebrew");
// the spine and the sheet show what's picked and each token's look
on("picks", () => { renderSpine(); renderSheet(); });
on("looks", () => { renderSheet(); renderSpine(); });
on("all", () => { renderSpine(); renderSheet(); });

export function renderSpine() {
  if (OWN) return renderOwnSpine();
  const lang = uiLang();
  // above the editions: every character, and the grimoire's info tokens
  const all = allCharacters(), info = state.lib!.roles.filter((r) => r.edition === "grimoire");
  const entry = (ed: string, icon: string, name: string, sub: string, roles: Role[]) => `<button class="ed" type="button" data-ed="${ed}" aria-current="${state.edition === ed && !searchQuery()}">${uiIcon(icon)}
    <span>${esc(name)}<small>${esc(sub)}</small></span>${pickedBadge(roles)}</button>`;
  $("#library").innerHTML = entry("all", "two-coins", t("library.all"), t("ed.count", { c: all.length, r: all.reduce((n, r) => n + remindersOf(r).length, 0) }), all)
    + (info.length ? entry("grimoire", "id-card", EDITIONS.grimoire.name[lang], t("ed.countInfo", { n: info.length }), info) : "");
  $("#editions").innerHTML = EDITION_ORDER.filter((e) => e !== "grimoire" && state.lib!.roles.some((r) => r.edition === e)).map((e) => {
    const roles = state.lib!.roles.filter((r) => r.edition === e);
    const rem = roles.reduce((n, r) => n + remindersOf(r).length, 0);
    return `<button class="ed" type="button" data-ed="${e}" aria-current="${state.edition === e && !searchQuery()}">
      <span>${esc(EDITIONS[e].name[lang])}<small>${esc(e === "grimoire" ? t("ed.countInfo", { n: roles.length }) : t("ed.count", { c: roles.length, r: rem }))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("");
  const scripts = loadScripts();
  $("#scripts").innerHTML = scripts.map((sc) => {
    const { roles, missing } = scriptRoles(sc);
    return `<button class="ed" type="button" data-ed="s:${esc(sc.id)}" aria-current="${state.edition === `s:${sc.id}` && !searchQuery()}">
      <span>${esc(sc.name)}<small>${esc(t("script.count", { n: roles.length, m: missing.length }))}</small></span>${pickedBadge(roles)}</button>`;
  }).join("") || `<p class="scripts-empty">${esc(t("script.empty"))} <button type="button" data-script-new>${esc(t("script.emptyAdd"))}</button></p>`;
}

/** How many tokens of these characters (with copies and reminders) are picked, as a badge. */
export function pickedBadge(roles: Role[]) {
  const ids = new Set(roles.map((r) => r.id));
  let n = 0;
  for (const [k, c] of state.pick) if (ids.has(k.split(":")[1])) n += c;
  return n ? `<span class="got" aria-label="${esc(t("pick.badge", { n }))}">${n}</span>` : "";
}

// ------------------------------------------------------------ adding to the queue

/**
 * The "Add to queue" menu, for what the sheet shows (edition or script, team filter, search):
 * its characters, their reminders, or both. It only adds what's missing, so the order you
 * choose them in doesn't matter; removing is its own item at the end, with undo.
 */
function renderAddMenu() {
  const roles = state.shown || [], lang = uiLang();
  const cards = roles.length > 0 && roles.every(isCard);
  const who = state.team !== "all" && !searchQuery() ? TEAM_PLURAL[lang][state.team].toLowerCase() : t(cards ? "add.cardsWho" : "add.charsWho");
  const Who = who[0].toUpperCase() + who.slice(1);
  const missChars = roles.filter((r) => !isPicked(charKey(r))).length;
  const missRems = roles.flatMap((r) => remindersOf(r).map((_, i) => remKey(r, i))).filter((k) => !isPicked(k)).length;
  const hasRems = roles.some((r) => remindersOf(r).length);
  const inQueue = roles.some((r) => isPicked(charKey(r)) || remindersOf(r).some((_, i) => isPicked(remKey(r, i))));
  const item = (a: string, icon: string, title: string, sub: string, n: number | null, off: boolean) => `<button type="button" role="menuitem" data-a="${a}"${off ? " disabled" : ""}>${icon}<span>${esc(title)}<small>${esc(sub)}</small></span><b>${n == null ? "" : `+${n}`}</b></button>`;
  const PLUS = `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  const CROSS = `<svg class="gi" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  $("#addMenu").innerHTML =
    item("chars", uiIcon("two-coins"), hasRems ? t("add.chars", { who, Who }) : t("add.allOf", { who, Who }), missChars ? t("add.missing", { miss: missChars, n: roles.length }) : t("add.allIn"), missChars, !missChars)
    + (hasRems ? item("rems", uiIcon("stack"), t("add.rems"), missRems ? t("add.tokens", { n: missRems }) : t("add.allIn"), missRems, !missRems)
      + item("both", PLUS, t("add.both", { who, Who }), t("add.bothSub"), missChars + missRems, !missChars && !missRems) : "")
    + `<hr>` + item("none", CROSS, t("add.remove"), t("add.removeSub"), null, !inQueue).replace('data-a="none"', 'data-a="none" class="rm"');
}
export function openAddMenu(on: boolean, focusFirst = false) {
  if (on) renderAddMenu();
  $("#addMenu").hidden = !on;
  $("#addBtn").setAttribute("aria-expanded", String(on));
  if (on && focusFirst) $("#addMenu button:not(:disabled)")?.focus();
}
/** One of the menu's choices, for everything shown. */
export function addShown(how: string) {
  const roles = state.shown || [];
  const apply = () => {
    for (const r of roles) {
      const rems = remindersOf(r).map((_, i) => remKey(r, i));
      if (how === "none") { setPick(charKey(r), false); rems.forEach((k) => setPick(k, false)); continue; }
      if (how !== "rems") setPick(charKey(r), true);
      if (how !== "chars") rems.forEach((k) => setPick(k, true));
    }
  };
  if (how === "none") changePicks(apply, t("pick.cleared")); else { apply(); emit("picks"); }
}

// ------------------------------------------------------------ sheet

export const searchQuery = () => fold($<HTMLInputElement>("#search").value.trim());

export function renderSheet() {
  const lang = uiLang(), q = searchQuery();
  if (state.edition.startsWith("s:") && !scriptOf(state.edition)) state.edition = "all";   // a deleted script
  // the generic creator: a deleted catalog or type, or "all", shows the first type's entry
  if (OWN && !ownAllView(state.edition) && !catalogOf(state.edition) && !typeOfView(state.edition)) state.edition = `t:${coll.types[0].id}`;
  const ed = state.edition, sc = scriptOf(ed), inScript = sc && scriptRoles(sc), cat = catalogOf(ed), ty = typeOfView(ed);
  const catOpen = !!cat && catalogsOf(coll).some(({ k, s: sec }) => k === cat && sec.open);
  // header
  $("#edTitle").textContent = q ? t("sheet.results", { q: $<HTMLInputElement>("#search").value.trim() }) : cat ? nameIn(cat.name, lang) : ty ? nameIn(ty.title, lang) : sc ? sc.name : ed === "all" ? t(OWN ? "own.everything" : "library.all") : EDITIONS[ed].name[lang];
  // the generic creator's actions: new tokens in a type's entry or an open catalog; the open catalog itself
  $("#ownActions").hidden = !OWN || !!q || !(ty || catOpen);
  $("#ownCatRename").hidden = $("#ownCatDelete").hidden = $("#ownCatList").hidden = !catOpen;
  $("#ownWelcome").hidden = !OWN || READONLY || !!q || !(coll.tokens.length === 0 || (coll.tokens.length === 1 && isUntouchedStarter(coll.tokens[0])));   // a new collection: what to do first
  $("#edLead").textContent = q ? t("sheet.leadSearch")
    : OWN ? t(cat ? "own.leadCatalog" : "own.leadAll", { n: (cat ? cat.tokens.length : ty ? state.lib!.roles.filter((r) => typeOfToken(r.id) === ty.id).length : state.lib!.roles.length) })
    : sc ? t("script.lead", { n: inScript!.roles.length, eds: new Set(inScript!.roles.filter((r) => r.kind !== "homebrew").map((r) => r.edition)).size })
      + (inScript!.missing.length ? t("script.missing", { list: inScript!.missing.join(", ") }) : "")
    : ed === "all" ? t("library.allLead", { n: allCharacters().length })
    : t(`edition.lead.${ed}`);
  $("#scriptActions").hidden = !sc || !!q;
  $("#scriptCustomWarn").hidden = !scriptHasOwn(sc);
  if (sc && $("#scriptActions").dataset.for !== sc.id) {   // a different script: fresh buttons
    $("#scriptActions").dataset.for = sc.id;
    $("#scriptNote").textContent = "";
    $("#scriptDelete").dataset.confirm = ""; $("#scriptDelete").textContent = t("script.delete");
  }
  $("#scriptShare").textContent = t(PHONE.matches && (navigator as Partial<Navigator>).share ? "script.share" : "script.copy");

  // which characters
  let roles = q ? state.lib!.roles : cat ? cat.tokens.map(roleById).filter((r): r is Role => !!r) : ty ? state.lib!.roles.filter((r) => typeOfToken(r.id) === ty.id) : sc ? inScript!.roles : ed === "all" ? (OWN ? state.lib!.roles : allCharacters()) : state.lib!.roles.filter((r) => r.edition === ed);
  const teamsHere = TEAM_ORDER.filter((tm) => roles.some((r) => r.team === tm));
  if (state.team !== "all" && !teamsHere.includes(state.team as Team)) state.team = "all";
  storeJSON(VIEW_KEY, { edition: state.edition, team: state.team });   // where to come back to
  // each team: its icon in the team colour, and how many characters it has here
  $("#teamChips").innerHTML = ([["all", t("team.all"), roles.length], ...teamsHere.map((tm) => [tm, TEAM_PLURAL[lang][tm], roles.filter((r) => r.team === tm).length])] as [Team | "all", string, number][])
    .map(([id, label, n]) => `<button class="pill" type="button" data-team="${id}" aria-pressed="${state.team === id}"${id === "all" ? "" : ` style="--c: ${TEAMS[id].colour}"`}>${id === "all" ? "" : uiIcon(TEAM_ICONS[id])}<span class="lbl">${esc(label)}</span><small>${n}</small></button>`).join("");
  if (state.team !== "all") roles = roles.filter((r) => r.team === state.team);
  // a collection of yours with one group (a new one's): no groups to show yet
  const oneGroup = OWN && coll.groups.length < 2;
  $("#filtWrap").hidden = oneGroup;
  $("#filtWrap").dataset.on = String(state.team !== "all");   // filtered: its dot says so

  // search matches the name (English, Spanish, the token language or your own text) or any reminder text (yours too)
  const hits = new Map<string, Set<number>>();
  if (q) {
    roles = roles.filter((r) => {
      const remHits = remindersOf(r).map((text, i) => [text, r.reminders?.en?.[i], textFor(remKey(r, i), r, i)].some((s) => s && fold(s).includes(q)) ? i : -1).filter((i) => i >= 0);
      // a two-state token by its other state's name too
      const nameHit = [r.en, r.es, roleName(r, tokenLang()), ...Object.values(r.listNames ?? {}), r.fem?.[tokenLang()], textFor(charKey(r), r, null), r.flip?.en, r.flip?.es, r.flip?.names?.[tokenLang()]].some((s) => s && fold(s).includes(q));
      if (remHits.length) hits.set(r.id, new Set(remHits));
      return nameHit || remHits.length;
    });
  }

  // Pick everything shown: the characters on screen (edition, team filter, search), with or without reminders.
  state.shown = roles;
  // the design bar: only the shapes of the tokens on screen
  setBarShapes(SHAPES.filter((sh) => roles.some((r) => shapeOf(r) === sh)));
  renderDesignBar();
  $("#addWrap").hidden = !roles.length;
  $("#addLabel").textContent = t("add.print");
  if (!$("#addMenu").hidden) renderAddMenu();

  if (!roles.length) { $("#rows").innerHTML = `<p class="empty">${esc(t(OWN && !q ? "own.empty" : "sheet.noResults"))}</p>`; return; }
  $("#rows").innerHTML = TEAM_ORDER.map((team) => {
    const list = roles.filter((r) => r.team === team).sort((a, b) => collator().compare(catalogText(a, null), catalogText(b, null)));
    if (!list.length) return "";
    const teamOn = list.every((r) => isPicked(charKey(r)));
    const rows = `<div class="team-rows">${list.map((r) => rowHtml(r, q, hits.get(r.id))).join("")}</div>`;
    if (oneGroup) return `<section class="team">${rows}</section>`;
    // a group of one: "pick the group" would only pick that token, so it isn't offered
    return `<section class="team"><div class="team-h"><i style="background:${TEAMS[team].colour}"></i><span>${esc(TEAM_PLURAL[lang][team])}</span><small>${list.length}</small>
      ${list.length > 1 ? `<button class="pick-team" type="button" data-pick-team="${team}">${esc(t(teamOn ? "pick.teamOff" : "pick.team"))}</button>` : ""}</div>${rows}</section>`;
  }).join("");
  peekHint();
}

/** A bin icon: taking a token out. */
export const BIN = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.5h6.6l.7-8.5M6.8 7v3.5M9.2 7v3.5"/></svg>`;
/** A click on a copy stepper: one more or one fewer. True when it was one. */
export function onCopyStep(e: Event) {
  const more = hit(e, "[data-more]"), less = hit(e, "[data-less]");
  if (more) { const k = more.dataset.more!; state.pick.set(k, (state.pick.get(k) || 0) + 1); }
  else if (less) { const k = less.dataset.less!, n = state.pick.get(k) || 0; if (n > 1) state.pick.set(k, n - 1); else state.pick.delete(k); }
  else return false;
  emit("picks");
  return true;
}

/** A token with something of its own: a design chosen for it or changes to it, or its own text, feminine name or icon. */
export const hasOwn = (key: string) => { const o = state.overrides.get(key); return !!o && !!(o.text || o.fem || o.icon) || designOverridden(key); };
/** The mark of a token with its own changes, and the way to them. Beside the token's button: a button can't hold buttons. */
export function ownPen(key: string, name: string) {
  const label = esc(t("sheet.editOwn", { name }));
  return `<button class="own-pen" type="button" data-edit="${key}" title="${label}" aria-label="${label}">✎</button>`;
}

/**
 * A character in or out of the queue, with its reminders: they come and go with it (each
 * reminder chip still adds or drops itself on its own).
 */
/** The rows on the sheet showing their linked tokens: opened by hand, or by picking the token. */
export const openRows = new Set<string>();
export function toggleCharacter(key: string) {
  const role = tokenRole(key);
  if (!role) return;
  const on = !isPicked(key);
  setPick(key, on);
  if (on) openRows.add(key); else openRows.delete(key);   // picked, its row opens; dropped, it folds
  if (key.startsWith("c:")) remindersOf(role).forEach((_, i) => setPick(remKey(role, i), on));
  emit("picks");
}
function rowHtml(r: Role, q: string, remHits: Set<number> | undefined) {
  const lang = uiLang(), ck = charKey(r);
  // Each token is a toggle: picked tokens light up with a check, and show their copies.
  const thumb = (key: string, reminder: number | null) => {
    const isRem = reminder != null;
    const spec = { ...specFor(key, isRem), diameter: isRem ? reminderSpec(DEFAULT_SPEC).diameter : 45, back: "none" };
    const own = hasOwn(key), copies = state.pick.get(key) || 0;
    const name = textFor(key, r, reminder);
    // once picked, a small stepper adds copies; tapping the token still drops it
    // a homebrew token whose icon is still on its way pulses where the icon will go
    const loading = r.loading ? ` loading" style="--team: ${r.colour ?? TEAMS[r.team].colour}` : "";
    // a two-state token shows both its faces: the other state, smaller, peeking from behind the front
    // a two-state token looks like any other, with ⇄ on its edge; pointing at the row (or tapping the ⇄)
    // turns it over in place to show its other state
    const two = !isRem && !!r.flip;
    // a one-sided token whose design prints a back turns over too: pointed at, or held down on a phone
    const full = specFor(key, false);
    const backed = !isRem && !two && SHAPE_FEATURES[shapeOf(r)].back && printsBack(r, full);
    const face = tokenSvg(state.lib!, r, spec, { text: name });
    const art = two || backed ? `<span class="tok-turn">${face}${tokenSvg(state.lib!, r, { ...full, diameter: 45 }, { side: "back" })}</span>` : face;
    return `<span class="tok-w${two ? " two" : backed ? " backed" : ""}"><button class="tok${isCard(r) ? " card" : ""}${loading}" type="button" data-pick="${key}" aria-pressed="${copies > 0}" aria-label="${esc(name)}">${art}<span class="ck" aria-hidden="true">✓</span></button>${two ? `<button class="turn-btn" type="button" data-turn title="${esc(t("sheet.turn"))}" aria-label="${esc(t("sheet.turn"))}">⇄</button>` : ""}${own ? ownPen(key, name) : ""}</span>`;
  };
  const rems = remindersOf(r);
  // a two-state token shows its front; its other state is named under it
  const flip = flipFace(r, catalogSpec(false));
  // Reminders as chips under the name: identical ones share a chip ("Correct ×5"), which adds or
  // removes all of them; it shows how many are in when only some are.
  const groups = new Map<string, number[]>();
  rems.forEach((_, i) => { const w = catalogText(r, i); groups.set(w, [...(groups.get(w) || []), i]); });
  const remSpec = (key: string) => ({ ...specFor(key, true), diameter: reminderSpec(DEFAULT_SPEC).diameter, back: "none" });
  const loadingTok = r.loading ? ` loading" style="--team: ${r.colour ?? TEAMS[r.team].colour}` : "";
  const chips = [...groups].map(([w, idx]) => {
    const keys = idx.map((i) => remKey(r, i)), on = keys.filter(isPicked).length, own = keys.find(hasOwn);
    const count = keys.length > 1 ? `<small>×${keys.length}${on && on < keys.length ? ` · ${on}/${keys.length}` : ""}</small>` : "";
    return `<div class="rem${idx.some((i) => remHits?.has(i)) ? " hit" : ""}" data-on="${on === keys.length ? "all" : on ? "some" : "none"}">
      <button class="rem-chip" type="button" data-pick-rems="${keys.join(" ")}" aria-pressed="${on === keys.length}" aria-label="${esc(keys.length > 1 ? `${w} ×${keys.length}` : w)}"><span class="rem-tok${loadingTok}">${tokenSvg(state.lib!, r, remSpec(keys[0]), { text: textFor(keys[0], r, idx[0]) })}</span><span class="rem-w">${esc(w)}</span>${count}<span class="ck" aria-hidden="true">✓</span></button>${own ? ownPen(own, w) : ""}</div>`;
  }).join("");
  // Folded, the row shows how many linked tokens it has (and how many are in) with their small faces;
  // open, the linked tokens large, to pick. A search that found one opens its row.
  const open = rems.length > 0 && !isCard(r) && (openRows.has(ck) || !!remHits?.size);
  const inN = rems.filter((_, i) => isPicked(remKey(r, i))).length;
  const minis = [...groups].slice(0, 4).map(([w, idx]) => tokenSvg(state.lib!, r, remSpec(remKey(r, idx[0])), { text: w })).join("");
  const fold = rems.length && !isCard(r) ? `<button class="rems-fold" type="button" data-rems-fold="${ck}" aria-expanded="${open}"><span class="rf-minis" aria-hidden="true">${minis}</span><span>${esc(t("sheet.linked", { n: rems.length }))}</span>${inN ? `<b class="rf-in">${esc(inN === rems.length ? t("sheet.linkedAll") : t("sheet.linkedSome", { n: inN, of: rems.length }))}</b>` : ""}${CHEVRON}</button>` : "";
  return `<div class="row${isCard(r) ? " info" : ""}${rems.length ? "" : " no-rems"}${open ? " open" : ""}" data-picked="${isPicked(ck)}" data-row="${ck}">
    ${thumb(ck, null)}
    <div class="who" data-pick="${ck}"><b>${esc(catalogText(r, null))}${flip ? `<span class="flip-sep" title="${esc(t("sheet.flip"))}"> ⇄ </span>${esc(roleName(flip, tokenLang()))}` : ""}</b>${OWN ? (ownHome(r) && (q || catalogOf(state.edition) !== ownHomeCatalog(r.id)) ? `<em>${esc(ownHome(r))}</em>` : "") : q || state.edition === "all" || (state.edition.startsWith("s:") && r.kind !== "homebrew") ? `<em>${esc(editionName(r, lang))}</em>` : ""}${r.loading ? `<small>${esc(t("sheet.iconLoading"))}</small>` : ""}</div>
    ${rems.length ? `<div class="rems">${fold}${open ? `<div class="rem-list">${chips}</div>` : ""}</div>` : ""}
    <div class="row-acts">${OWN && !READONLY && !isLocked(coll, r.id) ? `<button class="own-edit" type="button" data-own-edit="${esc(r.id)}" aria-label="${esc(t("own.edit"))}" title="${esc(t("own.edit"))}">${PEN}<span class="ra-l">${esc(t("own.edit"))}</span></button>` : ""}${r.loading ? "" : `<button class="own-edit" type="button" data-design-row="${ck}" aria-label="${esc(t("sheet.design"))}" title="${esc(t("sheet.design"))}">${ROLLER}<span class="ra-l">${esc(t("sheet.design"))}</span></button>`}</div>
  </div>`;
}

/** A pencil, the row's Edit. */
/** A paint roller, the row's Redesign. */
const ROLLER = `<svg class="pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="13" height="5" rx="1"/><path d="M17 5h3v6h-8v3"/><rect x="10.5" y="14" width="3" height="7" rx="1"/></svg>`;
const PEN = `<svg class="pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>`;

/** The token the workshop shows (step 2). */
export function selectToken(key: string | undefined) {
  const role = key && tokenRole(key);
  if (!key || !role) return;
  const was = state.sel?.reminder;
  if (state.sel?.key !== key) { state.flash = ""; state.saysOpen = false; }   // another token: the last one's note goes
  state.sel = { key, role, reminder: tokenRem(key) };
  if (state.sel!.reminder != null && was == null) { view3d("setView", "top"); syncView("top"); }
}
