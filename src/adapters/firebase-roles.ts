// RoleLibraryPort on Firestore: one document per role in "roles", kept on the device
// so the library is downloaded once, not on every visit.
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { app } from "./firebase-app.ts";
import type { RoleLibraryPort } from "../ports.ts";
import type { Role } from "../types.ts";

const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

export const firestoreRoles: RoleLibraryPort = {
  async list() {
    const snap = await getDocs(collection(db, "roles"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Role);
  },
  async put(roles, onProgress) {
    for (let i = 0; i < roles.length; i += 50) {   // a batch holds up to 500 writes; 50 keeps the progress moving
      const batch = writeBatch(db);
      for (const { id, ...data } of roles.slice(i, i + 50)) batch.set(doc(db, "roles", id), data);
      await batch.commit();
      onProgress(Math.min(i + 50, roles.length), roles.length);
    }
  },
};
