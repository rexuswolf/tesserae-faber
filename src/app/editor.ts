// The editor's menu, as a game's creator: what can be changed down the left, the options of the one
// chosen in the middle, the token large at the right.
//
// A token's (the design step): its Content (what it carries printed), its Design (the designs it can
// take, a list) and Customise ›, which goes into the design's parts (Layout, Colours, Text…), with
// "‹ Customise" to come back. Each says its value, so the menu is the token's sheet too. With changes
// of its own the token is "Customised", and the stage has its two actions: discard them, or keep them
// as a design of yours.
// A design's (the Taller): its parts, straight away.
// On a phone the three are big buttons; one tapped goes into it, with a bar to come back, and
// Customise's parts are tabs.
import { state, $, esc, hit } from "./context.ts";
import type { Part } from "./context.ts";
import { ownChanged, designFor, unsaved } from "./designs.ts";
import { renderEditorDesigns, wireEditorDesigns, toast, renderSays } from "./design-sheet.ts";
import { textFor } from "./tokens.ts";
import { t } from "../i18n.ts";
import { showTab, renderWorkshop } from "./workshop.ts";
import type { TokenShape } from "../types.ts";

type Cat = "content" | "design" | "part";
const ed = { cat: "design" as Cat, inside: false, key: "", flash: "" };

const app = () => $(".app");
/** The menu's state on the page: what's chosen, whether Customise is entered, and (a phone) whether inside one. */
function show() {
  const a = app();
  a.dataset.crc = ed.cat;
  a.dataset.crl = "flat";   // one level: Design, and the parts under it
  a.dataset.crm = ed.inside ? "in" : "menu";
  for (const b of document.querySelectorAll<HTMLElement>(".cr-cats [data-cr]")) b.setAttribute("aria-current", String(b.dataset.cr === ed.cat));
  $("#crBackLabel").textContent = t(ed.cat === "content" ? "editor.content" : ed.cat === "design" ? "editor.design" : "editor.custom");
}
/** A part of the token (its Token tab, a face…), opened from elsewhere: Customise, inside it. */
export function openPartTab(part: Part) {
  ed.cat = "part"; ed.inside = true;
  if (state.sel) ed.key = state.sel.key;   // this token's: not back to its menu when it's drawn
  show();
  showTab({ part });
  renderWorkshop();
}
/** What the token carries, opened from elsewhere (the line over the design): its front's Composition. */
export function openContent() {
  ed.cat = "part"; ed.inside = true;
  show();
  showTab({ part: "front", face: "layout" });
  renderWorkshop();
}

/** The menu's values, the designs' list and the stage's actions, for the token being edited. */
export function renderEditor(key: string, shape: TokenShape) {
  const { role, reminder } = state.sel!;
  // another token: on a phone, back to its menu
  if (ed.key !== key) { ed.key = key; ed.inside = false; }
  // its content's fields are the Content panel's: always open there
  if (!state.saysOpen) { state.saysOpen = true; renderSays(); }
  const tweaked = ownChanged(key), changed = unsaved(key), own = state.overrides.get(key);
  const said = !!(own?.text || own?.fem || own?.icon), text = textFor(key, role, reminder);
  const word = (s: string) => `<i>${esc(s)}</i>`;
  $("#crValContent").innerHTML = esc(text) + (said ? ` ${word(t("editor.changed"))}` : "");
  $("#crValDesign").innerHTML = tweaked ? word(t("editor.customised")) : esc(designFor(key, shape).name);
  $("#crValCustom").innerHTML = changed ? word(t("editor.withChanges")) : esc(t("editor.customSub"));
  const pic = $("#styleTok").innerHTML;
  $("#crPicDesign").innerHTML = pic;
  $("#crIcon").innerHTML = pic;
  // changes since it was saved: undo or save them; saved and customised, it can be kept as a design too
  $("#crActs").hidden = !changed && !tweaked;
  $("#crUnsaved").hidden = $("#crDrop").hidden = $("#crSave").hidden = !changed;
  $("#crSaveDesign").hidden = changed || !tweaked;
  renderEditorDesigns();
  // what used to show under the design (saved, dropped…): a moment at the bottom of the page
  if (state.flash && state.flash !== ed.flash) toast(state.flash);
  ed.flash = state.flash;
  show();
}

export function wireEditor() {
  wireEditorDesigns();
  $("#crNav").addEventListener("click", (e) => {
    if (hit(e, "#crBack")) { ed.inside = false; if (ed.cat === "part") ed.cat = "design"; show(); return; }
    // a part's tab (the workshop opens it): Customise is where you are
    if (hit(e, "#parts [data-part], #partsTok [data-part]")) { ed.cat = "part"; ed.inside = true; show(); return; }
    const b = hit(e, ".cr-cats [data-cr]"); if (!b) return;
    const cat = b.dataset.cr as Cat;
    if (cat === "content" && !state.saysOpen) { state.saysOpen = true; renderSays(); }
    ed.cat = cat; ed.inside = true;
    show();
    // Customise starts on its first part (Layout, or Text where a shape has no layouts)
    if (cat === "part") $<HTMLElement>("#parts [data-part]")?.click();
  });
  $("#crSave").onclick = () => $("#styleSave").click();
  $("#crSaveDesign").onclick = () => $("#styleSaveDesign").click();
  $("#crDrop").onclick = () => $("#styleDrop").click();
  show();
}
