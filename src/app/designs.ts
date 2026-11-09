// Designs: the collection's, yours and each token's, and which one a token prints with.
import type { TokenSpec, TokenShape, MyDesign, TokenOverride, Style, LookChanges } from "../types.ts";
import { nameIn, appDesigns, SHAPES, newId, OWN, knownStylesOf, builtIn, builtInStyles, loadCollection, basicStyles, storeCollection } from "../collection.ts";
import type { StyleDef, CollectionStyles } from "../collection.ts";
import { defSpec, defName, startingStyles, state, loadJSON, MY_DESIGNS_KEY, upgradeSpec, storeJSON, DEFAULTS_KEY, OVERRIDES2_KEY, STYLES_KEY, TOKENS_KEY, STYLE_KEYS, OVERRIDES_KEY, DESIGNS_KEY, legacySpecs, coll, knownStyles, startingStyle } from "./context.ts";
import type { SavedDesign } from "./context.ts";
import { uiLang, t } from "../i18n.ts";
import { appTwin } from "../shape-designs.ts";
import { roleIdOf, charKey, remindersOf, remKey } from "./tokens.ts";
import { shapeOf, migrateBack } from "../engine/token-engine.ts";
import { tokenRole } from "./queue.ts";
import { TALLER, taller } from "./taller.ts";
import { applyLook, lookFrom, lookFields, printsAs, keptBefore } from "./looks.ts";
import { placeGameIcon } from "../icons.ts";
import { local } from "../services.ts";
import { startedFrom } from "./workshop.ts";
import { roleById } from "./wiring.ts";
import { BOTC_STYLES } from "../botc-styles.ts";

// ------------------------------------------------------------ designs
//
// A design is a named look for one shape (Edition, Steel, Fine ring…): everything a token's spec
// says but its content (its name, icon, other state, linked tokens, printed text). There are two
// kinds. The collection's own, which it comes with (startingStyles), can't be changed. Yours are made
// in the Taller and kept once in this browser for every collection and Clocktower (MY_DESIGNS_KEY):
// a colour that is the group's stays "team", so any of them fits any collection.
//
// Each collection gives each shape a default design: its own first, unless another was chosen for
// the whole collection (in Pick: DEFAULTS_KEY). A token uses its shape's default (a linked token,
// its character's design), or a design chosen for it; and it may have changes of its own over it,
// field by field. Those two are its overrides (OVERRIDES2_KEY, with its own text, icon…). A design
// is referred to as "c:<id>" (the collection's), "a:<id>" (the app's, offered in every collection)
// or "u:<id>" (yours). A "c:<id>" kept before the functional designs became the app's still means
// what it did: the collection's style of that id when it has it (a hidden one too: Draw Steel's old
// Legible), else the app's of that id (they kept their ids: Fast print, Parchment, the rings'…).
// One that is the app's (an id the collection hasn't, or a style of its that's the app's, appTwin)
// reads as "a:<id>": refOf, defaultRef and the rest give that, so the menus mark it.

