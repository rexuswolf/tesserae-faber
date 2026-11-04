// Writes a Bambu Studio project (.3mf) for a Bambu Lab A1 or A1 mini: tokens laid out
// face-down on plates, each token one object whose parts (coin, front, frame, back)
// already have their filament. Plates are filled so none needs more than the AMS lite's
// 4 slots.
//
// The printer/process/filament settings come from <printer>-template.json, generated once
// per printer with Bambu Studio by tools/make_bambu_template.py.
import JSZip from "jszip";
import { FILAMENT_SLOTS, PARTS, purge, nozzleOf, plateStride, printerOf, slotOf, slotsFor, towerSpot, planPlates } from "./plates.js";

export { FILAMENT_SLOTS, AMS_SLOTS, PRINTERS, slotOf, perPlate, planPlates } from "./plates.js";

// Each printer's settings (about 60 kB) load only for a download to that printer.
const TEMPLATES = {
  a1: () => import("./a1-template.json"),
  a1mini: () => import("./a1mini-template.json"),
  "a1-n02": () => import("./a1-n02-template.json"),
  "a1mini-n02": () => import("./a1mini-n02-template.json"),
};


// ------------------------------------------------------------ geometry

/** Indexed mesh in print orientation (face-down), with shared vertices. */
function meshOf(geom, height, faceDown) {
  const pos = geom.attributes.position;
  const index = geom.index ? geom.index.array : null;
  const count = index ? index.length : pos.count;
  const map = new Map(), verts = [], tris = [];
  const vid = (i) => {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (faceDown) { y = -y; z = height - z; }       // 180° about X, sitting on the plate
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let id = map.get(key);
    if (id === undefined) { id = verts.length; map.set(key, id); verts.push(key); }
    return id;
  };
  for (let t = 0; t < count; t += 3) {
    const a = vid(index ? index[t] : t), b = vid(index ? index[t + 1] : t + 1), c = vid(index ? index[t + 2] : t + 2);
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return { verts, tris };
}

function meshXml(id, { verts, tris }) {
  const v = verts.map((k) => { const [x, y, z] = k.split(","); return `<vertex x="${+x}" y="${+y}" z="${+z}"/>`; }).join("");
  let t = "";
  for (let i = 0; i < tris.length; i += 3) t += `<triangle v1="${tris[i]}" v2="${tris[i + 1]}" v3="${tris[i + 2]}"/>`;
  return `<object id="${id}" type="model"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const NS = `xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"`;
const XML = `<?xml version="1.0" encoding="UTF-8"?>\n`;

// ------------------------------------------------------------ settings

function projectSettings(template, used, plates, bed, nozzle) {
  const s = structuredClone(template.settings);
  for (const key of template.perFilament) s[key] = used.map((slot) => template.settings[key][slot]);
  const n = used.length;
  s.filament_colour = used.map((slot) => FILAMENT_SLOTS[slot].hex.toUpperCase());
  s.filament_map = Array(n).fill("1");
  s.flush_volumes_vector = Array(2 * n).fill("140");
  // Bambu Studio's own auto-calculated purge for each pair of colours (flush.json, from
  // tools/make_flush_table.py), plus a safety margin: dark after light needs little, light
  // after dark a lot (Black → White 578 mm³, White → Black 163).
  s.flush_volumes_matrix = used.flatMap((a) => used.map((b) => String(purge(a, b))));
  // Bambu Studio may switch the prime tower on when it loads your presets, so plan
  // for it: a small tower in the slot we keep free on every plate. On the A1 most
  // purging goes down the waste chute; the tower only takes prime_volume per change.
  const spots = plates.map((p) => towerSpot(p.foot, bed));
  s.enable_prime_tower = "1";
  s.prime_tower_width = "35";
  s.wipe_tower_x = spots.map((t) => t.x.toFixed(1));
  s.wipe_tower_y = spots.map((t) => t.y.toFixed(1));
  // The face is printed first, so the lettering and the icon's fine lines are the first
  // layer. Bambu's defaults there (classic walls, 0.5 mm first-layer lines, elephant-foot
  // compensation narrowing every colour region) leave gaps in letters and drop lines thinner
  // than two walls: a plate of reminders got 25 % less inlay plastic than its shapes need.
  // Arachne varies the line width to fill thin strokes; the nozzle's normal line width
  // (0.42 mm, or 0.22 on a 0.2 mm nozzle) fits them better than the first layer's wider one.
  s.wall_generator = "arachne";
  s.initial_layer_line_width = nozzle.firstLine;
  s.elefant_foot_compensation = "0";
  // Bambu Studio keeps a project's own values only for the settings listed here as changed
  // from its system presets (process first, then each filament, then the printer); on
  // opening, it resets the rest to the preset. The command-line slicer doesn't, so this
  // only shows in the app.
  const ours = ["elefant_foot_compensation", "initial_layer_line_width", "wall_generator"];
  if (nozzle.towerInfillGap) { s.prime_tower_infill_gap = nozzle.towerInfillGap; ours.push("prime_tower_infill_gap"); }
  s.different_settings_to_system = [ours.sort().join(";"), ...used.map(() => ""), ""];
  s.inherits_group = ["", ...used.map(() => ""), ""];
  return s;
}

// ------------------------------------------------------------ writer

/**
 * The order the first layer prints its filaments in (1-based, every filament of the
 * project): the inlays' colours first, the coin's own last. The layers above are all
 * coin, so it then carries on without another change; Bambu's automatic order sometimes
 * starts with the coin and swaps back (one change and its purge more).
 */
function firstLayerOrder(plate, usedSlots) {
  const coin = new Set(plate.items.map((it) => slotOf(it.token.colours.base)));
  const order = [...usedSlots.filter((s) => !coin.has(s)), ...usedSlots.filter((s) => coin.has(s))];
  return order.map((s) => usedSlots.indexOf(s) + 1);
}

/**
 * Builds the .3mf for `printer` ("a1" or "a1mini") with `nozzle` ("0.4" or "0.2"). `items` are {token, title, group};
 * returns {blob, plan}. `onProgress(done, total)` is called as tokens are written.
 */
export async function buildBambuProject(items, { printer = "a1", nozzle: nozzleId = "0.4", faceDown = true, onProgress = () => {} } = {}) {
  if (!items.length) throw new Error("add some tokens to the print queue first");
  const { bed, id } = printerOf(printer);
  const nozzle = nozzleOf(nozzleId);
  const template = (await TEMPLATES[id + nozzle.suffix]()).default;
  const plan = planPlates(items, { bed });
  const stride = plateStride(bed);
  const usedSlots = [...new Set(plan.plates.flatMap((p) => [...p.slots]))].sort((a, b) => a - b);
  const extruder = (slot) => usedSlots.indexOf(slot) + 1;
  const cols = Math.ceil(Math.sqrt(plan.plates.length));

  const zip = new JSZip();
  let nextId = 1, identify = 100;
  const resources = [], build = [], rels = [], objectsCfg = [], platesCfg = [];
  let done = 0;

  for (const [pi, plate] of plan.plates.entries()) {
    const px = (pi % cols) * stride, py = -Math.floor(pi / cols) * stride;
    const slots = slotsFor(plate.foot, bed);
    const instances = [];
    for (const [ti, it] of plate.items.entries()) {
      const { x, y } = slots[ti];
      const { token } = it;
      const file = `/3D/Objects/token_${pi + 1}_${ti + 1}.model`;
      const partXml = [], components = [], partsCfg = [];
      // The magnet hole is a negative part: the slicer cuts it out of every colour.
      for (const part of [...PARTS, "magnet"]) {
        const geom = token.parts[part];
        if (!geom) continue;
        const id = nextId++;
        // The window style has its relief on top, so it prints face-up.
        const faceUp = token.spec.style === "window" && token.spec.windowFinish !== "flat";
        partXml.push(meshXml(id, meshOf(geom, token.spec.height, faceDown && !faceUp)));
        components.push(`<component p:path="${file}" objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} 0"/>`);
        partsCfg.push(`    <part id="${id}" subtype="${part === "magnet" ? "negative_part" : "normal_part"}">
      <metadata key="name" value="${part}"/>
      <metadata key="matrix" value="1 0 0 ${x.toFixed(3)} 0 1 0 ${y.toFixed(3)} 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="${extruder(slotOf(token.colours[part] ?? token.colours.base))}"/>
    </part>`);
      }
      zip.file(file.slice(1), `${XML}<model unit="millimeter" xml:lang="en-US" ${NS}><metadata name="BambuStudio:3mfVersion">1</metadata><resources>${partXml.join("")}</resources><build/></model>`);
      rels.push(file);
      const objId = nextId++;
      resources.push(`  <object id="${objId}" type="model"><components>${components.join("")}</components></object>`);
      build.push(`  <item objectid="${objId}" transform="1 0 0 0 1 0 0 0 1 ${px.toFixed(3)} ${py.toFixed(3)} 0" printable="1"/>`);
      objectsCfg.push(`  <object id="${objId}">
    <metadata key="name" value="${esc(it.title)}"/>
    <metadata key="extruder" value="${extruder(slotOf(token.colours.base))}"/>
${partsCfg.join("\n")}
  </object>`);
      instances.push(`    <model_instance>
      <metadata key="object_id" value="${objId}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="${identify++}"/>
    </model_instance>`);
      onProgress(++done, items.length);
      if (done % 5 === 0) await new Promise((r) => setTimeout(r));   // keep the page responsive
    }
    platesCfg.push(`  <plate>
    <metadata key="plater_id" value="${pi + 1}"/>
    <metadata key="plater_name" value="${esc(plate.name)}"/>
    <metadata key="locked" value="false"/>
    <metadata key="first_layer_sequence_choice" value="customize"/>
    <metadata key="first_layer_print_sequence" value="${firstLayerOrder(plate, usedSlots).join(" ")}"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <metadata key="filament_maps" value="${usedSlots.map(() => 1).join(" ")}"/>
${instances.join("\n")}
  </plate>`);
  }

  // Pauses to drop hidden magnets in: one per distinct height on each plate.
  const pauses = plan.plates.map((p) => [...new Set(p.items.map((it) => it.token.magnet?.pauseZ).filter(Boolean))].sort((a, b) => a - b));
  if (pauses.some((z) => z.length)) {
    zip.file("Metadata/custom_gcode_per_layer.xml", `${XML}<custom_gcodes_per_layer>
${pauses.map((zs, pi) => zs.length ? `<plate>
<plate_info id="${pi + 1}"/>
${zs.map((z) => `<layer top_z="${z}" type="1" extruder="1" color="" extra="" gcode="M400 U1"/>`).join("\n")}
<mode value="MultiAsSingle"/>
</plate>` : "").filter(Boolean).join("\n")}
</custom_gcodes_per_layer>`);
  }

  const today = new Date().toISOString().slice(0, 10);
  zip.file("3D/3dmodel.model", `${XML}<model unit="millimeter" xml:lang="en-US" ${NS}>
 <metadata name="Application">BambuStudio-02.08.02.61</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="CreationDate">${today}</metadata>
 <metadata name="Title">Midnight Mint tokens</metadata>
 <resources>
${resources.join("\n")}
 </resources>
 <build>
${build.join("\n")}
 </build>
</model>`);
  zip.file("3D/_rels/3dmodel.model.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.map((r, i) => ` <Relationship Target="${r}" Id="rel-${i + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`).join("\n")}
</Relationships>`);
  zip.file("_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`);
  zip.file("[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`);
  zip.file("Metadata/model_settings.config", `${XML}<config>
${objectsCfg.join("\n")}
${platesCfg.join("\n")}
</config>`);
  zip.file("Metadata/project_settings.config", JSON.stringify(projectSettings(template, usedSlots, plan.plates, bed, nozzle), null, 4));
  zip.file("Metadata/slice_info.config", `${XML}<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="02.08.02.61"/>
  </header>
</config>`);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, plan, filaments: usedSlots.map((s) => FILAMENT_SLOTS[s]), pauses: [...new Set(pauses.flat())].sort((a, b) => a - b) };
}
