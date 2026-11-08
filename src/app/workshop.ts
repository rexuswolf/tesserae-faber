// The workshop: a token's preview, its parts and faces, and its own icon.
import { on } from "./events.ts";
import type { TokenShape, TokenSpec, BackFace, TokenStyle, SpecInput, SpecColours, TokenIcon, TokenOverride, TokenContent } from "../types.ts";
import { shapeOf, SHAPE_FEATURES, DEFAULT_SPEC, FACE_FIELDS, reliefOf, buildToken, TEAMS, tokenSvg, MAGNET_SIZES, RING_SEPARATORS, RING_BASES, cardBackOf } from "../engine/token-engine.ts";
import { state, coll, LAYOUT_TEXT, defSpec, STYLE_KEEPS, knownStyles, $, view3d, esc, input, hit, $$, SEPARATOR_MARKS, COLOUR_CHOICES } from "./context.ts";
import type { Part, Side, FaceTab, Fields } from "./context.ts";
import { lookOf, designFor, ownChanged, designOf, inheritedRef, collLabel, defaultRef } from "./designs.ts";
import { changeLook, renderSays, renderTabs, syncControls, renderColourWarn, dz, renderDesignSheet, setOwn, patternGroupHtml, setCardBack, changeCardBack, setCardBackIcon, renderQuickDesigns } from "./design-sheet.ts";
import { APP_NAME, tallerUrl, OWN } from "../collection.ts";
import type { StyleDef } from "../collection.ts";
import { BOTC_STYLES } from "../botc-styles.ts";
import type { ViewKind } from "../engine/viewer.ts";
import { TALLER, tallerMine, renderTallerHead } from "./taller.ts";
import { uiLang, t } from "../i18n.ts";
import { specFor, textFor, charKey, ownIcon } from "./tokens.ts";
import { editionName } from "./scripts-ui.ts";
import { filled } from "./looks.ts";
import { tokenLang } from "./token-language.ts";
import { iconFromSvg, searchGameIcons, gameIconPreview, gameIcon } from "../icons.ts";
import { renderDesignStage } from "./queue.ts";
import { renderEditor } from "./editor.ts";

// ------------------------------------------------------------ workshop
//
// The design step's left column changes how one token looks, over the design it has. On top, what
// it says (a line, with the way to its content) and its design (the collection's default for its
// shape, or one chosen for it). Then its parts, which its shape decides: a coin's FRONT · BACK ·
// COIN · MAGNET, a ring's FRONT · RING, a card's FRONT · CARD; inside a face, its Layout · Text ·
// Icon · Frame (those the shape has). A change here is this token's only (an override); a design
// itself is changed in the Taller, which uses the same controls on one of your designs.

/** The shape being edited: the selected token's. */
export const editShape = (): TokenShape => shapeOf(state.sel!.role);
/** The parts a type is made of (level 1), from what its shape has. */
export const partsOf = (shape: TokenShape): Part[] => {
  const f = SHAPE_FEATURES[shape];
  return ["front", "colours", ...(f.back ? ["back" as const] : []), "body", ...(f.magnet ? ["magnet" as const] : [])];
};
/** One of the design's sections: a part, or a tab of the front. */
export interface Section { part: Part; face?: FaceTab }
/**
 * The sections a token's design is changed in, from the basic to the advanced: how it's laid out, its
 * colours, its text, icon and frame, its back; then its background pattern, its body and its magnet.
 * A token of yours that carries only its icon (or only its text) has no layout, nor text (or icon), to change.
 */
