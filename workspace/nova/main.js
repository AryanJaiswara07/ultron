import * as THREE from "three";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070502, 0.08);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.6, 7);

const gold = new THREE.Color("#ffb02e");
const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.35, 1),
  new THREE.MeshBasicMaterial({ color: gold, wireframe: true, transparent: true, opacity: 0.9 })
);
scene.add(core);

const halo = new THREE.Mesh(
  new THREE.TorusGeometry(2.3, 0.012, 8, 160),
  new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.6 })
);
halo.rotation.x = Math.PI / 2.4;
scene.add(halo);
const halo2 = halo.clone();
halo2.scale.setScalar(1.4);
halo2.rotation.x = Math.PI / 1.8;
halo2.material = halo.material.clone();
halo2.material.opacity = 0.3;
scene.add(halo2);

const COUNT = 900;
const positions = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const r = 3 + Math.random() * 6;
  const t = Math.random() * Math.PI * 2;
  const p = Math.acos(2 * Math.random() - 1);
  positions[i * 3] = r * Math.sin(p) * Math.cos(t);
  positions[i * 3 + 1] = r * Math.cos(p);
  positions[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
}
const points = new THREE.Points(
  new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
  new THREE.PointsMaterial({ color: 0xffc66a, size: 0.02, transparent: true, opacity: 0.8 })
);
scene.add(points);

let targetRX = 0, targetRY = 0, pulse = 0;
addEventListener("pointermove", (e) => {
  targetRY = (e.clientX / innerWidth - 0.5) * 0.8;
  targetRX = (e.clientY / innerHeight - 0.5) * 0.5;
});
addEventListener("wheel", (e) => { pulse = Math.min(pulse + Math.abs(e.deltaY) * 0.0015, 1.2); });

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  pulse *= 0.94;
  core.rotation.y = t * 0.3;
  core.rotation.x = t * 0.17;
  const s = 1 + Math.sin(t * 1.6) * 0.04 + pulse * 0.25;
  core.scale.setScalar(s);
  halo.rotation.z = t * 0.2;
  halo2.rotation.z = -t * 0.13;
  points.rotation.y = t * 0.03;
  camera.rotation.x += (targetRX - camera.rotation.x) * 0.05;
  camera.rotation.y += (-targetRY - camera.rotation.y) * 0.05;
  renderer.render(scene, camera);
});
