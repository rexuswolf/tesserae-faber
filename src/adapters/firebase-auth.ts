// AuthPort on Firebase Authentication: Google sign-in in a popup.
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { app } from "./firebase-app.ts";
import type { AuthPort } from "../ports.ts";
import posthog, { posthogEnabled } from "../posthog.ts";

const auth = getAuth(app);
let identifiedUid: string | null = null;

/** Keeps PostHog identity in lockstep with Firebase's persisted auth state. */
function syncPosthogIdentity(user: User | null) {
  if (!posthogEnabled) return;
  if (!user) {
    if (identifiedUid) posthog.reset();
    identifiedUid = null;
    return;
  }
  if (identifiedUid === user.uid) return;
  if (identifiedUid) posthog.reset();
  posthog.identify(user.uid, user.email ? { email: user.email } : undefined);
  identifiedUid = user.uid;
}

export const firebaseAuth: AuthPort = {
  onUser: (fn) => { onAuthStateChanged(auth, (u) => { syncPosthogIdentity(u); fn(u && { uid: u.uid, email: u.email, photoURL: u.photoURL }); }); },
  signIn: () => signInWithPopup(auth, new GoogleAuthProvider()).then(
    () => "ok" as const,
    (e) => { if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return "cancelled" as const; throw e; }),
  signInWithKey: (email, key) => signInWithEmailAndPassword(auth, email, key).then(() => true, (e) => {
    if (["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials", "auth/user-not-found"].includes(e?.code)) return false;
    throw e;
  }),
  signOut: () => signOut(auth),
};
