// Test adapter for AuthPort (src/ports.ts): signed in as the admin only with ?admin.
// The admin's address is the app's (src/services.ts decides who the admin is).
const AVATAR = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#4a2340"/><text x="16" y="21" font-family="Georgia,serif" font-size="15" text-anchor="middle" fill="#efe6d6">F</text></svg>');
const user = { uid: "ZF6TRxFCPNh6Bjvg7rbv5mAD0x83", email: "admin@example.com", photoURL: AVATAR };
// signed in as the admin with ?admin; as Clocktower's shared account once its key ("TEST-KEY") is given
// (the shared account's sign-in kept in this browser, as Firebase keeps it)
const kept = () => { try { return localStorage.getItem("mock-shared-account"); } catch { return null; } };
let current = new URLSearchParams(location.search).has("admin") ? user : kept() ? { uid: "shared", email: kept(), photoURL: null } : null;
const listeners = [];
const tell = () => listeners.forEach((fn) => fn(current));
export const firebaseAuth = {
  onUser: (fn) => { listeners.push(fn); setTimeout(() => fn(current), 0); },
  signIn: async () => "ok",
  signInWithKey: async (email, key) => { if (key !== "TEST-KEY") return false; current = { uid: "shared", email, photoURL: null }; try { localStorage.setItem("mock-shared-account", email); } catch { /* none */ } tell(); return true; },
  signOut: async () => { current = null; try { localStorage.removeItem("mock-shared-account"); } catch { /* none */ } tell(); },
};
