// Test adapter for AuthPort (src/ports.ts): signed in as the admin only with ?admin.
// The admin's address is the app's (src/services.ts decides who the admin is).
const AVATAR = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#4a2340"/><text x="16" y="21" font-family="Georgia,serif" font-size="15" text-anchor="middle" fill="#efe6d6">F</text></svg>');
const user = { email: "admin@example.invalid", photoURL: AVATAR };
const signedIn = new URLSearchParams(location.search).has("admin");
export const firebaseAuth = {
  onUser: (fn) => setTimeout(() => fn(signedIn ? user : null), 0),
  signIn: async () => "ok",
  signOut: async () => {},
};
