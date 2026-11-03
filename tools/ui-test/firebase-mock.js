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
  const roles = await (await fetch("/admin-data/roles_data.json")).json();
  return roles.map((r) => ({ id: roleId(r.en), ...r }));
}
export const loadSeal = async () => (await fetch("/admin-data/seal.svg")).text();
export const uploadRoles = async () => 0, uploadSeal = async () => {};
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
    else if (k === "add") click("#enqueue");
    else if (k === "addall") click(`#rows [data-addall="${v}"]`);
    else if (k === "queue") click("#queueToggle");
  }
}, 4000);

export async function loadEditionLogos() {
  const out = {};
  for (const n of ["tb", "bmr", "snv", "taf"]) {
    const blob = await (await fetch(`/admin-data/editions/${n}.webp`)).blob();
    out[n] = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  }
  return out;
}
export const uploadEditionLogo = async () => {};

// Test-only: report elements wider than the viewport (#measure)
setTimeout(() => {
  if (!location.hash.includes("measure")) return;
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 1 && el.getClientRects().length)
    .slice(0, 12).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} right=${Math.round(el.getBoundingClientRect().right)}`);
  const pre = document.createElement("pre"); pre.id = "measure";
  pre.textContent = `vw=${vw} scrollWidth=${document.documentElement.scrollWidth}\n` + wide.join("\n");
  document.body.append(pre);
}, 6000);
