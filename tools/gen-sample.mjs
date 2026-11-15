// tools/gen-sample.mjs -- deterministic corpus for the wall-thickness certificate.
// Same command twice -> byte-identical files (fixed tessellation, no RNG, no clock).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { makeMesh, triAt, triNormal, triCentroid } from '../src/core.mjs';

const SPHERE = (lon, lat, R, rot = 0) => {
  const verts = [], tris = [];
  const push = (x, y, z) => { verts.push(x, y, z); return verts.length / 3 - 1; };
  const top = push(0, R, 0), bot = push(0, -R, 0);
  const ring = [];
  for (let i = 1; i < lat; i++) {
    const th = Math.PI * i / lat, row = [];
    for (let j = 0; j < lon; j++) {
      const ph = 2 * Math.PI * j / lon + rot;
      row.push(push(R * Math.sin(th) * Math.cos(ph), R * Math.cos(th), R * Math.sin(th) * Math.sin(ph)));
    }
    ring.push(row);
  }
  for (let j = 0; j < lon; j++) tris.push(top, ring[0][j], ring[0][(j + 1) % lon]);
  for (let i = 0; i + 1 < ring.length; i++) {
    for (let j = 0; j < lon; j++) {
      const a = ring[i][j], b = ring[i][(j + 1) % lon], c = ring[i + 1][(j + 1) % lon], d = ring[i + 1][j];
      tris.push(a, b, c, a, c, d);
    }
  }
  for (let j = 0; j < lon; j++) tris.push(bot, ring[ring.length - 1][(j + 1) % lon], ring[ring.length - 1][j]);
  return { verts, tris };
};
const BOX = (hx, hy, hz) => {
  const v = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
  const verts = v.flat();
  const q = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];
  const tris = [];
  for (const [a, b, c, d] of q) tris.push(a, b, c, a, c, d);
  return { verts, tris };
};
/** outward-orient every triangle w.r.t. `center`; flip=true inverts all normals. */
function orient(surface, flip = false) {
  const m = makeMesh({ name: 'x', verts: surface.verts, tris: surface.tris });
  const out = Array.from(surface.tris);
  for (let f = 0; f < m.nt; f++) {
    const T = triAt(m, f), n = triNormal(T[0], T[1], T[2]), c = triCentroid(T);
    const outward = n[0] * c[0] + n[1] * c[1] + n[2] * c[2] >= 0;
    if (outward === flip) { const s = out[3 * f + 1]; out[3 * f + 1] = out[3 * f + 2]; out[3 * f + 2] = s; }
  }
  return { verts: Array.from(surface.verts), tris: out };
}
function combine(parts) {
  const verts = [], tris = [];
  let base = 0;
  for (const p of parts) {
    verts.push(...p.verts);
    for (const i of p.tris) tris.push(base + i);
    base += p.verts.length / 3;
  }
  return { verts, tris };
}

const LON = 36, LAT = 18, R_OUT = 1.0, WALL = 0.2, R_IN = R_OUT - WALL;
const sagitta = (R, lat) => R * (1 - Math.cos(Math.PI / lat));

function build(name, parts, meta) {
  const mesh = combine(parts);
  return { name, verts: mesh.verts, tris: mesh.tris, meta };
}

const corpora = [];
{
  const outer = orient(SPHERE(LON, LAT, R_OUT));
  const inner = orient(SPHERE(LON, LAT, R_IN), true);
  corpora.push(build('shell-sphere', [outer, inner], {
    wall: WALL, outerTris: outer.tris.length / 3, innerSagitta: sagitta(R_IN, LAT), outerSagitta: sagitta(R_OUT, LAT), kind: 'sphere-shell',
  }));
}
{
  const outer = orient(SPHERE(LON, LAT, R_OUT));
  const inner = orient(SPHERE(12, 6, R_IN, Math.PI / 12), true);   // coarse + rotated inner skin
  corpora.push(build('shell-sphere-misaligned', [outer, inner], {
    wall: WALL, outerTris: outer.tris.length / 3, innerSagitta: sagitta(R_IN, 6), outerSagitta: sagitta(R_OUT, LAT), kind: 'sphere-shell-misaligned',
  }));
}
{
  const outer = orient(BOX(1, 1, 1)), inner = orient(BOX(0.9, 0.9, 0.9), true);
  corpora.push(build('shell-box', [outer, inner], { wall: 0.1, outerTris: outer.tris.length / 3, innerSagitta: 0, outerSagitta: 0, kind: 'box-shell' }));
}
{
  const b = orient(BOX(1, 1, 0.25));
  corpora.push(build('slab-thin', [b], { wall: 0.5, outerTris: b.tris.length / 3, innerSagitta: 0, outerSagitta: 0, kind: 'slab' }));
}
{
  const b = orient(SPHERE(LON, LAT, R_OUT));
  corpora.push(build('solid-sphere', [b], { wall: null, outerTris: b.tris.length / 3, sagitta: sagitta(R_OUT, LAT), kind: 'solid' }));
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const manifest = [];
for (const c of corpora) {
  const file = new URL(`../data/${c.name}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(c) + '\n');
  const bytes = readFileSync(file).length;
  manifest.push({ name: c.name, bytes, tris: c.tris.length / 3, verts: c.verts.length / 3, meta: c.meta });
}
writeFileSync(new URL('../data/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
for (const m of manifest) console.log(`${m.name}: ${m.tris} tris, ${m.verts} verts, ${m.bytes} bytes`);
console.log(`manifest: ${manifest.length} corpora`);
