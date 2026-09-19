/**
 * Project scaffolds ULTRON can create in the sandboxed workspace.
 * Templates are self-contained where possible so verification works offline
 * (the 3D site runs from a CDN import — no install step required to see it).
 */

export type ScaffoldKind = "website" | "react-app" | "3d-site";

export interface ScaffoldFile {
  readonly path: string;
  readonly content: string;
}

export function scaffoldFiles(kind: ScaffoldKind, name: string): ScaffoldFile[] {
  switch (kind) {
    case "3d-site":
      return threeDSite(name);
    case "react-app":
      return reactApp(name);
    default:
      return website(name);
  }
}

/* --------------------------------- website -------------------------------- */

function website(name: string): ScaffoldFile[] {
  return [
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titleCase(name)}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="hero">
    <p class="tag">created by ULTRON</p>
    <h1>${titleCase(name)}</h1>
    <p class="sub">A clean starting point — static, fast, hackable.</p>
  </main>
  <script src="./main.js"></script>
</body>
</html>
`,
    },
    {
      path: "styles.css",
      content: `:root{color-scheme:dark;--gold:#ffd76a;--amber:#ffb02e}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;display:grid;place-items:center;background:#080604;color:#f5ead2;font-family:system-ui,sans-serif}
.hero{text-align:center;max-width:44rem;padding:2rem}
.tag{letter-spacing:.4em;text-transform:uppercase;font-size:.7rem;color:var(--amber)}
h1{font-size:clamp(2.6rem,8vw,5.4rem);margin:.6rem 0;background:linear-gradient(120deg,var(--gold),var(--amber));-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#a8977a;font-size:1.05rem}
`,
    },
    {
      path: "main.js",
      content: `document.addEventListener("pointermove", (e) => {
  document.body.style.background =
    \`radial-gradient(600px at \${e.clientX}px \${e.clientY}px, rgba(255,176,46,.08), transparent), #080604\`;
});
`,
    },
    {
      path: "README.md",
      content: `# ${titleCase(name)}\n\nStatic site scaffolded by ULTRON. Open index.html in a browser.\n`,
    },
  ];
}

/* -------------------------------- react app -------------------------------- */

function reactApp(name: string): ScaffoldFile[] {
  return [
    {
      path: "package.json",
      content: `{
  "name": "${name}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
`,
    },
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titleCase(name)}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`,
    },
    {
      path: "src/main.jsx",
      content: `import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
`,
    },
    {
      path: "src/App.jsx",
      content: `export function App() {
  return (
    <main className="hero">
      <p className="tag">created by ultron</p>
      <h1>${titleCase(name)}</h1>
      <p className="sub">React + Vite. Run "npm install" then "npm run dev".</p>
    </main>
  );
}
`,
    },
    {
      path: "src/styles.css",
      content: `:root{color-scheme:dark;--gold:#ffd76a;--amber:#ffb02e}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;display:grid;place-items:center;background:#080604;color:#f5ead2;font-family:system-ui,sans-serif}
.hero{text-align:center;max-width:44rem;padding:2rem}
.tag{letter-spacing:.4em;text-transform:uppercase;font-size:.7rem;color:var(--amber)}
h1{font-size:clamp(2.6rem,8vw,5.4rem);margin:.6rem 0;background:linear-gradient(120deg,var(--gold),var(--amber));-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#a8977a}
`,
    },
    {
      path: "README.md",
      content: `# ${titleCase(name)}\n\nReact + Vite scaffold. Requires \`npm install\` (confirmation-gated) then \`npm run dev\`.\n`,
    },
  ];
}

/* --------------------------------- 3d site --------------------------------- */

function threeDSite(name: string): ScaffoldFile[] {
  return [
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titleCase(name)} — 3D</title>
  <link rel="stylesheet" href="./styles.css" />
  <script type="importmap">
    { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js" } }
  </script>
</head>
<body>
  <canvas id="scene"></canvas>
  <main class="overlay">
    <p class="tag">cinematic 3d — created by ULTRON</p>
    <h1>${titleCase(name)}</h1>
    <p class="sub">Drag to orbit. Scroll to pulse the core.</p>
  </main>
  <script type="module" src="./main.js"></script>
</body>
</html>
`,
    },
    {
      path: "styles.css",
      content: `:root{color-scheme:dark;--gold:#ffd76a;--amber:#ffb02e;--deep:#ff8a3c}
*{box-sizing:border-box;margin:0}
html,body{height:100%;overflow:hidden;background:#070502}
#scene{position:fixed;inset:0;display:block}
.overlay{position:fixed;inset:0;display:grid;place-content:center;text-align:center;color:#f7ecd4;
  font-family:system-ui,sans-serif;pointer-events:none}
.tag{letter-spacing:.45em;text-transform:uppercase;font-size:.68rem;color:var(--amber);margin-bottom:1rem}
h1{font-size:clamp(3rem,10vw,7rem);line-height:.95;background:linear-gradient(115deg,#fff3d6,var(--gold) 40%,var(--deep));
  -webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 60px rgba(255,176,46,.25)}
.sub{margin-top:1.1rem;color:#b09a72;font-size:.95rem;letter-spacing:.08em}
`,
    },
    {
      path: "main.js",
      content: `import * as THREE from "three";

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
`,
    },
    {
      path: "README.md",
      content: `# ${titleCase(name)} — cinematic 3D\n\nThree.js (CDN import map, no build step). Open index.html via any static server, e.g. \`npx serve .\` or a local vendored copy of three.js for fully offline use.\n`,
    },
  ];
}

function titleCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
