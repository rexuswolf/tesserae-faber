// Wiring: the page's event handlers, set once when the app starts.
import { emit } from "./events.ts";
import { $, hit, input, state, MY_DESIGNS_KEY, $$, storeJSON, view3d, LAYOUT_TEXT, RANGES, MAX_SVG, coll } from "./context.ts";
import type { Part, FaceTab, Fields, RangeKey, Side } from "./context.ts";
import { openScriptDialog, goEdition, drawer, saveFromDialog, scriptCustomizes, shareScript, scriptOf, scriptJsonWithOwn, syncHomebrew, openSharedScript, PHONE } from "./scripts-ui.ts";
import { saveFile, shapeOf, FACE_FIELDS, DEFAULT_SPEC, PATTERN_MIN, backLayoutContent } from "../engine/token-engine.ts";
import { t, uiLang } from "../i18n.ts";
import { storeScripts, loadScripts } from "../scripts.ts";
import { roleIdOf, charKey, textFor } from "./tokens.ts";
import { persistPicks, editToken, isPicked, setPick, renderQueue, goStep, flow, downloadPdf, downloadBambu, dropFromDesign, designToken, PAPER_BACKS_KEY, testQ, PRINT_WAY_KEY, PRINTER_KEY, NOZZLE_KEY, openQueue, onQueueClick, undoPicks, changePicks } from "./queue.ts";
import { renderSpine, renderSheet, onCopyStep, openRows, toggleCharacter, openAddMenu, addShown } from "./sheet.ts";
import { openTokenPanel, wireCollSwitch, wireOwn, setOwnContent } from "./creator.ts";
import { wireEditor, openContent } from "./editor.ts";
import { wireDesignBar, deepenAll, openDesignSheet, wireDesignSheet, saveLookAsDesign, setOwn, rememberReturn, renderSays, setBackFace, backToFront, backDrawn, changeLook, deepen, resetField, setReliefFace, toggleReliefPart, changePattern, changeCardBack, changeBackContent } from "./design-sheet.ts";
import { OWN } from "../collection.ts";
import { TALLER } from "./taller.ts";
import { designFor, rereadMyDesigns } from "./designs.ts";
import { adminSignIn } from "./boot.ts";
import { printerOf, nozzleOf } from "../bambu/plates.ts";
import type { ViewKind } from "../engine/viewer.ts";
import { syncView, editShape, openPart, showTab, renderWorkshop, viewTab, changeFace, editSide, editLook, wireIcons, wireCardBack } from "./workshop.ts";
import type { TokenOverride, TokenSpec, TokenStyle, ReliefPart, BackSay, TokenContent } from "../types.ts";
import { signOut as signOutUser, local } from "../services.ts";
import { openAdmin } from "./admin.ts";

// ------------------------------------------------------------ wiring

