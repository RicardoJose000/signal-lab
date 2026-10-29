/* Scene 02: the market as a 3D field of candles. A scanner sweeps every row,
   the camera follows scroll, and one coin ignites. Simulated, for illustration. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const section = document.getElementById("scene");
const canvas = document.getElementById("three");
const caps = Array.from(section.querySelectorAll(".cap"));
const rails = Array.from(section.querySelectorAll(".rail i"));
const lock = document.getElementById("lock");
const lockbox = document.getElementById("lockbox");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  document.documentElement.classList.add("no3d");
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const BG = new THREE.Color(0x04060b);
scene.background = BG;
scene.fog = new THREE.FogExp2(0x04060b, 0.019);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

/* lights */
scene.add(new THREE.HemisphereLight(0x8fb0ff, 0x05070c, 0.9));
const key = new THREE.DirectionalLight(0xbcd2ff, 1.3);
key.position.set(-14, 22, 10);
scene.add(key);
const goldLight = new THREE.PointLight(0xf2c14e, 0, 26, 1.6);
scene.add(goldLight);

/* floor grid */
const grid = new THREE.GridHelper(120, 96, 0x2a3d60, 0x131e33);
grid.position.y = -0.01;
scene.add(grid);

/* candle field */
const COLS = 46, ROWS = 32, GAP = 1.22;
const COUNT = COLS * ROWS;
const geo = new THREE.BoxGeometry(0.6, 1, 0.6);
geo.translate(0, 0.5, 0);
const mat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.55 });
const field = new THREE.InstancedMesh(geo, mat, COUNT);
scene.add(field);

function rand(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
const r = rand(7);
const TARGET_C = 31, TARGET_R = 21;
const items = [];
const steel = new THREE.Color(0x34496b), up = new THREE.Color(0x2c8f6b), down = new THREE.Color(0xa53f39);
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const x = (col - COLS / 2) * GAP, z = (row - ROWS / 2) * GAP;
    const roll = r();
    const base = roll < 0.12 ? up : roll < 0.22 ? down : steel;
    items.push({ x, z, h: 0.25 + Math.pow(r(), 2.2) * 1.8, ph: r() * Math.PI * 2, sp: 0.5 + r() * 0.9, base, target: col === TARGET_C && row === TARGET_R });
  }
}
const tgt = items.find(i => i.target);

/* the coin that ignites */
const tMat = new THREE.MeshStandardMaterial({ color: 0x2a3a55, emissive: 0xf2c14e, emissiveIntensity: 0, roughness: 0.25, metalness: 0.4 });
const tMesh = new THREE.Mesh(geo, tMat);
tMesh.position.set(tgt.x, 0, tgt.z);
scene.add(tMesh);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 64), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2;
ring.position.set(tgt.x, 0.02, tgt.z);
scene.add(ring);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.16, 30, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
beam.position.set(tgt.x, 15, tgt.z);
scene.add(beam);