/** A design as the menus and the editor see it, whichever kind it is. */
export interface DesignEntry { ref: string; name: string; spec: TokenSpec; mine: boolean; help?: string }
/** Your designs, per shape: one library for every collection. */
export let myDesigns: Record<TokenShape, MyDesign[]> = { coin: [], ring: [], card: [], base: [] };
/** Your designs read again from this browser (another tab, or the Taller, may have changed them). */
export const rereadMyDesigns = () => { myDesigns = readMyDesigns(); };
/** The collection's default design per shape, where it isn't its own first one. */
export let defaults: Partial<Record<TokenShape, string>> = {};
const collSpecs = new Map<string, TokenSpec>();
export function collEntry(shape: TokenShape, d: StyleDef, ref = `c:${d.id}`): DesignEntry {
  const k = `${shape}:${ref}`;
  let spec = collSpecs.get(k);
  if (!spec) collSpecs.set(k, spec = defSpec(d));   // made once: tokens' looks are drawn from it often
  return { ref, name: defName(d), spec, mine: false, ...(d.help ? { help: nameIn(d.help, uiLang()) } : {}) };
}
export const myEntry = (d: MyDesign): DesignEntry => ({ ref: `u:${d.id}`, name: d.name, spec: d.spec, mine: true });
/** A design by its reference; none when it's gone (one of yours deleted). Its ref is how it reads now ("c:" the app's: "a:"). */
export function designOf(shape: TokenShape, ref: string | undefined): DesignEntry | undefined {
  if (ref?.startsWith("u:")) { const d = myDesigns[shape].find((x) => x.id === ref.slice(2)); return d && myEntry(d); }
  if (ref?.startsWith("a:")) { const d = appDesigns(shape).find((x) => x.id === ref.slice(2)); return d && collEntry(shape, d, ref); }
  if (ref?.startsWith("c:")) {
    const id = ref.slice(2), d = startingStyles(shape).find((x) => x.id === id);
    return d && !appTwin(shape, d) ? collEntry(shape, d) : designOf(shape, `a:${id}`);
  }
  return undefined;
}
/** The collection's own default for a shape: its first design ("Original design"). */
export const originalRef = (shape: TokenShape) => designOf(shape, `c:${startingStyles(shape)[0].id}`)!.ref;
/** The collection's default for a shape: the one chosen for it, while it's there, else its own first. */
export const defaultRef = (shape: TokenShape) => designOf(shape, defaults[shape])?.ref ?? originalRef(shape);
/** The design a token has by default: its shape's default; a linked token's, its character's. */
export function inheritedRef(key: string, shape: TokenShape) {
  const char = key.startsWith("r:") ? state.overrides.get(`c:${roleIdOf(key)}`)?.style : undefined;
  return designOf(shape, char)?.ref ?? defaultRef(shape);
}
/** The design a token uses: one chosen for it, else the one it has by default. */
export function refOf(key: string, shape = shapeOf(tokenRole(key))): string {
  if (TALLER) return taller.ref;
  return designOf(shape, state.overrides.get(key)?.style)?.ref ?? inheritedRef(key, shape);
}
export const designFor = (key: string, shape = shapeOf(tokenRole(key))) => designOf(shape, refOf(key, shape))!;
/** A token's look: its design's, with its own changes. */
export const lookOf = (key: string): TokenSpec => migrateBack(applyLook(designFor(key).spec, state.overrides.get(key)?.look));
/** The token has changes of its own to its design's look. */
export const ownChanged = (key: string) => !!state.overrides.get(key)?.look;
/** The token has a design of its own or changes to it: an override of the collection's default. */
export const designOverridden = (key: string) => { const o = state.overrides.get(key); return !!o?.look || (!!o?.style && !!designOf(shapeOf(tokenRole(key)), o.style)); };
/** Every token of a shape (characters and their linked tokens), the one being made apart. */
export function tokensOf(shape: TokenShape): string[] {
  return state.lib!.roles.filter((r) => shapeOf(r) === shape)
    .flatMap((r) => [charKey(r), ...remindersOf(r).map((_, i) => remKey(r, i))]);
}
/** The shapes the collection's tokens come in, in the shapes' order. */
export const shapesHere = () => SHAPES.filter((sh) => state.lib!.roles.some((r) => shapeOf(r) === sh));
export function readMyDesigns(): Record<TokenShape, MyDesign[]> {
  const kept = loadJSON<Partial<Record<TokenShape, MyDesign[]>> | null>(MY_DESIGNS_KEY, null);
  const ok = (d: MyDesign | null) => !!d && typeof d.id === "string" && typeof d.name === "string" && !!d.spec && typeof d.spec === "object";
  return Object.fromEntries(SHAPES.map((sh) => [sh, Array.isArray(kept?.[sh]) ? kept[sh]!.filter(ok).map((d) => ({ ...d, spec: upgradeSpec(d.spec) })) : []])) as Record<TokenShape, MyDesign[]>;
}
/** Designs deleted in this tab: not brought back from another tab's copy. */
export const droppedDesigns = new Set<string>();
/** Saves your designs, keeping any another tab (the Taller open twice, a sheet) added since this one read them. */
export function storeMyDesigns() {
  const there = readMyDesigns();
  for (const sh of SHAPES) for (const d of there[sh]) if (!droppedDesigns.has(d.id) && !myDesigns[sh].some((x) => x.id === d.id)) myDesigns[sh].push(d);
  return storeJSON(MY_DESIGNS_KEY, myDesigns);
}
export function storeDefaults() { storeJSON(DEFAULTS_KEY, defaults); }
export function storeOverrides() { storeJSON(OVERRIDES2_KEY, Object.fromEntries(state.overrides)); }
/** A name not yet among your designs of a shape: "Ivory", else "Ivory 2". */
export function uniqueDesignName(shape: TokenShape, base: string, but?: MyDesign) {
  const taken = new Set(myDesigns[shape].filter((x) => x !== but).map((x) => x.name));
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
  return name;
}