export function wire() {
  // spine and sheet
  $(".spine-scroll").onclick = (e) => {
    if (hit(e, "[data-script-new]")) { openScriptDialog(); return; }
    const b = hit(e, "[data-ed]"); if (!b) return;
    goEdition(b.dataset.ed);
    drawer(false);
  };
  // scripts
  $("#scriptNew").onclick = openScriptDialog;
  $("#scriptDialogCancel").onclick = () => $<HTMLDialogElement>("#scriptDialog").close();
  $("#scriptDialogSave").onclick = () => saveFromDialog($<HTMLTextAreaElement>("#scriptDialogText").value);
  // Warn as soon as the pasted JSON renames or re-icons official characters.
  $("#scriptDialogText").oninput = (e) => {
    let data = null; try { data = JSON.parse(input(e).value); } catch { /* not JSON yet */ }
    $("#scriptDialogWarn").hidden = !scriptCustomizes(data);
  };
  $("#scriptDialogFile").onchange = async (e) => { const f = input(e).files![0]; input(e).value = ""; if (f) saveFromDialog(await f.text()); };
  $("#scriptInviteSkip").onclick = () => $<HTMLDialogElement>("#scriptInvite").close();
  $("#scriptShare").onclick = shareScript;
  $("#scriptJson").onclick = () => {
    const sc = scriptOf(state.edition); if (!sc) return;
    saveFile(new Blob([scriptJsonWithOwn(sc)], { type: "application/json" }), `${sc.name.replace(/[\\/:*?"<>|]+/g, "").trim() || "script"}.json`);
  };
  $("#scriptDelete").onclick = (e) => {
    const b = e.currentTarget as HTMLElement, sc = scriptOf(state.edition); if (!sc) return;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("script.deleteConfirm"); return; }
    storeScripts(loadScripts().filter((x) => x.id !== sc.id));
    // its homebrew characters go with it, and so do their tokens in the selection
    const gone = (k: string) => roleIdOf(k).startsWith(`hb_${sc.id}_`);
    if ([...state.pick.keys()].some(gone)) { for (const k of [...state.pick.keys()]) if (gone(k)) state.pick.delete(k); persistPicks(); }
    if (gone(state.sel!.key)) { const first = state.lib!.roles.find((r) => r.en === "Fortune Teller") || state.lib!.roles[0]; state.sel = { key: charKey(first), role: first, reminder: null }; }
    syncHomebrew();
    goEdition("all");
  };
  window.addEventListener("hashchange", openSharedScript);
  // phone: the top bar opens the sidebar as a drawer (step 1)
  $("#drawerOpen").onclick = () => drawer(true);
  $("#scrim").onclick = () => drawer(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#spine").classList.contains("open")) drawer(false); });
  PHONE.addEventListener("change", () => drawer(false));
  drawer(false);
  $("#search").oninput = () => { renderSpine(); renderSheet(); };
  // the groups' filter: its list opens under the funnel; a group picked closes it
  const filt = (on: boolean) => { $("#filtWrap").dataset.open = String(on); $("#filtBtn").setAttribute("aria-expanded", String(on)); };
  $("#filtBtn").onclick = () => filt($("#filtWrap").dataset.open !== "true");
  $("#teamChips").onclick = (e) => { const b = hit(e, "[data-team]"); if (b) { state.team = b.dataset.team!; filt(false); renderSheet(); } };
  document.addEventListener("click", (e) => { if ($("#filtWrap").dataset.open === "true" && !(e.target as Element).closest("#filtWrap")) filt(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#filtWrap").dataset.open === "true") { filt(false); $("#filtBtn").focus(); } });
  // step 1: tap a token to pick it (or drop it); a team or everything shown at once
  $("#rows").onclick = (e) => {
    const ownEdit = hit(e, "[data-own-edit]");
    if (ownEdit) { openTokenPanel(ownEdit.dataset.ownEdit!); return; }
    const pen = hit(e, "[data-edit]") ?? hit(e, "[data-design-row]");
    if (pen) { editToken(pen.dataset.edit ?? pen.dataset.designRow!); return; }
    if (onCopyStep(e)) return;
    const fold = hit(e, "[data-rems-fold]");
    if (fold) { const k = fold.dataset.remsFold!; if (openRows.has(k)) openRows.delete(k); else openRows.add(k); renderSheet(); $(`[data-rems-fold="${CSS.escape(k)}"]`)?.focus(); return; }
    const pick = hit(e, "[data-pick]"), team = hit(e, "[data-pick-team]");
    if (pick) { toggleCharacter(pick.dataset.pick!); return; }
    // a reminder chip: all its reminders in, or (when they're all in already) all out
    const chip = hit(e, "[data-pick-rems]");
    if (chip) { const keys = chip.dataset.pickRems!.split(" "), on = !keys.every(isPicked); keys.forEach((k) => setPick(k, on)); emit("picks"); return; }
    // anywhere else in a character's row adds or drops the character
    const row = !team && hit(e, "[data-row]");
    if (row && !hit(e, "a, button, input")) { toggleCharacter(row.dataset.row!); return; }
    if (team) {
      const list = (state.shown || []).filter((r) => r.team === team.dataset.pickTeam), on = !list.every((r) => isPicked(charKey(r)));
      list.forEach((r) => setPick(charKey(r), on)); emit("picks");
    }
  };
  wireCollSwitch();
  wireDesignBar();
  if (OWN) wireOwn();
  // your designs changed in another tab (the Taller): drawn with them here too
  window.addEventListener("storage", (e) => {
    if (e.key !== MY_DESIGNS_KEY || TALLER || !state.lib) return;
    rereadMyDesigns();
    emit("all");
  });
  // "Add to queue": a menu of what to add (see renderAddMenu)
  $("#addBtn").onclick = (e) => { openAddMenu($("#addMenu").hidden, e.detail === 0); };
  $("#addMenu").onclick = (e) => {
    const b = hit(e, "[data-a]") as HTMLButtonElement | null; if (!b || b.disabled) return;
    openAddMenu(false); addShown(b.dataset.a!); $("#addBtn").focus();
  };
  $("#addMenu").onkeydown = (e) => {
    const items = [...$$("#addMenu button:not(:disabled)")], i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
    else if (e.key === "Escape") { openAddMenu(false); $("#addBtn").focus(); }
    else if (e.key === "Tab") openAddMenu(false);
  };
  document.addEventListener("click", (e) => { if (!$("#addMenu").hidden && !hit(e, ".addmenu")) openAddMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#addMenu").hidden) { openAddMenu(false); $("#addBtn").focus(); } });
  // the steps
  $("#flowSteps").onclick = (e) => { const b = hit(e, "[data-goto]") as HTMLButtonElement | null; if (b && !b.disabled) goStep(+b.dataset.goto!); };
  $("#flowBack").onclick = () => goStep(1);
  $("#flowNext").onclick = () => (state.step < 3 ? goStep(3) : flow.way === "paper" ? downloadPdf() : downloadBambu());
  // step 2: your tokens; tap one to give it its own design
  $("#designGrid").onclick = (e) => {
    const drop = hit(e, "[data-drop]");
    if (drop) { dropFromDesign(drop.dataset.drop!); return; }
    if (onCopyStep(e)) return;
    const b = hit(e, "[data-design]"); if (b) designToken(b.dataset.design!);
  };
  // a mouse wheel moves the strip of tokens sideways
  $("#designGrid").addEventListener("wheel", (e) => {
    const g = e.currentTarget as HTMLElement;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || g.scrollWidth <= g.clientWidth) return;
    g.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  // step 3: how to print
  $("#printPage").addEventListener("change", (e) => {
    if (input(e).id !== "paperBacks") return;
    flow.backs = input(e).checked; storeJSON(PAPER_BACKS_KEY, flow.backs);
    $("#printNote").textContent = ""; renderQueue();
  });
  $("#printPage").addEventListener("click", (e) => {
    const w = hit(e, "[data-way]"), pr = hit(e, "[data-printer]"), nz = hit(e, "[data-nozzle]"), fix = hit(e, "[data-fix]");
    if (fix) { goStep(2); designToken(fix.dataset.fix!); return; }
    if (hit(e, "[data-deepen-all]")) { deepenAll(); return; }
    if (hit(e, "[data-test]") && testQ) { downloadBambu(testQ, hit(e, "[data-test]") as HTMLButtonElement); return; }
    if (w) { flow.way = w.dataset.way!; storeJSON(PRINT_WAY_KEY, flow.way); }
    else if (pr) { flow.printer = printerOf(pr.dataset.printer!).id; storeJSON(PRINTER_KEY, flow.printer); }
    else if (nz) { flow.nozzle = nozzleOf(nz.dataset.nozzle!).id; storeJSON(NOZZLE_KEY, flow.nozzle); }
    else return;
    $("#printNote").textContent = ""; renderQueue();
  });

  // workshop
  // Front and Back turn the view; on a coin, they also open its FRONT or BACK when one of them is open.
  $$(".turn .pill[data-view]").forEach((b) => b.onclick = () => {
    const v = b.dataset.view as ViewKind;
    view3d("setView", v); syncView(v);
    if (state.sel && editShape() === "coin" && (v === "top" || v === "back")) {
      const part = openPart(), want = v === "back" ? "back" : "front";
      if ((part === "front" || part === "back") && part !== want) { showTab({ part: want }); renderWorkshop(); }
    }
  });
  $("#xray").onclick = () => {
    const on = $("#xray").getAttribute("aria-pressed") !== "true";
    $("#xray").setAttribute("aria-pressed", String(on));
    view3d("setXray", on);
    if (on) { view3d("setView", "side"); syncView("side"); }
  };
  // the token's design: the sheet to choose it (the default, the collection's, yours); its own changes
  // kept as a design of yours or dropped; and the way back to the default
  $("#styleChange").onclick = () => openDesignSheet("token", shapeOf(state.sel!.role), $("#styleChange"));
  wireDesignSheet();
  wireEditor();
  // the fine changes: folded at first, then as you last left them
  const TWEAK_KEY = "tf-tweak-open";
  const setTweak = (open: boolean) => { $("#workshop").classList.toggle("tweak-closed", !open); $("#tweakToggle").setAttribute("aria-expanded", String(open)); };
  setTweak(local.get(TWEAK_KEY) === "1");
  $("#tweakToggle").onclick = () => {
    const open = $("#tweakToggle").getAttribute("aria-expanded") !== "true";
    setTweak(open); local.set(TWEAK_KEY, open ? "1" : "0");
    if (open) viewTab();
  };
  $("#styleSave").onclick = () => void saveLookAsDesign(state.sel!.key);
  $("#styleDrop").onclick = () => {
    const key = state.sel!.key, own: TokenOverride = { ...state.overrides.get(key) };
    delete own.look;
    setOwn(key, own);
    state.flash = t("design.dropDone", { name: designFor(key).name });
    renderWorkshop();
  };
  $("#styleBack").onclick = () => {
    const key = state.sel!.key, own: TokenOverride = { ...state.overrides.get(key) };
    delete own.look; delete own.style;
    setOwn(key, own);
    state.flash = t("design.backDone", { name: designFor(key).name });
    renderWorkshop();
  };
  $("#designTaller").onclick = rememberReturn;
  // what the token says: one line, opening its content (your collection's) or its printed text and icon (a closed one's)
  $("#saysLine").onclick = (e) => {
    const edit = hit(e, "[data-content-edit]");
    if (edit) { openContent(); return; }
    if (hit(e, ".says-toggle")) { state.saysOpen = !state.saysOpen; renderSays(); }
  };
  $("#parts").onclick = (e) => { const b = hit(e, "[data-part]"); if (!b) return; showTab({ part: b.dataset.part as Part, face: b.dataset.face as FaceTab | undefined }); viewTab(); renderWorkshop(); };
  $("#faceTabs").onclick = (e) => {
    if (hit(e, "[data-back-same]")) { backToFront(); return; }
    const b = hit(e, "[data-face]"); if (!b) return; showTab({ face: b.dataset.face as FaceTab }); renderWorkshop();
  };
  $("#backNote").onclick = (e) => { if (hit(e, "[data-back-face]")) setBackFace(); else if (hit(e, "[data-back-same]")) backToFront(); };
  // A face's choices and sliders go to the face being edited (the front, or a back of its own); the rest to the token.
  const FACE_KEYS = new Set<string>(FACE_FIELDS);
  const change = (key: string, mutate: (s: TokenSpec) => void) => (FACE_KEYS.has(key) ? changeFace(editSide(), mutate) : changeLook(mutate));
  for (const key of ["style", "frame", "magnet", "magnetSize", "ringBase", "separator", "edge", "cardIcon", "cardJoin"]) {
    $(`[data-choice=${key}]`).onclick = (e) => {
      const b = hit(e, "button"); if (!b) return;
      // the back's layouts end with Plain: nothing on it
      if (key === "style" && b.dataset.v === "plain") { changeLook((s) => { s.back = "none"; s.backMode = "design"; }); view3d("setView", "back"); syncView("back"); return; }
      // a token of yours: its front's layout chooses what it carries (its icon alone, its name alone, both), and a card's icon place too
      const own = !TALLER && editSide() === "front" && state.sel && state.sel.reminder == null && coll.tokens.some((x) => x.id === state.sel!.role.id) ? state.sel.role.id : null;
      if (own && (key === "style" || key === "cardIcon")) {
        const v = b.dataset.v!, content: TokenContent = key === "style" ? (v === "solo" ? "icon" : v === "text" ? "text" : "both") : v === "only" ? "icon" : v === "none" ? "text" : "both";
        setOwnContent(own, content);
        if (content !== "both" && key === "style") return;   // its icon or its name alone: the layout is what it carries
      }
      change(key, (s) => {
        // a name size doesn't carry over between layouts: each starts from its own
        if (key === "style" && (s.style ?? DEFAULT_SPEC.style) !== b.dataset.v) s.textSize = LAYOUT_TEXT[b.dataset.v as TokenStyle];
        if (key === "edge" && b.dataset.v === "smooth") delete s.edge;   // smooth is unset: the coin as always
        else (s as unknown as Fields)[key] = b.dataset.v;
      });
      // a layout for the back: the token behind, no longer plain; and what it says and shows, as that layout has them
      if (key === "style" && editSide() === "back" && editShape() === "coin") {
        const fix = backLayoutContent(b.dataset.v as TokenStyle, editLook().backFace ?? {});
        if (Object.keys(fix).length) changeBackContent(fix); else if (backDrawn()) setBackFace();
      }
    };
  }
  // the name's and the frame's colours are the face's; the back's own (a back that matches the front) is marked as the back's
  for (const box of $$(".metal")) box.onclick = (e) => {
    const b = hit(e, "button"); if (!b) return;
    const key = box.dataset.colour!, mutate = (s: TokenSpec) => { s.colours = { ...DEFAULT_SPEC.colours, ...s.colours, [key]: b.dataset.v! }; };
    // a card back's phrase and frame: its own colours
    if (box.dataset.side === "cardback") { const k = box.dataset.cbColour as "text" | "frame"; changeCardBack((cb) => { cb.colours = { ...cb.colours, [k]: b.dataset.v! }; }); return; }
    if (box.dataset.side === "back") changeFace("back", mutate);
    else if (box.closest("[data-panel=text], [data-panel=icon], [data-panel=frame], [data-panel=colours]")) changeFace(editSide(), mutate);
    else changeLook(mutate);
  };
  // a bevel of 0 is none: left unset, as in a design without one
  for (const id of Object.keys(RANGES) as RangeKey[]) $("#" + id).oninput = (e) => change(id, (s) => { if (id === "reliefBevel" && !+input(e).value) delete s.reliefBevel; else s[id] = +input(e).value; });
  $("#colourWarn").addEventListener("click", (e) => { if (hit(e, "[data-deepen]")) deepen(); });
  // A reset button for every field: in a slider's row, after a group of choices or colours.
  const resetBtn = () => Object.assign(document.createElement("button"), { type: "button", className: "reset-f", hidden: true, textContent: "↺" });
  for (const id of Object.keys(RANGES)) { const b = resetBtn(); b.dataset.reset = id; $(`output[data-for=${id}]`).after(b); }
  for (const el of $$("#styleFields [data-choice], #styleFields .metal:not([data-side])")) {
    const b = resetBtn(); b.classList.add("group"); b.dataset.reset = el.dataset.choice ?? `colours.${el.dataset.colour}`; el.after(b);
  }
  $("#styleFields").addEventListener("click", (e) => {
    const r = hit(e, "[data-reset]");
    if (r) { resetField(r.dataset.reset!); return; }
    // relief: which face stands out, and which of its parts
    const face = hit(e, "[data-relief-face]"), part = hit(e, "[data-relief-part]");
    if (face) setReliefFace(face.dataset.reliefFace as Side | "none");
    else if (part) toggleReliefPart(part.dataset.reliefPart as ReliefPart);
  });
  // a pattern: its tiles and colours on a click, its sliders when let go (each cut takes a moment), their value as they move
  for (const side of ["front", "back"] as const) {
    const box = $(`[data-pat-side=${side}]`);
    box.addEventListener("click", (e) => {
      const tile = hit(e, "[data-pat]"), col = hit(e, "[data-pat-col]");
      if (tile) changePattern(side, { id: tile.dataset.pat });
      else if (col) changePattern(side, { field: "colour", value: col.dataset.patCol });
    });
    box.addEventListener("input", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLInputElement>("[data-pat-range]"); if (!el) return;
      const k = el.dataset.patRange!;
      $(`[data-pat-out=${k}]`, box).textContent = (+el.value).toFixed(k === "scale" ? 1 : 2).replace(".", uiLang() === "es" ? "," : ".") + " mm";
    });
    box.addEventListener("change", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLInputElement>("[data-pat-range]"); if (!el) return;
      changePattern(side, { field: el.dataset.patRange as "scale" | "line" | "halo", value: Math.max(PATTERN_MIN, +el.value) });
    });
  }
  // a one-state token's back: what it says (its own words as they're typed) and what it shows (your SVG asks for one first)
  $("#backSay").onclick = (e) => { const b = hit(e, "[data-v]"); if (b) changeBackContent({ say: b.dataset.v as BackSay }); };
  $("#backPhrase").oninput = (e) => changeBackContent({ say: "phrase", phrase: input(e).value });
  $("#backArt").onclick = (e) => {
    const b = hit(e, "[data-v]"); if (!b) return;
    if (b.dataset.v === "custom" && !editLook().customSvg) { $("#upload").click(); return; }
    changeBackContent({ art: b.dataset.v });
  };
  $("#upload").onchange = async (e) => {
    const f = input(e).files![0]; input(e).value = "";
    if (!f) return;
    const hint = $("#uploadHint");
    hint.hidden = false;
    if (f.size > MAX_SVG) { hint.className = "hint warn"; hint.textContent = t("upload.tooBig", { file: f.name, kb: (f.size / 1024).toFixed(0), max: MAX_SVG / 1000 }); return; }
    const svg = await f.text();
    changeLook((s) => { s.customSvg = svg; });
    changeBackContent({ art: "custom" });
    hint.className = "hint"; hint.textContent = t("upload.using", { file: f.name });
  };
  // what the token says: its printed text, its feminine name and its icon (Clocktower's, a closed collection's)
  $("#printed").oninput = (e) => {
    const own = { ...(state.overrides.get(state.sel!.key) || {}), text: input(e).value };
    setOwn(state.sel!.key, own);
  };
  wireIcons();
  wireCardBack();
  $("#fem").onchange = (e) => {
    const own: TokenOverride = { ...(state.overrides.get(state.sel!.key) || {}) };
    if (input(e).checked) own.fem = true; else delete own.fem;
    setOwn(state.sel!.key, own);
  };
  $("#download").onclick = forge;

  // your selection: copies, reminders, clear
  $("#queueToggle").onclick = openQueue;
  $("#queueClose").onclick = () => $<HTMLDialogElement>("#queueDrawer").close();
  $("#queueDrawer").addEventListener("click", (e) => { if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close(); });   // backdrop
  $("#queue").onclick = onQueueClick;
  $("#queueToast button").onclick = $("#appToast button").onclick = undoPicks;
  $("#queueClear").onclick = (e) => {
    const b = e.currentTarget as HTMLElement;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = t("queue.clearConfirm"); return; }
    b.dataset.confirm = ""; b.textContent = t("queue.clear");
    changePicks(() => state.pick.clear(), t("queue.cleared"));
  };

  // account
  $("#signOut").onclick = () => { $<HTMLDetailsElement>(".me").open = false; signOutUser(); };
  $("#openAdmin").onclick = () => { $<HTMLDetailsElement>(".me").open = false; openAdmin(); };
  $("#adminSignIn").onclick = adminSignIn;
}

export const roleById = (id: string) => state.lib!.roles.find((r) => r.id === id);
function note(text: string) { $("#exportNote").textContent = text; }

async function forge() {
  const btn = $<HTMLButtonElement>("#download");
  btn.disabled = true;
  try {
    const { role, reminder, key } = state.sel!;
    const [{ default: JSZip }, { addTokenToZip }] = await Promise.all([import("jszip"), import("../engine/export.ts")]);
    const zip = new JSZip();
    const folder = addTokenToZip(zip, state.token!, role, textFor(key, role, reminder), { faceDown: true });
    await saveFile(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
    note(t("act.downloaded", { file: `${folder}.zip` }));
  } catch (err) {
    note(t("act.downloadFailed", { message: (err as Error)?.message || String(err) }));
  } finally { btn.disabled = false; }
}
