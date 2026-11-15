# wallthickness-cert-lab

**Promise:** every triangle of a mesh gets a *wall-thickness witness* — a ray from the triangle
centroid along −normal, the exit triangle it hits, and the distance — and the whole vector is
checkable against closed-form oracles: on the `shell-sphere` corpus **1224/1224 outer triangles land
inside the analytic band [0.184808, 0.212154]** (wall 0.2 minus outer faceting, plus inner faceting),
median **0.198858774** (0.57 % from the analytic wall), **0/1224 outside the band**. The common
shortcut (nearest *vertex* on another triangle) is wrong on the same mesh by **−66.42 %**
(0.075339 vs 0.224380), baseline in `baseline/naive.mjs`.

Upstream: none

## How to run

```bash
node tools/gen-sample.mjs && node bench/verify.mjs
```

Expected tail: `RESULT PASS: 12 passed / 0 failed` (exit 0). Then, for the timing record:

```bash
node bench/bench.mjs     # writes bench/result.json
```

Browser view (no build step, no `npm install`; three.js comes from a pinned CDN importmap):

```bash
python3 -m http.server 4173    # then open http://localhost:4173
```

Drag to rotate, move the threshold slider to highlight walls thinner than the threshold, and press
**recompute one witness in this tab** to re-run `verifyWitness()` on the thinnest triangle live.

## What is measured

`src/core.mjs` (pure ES module, no `three`, no DOM, no I/O) casts one ray per triangle from the
centroid along the inward normal and reports the nearest hit. Each row is a witness
`{f, exit, hit, d}` that `verifyWitness()` can recompute from scratch, scanning every triangle with
no spatial prefilter. A dimensionless slab test over per-triangle AABBs skips triangles the ray
cannot reach — that is an optimisation, not a correctness device; `baseline/naive.mjs` implements the
unfiltered loop independently and `verify.mjs` compares the two.

### Evidence

| corpus | triangles | oracle | result |
| --- | --- | --- | --- |
| `shell-sphere` (R=1.0, cavity r=0.8) | 2448 | two-sided band `[wall−outerSagitta, wall+innerSagitta]` = `[0.184808, 0.212154]` | **0/1224 outer rows outside**, min 0.198487, max 0.199233, median 0.198858774 |
| `shell-sphere-misaligned` (coarse rotated inner skin) | 1344 | band `[0.184808, 0.307180]` | **0/1224 outside**, spread `[0.206716, 0.244365]` |
| `shell-box` (wall 0.1) | 24 | exact 0.1 | **24/24 == 0.1**, worst relative error 2.220e-16 |
| `slab-thin` (2×2×0.5) | 12 | min 0.5, max 2.0 | min **0.500000000000000** exactly, max **2.000000000000000** |
| `solid-sphere` (control: no cavity) | 1224 | must NOT report a thin wall | min **1.984865** > 1.5, no false thin wall |

Other assertions (`node bench/verify.mjs`, 12/12):

- **witness recomputation** — 400 witnesses re-derived by a full O(T) rescan with no prefilter:
  **400/400 identical** (exit triangle and distance).
- **independent brute force** — filtered vs unfiltered paths on `slab-thin`: **0 mismatches**.
- **shortcut failure** — nearest-vertex estimator on `shell-sphere-misaligned`:
  exact median **0.224380**, shortcut median **0.075339** → **−66.42 %** (it locks onto the
  neighbouring triangle's own vertices, i.e. the edge length, not the opposite wall).
- **scale** — the same mesh scaled by 1e-6, 1e-3, 1, 1e3, 1e6: `thickness/k` differs from the
  unscaled result by at most **3.472e-16** (one float ulp; uniform scale is a multiply, so exact
  bit-equality is not claimed).

### Timing (`bench/result.json`, warmup 1 + 7 repetitions, shared 4-core box)

- core (AABB prefilter) median **204.92 ms**, cold start **296.62 ms**, p95 **296.62 ms**,
  relStddev **22.5 %**; brute force (no prefilter) median **287.00 ms** over 5 repetitions.
- ray-triangle tests **1,470,920 vs 5,990,256** candidate scans → **4.07×** fewer full
  intersection tests; wall-clock ratio **1.40×**.
- The relative stddev of 22.5 % is reported as measured: the run is a ~200 ms CPU-bound batch on a
  box shared with other jobs, so scheduler noise dominates. The speed-up is **not** the claim of
  this repository — the certificate is. The prefilter removes tests but adds its own O(T) AABB pass
  per ray, which is why the wall-clock gain (1.40×) is far below the test-count gain (4.07×).

## 本轮创新

First *per-triangle wall-thickness witness with a closed-form, two-sided oracle*. Existing
thin-wall checkers (Blender's 3D-Print toolbox, Netfabb/meshfix-style tools) are voxel or
point-sampling based and report a count of thin faces; they ship no per-triangle object that a second
implementation can recompute, and no analytic band. This repository (a) makes each measurement a
witness `(triangle, exit triangle, point, distance)` and re-derives 400 of them from scratch, and
(b) pins the whole vector against a **closed-form band** that accounts for both inscribed polyhedra
(`wall − sagitta_outer ≤ d ≤ wall + sagitta_inner`) — the ledger has no thickness/ray-cast entry,
and no prior entry turns "is this wall thin" into a recomputable per-face object. It also quantifies
the failure of the nearest-vertex shortcut on a deliberately misaligned cavity (−66.42 %).

## Known limitations

- **Threshold-free by design, but not epsilon-free.** The only scalar constant is
  `DOC_EPS = 1e-12`, used as a *relative* magnitude guard in Möller–Trumbore
  (`|det| ≤ DOC_EPS · |e1| · |e2| · |dir|`) and in the AABB slab test (`|dir_k| ≤ DOC_EPS`).
  Both tests are dimensionless, so behaviour is unchanged under uniform rescaling of the mesh.
- **Valid scale range.** All geometric decisions are ratios, so the measurement is valid for the
  tested range **1e-6 … 1e6** in model units; below ~1e-300 the products in `|e1||e2||dir|`
  underflow and a ray parallel to a plane may be misclassified. Faceting bounds
  (`sagitta`) are exact for the tested corpus but are per-corpus numbers, not a general theorem.
- **Definition of thickness.** A single ray along −normal is a *local, directional* measurement. It
  is not the maximal inscribed sphere radius (Shape-Diameter-Function), and it says nothing about
  walls that are thin in a direction that no triangle normal samples (e.g. a knife-edge sliver whose
  facet is nearly tangent). The reported `min` is therefore a lower bound on barriers crossed *along
  face normals*, not a global thinness certificate.
- **Faceting is real error, not noise.** For a shell whose true wall is `w`, the measured value sits
  in `[w − sagitta_outer, w + sagitta_inner]`; `shell-sphere` shows 0.198487 instead of 0.200000.
  Refining the tessellation shrinks the band; it does not vanish.
- **Open surfaces.** Rays that escape without a hit are reported as `d = null` and excluded from the
  statistics (the two-shell corpora are not manifold solids: outer and inner skin touch nowhere).
- **Not a watertightness or self-intersection test.** Separate concerns, and this repository does
  not claim them.
- The triangle counts per corpus (12 … 2448) are small on purpose: the run must stay well inside a
  few hundred milliseconds so `verify.mjs` finishes in seconds. Nothing here has been evaluated on a
  production 100k-triangle asset.

## Licence

MIT (see `LICENSE`). Corpus is generated by `tools/gen-sample.mjs` with a fixed tessellation — no
RNG, no clock — so two runs are byte-identical.