export function sectionsOf(shape: TokenShape, content?: TokenContent): Section[] {
  const front = faceTabsOf(shape, "front").filter((f) => !(content === "icon" || content === "text") || (f !== "layout" && f !== (content === "icon" ? "text" : "icon")));
  const basic = front.filter((f) => f !== "pattern"), rest = partsOf(shape).filter((p) => p !== "front" && p !== "colours" && p !== "back");
  return [
    ...basic.filter((f) => f === "layout").map((face) => ({ part: "front" as const, face })),
    { part: "colours" },
    ...basic.filter((f) => f !== "layout").map((face) => ({ part: "front" as const, face })),
    ...(partsOf(shape).includes("back") ? [{ part: "back" as const }] : []),
    ...(front.includes("pattern") ? [{ part: "front" as const, face: "pattern" as const }] : []),
    ...rest.map((part) => ({ part })),
  ];
}
/** A face's tabs (level 2): the layout only where there's more than one, the icon where the shape has one. */
export const faceTabsOf = (shape: TokenShape, side: Side = "front"): FaceTab[] => {
  const f = SHAPE_FEATURES[shape];
  // the background pattern: the front's (a back face has none; a back design's is in BACK)
  return [...(f.layout ? ["layout" as const] : []), "text", ...(f.icon ? ["icon" as const] : []), "frame", ...(f.pattern && side === "front" ? ["pattern" as const] : [])];
};
/** The open level-1 tab of the type being edited (one it has). */
export function openPart(): Part {
  const shape = editShape(), list = partsOf(shape);
  if (!list.includes(state.part[shape])) state.part[shape] = "front";
  return state.part[shape];
}
/** Which face the controls edit: the back's when BACK is open, else the front's. */
export const editSide = (): Side => (openPart() === "back" ? "back" : "front");
/** The open panel: a face's tab, the back's choices, the body or the magnet. */
export function openPanel(): string {
  const part = openPart(), shape = editShape();
  if (part === "back" && shape === "card") return "cardBack";   // a card's back: a face of its own, in one panel
  if (part === "front" || (part === "back" && editLook().backMode === "own")) {
    const side = part === "back" ? "back" : "front", tabs = faceTabsOf(shape, side);
    if (!tabs.includes(state.faceTab[side])) state.faceTab[side] = tabs[0];
    return state.faceTab[side];
  }
  return part;
}

/** The look the controls show: the selected token's (its design's, with its own changes), or in the Taller the design's. */
export const editLook = () => lookOf(state.sel!.key);

/**
 * A face as the controls show it: the front is the spec itself; the back (a face) is the front's
 * look, or with "own" its own, with the back's relief and colours. As backFaceOf draws it, before
 * the rule that only one face is raised (the workshop asks about that instead).
 */
export function faceOf(s: TokenSpec, side: Side): TokenSpec {
  const spec = { ...DEFAULT_SPEC, ...s, colours: { ...DEFAULT_SPEC.colours, ...s.colours } };
  if (side === "front") return spec;
  const b = spec.backFace ?? {};
  const look = spec.backMode === "own" ? Object.fromEntries(FACE_FIELDS.filter((k) => b[k] != null).map((k) => [k, b[k]])) : {};
  return { ...spec, ...look, relief: reliefOf(b), colours: { ...spec.colours, front: b.colours?.front ?? spec.colours.front, frame: b.colours?.frame ?? spec.colours.frame } };
}
/** Applies a change to a face: the front's goes to the spec; the back's to its own settings, only what changed (what it
 *  never changed keeps following the front). */
export function changeFace(side: Side, mutate: (f: TokenSpec) => void) {
  changeLook((s) => {
    if (side === "front") { mutate(s); return; }
    const before = faceOf(s, "back"), v = structuredClone(before);
    mutate(v);
    const b: BackFace = { ...s.backFace };
    for (const k of FACE_FIELDS) if (v[k] !== before[k]) (b as Fields)[k] = v[k];
    for (const k of ["front", "frame"] as const) if (v.colours[k] !== before.colours[k]) b.colours = { ...b.colours, [k]: v.colours[k] };
    b.relief = reliefOf(v);
    s.backFace = b;
  });
}
/** A back face of its own starts as the front in another layout (the solo, or the classic for a solo front), so choosing it shows something new. */
export function ownStart(s: TokenSpec): BackFace {
  const style: TokenStyle = s.style === "solo" ? "classic" : "solo";
  return { ...Object.fromEntries(FACE_FIELDS.map((k) => [k, s[k] ?? DEFAULT_SPEC[k]])), style, textSize: LAYOUT_TEXT[style] };
}
export const hasOwnLook = (b: BackFace | undefined) => FACE_FIELDS.some((k) => b?.[k] != null);

/**
 * What of a design a shape shows, to tell whether a spec kept before styles is one of the
 * collection's: a coin, everything a style sets; a card or a ring, its colours, its frame as none or
 * a line, its thickness and colour depth (and a ring its letters and relief).
 */
