// What changed, said once: each part of the page that shows it listens and redraws itself, so a
// change doesn't need to know who shows it, and a new view only has to listen.
//   picks  what's picked (the sheet, the spine, the queue; and it's kept)
//   looks  a design, or a token's own look (the sheet, the spine, the queue)
//   all    the language, the collection or your designs: every view
export type Change = "picks" | "looks" | "all";

const listeners = new Map<Change, (() => void)[]>();

/** Calls `fn` whenever `what` changes (in the order the parts of the app started listening). */
export function on(what: Change, fn: () => void) {
  if (!listeners.has(what)) listeners.set(what, []);
  listeners.get(what)!.push(fn);
}
/** Says `what` changed: everything that shows it redraws. */
export function emit(what: Change) {
  for (const fn of listeners.get(what) ?? []) fn();
}
