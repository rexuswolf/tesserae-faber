// Firebase: the public role library, and Google sign-in for the admin (the only account that can upload).
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, writeBatch,
} from "firebase/firestore";
import config from "./firebase-config.json";
import type { Role } from "./types.ts";

export const ADMIN_EMAIL = "admin@example.invalid";

const app = initializeApp(config);
const auth = getAuth(app);
// Cache on the device, so the 181-role library is downloaded once, not on every visit.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

export const onUser = (fn: (user: User | null) => void) => onAuthStateChanged(auth, fn);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);
export const isAdmin = (user: { email?: string | null } | null | undefined) => user?.email?.toLowerCase() === ADMIN_EMAIL;


// ------------------------------------------------------------ role library

const TEAM_ORDER = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];
export const roleId = (en: string) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function loadRoles(): Promise<Role[]> {
  const snap = await getDocs(collection(db, "roles"));
  const roles = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Role);
  roles.sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || a.en.localeCompare(b.en));
  return roles;
}

/** Admin: replaces the role library with the contents of roles_data.json. */
export async function uploadRoles(roles: Partial<Role>[], onProgress: (done: number, total: number) => void = () => {}) {
  const valid = roles.filter((r) => r && typeof r.en === "string" && typeof r.team === "string" && typeof r.body === "string");
  if (!valid.length) throw new Error("the file has no roles in the expected format (en, es, team, icon, author, g, body)");
  for (let i = 0; i < valid.length; i += 50) {
    const batch = writeBatch(db);
    for (const r of valid.slice(i, i + 50)) {
      batch.set(doc(db, "roles", roleId(r.en!)), {
        en: r.en, es: r.es || r.en, names: r.names || {}, fem: r.fem || {},
        team: r.team, edition: r.edition || "", reminders: r.reminders || { en: [], es: [] },
        icon: r.icon || "", author: r.author || "", g: r.g || "", body: r.body,
      });
    }
    await batch.commit();
    onProgress(Math.min(i + 50, valid.length), valid.length);
  }
  return valid.length;
}
