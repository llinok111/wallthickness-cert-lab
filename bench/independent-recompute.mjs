// bench/independent-recompute.mjs -- third method, on purpose NOT importing
// src/core.mjs and NOT using Moeller-Trumbore:
//   * ray/triangle by explicit plane solve (t = (a-o).n / (d.n))
//   * point-in-triangle by sub-area comparison (|cross(b-a,p-a)| + ... == |n|)
//   * band computed from the corpus meta, not hard-coded
// Run: node bench/independent-recompute.mjs   (needs data/, built by tools/gen-sample.mjs)
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('../data/shell-sphere.json', import.meta.url), 'utf8'));
const V = raw.verts, T = raw.tris, NT = T.length / 3;
const P = (i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));

function hit(o, d, a, b, c) {
  const n = cross(sub(b, a), sub(c, a));
  const den = dot(n, d);
  if (den === 0) return null;
  const t = dot(sub(a, o), n) / den;
  if (t <= 0) return null;
  const p = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
  const s = (len(cross(sub(b, a), sub(p, a))) + len(cross(sub(c, b), sub(p, b))) + len(cross(sub(a, c), sub(p, c)))) / len(n);
  if (s > 1 + 1e-9) return null;          // outside the triangle (relative slack)
  return t;
}

const ds = [];
for (let f = 0; f < raw.meta.outerTris; f++) {
  const a = P(T[3 * f]), b = P(T[3 * f + 1]), c = P(T[3 * f + 2]);
  const n = cross(sub(b, a), sub(c, a)), L = len(n);
  if (L === 0) continue;
  const o = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const d = [-n[0] / L, -n[1] / L, -n[2] / L];
  let best = null;
  for (let g = 0; g < NT; g++) {
    if (g === f) continue;
    const t = hit(o, d, P(T[3 * g]), P(T[3 * g + 1]), P(T[3 * g + 2]));
    if (t !== null && (best === null || t < best)) best = t;
  }
  if (best !== null) ds.push(best);
}
ds.sort((x, y) => x - y);
const lo = raw.meta.wall - raw.meta.outerSagitta;
const hi = raw.meta.wall + raw.meta.innerSagitta;
const outside = ds.filter((d) => d < lo - 1e-9 || d > hi + 1e-9).length;
const res = {
  method: 'plane-solve + sub-area barycentric (no Moeller-Trumbore, no import of src/core.mjs)',
  measured: ds.length, min: ds[0], max: ds[ds.length - 1], median: ds[Math.floor(ds.length / 2)],
  band: [lo, hi], outsideBand: outside,
};
console.log(JSON.stringify(res, null, 1));
if (outside !== 0) { console.error('third method disagrees with the band'); process.exit(1); }