/**
 * A token of yours given an icon in the designer, before its content was the token's (an override, as a
 * closed collection's token has): the icon becomes the token's own, if it had none, and the override goes.
 * Its editor then says the icon it prints with.
 */
function foldOwnIcons() {
  if (!OWN) return;
  let changed = false;
  for (const [k, v] of state.overrides) {
    const tk = k.startsWith("c:") && v.icon ? coll.tokens.find((x) => x.id === k.slice(2)) : undefined;
    if (!tk) continue;
    if (!tk.icon) tk.icon = v.icon!;
    const { icon: _icon, ...rest } = v;
    if (Object.keys(rest).length) state.overrides.set(k, rest); else state.overrides.delete(k);
    changed = true;
  }
  if (changed) { storeCollection(coll); storeOverrides(); }
}
/**
 * Your designs, the collection's defaults and each token's overrides, once the tokens are known (a
 * token's shape is its character's). Kept since designs were yours: read as they are. Else made,
 * once, from what was kept before, printing exactly as it did:
 *  - a collection's styles (49eeec0, or made from what was kept before them: keptStyles) each
 *    become a design: one of the collection's when it prints as one (adoptStyle), else one of yours (a copy
 *    already there is the same one; a name one of yours or the collection's already has gets the
 *    collection's after it);
 *  - each shape's default is what its first style became;
 *  - a token that used another style chooses what that one became, and keeps its own changes.
 * The old keys are left as they were.
 */
export function loadDesigns() {
  myDesigns = readMyDesigns();
  const place = (v: TokenOverride): TokenOverride => ({ ...v, ...(v.icon ? { icon: placeGameIcon(v.icon) } : {}) });
  const kept = loadJSON<Record<string, TokenOverride> | null>(OVERRIDES2_KEY, null);
  if (kept) {
    defaults = loadJSON<Partial<Record<TokenShape, string>>>(DEFAULTS_KEY, {});
    state.overrides = new Map(Object.entries(kept).filter(([, v]) => v).map(([k, v]) => [k, place(v)]));
    foldOwnIcons();
    return;
  }
  defaults = {}; state.overrides = new Map();
  const old = keptStyles(place);
  if (old) fromStyles(old.styles, old.overrides);
  storeMyDesigns(); storeDefaults(); storeOverrides();
}
/**
 * What a collection kept before designs were yours: its styles per shape and each token's own, as
 * 49eeec0 kept them; or made from what was kept before styles (each type's set design its shape's
 * first style, named after the collection's style it is; a token's own whole design its changes
 * over that, its text, feminine name and icon its content; each saved design a style of its type).
 * Nothing kept: a first visit.
 */
