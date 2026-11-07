// The test server skips the first-visit guide (it would cover the app), unless the URL asks for it.
try { if (!location.hash.includes("guide")) localStorage.setItem("midnight-mint-guide-seen", "1"); } catch { /* no storage */ }
// Test double for src/firebase.ts: the local library; signed in as the admin only with ?admin.
// ?lang=en sets the interface language before the app starts (this module loads before i18n.js).
{ const l = new URLSearchParams(location.search).get("lang"); if (l) try { localStorage.setItem("midnight-mint-lang", l); } catch { /* none */ } }
export const ADMIN_EMAIL = "admin@example.com";
// A plain monogram avatar so screenshots don't show a broken image.
const AVATAR = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#4a2340"/><text x="16" y="21" font-family="Georgia,serif" font-size="15" text-anchor="middle" fill="#efe6d6">F</text></svg>');
const user = { uid: "test", email: ADMIN_EMAIL, photoURL: AVATAR };
const signedIn = new URLSearchParams(location.search).has("admin");
export const onUser = (fn) => setTimeout(() => fn(signedIn ? user : null), 0);
export const signIn = async () => {};
export const signOutUser = async () => {};
export const isAdmin = (u) => u?.email === ADMIN_EMAIL;
export const roleId = (en) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export async function loadRoles() {
  const roles = await (await fetch("/admin-data/roles_game_icons.json")).json();
  return roles.map((r) => ({ id: roleId(r.en), ...r }));
}
export const uploadRoles = async () => 0;

// Test-only scripted clicks, chosen by the URL hash, e.g. #search=envenen,select=c:poisoner,token,own,frame=clock,add
setTimeout(() => {
  const click = (sel) => document.querySelector(sel)?.click();
  // Steps come from the hash, or from ?t=… when the hash is taken (a shared script link, #s=…).
  const steps = new URLSearchParams(location.search).get("t") ?? (location.hash.startsWith("#s=") ? "" : location.hash.slice(1));
  for (const step of steps.split(",").filter(Boolean)) {
    const [k, v] = step.split("=");
    if (k === "lang") click(`[data-lang="${v}"]`);
    else if (k === "search") { const i = document.querySelector("#search"); i.value = decodeURIComponent(v); i.dispatchEvent(new Event("input")); }
    else if (k === "select") { window.__mm.goStep(2); window.__mm.designToken(v); }   // a token in step 2's workshop
    else if (k === "pick") click(`#rows [data-pick="${v}"]`);
    else if (k === "step") window.__mm.goStep(+v);
    else if (k === "ed") click(`#editions [data-ed="${v}"]`);
    else if (k === "token") click('.scope [data-tab="token"]');
    else if (k === "frame") click(`[data-choice="frame"] [data-v="${v}"]`);
    else if (k === "style") click(`[data-choice="style"] [data-v="${v}"]`);
    else if (k === "finish") click(`[data-choice="windowFinish"] [data-v="${v}"]`);
    else if (k === "addall") { click(`#rows .tok[data-pick="c:${v}"]`); for (let n = 0; n < 20; n++) { const b = document.querySelector(`#rows [data-pick-rems^="r:${v}:"][aria-pressed=false]`); if (!b) break; b.click(); } }   // a character and its reminders
    else if (k === "pickall") { click("#addBtn"); click(`#addMenu [data-a="${{ all: "both" }[v] || v}"]`); }   // chars | rems | all | none
    else if (k === "queue") click("#queueToggle");
    else if (k === "pdf") { window.__mm.goStep(3); click('#printPage [data-way="paper"]'); click("#flowNext"); }
    else if (k === "print") window.__mm.goStep(3);
    else if (k === "way") click(`#printPage [data-way="${v}"]`);
    else if (k === "printer") click(`#printPage [data-printer="${v}"]`);
    else if (k === "nozzle") click(`#printPage [data-nozzle="${v}"]`);
    else if (k === "go") click("#flowNext");
    else if (k === "stl") click("#download");
    else if (k === "design") click(`#presets [data-preset="${v}"]`);
    else if (k === "tlang" || k === "tlpick") {
      // Open the token language dialog, unfold every group, pick v; "tlang" also confirms.
      click("#tokenLangBtn");
      document.querySelectorAll('#tlangList [aria-expanded="false"]').forEach((g) => g.click());
      click(`#tlangList [data-id="${v}"]`);
      if (k === "tlang") click("#tlangUse");
    }
    else if (k === "tlopen") click("#tokenLangBtn");
    else if (k === "drawer") click("#drawerOpen");
    else if (k === "scriptsave") click("#scriptInviteSave");
    else if (k === "scriptnew") click("#scriptNew");
    else if (k === "fem") { const c = document.querySelector("#fem"); c.checked = true; c.dispatchEvent(new Event("change")); }
    else if (k === "credits") click("[data-credits]");
  }
}, 4000);

// Test-only: #pdfdump writes every downloaded PDF as base64 into <pre id="pdfdump"> (read it with --dump-dom)
if (location.hash.includes("pdfdump")) {
  const make = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    if (blob?.type === "application/pdf") blob.arrayBuffer().then((buf) => {
      const b = new Uint8Array(buf); let s = "";
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      const pre = document.createElement("pre"); pre.id = "pdfdump"; pre.textContent = "B64:" + btoa(s);
      document.body.append(pre);
    });
    return make(blob);
  };
}


// Test-only: #scrollws scrolls the workshop to the bottom
setTimeout(() => { if (location.hash.includes("scrollws")) document.querySelector("#workshop").scrollTop = 99999; }, 6000);

// Test-only: #preset=marfil applies a design; #showback opens the back section and scrolls to it
setTimeout(() => {
  const h = location.hash;
  const m = h.match(/preset=(\w+)/); if (m) document.querySelector(`[data-preset="${m[1]}"]`)?.click();
  if (h.includes("showback")) setTimeout(() => {
    document.querySelector('[data-section="back"]').click();
  }, 800);
}, 5000);

// Test-only: #showframe opens the frame section; #frame=laurel picks one
setTimeout(() => {
  const h = location.hash;
  if (!h.includes("showframe")) return;
  document.querySelector('[data-section="frame"]').click();
  const m = h.match(/frame=(\w+)/); if (m) setTimeout(() => document.querySelector(`[data-choice=frame] [data-v="${m[1]}"]`)?.click(), 300);
}, 5800);

// Test-only: #open=frame opens the section holding that colour row or choice
setTimeout(() => {
  const m = location.hash.match(/open=([\w,]+)/); if (!m) return;
  const panel = document.querySelector(`[data-colour=${m[1].split(",")[0]}], [data-choice=${m[1].split(",")[0]}]`)?.closest(".ws-panel");
  if (panel) document.querySelector(`[data-section="${panel.dataset.panel}"]`).click();
}, 5800);

// Test-only: #xray turns on the X-ray view
setTimeout(() => { if (location.hash.includes("xray")) document.querySelector("#xray")?.click(); }, 6500);

// Test-only: #addshown clicks "+ All" on the sheet

// Test-only: #langmenu opens the language menu
setTimeout(() => { if (location.hash.includes("langmenu")) { const m = [...document.querySelectorAll("[data-lang-menu]")].find((d) => d.offsetParent); if (m) m.open = true; } }, 6000);
