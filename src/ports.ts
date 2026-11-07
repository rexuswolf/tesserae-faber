// The app's ports: what it needs from outside, in its own terms. The adapters in src/adapters/
// implement them (Firebase today); src/services.ts is the one place that picks which.
import type { Role } from "./types.ts";

/** Who is signed in, as far as the app cares. */
export interface AppUser { email: string | null; photoURL: string | null }

/** Signing in (only the admin does, to upload the library). */
export interface AuthPort {
  /** Calls `fn` with who is signed in now (null: no one), and again on every change. */
  onUser(fn: (user: AppUser | null) => void): void;
  /** "cancelled" when the person closed the sign-in window; other failures throw. */
  signIn(): Promise<"ok" | "cancelled">;
  signOut(): Promise<void>;
}

/** The public role library (Clocktower's characters). */
export interface RoleLibraryPort {
  /** Every role in the library, in no particular order. */
  list(): Promise<Role[]>;
  /** Writes these roles, each by its id (an existing one is replaced). */
  put(roles: Role[], onProgress: (done: number, total: number) => void): Promise<void>;
}