function shapeLook(shape: TokenShape, spec: SpecInput) {
  const f = <K extends keyof TokenSpec>(k: K) => spec[k] ?? DEFAULT_SPEC[k], c = { ...DEFAULT_SPEC.colours, ...spec.colours };
  const line = f("frame") !== "none";
  const look = { base: c.base, front: c.front, frame: line ? c.frame : null, frameWidth: line ? f("frameWidth") : null, height: f("height"), depth: f("depth"),
    // a card's frame only at its corners; a ring's mark between repeats other than the dot (only when set: older looks compare as they did)
    ...(shape === "card" && f("frame") === "corners" ? { corners: true } : {}), ...(shape === "card" && f("frame") === "laurel" ? { laurel: true } : {}),
    // a card's icon, where it has one: its place, its size and how it sits with the phrase
    ...(shape === "card" && f("cardIcon") !== "none" ? { cardIcon: f("cardIcon"), cardIconSize: f("cardIconSize"), ...(f("cardIcon") !== "only" ? { cardJoin: f("cardJoin") } : {}) } : {}),
    // a card's back of its own, filled in (so one kept whole and one kept in part compare alike), and the colour behind it
    ...(shape === "card" && spec.cardBack?.on ? { cardBack: cardBackOf(spec), backBase: c.backBase ?? null } : {}) };
  if (shape === "base") return { ...look, spacing: f("spacing"), relief: reliefOf(spec) };
  return shape === "ring" ? { ...look, textSize: f("textSize"), spacing: f("spacing"), relief: reliefOf(spec), ...(f("separator") !== "dot" ? { separator: f("separator") } : {}) } : look;
}
/** Whether a spec differs from a collection's style in anything the style sets for the shape (the magnet is a choice of its own). */
function differsFrom(d: StyleDef, spec: TokenSpec, shape: TokenShape) {
  const { preset: _id, ...whole } = defSpec(d);
  if (shape !== "coin") return JSON.stringify(shapeLook(shape, whole)) !== JSON.stringify(shapeLook(shape, spec));
  const colours = (c: unknown) => ({ ...DEFAULT_SPEC.colours, ...(c as Partial<SpecColours>) });
  return Object.entries(whole).some(([k, v]) => !STYLE_KEEPS.has(k)
    && JSON.stringify(k === "colours" ? colours(v) : v) !== JSON.stringify(k === "colours" ? colours(spec.colours) : spec[k as keyof TokenSpec] ?? DEFAULT_SPEC[k as keyof TokenSpec]));
}
/**
 * The collection's style a spec kept before styles started from (by the id it keeps), or the one it
 * matches; the templates of old (Clocktower's styles) too, for one made from one.
 */
export function startedFrom(spec: TokenSpec, shape: TokenShape) {
  const list = [...knownStyles(shape), ...BOTC_STYLES[shape]], id = spec.preset ?? spec.fromPreset;
  const def = list.find((d) => d.id === id) ?? list.find((d) => !differsFrom(d, spec, shape));
  return { def, modified: !!def && differsFrom(def, spec, shape) };
}
/** What each tab shows in the 3D view: a face straight on, the body at an angle, the magnet from behind. */
const PART_VIEW: Record<Part, ViewKind> = { front: "top", colours: "angle", back: "back", body: "angle", magnet: "back" };
/** Opens a tab: a part, and inside a face one of its tabs. */
export function showTab({ part, face }: { part?: Part; face?: FaceTab } = {}) {
  if (part) state.part[editShape()] = part;
  if (face) state.faceTab[editSide()] = face;
  state.reliefAsk = null;
  $("#styleFields").scrollTop = 0;
}
/** Turns the 3D view to what the open tab changes. */
export function viewTab() {
  const v = PART_VIEW[openPart()];
  view3d("setView", v); syncView(v);
}

let raf = 0;
on("all", () => renderWorkshop());

