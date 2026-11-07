// KeyValueStore on the browser's Web Storage (localStorage, sessionStorage). Storage can be
// missing or blocked (private windows, site data off) or full: reads then find nothing and
// writes say they failed, so the app carries on without it.
import type { KeyValueStore } from "../ports.ts";

export function webStorage(storage: () => Storage): KeyValueStore {
  return {
    get: (key) => { try { return storage().getItem(key); } catch { return null; } },
    set: (key, value) => { try { storage().setItem(key, value); return true; } catch { return false; } },
    remove: (key) => { try { storage().removeItem(key); } catch { /* no storage */ } },
    keys: () => { try { return Object.keys(storage()); } catch { return []; } },
  };
}

/** A store that lives only as long as the page: for tests, or a place with no Web Storage. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); return true; }, remove: (k) => { m.delete(k); }, keys: () => [...m.keys()] };
}
