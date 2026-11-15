// baseline/naive.mjs -- independent baselines. No import of src/core.mjs helpers
// for the measurement loop; the ray test is written out separately here.
export function rayTri(o, d, a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (det === 0) return null;
  const inv = 1 / det;
  const tv = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) * inv;
  if (u < 0 || u > 1) return null;
  const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > 0 ? t : null;
}
const P = (m, i) => [m.verts[3 * i], m.verts[3 * i + 1], m.verts[3 * i + 2]];

/** Brute force: every triangle scans every other triangle. No prefilter at all. */
export function bruteThickness(mesh) {
  const out = [];
  for (let f = 0; f < mesh.nt; f++) {
    const a = P(mesh, mesh.tris[3 * f]), b = P(mesh, mesh.tris[3 * f + 1]), c = P(mesh, mesh.tris[3 * f + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l === 0) { out.push({ f, d: null }); continue; }
    const o = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const d = [-n[0] / l, -n[1] / l, -n[2] / l];
    let best = null;
    for (let g = 0; g < mesh.nt; g++) {
      if (g === f) continue;
      const t = rayTri(o, d, P(mesh, mesh.tris[3 * g]), P(mesh, mesh.tris[3 * g + 1]), P(mesh, mesh.tris[3 * g + 2]));
      if (t !== null && (best === null || t < best)) best = t;
    }
    out.push({ f, d: best });
  }
  return out;
}

/** The common shortcut: nearest VERTEX belonging to a different triangle. */
export function vertexNearestThickness(mesh) {
  const sv = new Map();
  for (let f = 0; f < mesh.nt; f++) for (let k = 0; k < 3; k++) sv.set(mesh.tris[3 * f + k], true);
  const out = [];
  for (let f = 0; f < mesh.nt; f++) {
    const a = P(mesh, mesh.tris[3 * f]), b = P(mesh, mesh.tris[3 * f + 1]), c = P(mesh, mesh.tris[3 * f + 2]);
    const q = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    let best = Infinity;
    for (let g = 0; g < mesh.nt; g++) {
      if (g === f) continue;
      for (let k = 0; k < 3; k++) {
        const p = P(mesh, mesh.tris[3 * g + k]);
        const dd = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (dd < best) best = dd;
      }
    }
    out.push({ f, d: best });
  }
  return out;
}