export function renderWorkshop() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (!state.sel || (TALLER && !tallerMine())) return;   // the Taller's editor only
    const { key, role, reminder } = state.sel;
    const isRem = reminder != null;
    const lang = uiLang();
    const spec = specFor(key, isRem);
    const text = textFor(key, role, reminder);
    const token = buildToken(state.lib!, role, spec, text);
    state.token = token;
    const shape = shapeOf(role);
    if (TALLER) renderTallerHead();
    else {
      view3d("setToken", token);
      // X-ray only makes sense with a magnet inside.
      $("#xray").hidden = !token.magnet;
      if (!token.magnet && $("#xray").getAttribute("aria-pressed") === "true") { $("#xray").setAttribute("aria-pressed", "false"); view3d("setXray", false); }
      const design = designFor(key, shape);
      $("#name").textContent = text.trim() || t("own.namePlaceholder");
      $("#sub").textContent = [isRem ? textFor(charKey(role), role, null) : null, OWN && coll.groups.length < 2 ? null : TEAMS[role.team].label[lang], editionName(role, lang),
        t("design.sub", { name: design.name }), ownChanged(key) ? t("design.tweakedSub") : null].filter(Boolean).join(" · ");
      renderSays();
      renderDesignRow(key, shape);
    }
    $("#lookTitle").textContent = t(openPart() === "back" ? "look.titleBack" : "look.title");
    $("#lookSub").textContent = TALLER ? t("look.subDesign") : t("look.subToken");
    const look = editLook();
    renderTabs(role, look);
    syncControls(role, look, token);
    renderColourWarn(role, spec);
  });
}

/** A design drawn small on the token being edited: its colours and frame at a glance. */
export function designSwatch(spec: TokenSpec, role = state.sel!.role) {
  return `<span class="style-sw">${tokenSvg(state.lib!, role, { ...filled(spec), lang: tokenLang(), icon: ownIcon(role.id), diameter: 45, back: "none", backMode: "design" }, { text: textFor(charKey(role), role, null) })}</span>`;
}

/**
 * The token's design: the one it uses (its shape's default, a linked token's character's, or one
 * chosen for it), drawn on it, with where it comes from; "Change" opens the designs to choose from.
 * With changes of its own over it, the token is "customised": they can be kept as a design of
 * yours, or dropped. A design chosen for it has the way back to the default; and the way to the
 * Taller, where the design itself is changed.
 */
function renderDesignRow(key: string, shape: TokenShape) {
  const d = designFor(key, shape), def = designOf(shape, inheritedRef(key, shape))!, tweaked = ownChanged(key);
  const { role, reminder } = state.sel!;
  $("#styleTok").innerHTML = tokenSvg(state.lib!, role, specFor(key, reminder != null), { text: textFor(key, role, reminder) });
  $("#styleName").innerHTML = esc(d.name) + (tweaked ? ` · ${esc(t("design.custom"))} <span aria-hidden="true">✎</span>` : "");
  $("#styleCount").textContent = d.ref === def.ref ? t("design.isDefault") : d.mine ? t("design.yours") : t("design.fromSrc", { name: d.ref.startsWith("a:") ? APP_NAME : collLabel() });
  $("#styleChange").setAttribute("aria-label", `${t("design.change")}: ${t("design.label")} ${d.name}`);
  $("#styleTweak").hidden = !tweaked;
  // a design chosen for this token (not its shape's default): offered for all of them
  const all = $<HTMLButtonElement>("#styleAll");
  all.hidden = reminder != null || d.ref === defaultRef(shape);
  all.textContent = t("design.useAll", { name: d.name, shape });
  const back = $<HTMLButtonElement>("#styleBack");
  back.hidden = d.ref === def.ref;
  back.innerHTML = `<span aria-hidden="true">✎</span> ${esc(t("design.chosen"))} · <u>${esc(t("design.back"))}</u>`;
  $<HTMLAnchorElement>("#designTaller").href = tallerUrl(location.pathname, { shape, d: d.ref });
  $("#designFlash").hidden = !state.flash;
  $("#designFlash").textContent = state.flash;
  renderQuickDesigns();
  renderEditor(key, shape);
  if (dz.open && dz.mode === "token") renderDesignSheet();
}

// ------------------------------------------------------------ own icons

