// AuthPort on Firebase Authentication: Google sign-in in a popup.
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { app } from "./firebase-app.ts";
import type { AuthPort } from "../ports.ts";

const auth = getAuth(app);

export const firebaseAuth: AuthPort = {
  onUser: (fn) => { onAuthStateChanged(auth, (u) => fn(u && { uid: u.uid, email: u.email, photoURL: u.photoURL })); },
  signIn: () => signInWithPopup(auth, new GoogleAuthProvider()).then(
    () => "ok" as const,
    (e) => { if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return "cancelled" as const; throw e; }),
  signInWithKey: (email, key) => signInWithEmailAndPassword(auth, email, key).then(() => true, (e) => {
    if (["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials", "auth/user-not-found"].includes(e?.code)) return false;
    throw e;
  }),
  signOut: () => signOut(auth),
};
