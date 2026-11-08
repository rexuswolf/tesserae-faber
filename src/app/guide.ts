// How it works: the front page's walkthrough, from anywhere in the app.
import { hit } from "./context.ts";
import { plateEstimates, goStep, designToken, queuePlan } from "./queue.ts";

/** Where "How it works" goes: the front page, at its first chapter (it explains making, designing and printing). */
export const GUIDE_HREF = "/#tourPick";
export const guide: { wired?: boolean } = {};
export function wireGuide() {
  document.addEventListener("click", (e) => { if (hit(e, "[data-guide]")) { e.preventDefault(); location.href = GUIDE_HREF; } });
}

// The UI test server drives the flow through these.
declare global {
  interface Window { __mm: { goStep: (step: number) => void; designToken: (key: string) => void; estimates: () => ReturnType<typeof plateEstimates> } }
}
window.__mm = { goStep, designToken, estimates: () => plateEstimates(queuePlan()) };
