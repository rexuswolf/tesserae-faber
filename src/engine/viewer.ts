// The 3D preview (WebGL renderer and camera controls). Loaded on its own, after the app
// starts, so the sheet doesn't wait for it; on a phone it isn't needed until a token is opened.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
  let diameter = 45;

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
    const d = diameter;
    // close enough to read a letter, not so close the camera goes into the coin; never lost
    controls.minDistance = d * 0.8; controls.maxDistance = d * 6;
    if (kind === "top") camera.position.set(0, -0.001, d * 2.5);
    else if (kind === "back") camera.position.set(0, 0.001, -d * 2.5);
    else if (kind === "side") camera.position.set(d * 0.3, -d * 1.25, d * 0.42);
    else camera.position.set(0, -d * 1.5, d * 1.85);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  return {
    setToken(token: Token) {
      // A token of another size (a card after a coin): frame it again, from the same side.
      const resize = token.spec.diameter !== diameter;
      diameter = token.spec.diameter;
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
    setView,
    controls,
    /** The scene, for a page that lights it its own way (the prototypes' raking light). */
    scene,
    dispose() { running = false; renderer.dispose(); },
  };
}