function keptStyles(place: (v: TokenOverride) => TokenOverride): { styles: Record<TokenShape, Style[]>; overrides: Map<string, TokenOverride> } | null {
  const kept = loadJSON<Record<TokenShape, Style[]> | null>(STYLES_KEY, null);
  if (kept && SHAPES.every((sh) => Array.isArray(kept[sh]) && kept[sh].length)) {
    return {
      styles: Object.fromEntries(SHAPES.map((sh) => [sh, kept[sh].map((x) => ({ ...x, spec: upgradeSpec(x.spec) }))])) as Record<TokenShape, Style[]>,
      overrides: new Map(Object.entries(loadJSON<Record<string, TokenOverride>>(TOKENS_KEY, {})).filter(([, v]) => v).map(([k, v]) => [k, place(v)])),
    };
  }
  const before = [...Object.values(STYLE_KEYS), OVERRIDES_KEY, DESIGNS_KEY].some((k) => local.get(k) != null);
  if (!before) return null;
  const specs = legacySpecs(), styles = {} as Record<TokenShape, Style[]>, overrides = new Map<string, TokenOverride>();
  for (const sh of SHAPES) {
    const { def, modified } = startedFrom(specs[sh], sh);
    styles[sh] = [{ id: `${sh}-1`, ...(def && !modified ? { tpl: def.id } : {}), spec: specs[sh] }];
  }
  for (const [k, v] of Object.entries(loadJSON<Record<string, TokenOverride>>(OVERRIDES_KEY, {}))) {
    if (!v) continue;
    const { spec, ...own } = place(v);
    if (spec) {
      const role = roleById(roleIdOf(k)), look = lookFrom(styles[role ? shapeOf(role) : "coin"][0].spec, upgradeSpec(spec));
      if (lookFields(look).length) own.look = look;
    }
    if (Object.keys(own).length) overrides.set(k, own);
  }
  for (const d of loadJSON<SavedDesign[]>(DESIGNS_KEY, []).filter((d) => d && d.roleId && d.spec)) {
    const role = roleById(d.roleId), shape = d.shape ?? (role ? shapeOf(role) : "coin");
    const { lang: _lang, ...spec } = upgradeSpec(d.spec);
    styles[shape].push({ id: newId("s"), name: d.title, spec: spec as TokenSpec });
  }
  return { styles, overrides };
}
/** The collection's name, after a design of yours that came from it whose name was taken. */
export const collLabel = () => (OWN ? nameIn(coll.name, uiLang()) : "Clocktower");
/** A collection's styles and its tokens' own, as designs, defaults and overrides (see loadDesigns). */
function fromStyles(styles: Record<TokenShape, Style[]>, overrides: Map<string, TokenOverride>) {
  const looks = [...overrides.values()].flatMap((v) => (v.look ? [v.look] : []));
  const refs = Object.fromEntries(SHAPES.map((sh) => [sh, new Map(styles[sh].map((st) => [st.id, adoptStyle(sh, st, looks)]))])) as Record<TokenShape, Map<string, string>>;
  for (const sh of SHAPES) { const first = refs[sh].get(styles[sh][0].id)!; if (designOf(sh, first)?.ref !== originalRef(sh)) defaults[sh] = first; }
  for (const [k, v] of overrides) {
    const own = { ...v }, role = roleById(roleIdOf(k));
    if (own.style != null) {
      // a style that's gone was its shape's first
      const shape = role ? shapeOf(role) : SHAPES.find((sh) => refs[sh].has(own.style!)) ?? "coin";
      own.style = refs[shape].get(own.style) ?? refs[shape].get(styles[shape][0].id);
    }
    state.overrides.set(k, own);
  }
  // a design chosen that the token has by default anyway isn't one of its own (characters first: their linked tokens take theirs)
  for (const k of [...state.overrides.keys()].sort((a, b) => Number(a.startsWith("r:")) - Number(b.startsWith("r:")))) {
    const own = state.overrides.get(k)!, role = roleById(roleIdOf(k));
    if (own.style && (!role || designOf(shapeOf(role), own.style)?.ref === inheritedRef(k, shapeOf(role)))) delete own.style;
    if (!Object.keys(own).length) state.overrides.delete(k);
  }
}
/**
 * A style kept by a collection, as a design: what it is (one of the collection's, unchanged), or one
 * of yours. Unchanged is as it prints, with the tokens' own changes over it (printsAs): a style made
 * from one of the collection's kept the magnet, ring base and uploaded back of the style it was made
 * over, which a coin with no magnet or ring doesn't print.
 */