/* scanner sweep */
const sweep = new THREE.Mesh(new THREE.PlaneGeometry(COLS * GAP + 6, 0.08),
  new THREE.MeshBasicMaterial({ color: 0x5b93f5, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
sweep.rotation.x = -Math.PI / 2;
scene.add(sweep);

/* dust */
const dustGeo = new THREE.BufferGeometry();
const dn = 900, dp = new Float32Array(dn * 3);
for (let i = 0; i < dn; i++) { dp[i * 3] = (r() - 0.5) * 70; dp[i * 3 + 1] = r() * 14; dp[i * 3 + 2] = (r() - 0.5) * 50; }
dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x8fb0ff, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
scene.add(dust);

/* post */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.45, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* camera path */
const shots = [
  { p: new THREE.Vector3(-2, 26, 34), l: new THREE.Vector3(0, 0, 0) },
  { p: new THREE.Vector3(-16, 11, 22), l: new THREE.Vector3(2, 0, 0) },
  { p: new THREE.Vector3(10, 6.5, 22), l: new THREE.Vector3(tgt.x - 4, 1, tgt.z - 2) },
  { p: new THREE.Vector3(tgt.x + 8.5, 4.6, tgt.z + 12), l: new THREE.Vector3(tgt.x - 1.5, 2.8, tgt.z) },
];
const camPos = shots[0].p.clone(), camLook = shots[0].l.clone();
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function shotAt(p) {
  const seg = Math.min(shots.length - 2, Math.floor(p * (shots.length - 1)));
  const t = ease(p * (shots.length - 1) - seg);
  return { p: shots[seg].p.clone().lerp(shots[seg + 1].p, t), l: shots[seg].l.clone().lerp(shots[seg + 1].l, t) };
}

/* state */
let progress = 0, visible = false, mx = 0, my = 0;
function measure() {
  const rect = section.getBoundingClientRect();
  const total = rect.height - innerHeight;
  progress = Math.min(1, Math.max(0, -rect.top / (total || 1)));
}
addEventListener("scroll", measure, { passive: true });
addEventListener("pointermove", e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { rootMargin: "100px 0px" }).observe(section);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w < 700 ? 56 : 42;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
measure();

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), col = new THREE.Color();
const clock = new THREE.Clock();
let activeCap = -1;

function frame() {
  requestAnimationFrame(frame);
  if (!visible) return;
  const t = reduce ? 4 : clock.getElapsedTime();
  const p = progress;

  // captions + rail
  const ci = Math.min(3, Math.floor(p * 4.0001));
  if (ci !== activeCap) { caps.forEach((c, k) => c.classList.toggle("on", k === ci)); activeCap = ci; }
  rails.forEach((el, k) => el.style.setProperty("--f", Math.min(1, Math.max(0, p * 4 - k)).toFixed(3)));

  // ignition amount (last quarter)
  const ign = Math.min(1, Math.max(0, (p - 0.66) / 0.24));
  const dim = 1 - ign * 0.55;

  // sweep across rows, once every 3.2s
  const sz = ((t / 3.2) % 1) * (ROWS * GAP + 4) - (ROWS * GAP) / 2 - 2;
  sweep.position.set(0, 0.04, sz);

  for (let k = 0; k < COUNT; k++) {
    const it = items[k];
    const breathe = reduce ? 0 : Math.sin(t * it.sp + it.ph) * 0.18 + Math.sin(t * 0.37 + it.x * 0.21) * 0.12;
    const h = it.target ? 0.001 : Math.max(0.08, it.h + breathe);
    s3.set(1, h, 1);
    v3.set(it.x, 0, it.z);
    m4.compose(v3, q, s3);
    field.setMatrixAt(k, m4);
    const d = it.z - sz, lit = Math.exp(-(d * d) / 0.9);
    col.copy(it.base).multiplyScalar((1 + lit * 2.4) * dim);
    field.setColorAt(k, col);
  }
  field.instanceMatrix.needsUpdate = true;
  field.instanceColor.needsUpdate = true;

  // the target coin
  const th = 1.1 + ign * 5 + (reduce ? 0 : Math.sin(t * 2) * 0.08 * ign);
  tMesh.scale.set(1, th, 1);
  tMat.emissiveIntensity = ign * 1.5;
  tMat.color.setRGB(0.16 + ign * 0.5, 0.22 + ign * 0.35, 0.33 - ign * 0.2);
  goldLight.position.set(tgt.x, th + 1.5, tgt.z);
  goldLight.intensity = ign * 40;
  const pulse = reduce ? 0.5 : (t * 0.8) % 1;
  ring.scale.setScalar(1 + pulse * 3);
  ring.material.opacity = ign * (1 - pulse) * 0.9;
  beam.material.opacity = ign * 0.08;
  dust.rotation.y = reduce ? 0 : t * 0.01;

  // camera
  const sh = shotAt(p);
  sh.p.x += mx * 2.2; sh.p.y -= my * 1.2;
  camPos.lerp(sh.p, reduce ? 1 : 0.07);
  camLook.lerp(sh.l, reduce ? 1 : 0.07);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  composer.render();

  // HTML tag pinned to the coin top
  if (ign > 0.6) {
    v3.set(tgt.x, th, tgt.z).project(camera);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const x = Math.min(W - 110, Math.max(110, (v3.x * 0.5 + 0.5) * W)), y = Math.min(H - 40, Math.max(150, (-v3.y * 0.5 + 0.5) * H));
    lockbox.style.left = x + "px"; lockbox.style.top = y + "px";
    lock.classList.add("on");
  } else lock.classList.remove("on");
}
frame();
