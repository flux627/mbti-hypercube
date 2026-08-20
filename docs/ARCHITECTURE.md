# Architecture

Cognitive Cube is an interactive 3D visualization of the MBTI
cognitive-function system: the eight functions on the corners of a cube,
drawn as four superellipsoid poles, with every displayed pixel derived from
the corner-rank model — no per-type configuration anywhere. Deployed as a
Cloudflare Worker (assets-only) at
https://cognitive-cube.julienheller627.workers.dev.

## Layer map

```
src/data/mbtiData.js          16 stacks, 4 function-set groups
src/lib/cubeModel.js          pure model (no three.js)
src/lib/choreography.js       pure transition choreography
src/lib/lanes.generated.js    baked dance lanes (generated, committed)
scripts/optimize-lanes.mjs    offline least-action lane optimizer (npm run lanes)
src/components/superellipsoid.js   pole surface geometry
src/components/CognitiveCube.jsx   the whole three.js scene
src/components/TypeSelector.jsx, src/App.jsx   shell, URL params
```

Tests (`npm test`, plain node): `cubeModel.test.js` locks the geometric and
color invariants; `choreography.test.js` locks the lattice algebra and
dense-samples every lane (analytic and baked) with separating-axis
clearance checks. Anything that would let poles stretch, collide, or land
off the canonical grid fails a test.

## The model (cubeModel.js)

- `CORNERS`: opposite functions antipodal; every dom–inf and aux–tert pair
  is a vertical edge; top corners are the J-dominants. Consequently each
  side face carries one function set (4 types, each at its dominant's
  corner) and the four vertical edges define the four `POLES` (Si/Ne,
  Fe/Ti, Ni/Se, Te/Fi — key, sx/sz signs, top/bottom fn).
- `functionRank(type, fn)`: 1–4 the stack, 5–8 the attitude-flipped shadow
  (antipodal corners by construction).
- `cornerColor(type, fn, dim, sat)`: rank colors `RANK_COLORS`
  (red/orange/cyan/blue) for 1–4; shadows are the partner hue shaded by
  `SHADOW_DIM = 0.73` and `SHADOW_SAT = 0.9` (luma-mix desaturation, then
  dim). `poleShading(pole, type, …)`: near/far gradient pairs + `dirFace`
  + `isNear` for the shader; the two poles sharing a perpendicular sign
  return identical fields (color continuity through their groove).
- `homeOrientation(type)`: the canonical home pose frame (dominant
  top-left grid) with `parity` — 8 of 16 types are chirally mirrored
  (`parity −1`), unreachable by rotation.

## Rendering

- Poles are superellipsoids |x/a|ⁿ+|y/b|ⁿ+|z/c|ⁿ=1 (n = 7 locked, `?n=`
  override), built by radially projecting a subdivided box (good corner
  density) with analytic gradient normals. One shared geometry, one
  ShaderMaterial per pole.
- Shader: each pole is the vertical gradient between its own corner
  colors; along the home-face axis it blends toward its partner's gradient.
  `blendSides=0` (locked default) snaps each pole to its own gradient —
  hard color boundaries at every groove. Baked view-space lighting
  (diffuse + specular) keeps the form legible; no scene lights exist.
  Known limitation: the `?blend=1` override's blend axis does not track a
  rearranged lattice.
- Equator lines: each pole carries its y=0 superellipse cross-section as a
  white loop, opacity 0.1 locked (`?lines=`).
- Colors crossfade on the shared transition clock (uniform lerp in Pole),
  so re-ranking melts rather than snaps.

## Labels

All labels are anchored in their pole's own geometry frame, so they ride
every dance and slerp automatically. `SurfaceLabel` re-bases each label to
a world-upright orthonormal basis every frame (readable even mid-flip) and
carries a fade for visibility changes. Function labels are `FnRankLabel`:
abbreviation + the selected type's rank as a subscript, positioned from
troika's measured glyph widths (onSync blockBounds) so Si₄ and Ne₁ read
identically. Type badges are horizontally centered on the pole (placement
invariant under any rearrangement), 72% toward the octant end, and shown
only for the selected type or the hovered quadrant (hover = pointermove on
the pole mesh with stopPropagation — without it the ray hits the poles
behind and overwrites the hover).

