// The front page's walk through what the app does (index.html, #ownLanding's chapters): the app's
// own collections' tokens, drawn by the engine when a chapter comes near; a name and an icon that
// make a token; a token whose design answers three controls; tokens that turn over; and a token in
// 3D that comes apart into its colours as the page scrolls. Loaded only on the front page.
import * as THREE from "three";
import { readBuiltIn, collectionRoles, builtInCollections, openUrl, nameIn } from "../collection.ts";
import type { Collection } from "../collection.ts";
import { loadLibrary, tokenSvg, flipFace, buildToken, DEFAULT_SPEC, FILAMENTS } from "../engine/token-engine.ts";
import type { Library } from "../types.ts";
import type { Role, TokenSpec, TokenIcon, Hex } from "../types.ts";
import { gameIcon, gameIconPreview } from "../icons.ts";
import { uiLang, t } from "../i18n.ts";
import { $, esc } from "./context.ts";

/** A collection ready to draw: its tokens as roles (each with its group's colour), their library, its styles. */
interface Kit { c: Collection; lib: Library; byId: Map<string, Role>; style: (shape: string, i?: number) => TokenSpec }
async function kit(id: string, lang: string): Promise<Kit | null> {
  const c = await readBuiltIn(id);
  if (!c) return null;
  const colour = new Map(c.groups.map((g) => [g.id, g.colour as Hex]));
  // the group's colour on each token: the engine's teams are the open collection's, not these
  const roles = collectionRoles(c, lang).map((r) => ({ ...r, colour: r.colour ?? colour.get(r.team) }));
  const lib = await loadLibrary(roles);
  const byId = new Map(c.tokens.map((tk, i) => [tk.id, roles[i]]));
  const style = (shape: string, i = 0) => {
    const s = (c.styles as Record<string, { spec: Partial<TokenSpec> }[]>)[shape]?.[i]?.spec ?? {};
    return { ...DEFAULT_SPEC, ...s, colours: { ...DEFAULT_SPEC.colours, ...s.colours }, lang } as TokenSpec;
  };
  return { c, lib, byId, style };
}
const draw = (k: Kit, id: string, spec: TokenSpec, side: "front" | "back" = "front") => { const r = k.byId.get(id); return r ? tokenSvg(k.lib, r, spec, { side }) : ""; };

let started = false;
/** The Workshop's 3D view, made the first time it's asked for (one per canvas). */
let viewer: { setToken(t: ReturnType<typeof buildToken>): void; setView(kind?: "angle"): void } | null = null;
/** The chapters again, in the interface's new language. */
export function redrawTour() { started = false; startTour(); }
/** Draws the chapters once, as they come near; called on every visit to the front page. */
export function startTour() {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-tour-go]")) a.onclick = (e) => {
    e.preventDefault();
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(a.hash)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };
  if (started) return;
  started = true;
  // come from "How it works" (/#tourPick): to that chapter, once the page is shown
  const at = /^#tour\w+$/.test(location.hash) ? document.querySelector(location.hash) : null;
  if (at) requestAnimationFrame(() => at.scrollIntoView());
  const lang = uiLang();
  const kits = Promise.all(["senado", "srd5e", "drawsteel"].map((id) => kit(id, lang)));
  const when = (sel: string, fn: () => Promise<void> | void) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); void fn(); } }, { rootMargin: "600px 0px" });
    io.observe(el);
  };
  when("#tourPick", async () => { const [sen, d5, ds] = await kits; pick(sen, d5, ds, lang); });
  when("#tourDesign", async () => { const [sen, d5, ds] = await kits; design(sen, d5, ds); });
  when("#tourPrint", async () => { const [, d5] = await kits; if (d5) { paper(d5); explode(d5); } });
}

