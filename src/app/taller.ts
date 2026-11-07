// The Taller: your designs, for every collection.
import { OWN_VIEW, builtIn, APP_LOGO, APP_LOGO_SMALL, APP_NAME, SHAPES, readBuiltIn, loadCollection, nameIn, basicStyles, ownStylesOf, builtInStyles, appDesigns, collectionRoles, APP_ICON, LIST_URL, listCollections, newId } from "../collection.ts";
import type { StyleDef, Collection, CollectionStyles } from "../collection.ts";
import type { TokenShape, TokenSpec, TokenIcon, Role, MyDesign, TokenOverride } from "../types.ts";
import { myDesigns, collEntry, uniqueDesignName, storeMyDesigns, myEntry, droppedDesigns, rereadMyDesigns } from "./designs.ts";
import type { DesignEntry } from "./designs.ts";
import { tokenRole, tokenRem } from "./queue.ts";
import { DEFAULT_SPEC, tokenSvg, reminderSpec, shapeOf, loadLibrary, SHAPE_FEATURES } from "../engine/token-engine.ts";
import { tokenLang } from "./token-language.ts";
import { ownIcon, roleIdOf, textFor, charKey, remKey } from "./tokens.ts";
import { state, $, esc, loadJSON, storeJSON, hit, setColl, setGateState } from "./context.ts";
import { UI_ICONS, uiIcon, SHAPE_ICONS } from "../ui-icons.ts";
import { uiLang, t } from "../i18n.ts";
import { applyGroups, applyOwnTheme } from "./creator.ts";
import { BOTC_STYLES } from "../botc-styles.ts";
import { BUILT_INS } from "../builtins.ts";
import { markStarted } from "./boot.ts";
import { wire } from "./wiring.ts";
import { buildChoices, renderWorkshop, designSwatch } from "./workshop.ts";
import { filled } from "./looks.ts";
import { CHEVRON } from "./language.ts";
import { local } from "../services.ts";
import { toast, ask } from "./design-sheet.ts";
import { PHONE } from "./scripts-ui.ts";

// ------------------------------------------------------------ the Taller
//
// The Taller (/taller) is where your designs are made and changed, outside the steps, for every
// shape the app has. Entering it starts a new design in two steps: 1. its shape (or one of yours to
// carry on with), 2. the design it starts from, its base: Basic (the app's own, blank), then the
// collection it was opened from, then the app's collections' (Clocktower, Draw Steel, 5e Fantasy), each with its
// own designs only, then the app's (Tesserae Faber's, offered in every collection). Starting
// makes a copy of the base, yours, and opens it in the editor: its look changed with the design
// step's controls (the workshop column), straight on the design, which every token using it shows.
// A collection's designs are never changed here: they're only bases. A design is drawn on sample
// tokens: the collection's it was opened from, else a few of the app's own.

export const TALLER = OWN_VIEW === "taller";
/**
 * A group of bases in the second step: Basic ("blank"), the collection the Taller was opened from
 * ("from"), another of the app's collections ("other"), each with its own designs; the app's
 * designs, Tesserae Faber's ("app").
 */
interface TallerGroup { kind: "blank" | "from" | "other" | "app"; name: string; designs: Partial<Record<TokenShape, StyleDef[]>>; look?: GroupLook }
/** How a collection's group of bases looks folded: like its cover on the collections page. */
interface GroupLook { logo?: string; accent?: string; cover?: string }
/** A collection's cover look: an app collection's from its entry, one of yours from its brand and theme. */
function lookOfCollection(id: string | null, c?: Collection | null): GroupLook {
  const b = id ? builtIn(id) : undefined;
  if (b) return { logo: b.logo ?? APP_LOGO, accent: b.accent, cover: b.cover };
  const theme = c && typeof c.theme === "object" ? c.theme : undefined;
  return { logo: c?.brand?.logo || APP_LOGO_SMALL, accent: theme?.accent };
}
/** Where the Taller is: choosing a shape, choosing a base, or changing one of your designs. */
type TallerView = "shape" | "base" | "edit";
/**
 * The Taller's state: where it is, the shape, the design open in the editor ("u:<id>"), the base
 * chosen in the second step ("g<n>:<id>", by its group's place in `groups`), where it was opened
 * from, and each shape's sample tokens (token keys).
 */