/** Gives the selected token's character an icon (null: back to its own). Its reminders follow. */
function setIcon(icon: TokenIcon | null) {
  const key = charKey(state.sel!.role), own: TokenOverride = { ...(state.overrides.get(key) || {}) };
  if (icon) own.icon = icon; else delete own.icon;
  setOwn(key, own);
}
export function renderIconField() {
  const role = state.sel?.role; if (!role) return;
  const icon = ownIcon(role.id), isRem = state.sel!.reminder != null;
  $("#iconReset").hidden = !icon;
  $("#iconHint").className = "hint";
  $("#iconHint").textContent = icon
    ? t(icon.source === "game-icons" ? "icon.isGame" : "icon.isOwn", { name: icon.name || "SVG", author: icon.author || "" }) + (isRem ? ` ${t("icon.remShares")}` : "")
    : t("icon.help");
}
export function wireIcons() {
  $("#iconUpload").onclick = () => $("#iconFile").click();
  $("#iconFile").onchange = async (e) => {
    const file = input(e).files![0]; input(e).value = "";
    if (!file) return;
    try { setIcon(iconFromSvg(await file.text(), { source: "upload", name: file.name.replace(/\.svg$/i, "") })); }
    catch (err) { $("#iconHint").className = "hint warn"; $("#iconHint").textContent = t((err as Error).message === "no-shapes" ? "icon.noShapes" : "icon.notSvg"); }
  };
  $("#iconReset").onclick = () => setIcon(null);
  $("#iconSearchOpen").onclick = () => { const box = $("#iconSearch"); box.hidden = !box.hidden; if (!box.hidden) $("#iconQuery").focus(); };
  let timer: ReturnType<typeof setTimeout> | number = 0;
  $("#iconQuery").oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query = input(e).value;
      let hits: string[];
      try { hits = await searchGameIcons(query); } catch { $("#iconResults").innerHTML = `<p class="hint warn">${esc(t("icon.searchFailed"))}</p>`; return; }
      if (input(e).value !== query) return;   // typed on meanwhile: that search shows instead
      $("#iconResults").innerHTML = hits.length
        ? hits.map((p) => `<button type="button" class="icon-hit" data-gi="${esc(p)}" title="${esc(p.replace("/", " · "))}"><img src="${gameIconPreview(p)}" alt="" loading="lazy"><span>${esc(p.split("/")[1])}</span></button>`).join("")
        : `<p class="hint">${esc(t(input(e).value.trim() ? "icon.none" : "icon.type"))}</p>`;
    }, 200);
  };
  $("#iconResults").onclick = async (e) => {
    const b = hit(e, "[data-gi]"); if (!b) return;
    try { setIcon(await gameIcon(b.dataset.gi!)); $("#iconSearch").hidden = true; }
    catch { $("#iconHint").className = "hint warn"; $("#iconHint").textContent = t("icon.fetchFailed"); }
  };
}

/**
 * A card's back (REVERSO): on or off, its phrase or the collection's name, its icon (searched on
 * game-icons.net or an SVG of yours, like a token's), its icon's place and join, its frame, sizes and colours.
 */
