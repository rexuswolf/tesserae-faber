// Firebase: Google sign-in, the invite list, the role library and saved designs.
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import config from "./firebase-config.json";

export const ADMIN_EMAIL = "admin@example.invalid";

const app = initializeApp(config);
const auth = getAuth(app);
// Cache on the device, so the 181-role library is downloaded once, not on every visit.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

export const onUser = (fn) => onAuthStateChanged(auth, fn);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);
export const isAdmin = (user) => user?.email?.toLowerCase() === ADMIN_EMAIL;

/** True when this person may use the app. */
export async function isInvited(user) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const snap = await getDoc(doc(db, "allowlist", user.email.toLowerCase()));
  return snap.exists();
}

// ------------------------------------------------------------ role library

const TEAM_ORDER = ["townsfolk", "outsider", "minion", "demon", "traveller", "fabled", "loric"];
export const roleId = (en) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function loadRoles() {
  const snap = await getDocs(collection(db, "roles"));
  const roles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  roles.sort((a, b) => TEAM_ORDER.indexOf(a.team) - TEAM_ORDER.indexOf(b.team) || a.en.localeCompare(b.en));
  return roles;
}

/** Admin: replaces the role library with the contents of roles_data.json. */
export async function uploadRoles(roles, onProgress = () => {}) {
  const valid = roles.filter((r) => r && typeof r.en === "string" && typeof r.team === "string" && typeof r.body === "string");
  if (!valid.length) throw new Error("the file has no roles in the expected format (en, es, team, icon, author, g, body)");
  for (let i = 0; i < valid.length; i += 50) {
    const batch = writeBatch(db);
    for (const r of valid.slice(i, i + 50)) {
      batch.set(doc(db, "roles", roleId(r.en)), {
        en: r.en, es: r.es || r.en, team: r.team, edition: r.edition || "", reminders: r.reminders || { en: [], es: [] },
        icon: r.icon || "", author: r.author || "", g: r.g || "", body: r.body,
      });
    }
    await batch.commit();
    onProgress(Math.min(i + 50, valid.length), valid.length);
  }
  return valid.length;
}



// ------------------------------------------------------------ invites

export async function listInvites() {
  const snap = await getDocs(collection(db, "allowlist"));
  return snap.docs.map((d) => ({ email: d.id, ...d.data() }));
}
export async function addInvite(email) {
  const address = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error(`"${email}" isn't an email address`);
  await setDoc(doc(db, "allowlist", address), { addedAt: serverTimestamp() });
  return address;
}
export const removeInvite = (email) => deleteDoc(doc(db, "allowlist", email));

// ------------------------------------------------------------ saved designs

const designs = (uid) => collection(db, "users", uid, "designs");

export async function listDesigns(uid) {
  const snap = await getDocs(query(designs(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function saveDesign(uid, design, id) {
  const ref = id ? doc(designs(uid), id) : doc(designs(uid));
  await setDoc(ref, { ...design, updatedAt: serverTimestamp() });
  return ref.id;
}
export const deleteDesign = (uid, id) => deleteDoc(doc(designs(uid), id));
