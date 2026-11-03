// Test double for src/firebase.js: a signed-in admin with the local library.
export const ADMIN_EMAIL = "admin@example.com";
const user = { uid: "test", email: ADMIN_EMAIL, photoURL: "" };
export const onUser = (fn) => setTimeout(() => fn(user), 0);
export const signIn = async () => {};
export const signOutUser = async () => {};
export const isAdmin = () => true;
export const isInvited = async () => true;
export const roleId = (en) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export async function loadRoles() {
  const roles = await (await fetch("/admin-data/roles_game_icons.json")).json();
  return roles.map((r) => ({ id: roleId(r.en), ...r }));
}
export const uploadRoles = async () => 0;
export const listInvites = async () => [], addInvite = async (e) => e, removeInvite = async () => {};
export const listDesigns = async () => [], saveDesign = async () => "d1", deleteDesign = async () => {};

// Test-only scripted clicks, chosen by the URL hash, e.g. #search=envenen,select=c:poisoner,token,own,frame=clock,add
setTimeout(() => {
  const click = (sel) => document.querySelector(sel)?.click();
  for (const step of location.hash.slice(1).split(",").filter(Boolean)) {
    const [k, v] = step.split("=");
    if (k === "search") { const i = document.querySelector("#search"); i.value = decodeURIComponent(v); i.dispatchEvent(new Event("input")); }
    else if (k === "select") click(`#rows .tok[data-key="${v}"]`);
    else if (k === "ed") click(`#editions [data-ed="${v}"]`);
    else if (k === "token") click('.tabs [data-tab="token"]');
    else if (k === "own") { const c = document.querySelector("#ownStyle"); c.checked = true; c.dispatchEvent(new Event("change")); }
    else if (k === "frame") click(`[data-choice="frame"] [data-v="${v}"]`);
    else if (k === "style") click(`[data-choice="style"] [data-v="${v}"]`);
    else if (k === "finish") click(`[data-choice="windowFinish"] [data-v="${v}"]`);
    else if (k === "add") click("#enqueue");
    else if (k === "addall") click(`#rows [data-addall="${v}"]`);
    else if (k === "queue") click("#queueToggle");
  }
}, 4000);


// Test-only: #scrollws scrolls the workshop to the bottom
setTimeout(() => { if (location.hash.includes("scrollws")) document.querySelector("#workshop").scrollTop = 99999; }, 6000);

// Test-only: #preset=marfil applies a design; #showback opens the back section and scrolls to it
setTimeout(() => {
  const h = location.hash;
  const m = h.match(/preset=(\w+)/); if (m) document.querySelector(`[data-preset="${m[1]}"]`)?.click();
  if (h.includes("showback")) setTimeout(() => {
    const d = [...document.querySelectorAll(".ws-body details")].find((x) => x.querySelector("[data-choice=back]"));
    d.open = true; d.scrollIntoView();
  }, 800);
}, 5000);