## Transitions: the four-move system

Full design rationale (with diagrams):
https://juliens-macbook-pro-m3-3.taild9c359.ts.net/briefs/cube-transitions/
(file: ~/Sites/briefs/cube-transitions/index.html).

Invariants: poles are only rotated/translated (never scaled), never
intersect, and every transition is one slerp plus at most one dance.

- The group transform is always a **proper rotation**. Reflections are
  carried by the **lattice** L = diag(lx, ly, lz): poles physically sit at
  L(slot), inverted when ly = −1. Dances flip one sign each: `swap-x`,
  `swap-z` (the left/right half-cubes trade places), `flip` (both halves
  turn 180° end-for-end in place). swap ∘ flip = roll, so the canonical
  factorization is at most one of {roll, swap, flip} ∘ at most one yaw —
  16 net maps, each reached once; roll/yaw merge into a single slerp.
- Planner (selection effect in CognitiveCube): if target parity ≠ det(L),
  enumerate candidates — each of the three dance generators × both mirror
  signs of the lane (`bulgeSign` flips which way an orbit goes around,
  `ySign` which half passes over / which way a flip turns; mirroring is
  legal because lane endpoints sit at b = y = rot = 0 and separating-axis
  clearance is reflection-invariant) × both rotation directions when the
  residual is near 180°. Each candidate is scored by `compositeMotion`:
  the sampled world translation + gyration-weighted rotation of all four
  poles under the actual composite (lane × eased residual rotation) —
  which is what detects a frame rotation that cancels the dance's motion
  versus one that exaggerates it. The lowest-motion candidate wins
  (`?plan=residual` restores the legacy smallest-residual rule for A/B).
  The group rotation plays as explicit axis-angle, not slerp, so the
  chosen direction is honored. Flip splits along the target face's
  in-plane horizontal axis and turns about the face normal. Retargeting
  mid-dance snap-finishes the previous dance. Vertical dance motion is
  multiplied by `hopSign` (world-up, whichever way the cube hangs).
  `window.__lastPlan` exposes the full scored candidate table for
  headless verification.
- Dance evaluation is table-driven: `lanes.generated.js` holds per-lane
  A/B tracks of `[a, b, y, rot]` half-center rows (a = swap/split axis,
  b = other horizontal, y vertical, rot about y for 'yaw' / about b for
  'pitch'); A is the half starting on the negative side. Timing is baked
  into the knots — lanes play on the **linear** master clock, while the
  slerp (and the color crossfade) ease with the minimum-jerk quintic
  6t⁵−15t⁴+10t³, so a pure-rotation transition is exactly least-action:
  fixed-axis geodesic, min-jerk timing (`?ease=cubic` restores the old
  cubic profile for comparison). Poles = half center + rotated offset;
  quaternion = half rotation ∘ rest quaternion. Sampling is Catmull-Rom
  (`sampleLane`).
- Interaction under a rearranged lattice: hit normals map
  geometry → cube-local (pole quaternion) → semantic (multiply by L);
  the octant test is geometry-local (a pole's top half is always its top
  fn).

## Least-action lanes

`npm run lanes` regenerates `lanes.generated.js` deterministically:
minimum-jerk direct collocation (81 knots, third-difference objective in
physical units, translation weighted by mass, rotation by the 1.5×3 slab
inertia 0.9375) with separating-axis clearance as a ramped penalty —
contact is legal at the flush rest pose, the required gap (0.16) ramps in
over the first/last 15% — Adam descent seeded from the hand lanes (the
seed picks the homotopy class). Hand lanes are re-baked into the same
format with their easing pre-applied.

Findings (jerk cost, lower = less action):