export const taller: { view: TallerView; shape: TokenShape; ref: string; pick: string; from: { path: string; id: string; name: string } | null; groups: TallerGroup[]; samples: Record<TokenShape, string[]>; focusName: boolean } =
  { view: "shape", shape: "coin", ref: "", pick: "", from: null, groups: [], samples: { coin: [], ring: [], card: [] }, focusName: false };
/** The design open in the Taller's editor (always one of yours). */
export const tallerMine = () => (TALLER && taller.view === "edit" && taller.ref.startsWith("u:") ? myDesigns[taller.shape].find((x) => x.id === taller.ref.slice(2)) : undefined);
/** A base of the second step by its reference ("g<n>:<id>"). */
function tallerBase(shape: TokenShape, ref: string): DesignEntry | undefined {
  const m = ref.match(/^g(\d+):(.+)$/), d = m ? taller.groups[+m[1]]?.designs[shape]?.find((x) => x.id === m[2]) : undefined;
  return d ? collEntry(shape, d, ref) : undefined;
}
/** The base the second step starts on: Basic, the first group's. */
const firstBase = (shape: TokenShape) => `g0:${taller.groups[0].designs[shape]![0].id}`;
/** A sample token as it prints with a design's look. */
function tallerPic(key: string, spec: TokenSpec, side: "front" | "back" = "front") {
  const role = tokenRole(key), ri = tokenRem(key);
  const s = { ...DEFAULT_SPEC, ...spec, colours: { ...DEFAULT_SPEC.colours, ...spec.colours }, lang: tokenLang(), icon: ownIcon(roleIdOf(key)) };
  return tokenSvg(state.lib!, role, ri != null ? reminderSpec(s) : s, { text: textFor(key, role, ri), side });
}
/** A few tokens a design is drawn on when there's no collection to take them from (or it has none of the shape). */
function sampleTokens(groups: string[]): Collection {
  const [g1, g2 = g1] = groups, n = (es: string, en: string) => ({ es, en });
  return {
    name: APP_NAME, groups: [], sections: [],
    types: SHAPES.map((sh) => ({ id: `sample-${sh}`, name: sh, title: sh, shape: sh })),
    tokens: [
      { id: "sample-a", type: "sample-coin", group: g1, name: n("Ejemplo", "Sample"), icon: uiTokenIcon("two-coins"), linked: [n("Recuerdo", "Reminder")] },
      { id: "sample-b", type: "sample-coin", group: g2, name: n("Otra ficha", "Another token"), icon: uiTokenIcon("stack"), linked: [] },
      { id: "sample-c", type: "sample-coin", group: g1, name: n("Preparado", "Ready"), icon: null, linked: [], flip: { name: n("Usado", "Used"), icon: null } },
      { id: "sample-r1", type: "sample-ring", group: g1, name: n("Aturdido", "Dazed"), icon: null, linked: [] },
      { id: "sample-r2", type: "sample-ring", group: g2, name: n("Sangrando", "Bleeding"), icon: null, linked: [] },
      { id: "sample-k1", type: "sample-card", group: g1, name: n("Eres", "You are"), icon: null, linked: [] },
      { id: "sample-k2", type: "sample-card", group: g2, name: n("Elige a un jugador", "Choose a player"), icon: null, linked: [] },
    ],
  };
}
/** One of the interface's game-icons.net icons as a token's icon, where the library places them. */
function uiTokenIcon(id: string): TokenIcon | null {
  const ui = UI_ICONS[id];
  return ui ? { id: `ui:${id}`, source: "game-icons", name: id, author: ui.author, g: "translate(28.063 19.134) scale(0.139518)", body: ui.body.replace(/\sfill="[^"]*"/g, "") } : null;
}
/**
 * Opens the Taller: the collection it was opened from (its tokens to draw on, its look, its designs
 * among the bases), the bases, your designs, and the step the address says.
 */
export async function openTaller() {
  const params = new URLSearchParams(location.search), path = params.get("from") ?? "";
  const id = /^\/botc(\/|$)/.test(path) ? "botc" : path.match(/^\/c\/([\w-]+)/)?.[1] ?? null;
  const c = id ? (builtIn(id) ? await readBuiltIn(id) : loadCollection(id)) : null;
  const label = (x: Collection) => (id === "botc" ? "Blood on the Clocktower" : nameIn(x.brand?.title, uiLang()) || nameIn(x.name, uiLang()));
  if (c && id) { setColl(c); taller.from = { path, id, name: label(c) }; applyGroups(); }
  applyOwnTheme();   // the collection's colours (Clocktower's velvet), else Tesserae Faber's
  // the bases: Basic first (each shape's first basic design, named Basic), then the collection's own
  // designs, the app's collections' own, and the app's designs (but the one Basic already is)
  const basic = basicStyles(), own = (styles: CollectionStyles | undefined) => Object.fromEntries(SHAPES.map((sh) => [sh, styles?.[sh]?.length ? ownStylesOf({ styles }, sh) : []]));
  const groups: TallerGroup[] = [{ kind: "blank", name: APP_NAME, designs: Object.fromEntries(SHAPES.map((sh) => [sh, [{ ...basic[sh][0], name: { es: "Básico", en: "Basic" } }]])) }];
  if (c?.styles) groups.push({ kind: "from", name: label(c), designs: own(c.styles), look: lookOfCollection(id, c) });
  if (id !== "botc") groups.push({ kind: "other", name: "Blood on the Clocktower", designs: own(BOTC_STYLES), look: lookOfCollection("botc") });
  for (const b of BUILT_INS) {
    if (b.id === "botc" || b.id === id || !b.file) continue;
    const styles = await builtInStyles(b.id);
    if (styles) groups.push({ kind: "other", name: nameIn(b.name, uiLang()), designs: own(styles), look: lookOfCollection(b.id) });
  }
  groups.push({ kind: "app", name: APP_NAME, designs: Object.fromEntries(SHAPES.map((sh) => [sh, appDesigns(sh).filter((d) => d.id !== basic[sh][0].id)])), look: { logo: APP_LOGO } });
  taller.groups = groups;
  // the tokens to draw on: a few of each shape from the collection, different groups first, one with another state
  const roles = c ? collectionRoles(c, uiLang()) : [];
  const teams = c?.groups.map((g) => g.id) ?? [];
  const generic = collectionRoles(sampleTokens(teams.length ? teams : ["townsfolk", "demon"]), uiLang());
  const chosen: Role[] = [];
  for (const sh of SHAPES) {
    const here = roles.filter((r) => shapeOf(r) === sh), out: Role[] = [];
    for (const r of here) if (!r.flip && out.length < 4 && !out.some((o) => o.team === r.team)) out.push(r);
    const two = here.find((r) => r.flip); if (two) out.push(two);
    for (const r of here) if (out.length < 5 && !out.includes(r)) out.push(r);
    const list = out.length ? out : generic.filter((r) => shapeOf(r) === sh);
    chosen.push(...list);
    const withRem = list.find((r) => !r.flip && r.reminders?.en?.length);
    taller.samples[sh] = [...list.map(charKey), ...(sh === "coin" && withRem ? [remKey(withRem, 0)] : [])];
  }
  state.lib = await loadLibrary(chosen);
  rereadMyDesigns();
  readTallerAddress();
  startTaller();
}
/**
 * The Taller's step from its address: "d=u:<id>" one of your designs, in the editor; "shape" (with
 * "d=c:<id>", a collection's design as the design step names it, "d=a:<id>", one of the app's, or "d=g<n>:<id>", a base) the
 * second step, on that base; else the first.
 */
function readTallerAddress() {
  const q = new URLSearchParams(location.search), want = q.get("shape") as TokenShape, d = q.get("d") ?? "";
  const shape = SHAPES.includes(want) ? want : null;
  if (d.startsWith("u:")) {
    const sh = [shape, ...SHAPES].find((s) => s && myDesigns[s].some((x) => x.id === d.slice(2)));
    if (sh) { Object.assign(taller, { view: "edit", shape: sh, ref: d }); return; }
  }
  if (!shape || d.startsWith("u:")) { taller.view = "shape"; return; }
  let pick = tallerBase(shape, d) ? d : "";
  if (d.startsWith("c:")) {
    // the collection's design: its own when it has designs of the shape, else one of the basic ones (Basic first)
    const own = taller.groups.some((g) => g.kind === "from" && g.designs[shape]?.length);
    const rank = (g: TallerGroup) => (own ? (g.kind === "from" ? 0 : 1) : (g.kind === "blank" || g.kind === "app" ? 0 : 1));
    const order = taller.groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g));
    const hit = order.find(({ g }) => g.designs[shape]?.some((x) => x.id === d.slice(2)));
    if (hit) pick = `g${hit.i}:${d.slice(2)}`;
  }
  if (d.startsWith("a:")) {
    // the app's: in its group, or Basic when it's the one Basic is
    const i = taller.groups.findIndex((g) => (g.kind === "app" || g.kind === "blank") && g.designs[shape]?.some((x) => x.id === d.slice(2)));
    if (i >= 0) pick = `g${i}:${d.slice(2)}`;
  }
  Object.assign(taller, { view: "base", shape, pick: pick || firstBase(shape) });
}
/** The address for where the Taller is, so a reload (or going back) opens the same. */
function tallerAddress() {
  const q = new URLSearchParams(), from = new URLSearchParams(location.search).get("from");
  if (from) q.set("from", from);
  if (taller.view !== "shape") { q.set("shape", taller.shape); q.set("d", taller.view === "edit" ? taller.ref : taller.pick); }
  return `${location.pathname}?${q}`;
}
/** Goes to a step (a new entry in the history: the browser's back comes back) or changes it in place. */
function tallerGo(next: Partial<Pick<typeof taller, "view" | "shape" | "ref" | "pick" | "focusName">>, push = true) {
  const was = taller.view;
  Object.assign(taller, next);
  const url = tallerAddress();
  if (url !== location.pathname + location.search) history[push ? "pushState" : "replaceState"](null, "", url);
  if (taller.view !== was || push) { $("#tallerMain").scrollTop = 0; $("#styleFields").scrollTop = 0; }
  renderTaller();
}
/** The Taller's shapes, in the order the first step shows them. */
const TALLER_SHAPES: TokenShape[] = ["coin", "ring", "card"];
function startTaller() {
  setGateState(null);
  $("#gate").hidden = true; $("#app").hidden = false;
  $("#app").dataset.step = "taller";
  document.title = `${t("taller.title")} · ${APP_NAME}`;
  $<HTMLLinkElement>("#favicon").href = APP_ICON;
  const back = $<HTMLAnchorElement>("#tallerBack");
  back.href = taller.from?.path ?? LIST_URL;
  $("b", back).textContent = taller.from?.name ?? t("own.homeTitle");
  markStarted();
  history.replaceState(null, "", tallerAddress());
  wire(); wireTaller();
  buildChoices();
  renderTaller();
}
/** Everything in the Taller, for where it is. */
export function renderTaller() {
  if (!state.lib) return;
  if (taller.view === "edit" && !tallerMine()) taller.view = "shape";   // deleted (in another tab)
  const edit = taller.view === "edit";
  $("#app").dataset.tv = edit ? "edit" : "start";
  $("#tallerWizard").hidden = edit;
  $("#tallerPreview").hidden = $("#tallerList").hidden = !edit;
  if (taller.view === "shape") { renderTallerShapes(); return; }
  if (taller.view === "base") { renderTallerBases(); return; }
  const sh = taller.shape, key = taller.samples[sh][0];
  if (state.sel?.key !== key) state.sel = { key, role: tokenRole(key), reminder: tokenRem(key) };
  renderTallerPreview();
  renderTallerList();
  renderWorkshop();
}
/** "1. Shape › 2. Base › 3. Design", the step it's on marked. */
const tallerSteps = (n: number) => `<ol class="tw-steps">${["shape", "base", "design"].map((k, i) => `<li${i + 1 === n ? ' aria-current="step"' : ""}><span>${i + 1}. ${esc(t(`taller.step.${k}`))}</span></li>`).join("")}</ol>`;
/** Your design as a card to open: drawn on the shape's first sample token, with what it is and where it's used. */
function myDesignCard(sh: TokenShape, d: MyDesign, withShape: boolean) {
  const sub = [withShape ? t(`own.shape.${sh}`) : "", usesLine(sh, d.id)].filter(Boolean).join(" · ");
  return `<button class="tl-design" type="button" data-taller-open="${sh}" data-ref="u:${esc(d.id)}" aria-pressed="${taller.view === "edit" && taller.ref === `u:${d.id}`}">${designSwatch(d.spec, tokenRole(taller.samples[sh][0]))}<span><b>${esc(d.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
}
/** The first step: the three shapes, each drawn on a sample token, and your designs to carry on with. */
function renderTallerShapes() {
  const shapes = TALLER_SHAPES.map((sh) => {
    const n = myDesigns[sh].length, from = taller.groups.findIndex((g) => g.kind === "from" && g.designs[sh]?.length);
    const look = from >= 0 ? tallerBase(sh, `g${from}:${taller.groups[from].designs[sh]![0].id}`)! : tallerBase(sh, firstBase(sh))!;
    return `<button class="tw-shape" type="button" data-tw-shape="${sh}"><span class="tw-tok ${sh}">${tallerPic(taller.samples[sh][0], look.spec)}</span>
      <span><b>${esc(t(`taller.shape.${sh}`))}</b><small>${esc(t(`taller.shapeHelp.${sh}`))}</small>${n ? `<span class="cnt">${esc(t("taller.yoursN", { n }))}</span>` : ""}</span></button>`;
  }).join("");
  const mine = TALLER_SHAPES.flatMap((sh) => myDesigns[sh].map((d) => myDesignCard(sh, d, true)));
  $("#tallerWizard").innerHTML = `${tallerSteps(1)}
    <h2 class="tw-title">${esc(t("taller.shapeQ"))}</h2>
    <div class="tw-shapes">${shapes}</div>
    ${mine.length ? `<section class="tl-sec"><h3>${esc(t("taller.carryOn"))}<small>${mine.length}</small></h3><div class="tl-grid">${mine.join("")}</div></section>`
      : `<p class="hint tw-none">${esc(t("taller.noneYet"))}</p>`}`;
}
/** The second step: the bases for the shape, Basic first; the one chosen drawn on the sample tokens, and the way to start. */
/** The collections' groups of bases left open in step 2 (shape:index). */
const tallerOpenGroups = new Set<string>();
document.addEventListener("toggle", (e) => {
  const d = e.target as HTMLElement;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.twGroup) return;
  if (d.open) tallerOpenGroups.add(d.dataset.twGroup); else tallerOpenGroups.delete(d.dataset.twGroup);
}, true);
function renderTallerBases() {
  const sh = taller.shape, role = tokenRole(taller.samples[sh][0]);
  if (!tallerBase(sh, taller.pick)) taller.pick = firstBase(sh);
  const pick = tallerBase(sh, taller.pick)!;
  const more = (spec: TokenSpec) => `<span class="tw-more">${taller.samples[sh].slice(1, sh === "card" ? 3 : 4).map((k) => tallerPic(k, spec)).join("")}${SHAPE_FEATURES[sh].back ? tallerPic(taller.samples[sh][0], spec, "back") : ""}</span>`;
  const row = (g: TallerGroup, i: number, def: StyleDef) => {
    const d = tallerBase(sh, `g${i}:${def.id}`)!, on = d.ref === pick.ref;
    return `<button class="tw-opt" type="button" role="radio" aria-checked="${on}" data-tw-pick="${esc(d.ref)}"><span class="tw-sw">${designSwatch(d.spec, role)}${SHAPE_FEATURES[sh].back && filled(d.spec).back !== "none" ? `<span class="tw-swb">${tokenSvg(state.lib!, role, { ...filled(d.spec), lang: tokenLang(), icon: ownIcon(role.id), diameter: 45 }, { side: "back" })}</span>` : ""}</span><span class="tw-ot"><b>${esc(d.name)}${g.kind === "blank" ? ` <span class="tw-tag">${esc(t("taller.blankTag"))}</span>` : ""}</b>${d.help ? `<small>${esc(d.help)}</small>` : ""}</span><span class="rad" aria-hidden="true"></span>${on ? more(d.spec) : ""}</button>`;
  };
  const label = (g: TallerGroup) => (g.kind === "blank" ? t("taller.blankGroup") : g.kind === "app" ? g.name : t("taller.of", { name: g.name }));
  const note = (g: TallerGroup) => (g.kind === "blank" ? t("taller.blankNote") : g.kind === "from" ? t("taller.fromNote") : g.kind === "app" ? t("taller.appNote") : "");
  // the starting base in the open; each collection's designs folded (open where the chosen base is)
  const opts = taller.groups.map((g, i) => {
    const list = g.designs[sh];
    if (!list?.length) return "";
    const head = `${esc(label(g))}${note(g) ? ` <small>${esc(note(g))}</small>` : ""}`, rows = list.map((def) => row(g, i, def)).join("");
    if (g.kind === "blank") return `<p class="tw-gl">${head}</p>${rows}`;
    const open = tallerOpenGroups.has(`${sh}:${i}`) || list.some((def) => `g${i}:${def.id}` === pick.ref);
    // folded, it looks like the collection's cover: its colours, logo and name, and its designs on the sample token
    const lk = g.look ?? {}, minis = list.slice(0, 6).map((def) => designSwatch(tallerBase(sh, `g${i}:${def.id}`)!.spec, role)).join("");
    const style = `--acc:${esc(lk.accent ?? "#c9963a")}${lk.cover ? `;--cover:${esc(lk.cover)}` : ""}`;
    return `<details class="tw-grp" data-tw-group="${sh}:${i}"${open ? " open" : ""}><summary class="tw-cover" style="${style}"><img src="${esc(lk.logo ?? APP_LOGO)}" alt=""><span class="tw-cv-t"><b>${esc(g.name)}</b><small>${esc(t("taller.groupCount", { n: list.length }))}${note(g) ? ` · ${esc(note(g))}` : ""}</small></span><span class="tw-cv-minis" aria-hidden="true">${minis}</span>${CHEVRON}</summary><div class="tw-grp-rows">${rows}</div></details>`;
  }).join("");
  const go = esc(t("taller.go", { name: pick.name }));
  $("#tallerWizard").innerHTML = `${tallerSteps(2)}
    <div class="tw-titlebar"><button class="link" type="button" data-tw-back>‹ ${esc(t("taller.step.shape"))}</button><h2 class="tw-title">${esc(t(`taller.baseQ.${sh}`))}</h2></div>
    <div class="tw-blist">
      <div class="tw-opts" role="radiogroup" aria-label="${esc(t("taller.step.base"))}">${opts}</div>
      <div class="tw-side">
        <div class="tw-pv">${tallerPreviewHtml(sh, pick.spec)}</div>
        <p class="tw-desc"><b>${esc(pick.name)}</b>${pick.help ? ` · ${esc(pick.help)}` : ""}</p>
        <button class="forge" type="button" data-tw-go>${go} ›</button>
        <p class="hint tw-note">${esc(t("taller.goNote", { name: uniqueDesignName(sh, t("taller.mineName", { name: pick.name })) }))}</p>
      </div>
    </div>`;
}
/** A design on the sample tokens: the first large, front and back; the rest beside it (a coin's backs under them). */
function tallerPreviewHtml(sh: TokenShape, spec: TokenSpec) {
  const keys = taller.samples[sh], backs = SHAPE_FEATURES[sh].back;
  const front = esc(t("part.front")), back = esc(t("part.back")), rest = keys.slice(1);
  const cell = (k: string, side: "front" | "back") => `<span class="${tokenRem(k) != null ? "r" : ""}${side === "back" ? " b" : ""}">${tallerPic(k, spec, side)}</span>`;
  return `<div class="tv-hero"><figure>${tallerPic(keys[0], spec)}${backs ? `<figcaption>${front}</figcaption>` : ""}</figure>${backs ? `<figure>${tallerPic(keys[0], spec, "back")}<figcaption>${back}</figcaption></figure>` : ""}</div>
    ${rest.length ? `<div class="tv-rest${sh === "card" ? " cards" : ""}${backs ? " two" : ""}" style="--n:${rest.length}">${backs ? `<i>${front}</i>` : ""}${rest.map((k) => cell(k, "front")).join("")}${backs ? `<i class="b">${back}</i>${rest.map((k) => cell(k, "back")).join("")}` : ""}</div>` : ""}`;
}
/** The design open in the editor, on the sample tokens. */
function renderTallerPreview() {
  $("#tallerPreview").innerHTML = tallerPreviewHtml(taller.shape, tallerMine()!.spec);
}
/** Your other designs of the shape, to switch to. */
function renderTallerList() {
  const sh = taller.shape;
  $("#tallerList").innerHTML = `<section class="tl-sec"><h3>${esc(t("taller.mine"))}<small>${esc(t(`type.${sh}.many`))} · ${myDesigns[sh].length}</small></h3>
    <div class="tl-grid">${myDesigns[sh].map((d) => myDesignCard(sh, d, false)).join("")}</div></section>`;
}
/**
 * Where one of your designs is used: as a default in a collection, or by its tokens, in every
 * collection kept in this browser (and Clocktower).
 */
function designUses(id: string): { prefix: string; name: string; defaults: TokenShape[]; tokens: number }[] {
  const ref = `u:${id}`, out = new Map<string, { prefix: string; name: string; defaults: TokenShape[]; tokens: number }>();
  const entry = (prefix: string) => {
    if (!out.has(prefix)) {
      const cid = prefix.match(/^midnight-mint-own-(.+)-$/)?.[1];
      out.set(prefix, { prefix, name: cid ? (builtIn(cid) ? nameIn(builtIn(cid)!.name, uiLang()) : undefined) ?? listCollections().find((x) => x.id === cid)?.name ?? cid : "Blood on the Clocktower", defaults: [], tokens: 0 });
    }
    return out.get(prefix)!;
  };
  for (const k of local.keys()) {
    if (k.endsWith("design-defaults")) for (const [sh, r] of Object.entries(loadJSON<Record<string, string>>(k, {}))) { if (r === ref) entry(k.slice(0, -15)).defaults.push(sh as TokenShape); }
    if (k.endsWith("design-tokens")) { const n = Object.values(loadJSON<Record<string, TokenOverride>>(k, {})).filter((o) => o?.style === ref).length; if (n) entry(k.slice(0, -13)).tokens += n; }
  }
  return [...out.values()];
}
/** A line on one of your designs saying where it's the default ("Default in Draw Steel"). */
function usesLine(shape: TokenShape, id: string) {
  const uses = designUses(id), def = uses.filter((u) => u.defaults.includes(shape)).map((u) => u.name), n = uses.reduce((a, u) => a + u.tokens, 0);
  return [def.length ? t("taller.defaultIn", { list: def.join(", ") }) : "", n ? t("taller.tokens", { n }) : ""].filter(Boolean).join(" · ");
}
/** The editor's head, over the controls: back to your designs, the design's name (to change), its shape, where it's used, and what can be done with it. */
let tallerHeadFor = "";
export function renderTallerHead() {
  const sh = taller.shape, mine = tallerMine()!, head = $("#tallerHead");
  const sig = `${mine.id}|${uiLang()}`;
  if (tallerHeadFor !== sig || !head.firstElementChild) {
    tallerHeadFor = sig;
    head.innerHTML = `<div class="th-top"><button class="link th-back" type="button" data-taller-act="mine">‹ ${esc(t("taller.mine"))}</button><span class="th-shape">${uiIcon(SHAPE_ICONS[sh])}${esc(t(`taller.shape.${sh}`))}</span></div>
      <input class="th-name" id="tallerName" type="text" autocomplete="off" maxlength="80" value="${esc(mine.name)}" aria-label="${esc(t("taller.nameLabel"))}">
      <p class="hint" id="tallerUses"></p>
      <div class="th-actions"><button class="pill" type="button" data-taller-act="copy">${esc(t("taller.duplicate"))}</button><button class="pill danger" type="button" data-taller-act="delete">${esc(t("taller.delete"))}</button><button class="pill th-new" type="button" data-taller-act="new">+ ${esc(t("taller.new"))}</button></div>`;
  }
  const name = $<HTMLInputElement>("#tallerName");
  if (document.activeElement !== name) name.value = mine.name;
  const uses = usesLine(sh, mine.id);
  $("#tallerUses").textContent = uses; $("#tallerUses").hidden = !uses;
  // the new copy's name ready to type over; not on a touch screen, where the keyboard would cover the preview
  if (taller.focusName) { taller.focusName = false; if (!matchMedia("(hover: none)").matches) { name.focus(); name.select(); } }
}
/** A design of yours from a base (a collection's, or Basic) or another of yours: it opens in the editor, to be changed. */
function tallerCopy(from: DesignEntry, name: string, origin = from.mine ? tallerMine()?.from : { name: from.name, spec: structuredClone(from.spec) }) {
  const { preset: _p, fromPreset: _f, ...spec } = structuredClone(from.spec);
  const d: MyDesign = { id: newId("d"), name: uniqueDesignName(taller.shape, name), spec: spec as TokenSpec, ...(origin ? { from: origin } : {}) };
  myDesigns[taller.shape].push(d); storeMyDesigns();
  tallerGo({ view: "edit", ref: `u:${d.id}`, focusName: true });
  toast(t("taller.made", { name: d.name }));
}
/** The name typed in the editor's head: kept as it's typed, made unique among the shape's when it's done. */
function tallerRename(done: boolean) {
  const mine = tallerMine(), input = $<HTMLInputElement>("#tallerName"); if (!mine) return;
  const typed = input.value.trim();
  if (typed) mine.name = done ? uniqueDesignName(taller.shape, typed, mine) : typed;
  if (done) input.value = mine.name;
  storeMyDesigns(); renderTallerList();
}
async function tallerAction(act: string) {
  const sh = taller.shape, mine = tallerMine();
  if (act === "mine" || act === "new") { tallerGo({ view: "shape" }); return; }
  if (!mine) return;
  if (act === "copy") { tallerCopy(myEntry(mine), t("style.copyOf", { name: mine.name })); return; }
  if (act === "delete") {
    const uses = designUses(mine.id);
    const where = uses.map((u) => [u.defaults.includes(sh) ? t("taller.useDefault", { name: u.name }) : "", u.tokens ? t("taller.useTokens", { name: u.name, n: u.tokens }) : ""].filter(Boolean).join(", ")).filter(Boolean);
    const text = t("taller.deleteAsk", { name: mine.name }) + " " + (where.length ? t("taller.deleteUses", { list: where.join("; ") }) : t("taller.deleteUnused"));
    if (await ask(text, [{ id: "delete", label: t("taller.delete"), main: true }]) !== "delete") return;
    droppedDesigns.add(mine.id); myDesigns[sh] = myDesigns[sh].filter((x) => x !== mine); storeMyDesigns();
    // where it was used, back to the default: the collections' and their tokens' references to it go
    const ref = `u:${mine.id}`;
    for (const u of uses) {
      const defs = loadJSON<Record<string, string>>(`${u.prefix}design-defaults`, {});
      for (const k of Object.keys(defs)) if (defs[k] === ref) delete defs[k];
      storeJSON(`${u.prefix}design-defaults`, defs);
      const own = loadJSON<Record<string, TokenOverride>>(`${u.prefix}design-tokens`, {});
      for (const [k, o] of Object.entries(own)) if (o?.style === ref) { delete o.style; if (!Object.keys(o).length) delete own[k]; }
      storeJSON(`${u.prefix}design-tokens`, own);
    }
    tallerGo({ view: "shape" }, false);
    toast(t("taller.deleted", { name: mine.name }));
  }
}
function wireTaller() {
  const open = (b: HTMLElement) => tallerGo({ view: "edit", shape: b.dataset.tallerOpen as TokenShape, ref: b.dataset.ref! });
  $("#tallerWizard").onclick = (e) => {
    const shape = hit(e, "[data-tw-shape]"), pick = hit(e, "[data-tw-pick]"), mine = hit(e, "[data-taller-open]");
    if (shape) { const sh = shape.dataset.twShape as TokenShape; tallerGo({ view: "base", shape: sh, pick: firstBase(sh) }); }
    else if (pick) { tallerGo({ pick: pick.dataset.twPick! }, false); $<HTMLElement>(`[data-tw-pick="${CSS.escape(taller.pick)}"]`).focus({ preventScroll: true }); }
    else if (mine) open(mine);
    else if (hit(e, "[data-tw-back]")) tallerGo({ view: "shape" });
    else if (hit(e, "[data-tw-go]")) { const base = tallerBase(taller.shape, taller.pick)!; tallerCopy(base, t("taller.mineName", { name: base.name })); }
  };
  $("#tallerList").onclick = (e) => {
    const b = hit(e, "[data-taller-open]");
    if (b && b.dataset.ref !== taller.ref) { open(b); if (PHONE.matches) $("#workshop").scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  $("#tallerHead").onclick = (e) => { const b = hit(e, "[data-taller-act]"); if (b) void tallerAction(b.dataset.tallerAct!); };
  $("#tallerHead").oninput = (e) => { if ((e.target as HTMLElement).id === "tallerName") tallerRename(false); };
  $("#tallerHead").onchange = (e) => { if ((e.target as HTMLElement).id === "tallerName") tallerRename(true); };
  $("#tallerHead").onkeydown = (e) => { if (e.key === "Enter" && (e.target as HTMLElement).id === "tallerName") (e.target as HTMLInputElement).blur(); };
  window.addEventListener("popstate", () => { readTallerAddress(); renderTaller(); });
}