export function wireCardBack() {
  $("#cbOn").onclick = (e) => { const b = hit(e, "[data-v]"); if (b) setCardBack(b.dataset.v === "on"); };
  $("#cbText").oninput = (e) => changeCardBack((b) => { b.text = input(e).value; });
  $("#cbName").onchange = (e) => changeCardBack((b) => { if (input(e).checked) b.name = "collection"; else delete b.name; });
  for (const key of ["cardIcon", "cardJoin", "frame"] as const) {
    $(`[data-cb-choice=${key}]`).onclick = (e) => { const x = hit(e, "button"); if (x) changeCardBack((b) => { (b as unknown as Fields)[key] = x.dataset.v; }); };
  }
  // the sliders: their value as they move, the back drawn again when let go
  for (const [id, key] of [["cbIconSize", "cardIconSize"], ["cbFrameWidth", "frameWidth"]] as const) {
    $(`#${id}`).oninput = (e) => { $(`#${id}Out`).textContent = `${(+input(e).value).toFixed(key === "frameWidth" ? 1 : 0).replace(".", uiLang() === "es" ? "," : ".")} mm`; };
    $(`#${id}`).onchange = (e) => changeCardBack((b) => { b[key] = +input(e).value; });
  }
  const hint = (key: string) => { $("#cbIconHint").className = "hint warn"; $("#cbIconHint").textContent = t(key); };
  const choose = (icon: TokenIcon | null) => { $("#cbIconHint").className = "hint"; setCardBackIcon(icon); };
  $("#cbIconUpload").onclick = () => $("#cbIconFile").click();
  $("#cbIconFile").onchange = async (e) => {
    const file = input(e).files![0]; input(e).value = "";
    if (!file) return;
    try { choose({ ...iconFromSvg(await file.text(), { source: "upload", name: file.name.replace(/\.svg$/i, "") }), id: `upload:${Date.now().toString(36)}` }); }
    catch (err) { hint((err as Error).message === "no-shapes" ? "icon.noShapes" : "icon.notSvg"); }
  };
  $("#cbIconReset").onclick = () => choose(null);
  $("#cbIconSearchOpen").onclick = () => { const box = $("#cbIconSearch"); box.hidden = !box.hidden; if (!box.hidden) $("#cbIconQuery").focus(); };
  let timer: ReturnType<typeof setTimeout> | number = 0;
  $("#cbIconQuery").oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query = input(e).value;
      let hits: string[];
      try { hits = await searchGameIcons(query); } catch { $("#cbIconResults").innerHTML = `<p class="hint warn">${esc(t("icon.searchFailed"))}</p>`; return; }
      if (input(e).value !== query) return;   // typed on meanwhile: that search shows instead
      $("#cbIconResults").innerHTML = hits.length
        ? hits.map((p) => `<button type="button" class="icon-hit" data-gi="${esc(p)}" title="${esc(p.replace("/", " · "))}"><img src="${gameIconPreview(p)}" alt="" loading="lazy"><span>${esc(p.split("/")[1])}</span></button>`).join("")
        : `<p class="hint">${esc(t(input(e).value.trim() ? "icon.none" : "icon.type"))}</p>`;
    }, 200);
  };
  $("#cbIconResults").onclick = async (e) => {
    const b = hit(e, "[data-gi]"); if (!b) return;
    try { choose(await gameIcon(b.dataset.gi!)); $("#cbIconSearch").hidden = true; }
    catch { hint("icon.fetchFailed"); }
  };
}

export function syncView(v: string | undefined) {
  const turned = (state.view === "back") !== (v === "back");
  state.view = v ?? "angle";
  $$(".turn .pill[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  if (turned && state.step === 2 && state.lib) renderDesignStage();   // the strip shows the coins from the side the view does
}

export function buildChoices() {
  const make = (key: string, list: { id: string }[]) => {
    $(`[data-choice=${key}]`).innerHTML = list.map((s) => `<button class="pill" type="button" data-v="${s.id}">${esc(t(`${key}.${s.id}`))}</button>`).join("");
  };
  // Layouts are drawn as coin tiles by renderStyleTiles().
  make("magnet", [{ id: "none" }, { id: "pocket" }, { id: "hidden" }]);
  make("edge", [{ id: "smooth" }, { id: "reeded" }, { id: "segmented" }]);
  $("[data-choice=magnetSize]").innerHTML = MAGNET_SIZES.map((v) => `<button class="pill" type="button" data-v="${v}">${v.replace("x", " × ")} mm</button>`).join("");
  // a ring's mark between repeats: each drawn as itself, with its name
  $("[data-choice=separator]").innerHTML = RING_SEPARATORS.map((id) => `<button class="pill" type="button" data-v="${id}">${SEPARATOR_MARKS[id]}${esc(t(`separator.${id}`))}</button>`).join("");
  $("[data-choice=ringBase]").innerHTML = RING_BASES.map((v) => `<button class="pill" type="button" data-v="${v}">${v} mm</button>`).join("");
  // Frames are drawn as coin tiles by renderFrameTiles().
  // Backs are drawn as coin tiles by renderBackTiles().
  for (const side of ["front", "back"] as const) $(`[data-pat-side=${side}]`).innerHTML = patternGroupHtml(side);
  for (const box of $$(".metal")) {
    // Every filament the Bambu export knows. The name and icon and the frame can take the team
    // colour; on the coin or the back it would show the team from behind.
    const opts = [...(["front", "frame"].includes(box.dataset.colour!) ? [{ id: "team", hex: "team" }] : []), ...COLOUR_CHOICES];
    box.innerHTML = opts.map((o) => `<button type="button" class="${o.id === "team" ? "team" : ""}" data-v="${o.hex}" style="${o.id === "team" ? "" : `background:${o.hex}`}" aria-label="${esc(t(`metal.${o.id}`))}" title="${esc(t(`metal.${o.id}`))}"></button>`).join("");
  }
}