| lane            | jerk  | note                                          |
|-----------------|-------|-----------------------------------------------|
| action-flip     | 326k  | spreads early, near-constant turn rate        |
| action-vertical | 619k  | **global optimum swap**: symmetric over/under, peak excursion 1.65; also keeps front faces visible |
| action-planar   | 636k  | near-tie; bulge 1.84 vs hand 1.9              |
| action-hop      | 1.95M | one-over class optimum (lift 3.4)             |
| (shoulder)      | rejected | yawing to pass costs 1.8× planar even seeded in its own basin — not emitted |

## URL parameters

`?type=` (initial type) · `spin=0` · `cam=x,y,z` · `yaw=deg` (rest pose)
· `n=` exponent (7) · `lines=` equator opacity (0.1) · `dim=` (0.73) ·
`sat=` (0.9) · `blend=` (0) · `swap=` orbit|hop|planar|vertical|action-hop
(orbit) · `flip=` hand|action (hand) · `dur=` transition seconds (1.1,
slow-motion review) · `ease=cubic` (old easing profile, A/B review) ·
`plan=residual` (legacy smallest-residual planner, A/B review) ·
`dance=swap-x|swap-z|flip`, `db=±1` (orbit side), `dy=±1` (over/under,
flip turn), `dd=±1` (rotation direction) — review overrides restricting
the planner's candidates; an override matching no candidate is ignored.

## Dev workflow

- **Transition Explorer**: `/explore.html` — pick from/to types, lanes,
  duration, and direction overrides, or click a row in the live
  scored-candidate table (read from `window.__lastPlan`) to play exactly
  that combination. Runs the app in an iframe via `bare=1` (cube only)
  and `to=`/`play=` (auto-fire a transition after load).

- `npm run dev -- --port 3000 --host 127.0.0.1 --no-open`; expose over the
  tailnet with `tailscale serve --bg --https=8444 http://127.0.0.1:3000`
  (https://juliens-macbook-pro-m3-3.taild9c359.ts.net:8444 — plain HTTP
  never works on ts.net names, they're HSTS-preloaded; IPv4 bind matters,
  the proxy targets 127.0.0.1). Tear down: `tailscale serve --https=8444 off`.
  `vite.config.js` allows `.ts.net` hosts.
- Visual verification: headless Playwright with the machine's cached
  chromium (`npm i playwright` in a scratch dir; no browser download).
  Load with `&spin=0`, wait ~3.5s for troika fonts, drive transitions via
  `page.selectOption('#typeSel', 'INTP')`, screenshot mid-flight.
  Headless frame timing is jittery; use `&dur=` for reliable mid-dance
  captures.
- Deploy: `npm run deploy` (build + wrangler; assets-only Worker,
  wrangler.jsonc). Edge serves stale HTML for ~30–60s after deploy —
  verify by grepping the served HTML for the new `dist/assets/index-*.js`
  name until it's consistent.

## Open decisions

- **Lane verdict pending**: pick winning swap lane and flip lane from the
  page selectors, then lock as defaults, retire the swap/flip selectors
  (keep URL overrides), and fold the least-action findings into the
  transitions brief. Nominated: action-vertical + action-flip.
- **180°-residual composites still need least-action lanes.** The
  motion-scoring planner solved the 90° class: choosing the orbit
  direction that rides the frame yaw cuts composite motion from 32.05 to
  19.72 (ENTP↔ENFP; the exaggerate-vs-cancel split the mirror signs
  expose). But for the 180° classes (ENTP↔INTJ: opposite face + opposite
  chirality) every candidate ties near 36.7 — no combination of existing
  lanes and directions can do better, because the required net motion per
  half is a screw (travel across while rolling 180° about the travel
  axis, when danced as a swap) or an in-place 180° roll (as a flip), and
  no lane realizes it. Plan, if pursued: bake world-frame least-action
  screw/spin lanes for exactly these classes (estimated composite motion
  ≈ 18–20, roughly half), played anchored to the end pose so the residual
  no longer rides concurrently; the residual classification and
  cost-based selection machinery already exists in the planner. The 90°
  classes no longer need baked composites.
- Rank subscript digits still swap instantly on re-rank (discrete text);
  a fade is possible if wanted.
- `?dur=` and the lane selectors are review tooling; decide what stays
  user-facing when the design settles.
