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

// Test-only scripted clicks, chosen by the URL hash, e.g. #reminders,tb
setTimeout(() => {
  const steps = location.hash.slice(1).split(",").filter(Boolean);
  const click = (sel) => document.querySelector(sel)?.click();
  for (const step of steps) {
    if (step === "reminders") click('#kindSeg [data-kind="reminders"]');
    else if (step === "select") click("#selectMode");
    else if (step === "pickall") click("#pickAll");
    else if (step === "first") click("#tokens .tok");
    else if (step === "queue") document.querySelector("#queueBox").open = true;
    else if (step === "add") click("#pickAdd");
    else if (["tb", "bmr", "snv", "carousel", "fabled", "loric"].includes(step)) {
      const sel = document.querySelector("#editionFilter"); sel.value = step; sel.dispatchEvent(new Event("change"));
    }
  }
}, 4000);
