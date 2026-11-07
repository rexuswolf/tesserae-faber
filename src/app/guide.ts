// How it works: the first-visit guide.
import { $, hit } from "./context.ts";
import { local } from "../services.ts";
import { uiLang, t } from "../i18n.ts";
import { drawer } from "./scripts-ui.ts";
import { plateEstimates, goStep, designToken, queuePlan } from "./queue.ts";

// ------------------------------------------------------------ how it works

// A short guide: the three steps, each with a picture of the app in the interface language.
// It opens by itself on a first visit; the "?" in the top bar opens it again.
const GUIDE_KEY = "midnight-mint-guide-seen", GUIDE_STEPS = 3;
export const guide: { at: number; wired?: boolean } = { at: 0 };
function openGuide() {
  guide.at = 0;
  renderGuide();
  $<HTMLDialogElement>("#guide").showModal();
  local.set(GUIDE_KEY, "1");
}
function renderGuide() {
  const i = guide.at + 1, lang = uiLang();
  $("#guideKicker").textContent = t("guide.kicker", { i, n: GUIDE_STEPS, name: t(`flow.step${i}`) });
  $("#guideTitle").textContent = t(`guide.title${i}`);
  $("#guideText").textContent = t(`guide.text${i}`);
  const img = $<HTMLImageElement>("#guideShot");
  img.src = `/guide/${lang === "es" ? "es" : "en"}-${i}.jpg`;
  img.alt = t(`guide.alt${i}`);
  $("#guideBack").hidden = guide.at === 0;
  $("#guideNext").textContent = t(i === GUIDE_STEPS ? "guide.done" : "guide.next");
  $("#guideDots").innerHTML = Array.from({ length: GUIDE_STEPS }, (_, k) => `<i${k === guide.at ? ' class="on"' : ""}></i>`).join("");
}
export function wireGuide() {
  document.addEventListener("click", (e) => { if (hit(e, "[data-guide]")) { e.preventDefault(); drawer(false); if ($<HTMLDialogElement>("#credits").open) $<HTMLDialogElement>("#credits").close(); openGuide(); } });
  $("#guideBack").onclick = () => { guide.at = Math.max(0, guide.at - 1); renderGuide(); };
  $("#guideNext").onclick = () => { if (guide.at < GUIDE_STEPS - 1) { guide.at++; renderGuide(); } else $<HTMLDialogElement>("#guide").close(); };
  $("#guide").addEventListener("click", (e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });   // backdrop
  const seen = local.get(GUIDE_KEY);
  // A first visit opens it, unless it came with a shared script, which opens its own invite.
  if (!seen && !location.hash.startsWith("#s=")) openGuide();
}

// The UI test server drives the flow through these.
declare global {
  interface Window { __mm: { goStep: (step: number) => void; designToken: (key: string) => void; estimates: () => ReturnType<typeof plateEstimates> } }
}
window.__mm = { goStep, designToken, estimates: () => plateEstimates(queuePlan()) };
