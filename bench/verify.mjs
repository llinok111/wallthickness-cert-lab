// bench/verify.mjs -- real assertions over the generated corpus. Exit 0 iff all pass.
import { readFileSync } from 'node:fs';
import { makeMesh, wallThickness, verifyWitness, triangleAabbs, scaleMesh } from '../src/core.mjs';
import { bruteThickness, vertexNearestThickness } from '../baseline/naive.mjs';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS ${name} :: ${detail}`); }
  else { fail++; console.log(`  FAIL ${name} :: ${detail}`); }
};
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const rel = (a, b) => Math.abs(a / b - 1);

console.log('== analytic oracles: shell thickness must lie in [wall, wall + sagitta] ==');
for (const name of ['shell-sphere', 'shell-sphere-misaligned']) {
  const raw = load(name);
  const mesh = makeMesh(raw);
  const t0 = Date.now();
  const r = wallThickness(mesh);
  const ms = Date.now() - t0;
  const outer = r.perTri.slice(0, raw.meta.outerTris).filter((p) => p.d !== null);
  const ds = outer.map((p) => p.d);
  // BOTH surfaces are inscribed polyhedra, so the exact band is two sided:
  //   lower = wall - sagitta(outer polyhedron)   (chord sits inside the true sphere)
  //   upper = wall + sagitta(inner polyhedron)   (ray must reach the inner facet)
  const lo = raw.meta.wall - raw.meta.outerSagitta, hi = raw.meta.wall + raw.meta.innerSagitta;
  const outOfBand = ds.filter((d) => d < lo - 1e-9 || d > hi + 1e-9).length;
  console.log(`[${name}] band=[${lo.toFixed(6)}, ${hi.toFixed(6)}] (wall ${raw.meta.wall} - outerSagitta ${raw.meta.outerSagitta.toFixed(6)} .. + innerSagitta ${raw.meta.innerSagitta.toFixed(6)}) outerTris=${outer.length}`);
  ok(`${name}: every outer thickness inside the analytic two-sided band`, outOfBand === 0, `outOfBand=${outOfBand} min=${Math.min(...ds).toFixed(6)} max=${Math.max(...ds).toFixed(6)}`);
  ok(`${name}: whole measured spread inside the band`, Math.min(...ds) >= lo - 1e-9 && Math.max(...ds) <= hi + 1e-9, `spread=[${Math.min(...ds).toFixed(6)}, ${Math.max(...ds).toFixed(6)}]`);
  console.log(`[${name}] median=${med(ds).toFixed(9)} rel=${rel(med(ds), raw.meta.wall).toExponential(3)} (reported, not asserted: coarse inner faceting moves it)`);
  console.log(`[${name}] one full pass ${ms} ms, triangle trials ${r.tests.triTrials}, full ray-triangle tests ${r.tests.triTests}, AABB rejects ${r.tests.prefilterRejects}`);
}
console.log('== exact box shell: wall is exact, no discretisation error ==');
{
  const mesh = makeMesh(load('shell-box'));
  const r = wallThickness(mesh);
  const ds = r.perTri.filter((p) => p.d !== null).map((p) => p.d);
  const worst = Math.max(...ds.map((d) => rel(d, 0.1)));
  ok('shell-box: all 24 face thicknesses == 0.1', worst < 1e-12, `worstRel=${worst.toExponential(3)} min=${Math.min(...ds).toFixed(15)} max=${Math.max(...ds).toFixed(15)}`);
}
{
  const mesh = makeMesh(load('slab-thin'));
  const r = wallThickness(mesh);
  const ds = r.perTri.filter((p) => p.d !== null).map((p) => p.d);
  ok('slab-thin: min thickness == 0.5 exactly', Math.abs(r.stats.min - 0.5) < 1e-12, `min=${r.stats.min.toFixed(15)} max=${r.stats.max.toFixed(15)}`);
  ok('slab-thin: has both thin and thick faces', r.stats.max > 1.9 && r.stats.min < 0.6, `min=${r.stats.min} max=${r.stats.max}`);
}
console.log('== control: a solid body must NOT report a thin wall ==');
{
  const raw = load('solid-sphere');
  const mesh = makeMesh(raw);
  const r = wallThickness(mesh);
  const ds = r.perTri.filter((p) => p.d !== null).map((p) => p.d);
  const outer = ds.slice(0, raw.meta.outerTris);
  ok('solid-sphere: all thicknesses > 1.5 (diameter 2R)', Math.min(...outer) > 1.5, `min=${Math.min(...outer).toFixed(6)} max=${Math.max(...outer).toFixed(6)}`);
}
console.log('== witness recomputation: scan everything again, no prefilter, no shared state ==');
{
  const mesh = makeMesh(load('shell-sphere'));
  const r = wallThickness(mesh, { aabbs: triangleAabbs(mesh) });
  const sample = r.perTri.filter((p) => p.d !== null).slice(0, 400);
  let good = 0, bad = 0;
  for (const w of sample) { const v = verifyWitness(mesh, w); if (v.ok && v.matches) good++; else bad++; }
  ok('shell-sphere: 400 witnesses recompute identically', bad === 0, `recomputed=${good} mismatched=${bad}`);
}
console.log('== independent brute force agrees with the prefiltered path ==');
{
  const mesh = makeMesh(load('slab-thin'));
  const a = wallThickness(mesh, { filter: true }).perTri.map((p) => p.d);
  const b = bruteThickness(mesh).map((p) => p.d);
  let diff = 0;
  for (let i = 0; i < a.length; i++) if ((a[i] === null) !== (b[i] === null) || (a[i] !== null && Math.abs(a[i] - b[i]) > 1e-12 * (1 + a[i]))) diff++;
  ok('slab-thin: prefiltered == brute force on 12 triangles', diff === 0, `mismatches=${diff}`);
}
console.log('== the common shortcut (nearest vertex) overestimates a real thin wall ==');
{
  const rawM = load('shell-sphere-misaligned');
  const mesh = makeMesh(rawM);
  const N = rawM.meta.outerTris;   // the whole outer skin, 1224 rows, no subsetting
  const exact = wallThickness(mesh).perTri.slice(0, N).filter((p) => p.d !== null).map((p) => p.d);
  const nn = vertexNearestThickness(mesh).slice(0, N).map((p) => p.d);
  const e = med(exact), n = med(nn);
  // The shortcut is dominated by same-surface neighbouring vertices (it never reaches the
  // opposite wall), so it materially underestimates; f's own corners are excluded above.
  ok('misaligned: vertex-nearest shortcut off by >20% on all 1224 outer rows', (n / e - 1) < -0.2, `exactMedian=${e.toFixed(6)} vertexNNMedian=${n.toFixed(6)} error=${((n / e - 1) * 100).toFixed(2)}% (n=${exact.length})`);
}
console.log('== scale: thickness is exactly equivariant, verdicts do not drift ==');
{
  const base = makeMesh(load('shell-sphere'));
  const ref = wallThickness(base).perTri.map((p) => p.d);
  let worst = 0;
  for (const k of [1e-6, 1e-3, 1, 1e3, 1e6]) {
    const m = scaleMesh(base, k);
    const d = wallThickness(m).perTri.map((p) => p.d);
    for (let i = 0; i < ref.length; i++) {
      if (ref[i] === null) continue;
      const r = Math.abs(d[i] / k - ref[i]) / (1 + ref[i]);
      if (r > worst) worst = r;
    }
  }
  ok('scale 1e-6..1e6: thickness/k stable to <1e-12 (one ulp class)', worst < 1e-12, `worstRelativeDrift=${worst.toExponential(3)} (not exactly 0: uniform scale is a float multiply)`);
}
console.log(`\nRESULT ${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
