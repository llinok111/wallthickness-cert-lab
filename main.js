// main.js -- render layer only. Every number comes from src/core.mjs; this file
// does not recompute geometry by itself.
import * as THREE from 'three';
import { makeMesh, wallThickness, verifyWitness } from './src/core.mjs';

const CORPUS = 'shell-sphere';
const raw = await fetch(`./data/${CORPUS}.json`).then((r) => r.json());
const mesh = makeMesh(raw);
const { perTri, stats, tests } = wallThickness(mesh);

const minAtVertex = new Float32Array(mesh.nv).fill(Infinity);
for (const p of perTri) {
  if (p.d === null) continue;
  for (let k = 0; k < 3; k++) {
    const v = mesh.tris[3 * p.f + k];
    if (p.d < minAtVertex[v]) minAtVertex[v] = p.d;
  }
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.2, 3.2);

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(mesh.verts), 3));
geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.tris), 1));
geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * mesh.nv), 3));
geo.computeVertexNormals();
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.6, flatShading: true });
const obj = new THREE.Mesh(geo, mat);
scene.add(obj);
scene.add(new THREE.DirectionalLight(0xffffff, 2.2).translateX(3));
scene.add(new THREE.AmbientLight(0xffffff, 0.8));

const colors = geo.getAttribute('color');
const slider = document.getElementById('slider');
const thLabel = document.getElementById('th');
const statsEl = document.getElementById('stats');
function repaint(threshold) {
  thLabel.textContent = threshold.toFixed(3);
  for (let v = 0; v < mesh.nv; v++) {
    const t = minAtVertex[v];
    const thin = t !== Infinity && t < threshold;
    colors.setXYZ(v, thin ? 0.95 : 0.25, thin ? 0.25 : 0.6, thin ? 0.2 : 0.9);
  }
  colors.needsUpdate = true;
  const thinCount = perTri.filter((p) => p.d !== null && p.d < threshold).length;
  statsEl.textContent = `tris=${mesh.nt} measured=${stats.count} thin(<th)=${thinCount}\nmin=${stats.min.toFixed(6)} median=${stats.median.toFixed(6)} max=${stats.max.toFixed(6)}\nray trails=${tests.triTrials} full tests=${tests.triTests} AABB rejects=${tests.prefilterRejects}`;
}
repaint(Number(slider.value));
slider.addEventListener('input', () => repaint(Number(slider.value)));

document.getElementById('verify').addEventListener('click', () => {
  const w = perTri.find((p) => p.d !== null && p.d === stats.min);
  const v = verifyWitness(mesh, w);
  document.getElementById('out').textContent =
    `witness tri ${w.f} -> exit tri ${w.exit}\nrecomputed d=${v.d.toFixed(12)}\nstored d=${w.d.toFixed(12)}\nidentical=${v.matches}`;
});

let drag = false, px = 0, py = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = true; px = e.clientX; py = e.clientY; });
addEventListener('pointerup', () => { drag = false; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  obj.rotation.y += (e.clientX - px) * 0.01;
  obj.rotation.x += (e.clientY - py) * 0.01;
  px = e.clientX; py = e.clientY;
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
(function loop() { requestAnimationFrame(loop); renderer.render(scene, camera); })();
