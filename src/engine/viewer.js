// The 3D preview (WebGL renderer and camera controls). Loaded on its own, after the app
// starts, so the sheet doesn't wait for it; on a phone it isn't needed until a token is opened.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/** A rotatable preview bound to a canvas. */
export function createViewer(canvas, { background = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: background === null });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  // Bright enough that a face seen straight on ("front" or "back") shows its filament's colour,
  // as the flat thumbnails do.
  const KEY = 2.9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3440, 1.57));
  const key = new THREE.DirectionalLight(0xffffff, KEY); key.position.set(-70, -90, 150); scene.add(key);
  // The back gets the same key light, mirrored: as bright as the front, and lit from the same
  // side of the screen in the "back" view (that camera sees x flipped).
  const backKey = new THREE.DirectionalLight(0xffffff, KEY); backKey.position.set(70, -90, -150); scene.add(backKey);

  const meshes = {};
  for (const name of ["base", "front", "icon", "frame", "back", "hole"]) {
    meshes[name] = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }));
    scene.add(meshes[name]);
  }
  // Inlays are flush with the coin; nudge them out so the preview doesn't flicker.
  meshes.front.position.z = meshes.frame.position.z = 0.015;
  meshes.icon.position.z = 0.03;   // over the flat window
  meshes.back.position.z = -0.015;
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

  function setView(kind = "angle") {
    const d = diameter;
    if (kind === "top") camera.position.set(0, -0.001, d * 2.5);
    else if (kind === "back") camera.position.set(0, 0.001, -d * 2.5);
    else if (kind === "side") camera.position.set(d * 0.3, -d * 1.25, d * 0.42);
    else camera.position.set(0, -d * 1.5, d * 1.85);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  return {
    setToken(token) {
      diameter = token.spec.diameter;
      for (const [name, mesh] of Object.entries(meshes)) {
        mesh.geometry.dispose();
        mesh.geometry = token.parts[name] || new THREE.BufferGeometry();
        mesh.material.color.set(token.colours[name]);
      }
      magnetMesh.geometry.dispose(); cavityLines.geometry.dispose();
      magnetMesh.geometry = token.parts.magnetBody || new THREE.BufferGeometry();
      cavityLines.geometry = token.parts.cavity || new THREE.BufferGeometry();
      coinLines.geometry.dispose();
      coinLines.geometry = token.parts.base && token.parts.magnetBody ? new THREE.EdgesGeometry(token.parts.base, 20) : new THREE.BufferGeometry();
      applyXray();
    },
    setXray(on) { xray = on; applyXray(); },
    setView,
    controls,
    dispose() { running = false; renderer.dispose(); },
  };
}