function adoptStyle(shape: TokenShape, st: Style, looks: LookChanges[]): string {
  if (!st.name) {
    const list = knownStyles(shape), same = (x: StyleDef) => printsAsDef(shape, st.spec, x, looks);
    const d = list.find((x) => x.id === st.tpl && same(x)) ?? list.find(same);
    if (d) return `c:${d.id}`;
  }
  const twin = myDesigns[shape].find((x) => printsAs(shape, st.spec, x.spec, looks));
  if (twin) return `u:${twin.id}`;
  const { lang: _lang, icon: _icon, ...spec } = structuredClone(st.spec);
  const base = styleName(st, shape), theirs = startingStyles(shape).map(defName);
  const name = uniqueDesignName(shape, myDesigns[shape].some((x) => x.name === base) || theirs.includes(base) ? `${base} (${collLabel()})` : base);
  const from = startingStyle(shape, st.spec.preset ?? st.spec.fromPreset ?? st.tpl);
  const d: MyDesign = { id: newId("d"), name, spec: spec as TokenSpec, ...(from ? { from: { name: defName(from), spec: defSpec(from) } } : {}) };
  myDesigns[shape].push(d);
  return `u:${d.id}`;
}
/** A style's name as it was shown: its own, else that of the collection's style it is, else "My style". */
const styleName = (st: Style, shape: TokenShape) => {
  const d = st.name ? undefined : startingStyle(shape, st.tpl);
  return st.name || (d ? defName(d) : t("style.mine"));
};

/** A spec prints as a collection's design (one kept before a field it sets, as kept then: keptBefore). */
const printsAsDef = (shape: TokenShape, spec: TokenSpec, x: StyleDef, looks: LookChanges[]) => { const def = defSpec(x); return printsAs(shape, keptBefore(spec, def), def, looks); };
/** Set once tidyMyDesigns has gone through your designs. */
const TIDIED_KEY = "tesserae-styles-tidied-2";
/**
 * Once, for designs made from styles before adoptStyle compared them as they print: one of yours
 * that prints as one of a collection's own (Edition (Clocktower), Steel (Draw Steel)…) is that one
 * again wherever a collection that has it uses it, as its default or a token's design; a collection
 * that hasn't it keeps yours. One of yours that prints as one of a collection's and nothing uses any
 * more goes. Nothing prints differently (printsAs, with each collection's tokens' own changes).
 * Every collection kept in this browser, and Clocktower; done for good once each one's designs were
 * known (a collection that comes with the app, read from its file).
 */
