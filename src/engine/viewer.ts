// The 3D preview (WebGL renderer and camera controls). Loaded on its own, after the app
// starts, so the sheet doesn't wait for it; on a phone it isn't needed until a token is opened.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { PartName, Token } from "../types.ts";

/** The parts the preview draws; `hole` is the open pocket seen from the back. */
type ViewPart = PartName | "hole";
type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
/** A wheel event already turned into pixels (see below). */
type PixelWheel = WheelEvent & { mmPixels?: boolean };
/** What the app drives: the token shown, the X-ray, the camera. */
export type Viewer = ReturnType<typeof createViewer>;
/** The camera views: "angle" (the default), "top", "back" and "side". */
export type ViewKind = "angle" | "top" | "back" | "side";

/**
 * A size reference on the ground (z = 0): a line every 10 mm, a bolder one every 50 mm, fading out towards its edge
 * (by each point's alpha: a black line on a see-through canvas would show dark).
 */
function sizeGrid(half: number) {
  const pts: number[] = [], cols: number[] = [], c = new THREE.Color(0xefe6d6), n = 20;
  for (let v = -half; v <= half + 1e-6; v += 10) {
    const bold = Math.abs(Math.round(v) % 50) < 1e-6;
    for (const [a, b] of [[[v, -half], [v, half]], [[-half, v], [half, v]]]) for (let i = 0; i < n; i++) for (const k of [i, i + 1]) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      pts.push(x, y, -0.05);
      cols.push(c.r, c.g, c.b, Math.max(0, 1 - Math.hypot(x, y) / half) ** 1.3 * (bold ? 0.5 : 0.22));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 4));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
}
/** The size of a standard six-sided die (mm), and the room between it and the token. */
const DIE = 16, DIE_GAP = 5;
/** A standard d6 beside the token, for its size: rounded edges, ivory, dark pips, opposite faces adding up to 7. */
function sizeDie() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(DIE, DIE, DIE, 4, 1.6), new THREE.MeshStandardMaterial({ color: 0xe9e3d6, roughness: 0.45 })));
  const pip = new THREE.CircleGeometry(1.35, 24), mat = new THREE.MeshStandardMaterial({ color: 0x1d1b1f, roughness: 0.7 });
  const at: Record<number, number[][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const faces: [number, [number, number, number]][] = [[1, [0, 0, 1]], [6, [0, 0, -1]], [2, [0, -1, 0]], [5, [0, 1, 0]], [3, [1, 0, 0]], [4, [-1, 0, 0]]];
  for (const [num, nrm] of faces) for (const [u, v] of at[num]) {
    const m = new THREE.Mesh(pip, mat), N = new THREE.Vector3(...nrm);
    m.lookAt(N); m.position.copy(N.clone().multiplyScalar(DIE / 2 + 0.02));
    const U = Math.abs(N.z) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), W = new THREE.Vector3().crossVectors(N, U);
    m.position.addScaledVector(U, u * 4.2).addScaledVector(W, v * 4.2);
    g.add(m);
  }
  g.position.z = DIE / 2;
  return g;
}