/** 1: the app's collections, the four shapes, and a token of your own. */
async function pick(sen: Kit | null, d5: Kit | null, ds: Kit | null, lang: string) {
  const built = await builtInCollections();
  const COVERS: [Kit | null, string, string[]][] = [[sen, "senado", ["republicano", "cesar", "voto"]], [d5, "srd5e", ["blinded", "bless", "concentration"]], [ds, "drawsteel", ["heroic", "piety", "dazed"]]];
  $("#tourCovers").innerHTML = COVERS.map(([k, id, toks]) => {
    const b = built.find((x) => x.id === id);
    if (!k || !b) return "";
    return `<a class="tour-cover" href="${esc(openUrl(id, built))}" style="--c:${b.cover ?? "#2a2622"}"><span class="row tour-tok">${toks.map((tk) => draw(k, tk, k.style("coin"))).join("")}</span><span><b>${esc(nameIn(b.name, lang))}</b><small>${esc(t(`tour.sub.${id}`))}</small></span></a>`;
  }).join("");

  if (d5 && sen) {
    const ring = [...d5.byId.values()].find((r) => r.kind === "ring");
    const word = t("tour.baseText"), base = ring ? { ...ring, id: "tour-base", kind: "base" as const, en: word, es: word, names: { en: word, es: word } } : null;
    const shapes: [string, string, string][] = [
      [draw(d5, "frightened", d5.style("coin")), "tour.coin", "tour.coinSub"],
      [draw(sen, "ley", sen.style("card")), "tour.card", "tour.cardSub"],
      [ring ? tokenSvg(d5.lib, ring, d5.style("ring")) : "", "tour.ring", "tour.ringSub"],
      [base ? tokenSvg(d5.lib, base, { ...DEFAULT_SPEC, lang, ringBase: "32", colours: { ...DEFAULT_SPEC.colours, base: "#d4a72c", front: FILAMENTS.black, frame: FILAMENTS.black } }) : "", "tour.base", "tour.baseSub"],
    ];
    $("#tourShapes").innerHTML = shapes.map(([svg, b, sub]) => `<figure><span class="tour-tok">${svg}</span><figcaption><b>${esc(t(b))}</b>${esc(t(sub))}</figcaption></figure>`).join("");
  }

  // a token of your own: a name and an icon from game-icons.net
  const ICONS = ["lorc/wolf-head", "lorc/dragon-head", "lorc/crossed-swords", "lorc/potion-ball", "lorc/skull-crossed-bones", "lorc/crown", "lorc/castle", "lorc/fire-ring", "carl-olsen/spider-face", "lorc/magic-swirl", "lorc/treasure-map", "delapouite/greek-temple"];
  const name = $<HTMLInputElement>("#tourName"), out = $("#tourMade"), box = $("#tourIcons");
  name.value = t("tour.ownExample");
  box.innerHTML = ICONS.map((p, i) => `<button type="button" data-icon="${p}" aria-pressed="${i === 0}" aria-label="${esc(p.split("/")[1].replace(/-/g, " "))}"><img src="${gameIconPreview(p)}" alt="" loading="lazy"></button>`).join("");
  const icons = new Map<string, Promise<TokenIcon>>();
  let chosen = ICONS[0], lib: Library | null = null;
  const made = async () => {
    const path = chosen;
    if (!icons.has(path)) icons.set(path, gameIcon(path));
    let icon: TokenIcon;
    try { icon = await icons.get(path)!; } catch { icons.delete(path); return; }   // offline: the last one stays
    if (path !== chosen) return;
    const text = name.value.trim() || t("tour.ownExample");
    const role: Role = { id: "tour-own", en: text, es: text, names: { en: text, es: text }, team: "townsfolk" as Role["team"], colour: "#c4262b", edition: "own", editionName: "Tesserae Faber", d: [], body: "", g: "" } as Role;
    lib ??= await loadLibrary([]);
    const spec = { ...DEFAULT_SPEC, lang, frame: "rim", frameWidth: 0.8, icon, colours: { ...DEFAULT_SPEC.colours, base: FILAMENTS.black, front: "#c4262b", frame: "#c4262b" } } as TokenSpec;
    out.innerHTML = tokenSvg(lib, role, spec, { text });
  };
  box.onclick = (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-icon]");
    if (!b) return;
    chosen = b.dataset.icon!;
    for (const x of box.children) x.setAttribute("aria-pressed", String(x === b));
    void made();
  };
  name.oninput = () => void made();
  void made();
}

