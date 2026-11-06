// A token as STL files in a zip (one per colour, with instructions), for printers other
// than the Bambu A1. Loaded only when someone downloads one.
import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import type JSZip from "jszip";
import { TEAMS, printsFaceUp, reliefTop } from "./token-engine.ts";
import type { PartName, Role, Token, TokenSpec } from "../types.ts";

const M = () => new THREE.Matrix4();
const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

function stl(geom: THREE.BufferGeometry, spec: TokenSpec, faceDown: boolean) {
  const g = geom.clone();
  if (faceDown && !printsFaceUp(spec)) {   // a token with raised parts prints face-up
    g.applyMatrix4(M().makeRotationX(Math.PI));
    g.translate(0, 0, spec.height);
  }
  // Binary STLExporter returns a DataView; JSZip needs the underlying buffer.
  return new STLExporter().parse(new THREE.Mesh(g), { binary: true }).buffer as ArrayBuffer;
}

/** Adds one token's STLs to a JSZip folder. */
export function addTokenToZip(zip: JSZip, token: Token, role: Role, text: string, { faceDown = true }: { faceDown?: boolean } = {}) {
  const name = `${TEAMS[role.team].file}_${slug(text) || slug(role.en)}`;
  const dir = zip.folder(name)!;
  const lines: string[] = [];
  const order: PartName[] = ["base", "front", "icon", "frame", "back", "backIcon", "backFrame"];
  order.forEach((part, i) => {
    const geom = token.parts[part];
    if (!geom) return;
    const file = `${i + 1}_${part}.stl`;
    dir.file(file, stl(geom, token.spec, faceDown));
    lines.push(`${file}  filament ${token.colours[part]}`);
  });
  const m = token.magnet;
  if (m) dir.file("magnet_cut.stl", stl(token.parts.magnet!, token.spec, faceDown && !printsFaceUp(token.spec)));
  const magnetNote = !m ? "" : m.kind === "pocket"
    ? `\nmagnet_cut.stl: add it to the object as a NEGATIVE PART. It leaves a ${(m.radius * 2).toFixed(1)} mm hole in the back\nfor a ${m.md}x${m.mt} mm magnet; glue it in after printing.\n`
    : `\nmagnet_cut.stl: add it to the object as a NEGATIVE PART. It leaves a hidden ${(m.radius * 2).toFixed(1)} mm cavity\nfor a ${m.md}x${m.mt} mm magnet. Add a pause at the layer that ends at ${m.pauseZ} mm,\ndrop the magnet in (a dot of glue keeps it from jumping to the nozzle) and resume.\n`;
  dir.file("README.txt",
    `${text} (${role.en})\nDiameter ${token.spec.diameter} mm, thickness ${+(token.spec.height + reliefTop(token.spec)).toFixed(2)} mm${printsFaceUp(token.spec) ? ", face-up (raised parts on top)" : faceDown ? ", face-down" : ""}.\n\n` +
    `Load all STLs together as ONE object with several parts (Bambu Studio: "Yes" when asked),\nthen give each part its filament:\n\n${lines.join("\n")}\n${magnetNote}`);
  return name;
}