export async function tidyMyDesigns() {
  if (local.get(TIDIED_KEY)) return;
  const mine = readMyDesigns();
  const prefixes = new Set<string>();
  for (const k of local.keys()) { const m = k.match(/^(midnight-mint-.*)design-(?:defaults|tokens)$/); if (m) prefixes.add(m[1]); }
  // each collection's own designs, per shape
  let known = true;
  const theirs = new Map<string, Record<TokenShape, StyleDef[]>>();
  for (const p of prefixes) {
    const id = p.match(/^midnight-mint-own-(.+)-$/)?.[1];
    if (p === "midnight-mint-") { theirs.set(p, Object.fromEntries(SHAPES.map((sh) => [sh, knownStylesOf({ styles: BOTC_STYLES }, sh)])) as Record<TokenShape, StyleDef[]>); continue; }
    if (!id) continue;
    let styles: CollectionStyles | undefined;
    if (builtIn(id)) { styles = await builtInStyles(id); if (!styles) { known = false; continue; } }
    else { const c = loadCollection(id); if (!c) continue; styles = c.styles; }
    theirs.set(p, Object.fromEntries(SHAPES.map((sh) => [sh, knownStylesOf({ styles }, sh)])) as Record<TokenShape, StyleDef[]>);
  }
  const shapeOfMine = (ref: string | undefined) => (ref?.startsWith("u:") ? SHAPES.find((sh) => mine[sh].some((d) => d.id === ref.slice(2))) : undefined);
  const specOfMine = (sh: TokenShape, ref: string) => mine[sh].find((d) => d.id === ref.slice(2))!.spec;
  for (const [p, ship] of theirs) {
    const defs = loadJSON<Partial<Record<TokenShape, string>>>(`${p}design-defaults`, {});
    const own = loadJSON<Record<string, TokenOverride>>(`${p}design-tokens`, {});
    const looks = Object.values(own).flatMap((o) => (o?.look ? [o.look] : []));
    // what one of yours is here: the collection's that prints the same, if it has one
    const asTheirs = (ref: string | undefined): string | undefined => {
      const sh = shapeOfMine(ref);
      const d = sh && ship[sh].find((x) => printsAsDef(sh, specOfMine(sh, ref!), x, looks));
      return d ? `c:${d.id}` : undefined;
    };
    let changed = false;
    for (const sh of SHAPES) {
      const to = shapeOfMine(defs[sh]) === sh ? asTheirs(defs[sh]) : undefined;
      if (!to) continue;
      if (to === `c:${ship[sh][0].id}`) delete defs[sh]; else defs[sh] = to;   // its own first is the default anyway
      changed = true;
    }
    // a token's: and a design chosen that the token has by default anyway isn't one of its own
    // (characters first: their linked tokens take theirs)
    const valid = (sh: TokenShape, ref: string | undefined) => !!ref && (ref.startsWith("c:") ? ship[sh].some((x) => `c:${x.id}` === ref) : mine[sh].some((d) => `u:${d.id}` === ref));
    const byDefault = (k: string, sh: TokenShape) => {
      const char = k.startsWith("r:") ? own[`c:${roleIdOf(k)}`]?.style : undefined;
      return valid(sh, char) ? char! : valid(sh, defs[sh]) ? defs[sh]! : `c:${ship[sh][0].id}`;
    };
    for (const k of Object.keys(own).sort((a, b) => Number(a.startsWith("r:")) - Number(b.startsWith("r:")))) {
      const o = own[k], sh = shapeOfMine(o?.style), to = asTheirs(o?.style);
      if (!sh || !to) continue;
      o.style = to;
      if (to === byDefault(k, sh)) { delete o.style; if (!Object.keys(o).length) delete own[k]; }
      changed = true;
    }
    if (changed) { storeJSON(`${p}design-defaults`, defs); storeJSON(`${p}design-tokens`, own); }
  }
  // yours that print as one of a collection's, and nothing uses any more, go
  const used = new Set<string>();
  for (const p of prefixes) {
    for (const r of Object.values(loadJSON<Record<string, string>>(`${p}design-defaults`, {}))) used.add(r);
    for (const o of Object.values(loadJSON<Record<string, TokenOverride>>(`${p}design-tokens`, {}))) if (o?.style) used.add(o.style);
  }
  const all = [BOTC_STYLES, basicStyles(), Object.fromEntries(SHAPES.map((sh) => [sh, appDesigns(sh)])) as Record<TokenShape, StyleDef[]>, ...theirs.values()];
  let gone = false;
  for (const sh of SHAPES) {
    const keep = mine[sh].filter((d) => used.has(`u:${d.id}`) || !all.some((s) => s[sh].some((x) => printsAsDef(sh, d.spec, x, []))));
    if (keep.length !== mine[sh].length) { mine[sh] = keep; gone = true; }
  }
  // then every copy left, as asked: one of yours that prints as a collection's own, or is named after
  // one with its collection's name after it ("Parchment (Draw Steel)"), goes even where it's used;
  // what used it takes its collection's default (or the token its design by default)
  const shipped = new Set(all.flatMap((st) => SHAPES.flatMap((sh) => (st[sh] ?? []).flatMap((x) => (typeof x.name === "string" ? [x.name] : Object.values(x.name ?? {}))))));
  const isCopy = (sh: TokenShape, d: MyDesign) => all.some((st) => (st[sh] ?? []).some((x) => printsAsDef(sh, d.spec, x, [])))
    || (() => { const m = d.name.match(/^(.*) \(([^()]+)\)$/); return !!m && shipped.has(m[1]); })();
  const dropped = new Set<string>();
  for (const sh of SHAPES) {
    const keep = mine[sh].filter((d) => !isCopy(sh, d) || (dropped.add(`u:${d.id}`), false));
    if (keep.length !== mine[sh].length) { mine[sh] = keep; gone = true; }
  }
  if (dropped.size) for (const p of prefixes) {
    const defs = loadJSON<Partial<Record<TokenShape, string>>>(`${p}design-defaults`, {});
    const own = loadJSON<Record<string, TokenOverride>>(`${p}design-tokens`, {});
    for (const sh of SHAPES) if (defs[sh] && dropped.has(defs[sh]!)) delete defs[sh];
    for (const k of Object.keys(own)) { const o = own[k]; if (o?.style && dropped.has(o.style)) { delete o.style; if (!Object.keys(o).length) delete own[k]; } }
    storeJSON(`${p}design-defaults`, defs); storeJSON(`${p}design-tokens`, own);
  }
  if (gone) storeJSON(MY_DESIGNS_KEY, mine);
  if (known) storeJSON(TIDIED_KEY, 1);
}
