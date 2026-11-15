// bench/bench.mjs -- warmup 1 + >=5 repetitions, median/p95/stddev + cold start.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeMesh, wallThickness, triangleAabbs } from '../src/core.mjs';
import { bruteThickness } from '../baseline/naive.mjs';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const mesh = makeMesh(load('shell-sphere'));
const REPS = 7;

function time(fn) {
  const t0 = process.hrtime.bigint();
  const r = fn();
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1e6, r };
}
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { n: xs.length, min: s[0], median: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], max: s[s.length - 1], mean, stddev: sd, relStddev: sd / mean };
}

const aabbs = triangleAabbs(mesh);
const coldCore = time(() => wallThickness(mesh, { aabbs })).ms;
const coreT = [];
let coreTests = null;
for (let i = 0; i < REPS; i++) { const t = time(() => wallThickness(mesh, { aabbs })); coreT.push(t.ms); coreTests = t.r.tests; }
const coldBrute = time(() => bruteThickness(mesh)).ms;
const bruteT = [];
for (let i = 0; i < 5; i++) bruteT.push(time(() => bruteThickness(mesh)).ms);

const core = stats(coreT), brute = stats(bruteT);
const out = {
  generated: new Date().toISOString(),
  mesh: { name: mesh.name, triangles: mesh.nt, vertices: mesh.nv },
  workload: 'one wall-thickness pass over every triangle (ray from centroid along -normal)',
  core: { ...core, coldStartMs: coldCore, rayTriangleTests: coreTests.triTests, candidateScans: coreTests.triTrials, aabbRejects: coreTests.prefilterRejects },
  baselineBrute: { ...brute, coldStartMs: coldBrute, rayTriangleTests: mesh.nt * (mesh.nt - 1) },
  ratioMedian: brute.median / core.median,
  ratioRayTests: (mesh.nt * (mesh.nt - 1)) / coreTests.triTests,
  note: 'Timings are wall clock on a shared 4-core box and are not the claim; the claim is the certificate and the analytic oracle. Relative stddev is reported as measured.',
};
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ coreMedianMs: core.median, coreRelStddev: core.relStddev, bruteMedianMs: brute.median, ratioMedian: out.ratioMedian, ratioRayTests: out.ratioRayTests, rayTests: coreTests.triTests, coldMs: coldCore }, null, 2));
