// The composition root: which adapter serves each port, and the app's rules around them
// (who the admin is, how the library is ordered, what an upload must hold).
// The adapters are loaded only when needed: a collection of your own or the Taller never
// downloads Firebase; Clocktower loads the role library, and sign-in only for the admin.
import type { AppUser, AuthPort, RoleLibraryPort } from "./ports.ts";
import type { Role } from "./types.ts";

const authAdapter = (): Promise<AuthPort> => import("./adapters/firebase-auth.ts").then((m) => m.firebaseAuth);
const rolesAdapter = (): Promise<RoleLibraryPort> => import("./adapters/firebase-roles.ts").then((m) => m.firestoreRoles);

// ------------------------------------------------------------ the admin

export const ADMIN_EMAIL = "admin@example.invalid";
export const isAdmin = (user: AppUser | null | undefined) => user?.email?.toLowerCase() === ADMIN_EMAIL;

// Whether this browser has a sign-in to restore: then (or on ?admin) the sign-in adapter loads;
// otherwise no one is signed in, and nothing is downloaded to find that out.
const SESSION_KEY = "tesserae-admin-session";
const hasSession = () => { try { return localStorage.getItem(SESSION_KEY) === "1"; } catch { return false; } };
const markSession = (on: boolean) => { try { if (on) localStorage.setItem(SESSION_KEY, "1"); else localStorage.removeItem(SESSION_KEY); } catch { /* no storage */ } };

export function onUser(fn: (user: AppUser | null) => void, wanted = false) {
  if (!wanted && !hasSession()) { setTimeout(() => fn(null), 0); return; }
  authAdapter().then((a) => a.onUser((u) => { markSession(!!u); fn(u); }), () => fn(null));
}
export async function signIn() {
  const r = await (await authAdapter()).signIn();
  if (r === "ok") markSession(true);
  return r;
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
