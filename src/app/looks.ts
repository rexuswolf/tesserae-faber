// A design's look, field by field: reading, comparing and changing one field.
import type { SpecInput, TokenSpec, TokenShape, LookChanges, ColourRef, SpecColours } from "../types.ts";
import { DEFAULT_SPEC, SHAPE_FEATURES, normalizeSpec, reliefOf, hasRelief, cardBackOf } from "../engine/token-engine.ts";
import type { Fields } from "./context.ts";

// ------------------------------------------------------------ looks, field by field
//
// A token's own changes are kept field by field over its design, so whatever else the design
// becomes still reaches it.

/** Spec fields that aren't the look: the language and icon are the token's; the rest only notes. */
const NOT_LOOK = new Set(["lang", "icon", "preset", "fromPreset", "windowFinish", "windowDepth", "colours"]);
/** A spec with every field, to compare two of them field by field. */
export const filled = (s: SpecInput): TokenSpec => ({ ...DEFAULT_SPEC, ...s, colours: { ...DEFAULT_SPEC.colours, ...s.colours } }) as TokenSpec;
/** The same value, whatever order its keys were written in. */
export function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)])) : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
/** The look fields where two specs differ: "frame", "backFace", "colours.front"… */
export function lookDiff(a: SpecInput, b: SpecInput): string[] {
  const fa = filled(a) as unknown as Fields, fb = filled(b) as unknown as Fields, out: string[] = [];
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) if (!NOT_LOOK.has(k) && !sameValue(fa[k], fb[k])) out.push(k);
  const ca = fa.colours as Fields, cb = fb.colours as Fields;
  for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)])) if (ca[k] !== cb[k]) out.push(`colours.${k}`);
  return out;
}
/** Two looks that are the same, field by field. */
/**
 * What of a look prints on a shape: its fields filled in, but for what the shape hasn't
 * (SHAPE_FEATURES: a coin's ring base and mark between names; a ring's or card's magnet and back)
 * and what doesn't show (a magnet's size without a magnet, an uploaded back that isn't the back,
 * a back face's own look while the back is a design, how high relief stands with none raised).
 * Styles took such fields from the style they were made over (the magnet, the ring base, an
 * uploaded back: STYLE_KEEPS), so a collection's style kept that way differs from it only there.
 */
function printedLook(shape: TokenShape, spec: SpecInput): Fields {
  const f = SHAPE_FEATURES[shape], u = normalizeSpec(spec), s = filled(u) as unknown as Fields, c = { ...(s.colours as Fields) };
  for (const k of NOT_LOOK) delete s[k];
  if (!f.ringBase) delete s.ringBase;
  if (!f.separator) delete s.separator;
  if (!f.magnet) { delete s.magnet; delete s.magnetSize; } else if (s.magnet === "none") delete s.magnetSize;
  // a card's icon and back are its own (cardIcon…, cardBack): no other shape has them, and a card no coin back
  if (shape !== "card") { delete s.cardIcon; delete s.cardIconSize; delete s.cardJoin; delete s.cardBack; }
  else {
    if (s.cardIcon === "none") { delete s.cardIconSize; delete s.cardJoin; } else if (s.cardIcon === "only") delete s.cardJoin;
    if ((s.cardBack as SpecInput["cardBack"])?.on) s.cardBack = cardBackOf(u);
    else { delete s.cardBack; delete c.backBase; }
    delete s.back; delete s.backMode; delete s.backFace; delete s.customSvg; delete c.back;
  }
  if (!f.back) { delete s.back; delete s.backMode; delete s.backFace; delete s.customSvg; delete c.back; }
  else if (shape !== "card") {
    if (s.back !== "custom" && (s.backFace as SpecInput["backFace"])?.art !== "custom") delete s.customSvg;
    if (s.backMode !== "match" && s.backMode !== "own") delete s.backFace;
  }
  const raised: string[] = f.relief, relief = Object.fromEntries(Object.entries(reliefOf(u)).filter(([k]) => raised.includes(k)));
  s.relief = relief;
  const backRaised = (s.backMode === "match" || s.backMode === "own") && hasRelief(s.backFace as SpecInput | undefined);
  if (!Object.values(relief).some(Boolean) && !backRaised) { delete s.reliefHeight; delete s.reliefBevel; }
  s.colours = c;
  return s;
}
/** Two looks that print the same on a shape (printedLook). */
const samePrint = (shape: TokenShape, a: SpecInput, b: SpecInput) => sameValue(printedLook(shape, a), printedLook(shape, b));
/**
 * One design in place of another changes nothing printed: they print the same, and so do the
 * tokens' own changes over each (a token's own back made an uploaded one, say, shows the design's).
 */
