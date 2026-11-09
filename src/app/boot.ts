// Loading: the gate (loading screen), starting the app and the admin's sign-in.
import { emit } from "./events.ts";
import { $, coll, READONLY, state, loadViewer, loadJSON, VIEW_KEY, setGateState, setColl } from "./context.ts";
import { signIn, loadRoles, isAdmin, signOut as signOutUser, onUser , canSeeBotc, unlockBotc} from "../services.ts";
import { t, uiLang } from "../i18n.ts";
import { handingOver } from "../handoff.ts";
import { OWN, nameIn, hasCcc, OWN_ID, builtInCollections, readBuiltIn, OWN_VIEW, rememberCollection, collectionRoles } from "../collection.ts";
import { applyOwnTheme, applyOwnBrand, renderOwnLanding, renderOwnHome, applyGroups, syncOwnChrome, catalogOf, typeOfView } from "./creator.ts";
import { tidyMyDesigns, loadDesigns } from "./designs.ts";
import { TALLER, openTaller } from "./taller.ts";
import { loadLibrary } from "../engine/token-engine.ts";
import { infoRoles } from "../info-tokens.ts";
import { syncHomebrew, scriptOf, openSharedScript, resumeHomebrew } from "./scripts-ui.ts";
import { openAdmin } from "./admin.ts";
import { wire } from "./wiring.ts";
import { charKey, sortKeys } from "./tokens.ts";
import { buildChoices } from "./workshop.ts";
import { loadPicks, persistPicks, goStep, isPicked, stepInUrl } from "./queue.ts";
import { takeReturn } from "./design-sheet.ts";
import { selectToken } from "./sheet.ts";
import { guide, wireGuide } from "./guide.ts";
import { posthogAppLogger } from "../posthog-logger.ts";

// ------------------------------------------------------------ gate

/** What the gate (the screen before the app) says, and the buttons it offers. */
interface GateAction { label: string; run: () => unknown }
export interface GateConfig { title: string; text?: string; action?: GateAction; secondary?: GateAction; /** A field for a key, its action the Enter key too. */ key?: boolean }

export function gate(cfg: GateConfig | (() => GateConfig)) {
  const { title, text = "", action, secondary, key } = typeof cfg === "function" ? cfg() : cfg;
  $("#gateKeyForm").hidden = !key;
  $<HTMLFormElement>("#gateKeyForm").onsubmit = (e) => { e.preventDefault(); action?.run(); };
  $("#app").hidden = true;
  $("#gate").hidden = false;
  $("#gateTitle").textContent = title;
  $("#gateText").textContent = text;
  // The language switch only matters once there's something to read or do.
  $(".gate-langs").hidden = !action && !secondary;
  for (const [el, c] of [[$("#gateAction"), action], [$("#gateSecondary"), secondary]] as [HTMLButtonElement, GateAction | undefined][]) {
    el.hidden = !c;
    if (c) { el.textContent = c.label; el.onclick = c.run; el.disabled = false; }
  }
}
function showGate(make: () => GateConfig) { setGateState(make); gate(make()); }

// Anyone can use the app without signing in. Only the admin signs in (to upload the
// library); the sign-in button shows when the page is opened with ?admin.
const ADMIN_ENTRY = new URLSearchParams(location.search).has("admin");
export const adminSignIn = () => signIn().catch((e) => { $("#gateText").textContent = t("gate.signInFailed", { message: (e as Error).message }); });

