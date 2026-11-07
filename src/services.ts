// The composition root: which adapter serves each port, and the app's rules around them
// (who the admin is, how the library is ordered, what an upload must hold).
// The adapters are loaded only when needed: a collection of your own or the Taller never
// downloads Firebase; Clocktower loads the role library, and sign-in only for the admin.
import type { AppUser, AuthPort, KeyValueStore, RoleLibraryPort } from "./ports.ts";
import type { Role } from "./types.ts";
import { webStorage } from "./adapters/web-storage.ts";

// ------------------------------------------------------------ what this browser keeps

/** What stays in this browser (collections, designs, scripts, choices). */
export const local: KeyValueStore = webStorage(() => localStorage);
/** What lasts only while this tab is open. */
export const session: KeyValueStore = webStorage(() => sessionStorage);

/** A kept value read back; `fallback` when there's none or it isn't JSON. */
export function readJSON<T>(key: string, fallback: T, from = local): T {
  const s = from.get(key);
  if (s == null) return fallback;
  try { return (JSON.parse(s) as T) ?? fallback; } catch { return fallback; }
}
/** Keeps a value; false if it couldn't (storage full or unavailable). */
export function writeJSON(key: string, value: unknown, to = local): boolean {
  let s: string;
  try { s = JSON.stringify(value); } catch { return false; }
  return to.set(key, s);
}

const authAdapter = (): Promise<AuthPort> => import("./adapters/firebase-auth.ts").then((m) => m.firebaseAuth);
const rolesAdapter = (): Promise<RoleLibraryPort> => import("./adapters/firebase-roles.ts").then((m) => m.firestoreRoles);

// ------------------------------------------------------------ the admin

/** The admin: its Firebase account id (firestore.rules says the same). */
export const ADMIN_UID = "ZF6TRxFCPNh6Bjvg7rbv5mAD0x83";
export const isAdmin = (user: AppUser | null | undefined) => user?.uid === ADMIN_UID;

// Whether this browser has a sign-in to restore: then (or on ?admin) the sign-in adapter loads;
// otherwise no one is signed in, and nothing is downloaded to find that out.
const SESSION_KEY = "tesserae-admin-session";
const hasSession = () => local.get(SESSION_KEY) === "1";
const markSession = (on: boolean) => { if (on) local.set(SESSION_KEY, "1"); else local.remove(SESSION_KEY); };

export function onUser(fn: (user: AppUser | null) => void, wanted = false) {
  if (!wanted && !hasSession()) { setTimeout(() => fn(null), 0); return; }
  authAdapter().then((a) => a.onUser((u) => { markSession(!!u); if (canSeeBotc(u)) local.set(BOTC_KEY, "1"); else local.remove(BOTC_KEY); fn(u); }), () => fn(null));
}
export async function signIn() {
  const r = await (await authAdapter()).signIn();
  if (r === "ok") markSession(true);
  return r;
}
// Clocktower is private until The Pandemonium Institute says otherwise: its library is read only by
// the admin and by a shared account whose key is given to whoever may use it. This browser
// remembers that it has it, so the collection shows in the lists (the data stays behind the rules).
export const BOTC_EMAIL = "clocktower@tesserae-faber.web.app";
const BOTC_KEY = "tesserae-botc-access";
export const canSeeBotc = (user: AppUser | null | undefined) => isAdmin(user) || user?.email?.toLowerCase() === BOTC_EMAIL;
export const botcUnlocked = () => local.get(BOTC_KEY) === "1";
/** Opens Clocktower with its key; false when the key is wrong. */
export async function unlockBotc(key: string) {
  const ok = await (await authAdapter()).signInWithKey(BOTC_EMAIL, key.trim().toUpperCase());
  if (ok) { markSession(true); local.set(BOTC_KEY, "1"); }
  return ok;
}

export async function signOut() {
  markSession(false);
  await (await authAdapter()).signOut();
}

// ------------------------------------------------------------ the role library

const TEAM_ORDER = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];
export const roleId = (en: string) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** The library, by team and then by name. */
export async function loadRoles(): Promise<Role[]> {
  const roles = await (await rolesAdapter()).list();
  return roles.sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || a.en.localeCompare(b.en));
}

/** Admin: writes the roles of a roles_game_icons.json file into the library. */
export async function uploadRoles(roles: Partial<Role>[], onProgress: (done: number, total: number) => void = () => {}) {
  const valid = roles.filter((r) => r && typeof r.en === "string" && typeof r.team === "string" && typeof r.body === "string");
  if (!valid.length) throw new Error("the file has no roles in the expected format (en, es, team, icon, author, g, body)");
  await (await rolesAdapter()).put(valid.map((r) => ({
    id: roleId(r.en!), en: r.en!, es: r.es || r.en, names: r.names || {}, fem: r.fem || {},
    team: r.team!, edition: r.edition || "", reminders: r.reminders || { en: [], es: [] },
    icon: r.icon || "", author: r.author || "", g: r.g || "", body: r.body,
  })), onProgress);
  return valid.length;
}