export const printsAs = (shape: TokenShape, a: TokenSpec, b: TokenSpec, looks: LookChanges[]) =>
  samePrint(shape, a, b) && looks.every((l) => samePrint(shape, applyLook(a, l), applyLook(b, l)));
/**
 * A spec kept before a coin's frame could start in from its edge (it hasn't frameInset) as it compares
 * with a collection's design: with the design's. One kept untouched before Clocktower's frames moved
 * in 0.8 mm is that design still, and prints as the design now does, not as one of its own.
 */
export const keptBefore = (spec: TokenSpec, design: TokenSpec): TokenSpec =>
  (spec.frameInset === undefined && design.frameInset !== undefined ? { ...spec, frameInset: design.frameInset } : spec);
/** A look field of a spec ("frame", "colours.base"). */
export const fieldOf = (s: SpecInput, f: string): unknown => (f.startsWith("colours.") ? (s.colours as Fields | undefined)?.[f.slice(8)] : (s as Fields)[f]);
/** Sets a look field on a spec; nothing (or null, but for the uploaded back) takes it out, so the default holds. */
export function setField(s: TokenSpec, f: string, v: unknown) {
  if (f.startsWith("colours.")) { s.colours = { ...s.colours, [f.slice(8)]: v as ColourRef }; return; }
  if (v === undefined || (v === null && f !== "customSvg")) delete (s as unknown as Fields)[f];
  else (s as unknown as Fields)[f] = structuredClone(v);
}
/** A token's changes with one more field (null: the token hasn't the field its design has). */
export function withLookField(look: LookChanges, f: string, v: unknown): LookChanges {
  if (f.startsWith("colours.")) return { ...look, colours: { ...look.colours, [f.slice(8)]: v as ColourRef } };
  return { ...look, [f]: v === undefined ? null : structuredClone(v) };
}
/** A token's changes without a field. */
export function withoutLookField(look: LookChanges, f: string): LookChanges {
  const next = structuredClone(look);
  if (f.startsWith("colours.")) { if (next.colours) { delete next.colours[f.slice(8) as keyof SpecColours]; if (!Object.keys(next.colours).length) delete next.colours; } }
  else delete (next as Fields)[f];
  return next;
}
/** The fields a token's changes set. */
export const lookFields = (look: LookChanges | undefined) => !look ? [] : [...Object.keys(look).filter((k) => k !== "colours"), ...Object.keys(look.colours ?? {}).map((c) => `colours.${c}`)];
/** A design's look with a token's changes over it. */
export function applyLook(spec: TokenSpec, look: LookChanges | undefined): TokenSpec {
  if (!look) return spec;
  const s = structuredClone(spec);
  for (const f of lookFields(look)) setField(s, f, fieldOf(look as SpecInput, f));
  return s;
}
/** A token's changes as they differ from its design: those the design has anyway go. */
export function prunedLook(spec: TokenSpec, look: LookChanges): LookChanges | undefined {
  const mine = filled(applyLook(spec, look)), theirs = filled(spec);
  let next = look;
  for (const f of lookFields(look)) if (sameValue(fieldOf(mine, f), fieldOf(theirs, f))) next = withoutLookField(next, f);
  return lookFields(next).length ? next : undefined;
}
/** A whole spec as changes over a design: what a token's own design was before styles. */
export function lookFrom(style: TokenSpec, spec: TokenSpec): LookChanges {
  let look: LookChanges = {};
  for (const f of lookDiff(style, spec)) look = withLookField(look, f, fieldOf(spec, f));
  return look;
}