async function boot() {
  if (handingOver) return;   // handoff.ts is writing what came from the old address, then reloads: start nothing yet
  showGate(() => ({ title: OWN && coll.loader?.text ? nameIn(coll.loader.text, uiLang()) : t("gate.opening") }));
  if (OWN) {   // the collection's own line under the loading screen, and the community mark only if it asks for it
    $(".gate-card .ccc").hidden = !hasCcc(coll) && !coll.loader?.footer;   // the community-made line; the mark itself is in About
    if (coll.loader?.footer) $("#gateCcc").textContent = nameIn(coll.loader.footer, uiLang());
  }
  try {
    // a collection with an app of its own (Clocktower): there, at its one address
    if (OWN && OWN_ID) { const own = (await builtInCollections()).find((b) => b.id === OWN_ID && b.href); if (own) { location.replace(own.href! + location.hash); return; } }
    // a collection that comes with the app: read from its file, every time (it isn't kept here)
    if (READONLY) { const c = await readBuiltIn(OWN_ID!); if (c) { setColl(c); applyOwnTheme(); applyOwnBrand(); } }
    await tidyMyDesigns().catch((err) => console.error("tidyMyDesigns", err));   // once: your designs that are a collection's own, that one again (never in the way of opening)
    if (TALLER) { await openTaller(); return; }   // the Taller: designs, for every collection
    if (OWN && OWN_VIEW === "home") { renderOwnLanding(); return; }   // the front page
    if (OWN && (!OWN_ID || !coll.tokens.length)) { renderOwnHome(); return; }   // the list (or a collection that isn't there)
    if (OWN) rememberCollection(OWN_ID!);
    if (OWN) {   // your own collection: no library to fetch
      applyGroups();
      state.lib = await loadLibrary(collectionRoles(coll, uiLang()));
      setGateState(null);
      startApp();
      return;
    }
    if (!canSeeBotc(state.user)) return botcGate();   // private until TPI says otherwise: its key first
    const roles = await loadRoles();
    const broken = !roles.length ? "empty" : roles.some((r) => !r.body) ? "oldLibrary" : null;
    if (broken) return libraryGate(broken);
    state.lib = await loadLibrary(roles);
    state.lib!.roles.push(...infoRoles());   // the grimoire's info tokens: cards, an edition of their own
    syncHomebrew();                          // your scripts' own characters
    setGateState(null);
    startApp();
  } catch (err) {
    showGate(() => ({ title: t("gate.error.title"), text: t("gate.error.text", { message: (err as Error).message }), action: { label: t("gate.reload"), run: () => location.reload() } }));
  }
}
/** Clocktower is private: whoever has its key types it here, and the page opens. */
function botcGate() {
  const tryKey = async () => {
    const field = $<HTMLInputElement>("#gateKey"), key = field.value.trim();
    if (!key) { field.focus(); return; }
    $<HTMLButtonElement>("#gateAction").disabled = true;
    const ok = await unlockBotc(key).catch(() => false);
    if (ok) { location.reload(); return; }
    $("#gateText").textContent = t("botc.wrongKey");
    $<HTMLButtonElement>("#gateAction").disabled = false; field.select();
  };
  showGate(() => ({ title: t("botc.lockedTitle"), text: t("botc.lockedText"), key: true, action: { label: t("botc.unlock"), run: () => void tryKey() } }));
  $<HTMLInputElement>("#gateKey").focus();
}
/** The library is missing or out of date: the admin can fix it, everyone else waits. */
function libraryGate(kind: string) {
  showGate(() => (isAdmin(state.user)
    ? { title: t(`gate.${kind}.title`), text: t(`gate.${kind}.text`), action: { label: t("gate.empty.open"), run: openAdmin }, secondary: { label: t("gate.signOut"), run: signOutUser } }
    : ADMIN_ENTRY
      ? { title: t("gate.settingUp.title"), text: t("gate.settingUp.text"), action: { label: t("gate.signIn"), run: adminSignIn } }
      : { title: t("gate.settingUp.title"), text: t("gate.settingUp.text") }));
}

let firstAuth = true;
onUser((user) => {
  state.user = user;
  if (user && !canSeeBotc(user)) {
    // a session left from when the app needed sign-in: only the admin signs in now
    signOutUser();
    return;
  }
  if (firstAuth) { firstAuth = false; boot(); return; }
  if (state.lib) renderAccount();
  else boot();
}, ADMIN_ENTRY);

// ------------------------------------------------------------ app

export let started = false;
export const markStarted = () => { started = true; };
function startApp() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  renderAccount();
  if (!started) {
    started = true;
    loadViewer();
    wire();
  }
  const first = state.lib!.roles.find((r) => r.en === "Fortune Teller") || state.lib!.roles[0];
  if (OWN) syncOwnChrome();
  if (!state.sel) state.sel = { key: charKey(first), role: first, reminder: null };
  // back where you were: the same view and team filter, if it still exists
  const view = loadJSON<{ edition?: string; team?: unknown }>(VIEW_KEY, {});
  const known = (ed: string | undefined) => ed === "all" || (ed?.startsWith("k:") ? !!catalogOf(ed) : ed?.startsWith("t:") ? !!typeOfView(ed) : ed?.startsWith("s:") ? !!scriptOf(ed) : state.lib!.roles.some((r) => r.edition === ed));
  state.edition = known(view.edition) ? view.edition! : "all";
  state.team = typeof view.team === "string" ? view.team : "all";
  buildChoices();
  loadDesigns();
  state.pick = loadPicks();
  persistPicks();
  emit("all");
  // the step the address says (?disenar, ?imprimir), on the first token picked
  const asked = stepInUrl();
  goStep(1, "keep");
  // back from the Taller: where it was opened from (the design step, on the same token)
  const back = takeReturn();
  if (back?.step === 2 && state.pick.size) { if (back.sel && isPicked(back.sel)) selectToken(back.sel); goStep(2, "replace"); }
  else toStep(asked, "replace");
  if (!stepsWired) { stepsWired = true; window.addEventListener("popstate", () => { if (!TALLER) toStep(stepInUrl(), "keep"); }); }   // Back, Forward
  if (!OWN) { openSharedScript(); resumeHomebrew(); }
  if (!guide.wired) { guide.wired = true; wireGuide(); }
  posthogAppLogger.info("application ready", {
    collection_source: OWN ? "own" : "library",
    role_count: state.lib!.roles.length,
  });
}

/** The account corner: the admin's menu when signed in, a sign-in button only on ?admin. */
function renderAccount() {
  const admin = isAdmin(state.user);
  $(".me").hidden = !admin;
  $("#adminSignIn").hidden = admin || !ADMIN_ENTRY;
  if (admin) { $<HTMLImageElement>("#avatar").src = state.user!.photoURL || ""; $("#meEmail").textContent = state.user!.email ?? ""; }
}


let stepsWired = false;
/** To a step from the address (arriving, or Back and Forward): designing, the token it names, else the one shown or the first picked. */
function toStep({ step, key }: { step: number; key: string | null }, address: "replace" | "keep") {
  if (step === 2 && key && key !== state.sel?.key) selectToken(key);   // an unknown one is left alone
  if (step === 2 && !(state.sel && (state.sel.key === key || isPicked(state.sel.key))) && state.pick.size) selectToken(sortKeys(state.pick.keys())[0]);
  goStep(step, address);
}
