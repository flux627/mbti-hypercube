# Cognitive Cube

An interactive 3D visualization of the structure hiding inside the MBTI
cognitive-function system: the eight functions arranged on the corners of a
cube so that the theory's relationships become geometry.

## The geometry

Place the eight cognitive functions on the corners of a cube like this:

- **Opposite functions are antipodal.** Ni↔Ne, Si↔Se, Ti↔Te, Fi↔Fe each sit at
  diagonally opposite corners.
- **The top four corners are Pi/Je functions (Ni, Si, Fe, Te) — the dominants
  of J-types; the bottom four are Pe/Ji (Ne, Se, Fi, Ti) — the dominants of
  P-types.** A consequence: every type's dominant–inferior pair *and* its
  auxiliary–tertiary pair is a vertical edge of the cube.
- **Each side face carries exactly one "function set"** — the four functions
  shared (in different orders) by four types. Each of those types sits at the
  corner of its dominant function, so all 16 types tile the four side faces,
  one quadrant each. The top and bottom faces are not type faces: no valid
  stack draws all four of its functions from them.

The cube is drawn as those four stacked pairs — Si/Ne, Fe/Ti, Ni/Se, Te/Fi —
rendered as continuous vertical **poles**: one superellipsoid
(|x/a|ⁿ + |y/b|ⁿ + |z/c|ⁿ = 1, the 3D squircle) per pair, inherently
seamless at the octant junction, with Apple-icon-style continuous curvature
at every corner — no flat-to-arc crease anywhere. The exponent n sets the
sharpness (2 = ellipsoid, higher → a sharp box) and opens grooves between
neighboring poles that make the columns read as units; it's locked at
n = 7 (override via `?n=`).

Every quadrant on the side faces labels its function with the selected
type's rank as a subscript: the stack 1–4, and the attitude-flipped shadow
functions 5–8 — which sit at the antipodal corners. Type badges fade in on
a hovered quadrant. The header names the selected type by its
function shorthand — `NeTi (ENTP)` — and, beneath it, which side of the
cube currently fronts the camera: the Primary face (ranks 1–4), the
Shadow face (5–8), or the Dominant's/Auxiliary's Complement faces
between them.

Selecting a type colors every corner by rank —
<span>1&nbsp;dominant&nbsp;red, 2&nbsp;auxiliary&nbsp;orange,
3&nbsp;tertiary&nbsp;cyan, 4&nbsp;inferior&nbsp;blue</span>, with the shadow
corners (5–8, antipodal by construction) carrying the same hues dimmed and
slightly desaturated. Each pole is the vertical gradient between its own
two corner colors at full strength — dom→inf beside aux→tert fronting the
type's face, their shadow versions behind — with hard color boundaries at
every groove (`?blend=1` instead fades the side faces bright→dark along
the home-face axis, continuously through the grooves). All of it is
computed from the corner ranks; there is no per-type configuration
anywhere.

Selecting a type also glides the cube to that type's **home pose**: its face
fronting the camera with the stack laid out as the standard grid — dominant
top-left, auxiliary top-right, tertiary bottom-right, inferior bottom-left.
Transitions are built from four rigid moves — poles are only ever rotated
and translated, never scaled, and never intersect. Whole-cube rotations
(rolls and yaws) merge into a single slerp. When the target's chirality
differs — for eight of the sixteen types the canonical grid is the *mirror
image* of their face's rest arrangement, unreachable by rotation — the cube
splits into two halves for one dance: a **swap**, the halves trading places,
or a **flip**, both halves turning 180° end-for-end in unison (INTP↔ENTP
swaps; a stack reversal like ENTP↔ISFJ flips). Every transition is one
rotation plus at most one dance. Which dance plays, which way it orbits or
turns, and on which least-action lane is decided per transition *kind* — the
eleven visual equivalence classes of the 240 transitions — from recorded
taste plus a fixed-handedness rule (rotate clockwise seen from above), so
that repeated selections cycle like a revolving door rather than shuttling.
Labels re-orient every frame, so they stay upright throughout.

## Using it

