// Tokens: their keys, their text and the spec they print with.
import type { Role, TokenSpec } from "../types.ts";
import { langById, tokenLang } from "./token-language.ts";
import { TEAM_ORDER, state } from "./context.ts";
import { tokenRole, tokenRem } from "./queue.ts";
import { roleName, DEFAULT_SPEC, reminderSpec } from "../engine/token-engine.ts";
import { lookOf } from "./designs.ts";
import { t } from "../i18n.ts";
import { FILAMENT_SLOTS } from "../bambu/plates.ts";

// ------------------------------------------------------------ tokens: keys, text, style

export const charKey = (role: Role) => `c:${role.id}`;
export const remKey = (role: Role, i: number) => `r:${role.id}:${i}`;
/** Characters by team, then alphabetically by the name the token shows. */
// The token language is a translation id ("es-bumble3ee"); collation needs its language ("es").
// Numbers go by their value: "Damage 5" before "Damage 10".
const collators = new Map<string, Intl.Collator>();
export const collator = (lang = langById(tokenLang()).lang) => collators.get(lang) ?? collators.set(lang, new Intl.Collator(lang, { sensitivity: "base", numeric: true })).get(lang)!;
const byName = (a: Role, b: Role) => collator().compare(textFor(charKey(a), a, null), textFor(charKey(b), b, null));
const byTeamName = (a: Role, b: Role) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || byName(a, b);
/** Token keys in sheet order: team, name, the character before its reminders. */
export const sortKeys = (keys: Iterable<string>) => [...keys].sort((a, b) => byTeamName(tokenRole(a), tokenRole(b)) || (tokenRem(a) ?? -1) - (tokenRem(b) ?? -1));
export const remindersOf = (role: Role, lang = tokenLang()): string[] => role.reminders?.[lang] || role.reminders?.en || [];
/** The character's name in the token language, in its feminine form when the token asks for it. */
export const charName = (role: Role, key = charKey(role), lang = tokenLang()) =>
  (state.overrides.get(key)?.fem && role.fem?.[lang]) || roleName(role, lang);

/** A character's own icon (on its token; its reminders share it), or undefined. */
export const ownIcon = (roleId: string) => state.overrides.get(`c:${roleId}`)?.icon;
export const roleIdOf = (key: string) => key.split(":")[1];
/** The design a token uses: its style's look with its own changes; reminders get the reminder layout. */
export function specFor(key: string, isReminder: boolean): TokenSpec {
  const base = lookOf(key);
  const spec = { ...DEFAULT_SPEC, ...base, colours: { ...DEFAULT_SPEC.colours, ...base.colours }, lang: tokenLang(), icon: ownIcon(roleIdOf(key)) };
  return isReminder ? reminderSpec(spec) : spec;
}
/**
 * A token as the catalog has it, for step 1 (Pick): the default design with the character's
 * own name and icon. Its style and own changes show in the queue and step 2.
 */
export const catalogSpec = (isReminder: boolean): TokenSpec => (isReminder ? reminderSpec({ ...DEFAULT_SPEC, lang: tokenLang() }) : { ...DEFAULT_SPEC, lang: tokenLang() });
export const catalogText = (role: Role, reminder: number | null) => (reminder != null ? remindersOf(role)[reminder] : listName(role));
/** A token's name in the lists: its own (a token of yours whose front says something else), else what it says. */
export const listName = (role: Role) => (role.listNames ? role.listNames[tokenLang()] || role.listNames.en || role.listNames.es || roleName(role, tokenLang()) : roleName(role, tokenLang()));
/** The text printed on a token. */
export function textFor(key: string, role: Role, reminder: number | null): string {
  const own = state.overrides.get(key)?.text;
  if (own != null && own !== "") return own;
  return reminder != null ? remindersOf(role)[reminder] : charName(role, key);
}
export const filamentName = (slot: number) => t(`filament.${FILAMENT_SLOTS[slot].name}`);
