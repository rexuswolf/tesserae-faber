// Replaces the Firestore character library with admin-data/roles_game_icons.json,
// using your firebase-tools login (an owner account, so security rules don't apply).
// Each document is written whole, so fields from the old library (e.g. traced art) go away.
import fs from "node:fs";
import os from "node:os";
const PROJECT = "midnight-mint";
const cfg = JSON.parse(fs.readFileSync(`${os.homedir()}/.config/configstore/firebase-tools.json`));
let token = cfg.tokens?.access_token;
if (!token || (cfg.tokens.expires_at && cfg.tokens.expires_at < Date.now() + 60000)) {
  // Refresh with firebase-tools' public OAuth client (the same one the CLI uses).
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.tokens.refresh_token,
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com", client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi" }) });
  token = (await res.json()).access_token;
}
const value = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(value) } }
  : v && typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } }
  : typeof v === "number" ? { integerValue: String(v) } : { stringValue: String(v ?? "") };
const roleId = (en) => en.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const roles = JSON.parse(fs.readFileSync(new URL("../admin-data/roles_game_icons.json", import.meta.url)));
const base = `projects/${PROJECT}/databases/(default)/documents`;
for (let i = 0; i < roles.length; i += 100) {
  const writes = roles.slice(i, i + 100).map((r) => ({
    update: { name: `${base}/roles/${roleId(r.en)}`, fields: value({
      en: r.en, es: r.es, team: r.team, edition: r.edition || "", reminders: r.reminders || { en: [], es: [] },
      icon: r.icon, author: r.author, g: r.g, body: r.body }).mapValue.fields },
  }));
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ writes }) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  console.log(`wrote ${Math.min(i + 100, roles.length)} / ${roles.length}`);
}
// Check: list everything in roles and look for leftovers of the old library.
let page = "", total = 0, withD = 0, withBody = 0, extra = [];
const ids = new Set(roles.map((r) => roleId(r.en)));
do {
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}/roles?pageSize=300${page ? `&pageToken=${page}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  for (const d of j.documents || []) {
    total++; if (d.fields.d) withD++; if (d.fields.body) withBody++;
    const id = d.name.split("/").pop(); if (!ids.has(id)) extra.push(id);
  }
  page = j.nextPageToken || "";
} while (page);
console.log(`roles in Firestore: ${total} · with game-icons body: ${withBody} · with old traced art: ${withD} · not in the new library: ${extra.join(", ") || "none"}`);