/** A rotatable preview bound to a canvas. */
export function createViewer(canvas: HTMLCanvasElement, { background = null }: { background?: THREE.ColorRepresentation | null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: background === null });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  // A mouse wheel's click (about 100 px) moves the camera ~12%, not three's 5%.
  controls.zoomSpeed = 2.5;
  // This three (0.160) reads every wheel delta as pixels; Firefox gives lines (3 a click), which
  // barely moved the camera. Lines and pages become pixels before the controls see them.
  canvas.addEventListener("wheel", (e: PixelWheel) => {
    if (e.deltaMode === 0 || e.mmPixels) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const k = e.deltaMode === 1 ? 33 : 800;
    const px: PixelWheel = new WheelEvent("wheel", { deltaX: e.deltaX * k, deltaY: e.deltaY * k, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true });
    px.mmPixels = true;
    canvas.dispatchEvent(px);
  }, { capture: true, passive: false });
  // Bright enough that a face seen straight on ("front" or "back") shows its filament's colour,
  // as the flat thumbnails do.
  const KEY = 2.9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3440, 1.57));
  const key = new THREE.DirectionalLight(0xffffff, KEY); key.position.set(-70, -90, 150); scene.add(key);
  // The back gets the same key light, mirrored: as bright as the front, and lit from the same
  // side of the screen in the "back" view (that camera sees x flipped).
  const backKey = new THREE.DirectionalLight(0xffffff, KEY); backKey.position.set(70, -90, -150); scene.add(backKey);

  const meshes = {} as Record<ViewPart, PartMesh>;
  for (const name of ["base", "front", "icon", "frame", "back", "backIcon", "backFrame", "hole"] as ViewPart[]) {
    meshes[name] = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }));
    scene.add(meshes[name]);
  }
  // Inlays are flush with the coin; nudge them out so the preview doesn't flicker.
  meshes.front.position.z = meshes.frame.position.z = 0.015;
  meshes.icon.position.z = 0.03;   // over the flat window
  meshes.back.position.z = -0.015;
  // a two-state token's back is a front too: its window's icon over the window; a card's back, its
  // phrase, icon and frame over the plate of its own colour (the `back` part)
  meshes.backIcon.position.z = meshes.backFrame.position.z = -0.03;
  // Where an inlay runs along an edge (a ring's or a base tray's lines), its side lies in the body's
  // wall: the body is drawn a hair behind wherever they meet, so the inlay shows, not stripes of both.
  Object.assign(meshes.base.material, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  // X-ray view: the coin turns see-through and shows the magnet inside.
  const magnetMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xc8ced6, emissive: 0x30343a, roughness: 0.25, metalness: 0.8 }));
  const cavityLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc9a227 }));
  // The coin's outline, so its edges still read when it is see-through.
  const coinLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xefe6d6, transparent: true, opacity: 0.55 }));
  magnetMesh.visible = cavityLines.visible = coinLines.visible = false;
  magnetMesh.renderOrder = cavityLines.renderOrder = -1;    // drawn before the see-through coin
  scene.add(magnetMesh, cavityLines, coinLines);
  let xray = false;
  function applyXray() {
    for (const mesh of Object.values(meshes)) {
      mesh.material.transparent = xray;
      mesh.material.opacity = xray ? 0.2 : 1;
      mesh.material.depthWrite = !xray;
      mesh.material.needsUpdate = true;
    }
    magnetMesh.visible = cavityLines.visible = coinLines.visible = xray && magnetMesh.geometry.attributes.position != null;
  }
  let diameter = 45, foot = 45;
  // the size references: the grid under the token, a d6 beside it (each seen from above only: from below, the Back
  // view, they'd stand in front of the token's back)
  let grid = sizeGrid(80), gridOn = true, dieOn = false;
  const die = sizeDie();
  scene.add(grid, die);
  die.visible = false;
  /** What the camera frames: the token, or with the die the two side by side (its middle that far along x). */
  const framed = () => (dieOn ? { d: foot + 2 * (DIE_GAP + DIE) * 0.75, x: (foot / 2 + DIE_GAP + DIE / 2) / 2 } : { d: diameter, x: 0 });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  let running = true;
  (function loop() {
    if (!running) return;
    controls.update();
    const above = camera.position.z > 0;
    grid.visible = gridOn && above; die.visible = dieOn && above;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  let view: ViewKind = "angle";
  function setView(kind: ViewKind = "angle") {
    view = kind;
    // Drop any spin left from a drag first: with damping on it would keep turning the coin
    // after the camera is put back (the "Front" view came out tilted). An update without
    // damping spends it and clears it; then the camera goes where the view says.
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    // the die only counts seen from above: the Back view frames the token alone
    const f = kind === "back" ? { d: diameter, x: 0 } : framed(), d = f.d, x = f.x;
    // close enough to read a letter, not so close the camera goes into the coin; never lost
    controls.minDistance = d * 0.8; controls.maxDistance = d * 6;
    if (kind === "top") camera.position.set(x, -0.001, d * 2.5);
    else if (kind === "back") camera.position.set(0, 0.001, -d * 2.5);
    else if (kind === "side") camera.position.set(x + d * 0.3, -d * 1.25, d * 0.42);
    else camera.position.set(x, -d * 1.5, d * 1.85);
    controls.target.set(x, 0, 0);
    controls.update();
  }

  return {
    setToken(token: Token) {
      // A token of another size (a card after a coin): frame it again, from the same side.
      const resize = token.spec.diameter !== diameter;
      diameter = token.spec.diameter;
      // its footprint across (a card's long side, a piece's square, a coin's diameter): the die stands beside it
      foot = token.foot ? Math.max(token.foot.w, token.foot.h) : diameter;
      die.position.set(foot / 2 + DIE_GAP + DIE / 2, foot * 0.12, DIE / 2);
      const half = Math.max(80, Math.ceil((foot * 1.4) / 10) * 10);
      if (Math.abs((grid.geometry.boundingSphere?.radius ?? 0) - half * Math.SQRT2) > 1) { scene.remove(grid); grid.geometry.dispose(); grid = sizeGrid(half); grid.geometry.computeBoundingSphere(); scene.add(grid); }
      if (resize) setView(view);
      for (const [name, mesh] of Object.entries(meshes) as [ViewPart, PartMesh][]) {
        mesh.geometry.dispose();
        mesh.geometry = token.parts[name] || new THREE.BufferGeometry();
        mesh.material.color.set(token.colours[name]!);
      }
      magnetMesh.geometry.dispose(); cavityLines.geometry.dispose();
      magnetMesh.geometry = token.parts.magnetBody || new THREE.BufferGeometry();
      cavityLines.geometry = token.parts.cavity || new THREE.BufferGeometry();
      coinLines.geometry.dispose();
      coinLines.geometry = token.parts.base && token.parts.magnetBody ? new THREE.EdgesGeometry(token.parts.base, 20) : new THREE.BufferGeometry();
      applyXray();
    },
    setXray(on: boolean) { xray = on; applyXray(); },
    /** The grid on the ground, and the d6 beside the token (the camera then takes both in). */
    setGrid(on: boolean) { gridOn = on; },
    setDie(on: boolean) { if (dieOn !== on) { dieOn = on; setView(view); } },
    setView,
    controls,
    /** The scene, for a page that lights it its own way (the prototypes' raking light). */
    scene,
    dispose() { running = false; renderer.dispose(); },
  };
}
