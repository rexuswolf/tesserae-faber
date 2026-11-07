// AuthPort on Firebase Authentication: Google sign-in in a popup.
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { app } from "./firebase-app.ts";
import type { AuthPort } from "../ports.ts";

const auth = getAuth(app);

export const firebaseAuth: AuthPort = {
  onUser: (fn) => { onAuthStateChanged(auth, (u) => fn(u && { email: u.email, photoURL: u.photoURL })); },
  signIn: () => signInWithPopup(auth, new GoogleAuthProvider()).then(
    () => "ok" as const,
    (e) => { if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return "cancelled" as const; throw e; }),
  signOut: () => signOut(auth),
};