```bash
npm install
npm run dev      # dev server
npm test         # pure-model unit tests (node, no framework)
npm run build    # production bundle in dist/
npm run deploy   # build + deploy to Cloudflare Workers (needs `wrangler login`)
```

- **Dropdown** or **click a face quadrant** to select a type — the cube
  animates to that type's home pose (dancing the swap or flip when the
  chirality differs).
- **Drag** to orbit (auto-rotation stops on first interaction), scroll to zoom.
- **Hover a quadrant** to reveal its type badge.
- URL parameters make any view linkable and screenshot-testable:
  `?type=ENTP&spin=0&cam=5,-5,5&yaw=45&n=7&lines=0.1&dim=0.73&sat=0.9&blend=0&swap=orbit`
  — initial type (the cube starts in its home pose), disable auto-rotation,
  camera position, an explicit cube yaw in degrees (overrides the home
  pose; useful for framing the rest orientation), the superellipsoid
  exponent (default 7), the equator line opacity (default 0.1), the shadow
  dim and saturation (defaults 0.73 and 0.9), side-face blending
  (default 0, hard boundaries), and review overrides for the dance lanes
  (`swap=orbit|hop|planar|vertical|action-hop`, `flip=hand|action`) —
  normally each transition's choreography and lane are chosen per
  transition kind by the recorded favorites (see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)), explorable at
  `/explore.html`.

## Architecture

The living system map — layers, the transition system, the least-action
lane findings, dev workflow, and open decisions — is
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). File-by-file:

- `src/data/mbtiData.js` — the 16 stacks and the four function-set groups.
- `src/lib/cubeModel.js` — pure model, no three.js: corner layout, the six
  faces with canonical UV frames, the four `POLES`, `faceOverlay(face, type)`,
  which reduces everything drawn to one rule (corner colors from stack ranks;
  a face shows a full two-column gradient if it holds all 4 stack functions,
  an edge bleed if it holds 2, nothing if 0), `cornerColor(type, fn)` and
  `poleShading(pole, type)`, the per-corner colors (dimmed shadows) and the
  near/far gradient pairs the pole shader blends, `functionRank(type, fn)`,
  the 1–8 rank of any function including the shadow, and
  `homeOrientation(type)`, the possibly-improper frame of the home pose with
  its `parity`.
- `src/lib/cubeModel.test.js` — asserts the geometric invariants the
  visualization relies on (vertical dom–inf edges, type placement, overlay
  counts, pole pairing and per-pole paint directions, rank permutations and
  shadow antipodality, reference colors, canonical home-pose layout, the
  8/8 parity split).
- `src/lib/choreography.js` — pure transition choreography: the lattice (a
  diagonal sign map recording which reflection the pole arrangement
  currently realizes), the three dance generators, the hand lane math, and
  the baked-lane sampler.
- `scripts/optimize-lanes.mjs` (`npm run lanes`) — offline least-action
  lane optimizer: minimum-jerk direct collocation under the physical
  metric (mass for translation, slab inertia for rotation) with
  separating-axis clearance, seeded from the hand lanes (which selects the
  homotopy class: planar, over/under, or one-over). Emits
  `src/lib/lanes.generated.js`, the baked knot tables the runtime plays.
- `src/lib/choreography.test.js` — locks those constants: dense-sampled
  separating-axis tests prove the halves never intersect on any lane, and
  the lattice algebra (each dance is a reflection and an involution;
  swap ∘ flip = roll) is asserted.
- `src/components/superellipsoid.js` — the pole surface: a subdivided box
  projected radially onto the superellipsoid, with analytic gradient normals.
- `src/components/CognitiveCube.jsx` — react-three-fiber scene: four
  superellipsoid pole meshes sharing one geometry, one shader (per-pole
  corner gradients blended along the home-face axis, with a touch of baked
  view-space lighting), interaction, and the transition system — the group
  is always a proper rotation (one slerp); parity changes are danced by the
  poles per the planner, which picks whichever of swap-x, swap-z, or flip
  leaves the smallest residual rotation; labels are re-based to
  world-upright matrices each frame and mapped through the lattice.
- `src/components/TypeSelector.jsx`, `src/App.jsx` — UI shell and legend.