/** 2: one token and three controls; tokens that turn over. */
function design(sen: Kit | null, d5: Kit | null, ds: Kit | null) {
  if (ds && sen && d5) {
    // the token to try it on: one of each collection's
    const TOKENS: Record<string, [Kit, string]> = { heroic: [ds, "heroic"], republicano: [sen, "republicano"], blinded: [d5, "blinded"], consul: [sen, "consul"] };
    const lang = uiLang(), nameOf = ([k, id]: [Kit, string]) => { const r = k.byId.get(id); return r ? r.names?.[lang] ?? r.en : id; };
    const OPTS = {
      token: { label: "tour.optToken", now: "heroic", opts: Object.keys(TOKENS), key: "" },
      frame: { label: "tour.optFrame", now: "laurel", opts: ["rim", "laurel", "beads", "runas", "cordon"], key: "tour.frame" },
      style: { label: "tour.optLayout", now: "classic", opts: ["classic", "window", "solo", "double"], key: "tour.layout" },
      colours: { label: "tour.optColours", now: "gold", opts: ["gold", "silver", "white", "blue"], key: "tour.colours" },
    };
    const COLOURS: Record<string, Partial<TokenSpec["colours"]>> = {
      gold: { base: FILAMENTS.black, front: FILAMENTS.gold, frame: FILAMENTS.gold },
      silver: { base: FILAMENTS.black, front: FILAMENTS.silver, frame: FILAMENTS.silver },
      white: { base: FILAMENTS.white, front: FILAMENTS.black, frame: FILAMENTS.black },
      blue: { base: "#2f86e0", front: FILAMENTS.white, frame: FILAMENTS.white },
    };
    const label = (o: { key: string }, v: string) => (o.key ? t(`${o.key}.${v}`) : nameOf(TOKENS[v]));
    const box = $("#tourOpts"), out = $("#tourDesigned"), canvas = $<HTMLCanvasElement>("#tourDesigned3d"), views = $("#tourView");
    box.innerHTML = Object.entries(OPTS).map(([k, o]) => `<div><span>${esc(t(o.label))}</span><div class="tour-chips" data-k="${k}">${o.opts.map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === o.now}">${esc(label(o, v))}</button>`).join("")}</div></div>`).join("");
    let in3d = false;
    out.hidden = false; canvas.hidden = true;   // drawn again in another language: flat, as it starts
    for (const x of views.children) x.setAttribute("aria-pressed", String((x as HTMLElement).dataset.view === "flat"));
    const redraw = async () => {
      const [k, id] = TOKENS[OPTS.token.now], role = k.byId.get(id), base = ds.style("coin");
      if (!role) return;
      const spec = { ...base, frame: OPTS.frame.now, frameWidth: 1.2, style: OPTS.style.now, colours: { ...base.colours, ...COLOURS[OPTS.colours.now] } } as TokenSpec;
      if (!in3d) { out.innerHTML = tokenSvg(k.lib, role, spec); return; }
      if (!viewer) {
        try { viewer = (await import("../engine/viewer.ts")).createViewer(canvas); viewer.setView("angle"); }   // the camera, put where the app's is
        catch { in3d = false; canvas.hidden = true; out.hidden = false; return; }   // no WebGL: the flat token stays
      }
      viewer.setToken(buildToken(k.lib, role, spec));
    };
    box.onclick = (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
      if (!b) return;
      const row = b.parentElement!;
      OPTS[row.dataset.k as keyof typeof OPTS].now = b.dataset.v!;
      for (const x of row.children) x.setAttribute("aria-pressed", String(x === b));
      void redraw();
    };
    views.onclick = (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("button[data-view]");
      if (!b) return;
      in3d = b.dataset.view === "3d";
      for (const x of views.children) x.setAttribute("aria-pressed", String(x === b));
      out.hidden = in3d; canvas.hidden = !in3d;
      void redraw();
    };
    void redraw();
  }
  if (sen && d5) {
    const coin = sen.style("coin"), vote = sen.byId.get("voto"), other = vote ? flipFace(vote, coin) : null;
    const faces: [string, string, string][] = [
      [draw(sen, "republicano", coin), draw(sen, "republicano", coin, "back"), "tour.backSame"],
      [draw(sen, "voto", coin), other ? tokenSvg(sen.lib, other, coin) : "", "tour.backVote"],
      [draw(d5, "concentration", d5.style("coin")), draw(d5, "concentration", d5.style("coin"), "back"), "tour.backColl"],
    ];
    const box = $("#tourFaces");
    box.innerHTML = faces.map(([a, b, cap]) => `<button class="tour-turn" type="button" aria-pressed="false" aria-label="${esc(t("tour.turn"))}: ${esc(t(cap))}"><span class="in tour-tok"><span>${a}</span><span>${b}</span></span><span class="cap">${esc(t(cap))}</span></button>`).join("");
    // with a mouse a token turns over while the pointer is on it; on a touch screen, a tap turns it
    const hover = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const note = $("#tourTurnNote"); note.dataset.i18n = hover ? "tour.backsNoteHover" : "tour.backsNote"; note.textContent = t(note.dataset.i18n);
    box.classList.toggle("by-hover", hover);
    box.onclick = (e) => { const b = (e.target as Element).closest(".tour-turn"); if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); };
  }
}

/** 3, paper: a sheet of faces and the one of their backs. */
function paper(d5: Kit) {
  const ids = ["blinded", "frightened", "paralyzed", "restrained", "bless", "bane", "concentration", "dead", "blinded"], spec = d5.style("coin");
  const [front, back] = document.querySelectorAll("#tourSheets .tour-sheet");
  front.innerHTML = ids.map((id) => draw(d5, id, spec)).join("");
  // the backs are mirrored on their sheet: each falls behind its face
  back.innerHTML = ids.map((_, i) => ids[i - (i % 3) + 2 - (i % 3)]).map((id) => draw(d5, id, spec, "back")).join("");
}

/** 3, in 3D: a token that comes apart into its colours as its stretch of the page scrolls past. */
let legendOf: ((lang: string) => void) | null = null;
function explode(d5: Kit) {
  if (legendOf) { legendOf(uiLang()); return; }   // built once: only its labels change
  const canvas = $<HTMLCanvasElement>("#tour3d"), sec = $("#tourExplode"), role = d5.byId.get("bless");
  if (!role) return;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { sec.classList.add("no-3d"); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2018, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(60, -80, 140); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9a0, 1.1); rim.position.set(-90, 60, -40); scene.add(rim);
  const spec = { ...d5.style("coin"), frame: "laurel", frameWidth: 1.4, relief: { text: true, frame: true, icon: true }, colours: { base: FILAMENTS.black, front: FILAMENTS.gold, frame: FILAMENTS.white, back: FILAMENTS.gold } } as TokenSpec;
  const tok = buildToken(d5.lib, role, spec);
  const group = new THREE.Group(); group.rotation.x = -1.05; scene.add(group);
  // the parts in the order they come apart, and how far each one rises (mm) once apart
  const PARTS: [keyof typeof tok.parts & keyof typeof tok.colours, number][] = [["back", -16], ["base", 0], ["front", 13], ["icon", 22], ["frame", 31]];
  const parts = PARTS.flatMap(([name, lift]) => {
    const g = tok.parts[name];
    if (!g) return [];
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: tok.colours[name], roughness: .55, metalness: name === "base" ? .05 : .25, polygonOffset: name === "base", polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    group.add(mesh);
    return [{ name, lift, mesh, colour: tok.colours[name] }];
  });
  const legend = $("#tourLegend");
  legendOf = () => { legend.innerHTML = parts.map((p) => `<li><i style="background:${p.colour}"></i>${esc(t(`tour.part.${p.name}`))}</li>`).join(""); };
  legendOf(uiLang());
  const items = () => legend.children;
  const size = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.position.set(0, 0, w < 500 ? 190 : 150); camera.updateProjectionMatrix(); };
  size(); addEventListener("resize", size);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false;
  new IntersectionObserver((es) => { seen = es.some((x) => x.isIntersecting); }).observe(sec);
  const t0 = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!seen || $("#ownLanding").hidden) return;
    const r = sec.getBoundingClientRect(), span = Math.max(1, r.height - innerHeight);
    const p = Math.min(1, Math.max(0, -r.top / span)), k = still ? 1 : Math.min(1, Math.max(0, (p - .08) / .55));
    const ease = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    parts.forEach((x, i) => { x.mesh.position.z = x.lift * ease; items()[i]?.classList.toggle("on", ease > .15 + i * .12); });
    group.rotation.z = still ? .4 : (now - t0) / 9000;
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}
