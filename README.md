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
a hovered quadrant; only the selected type's badge stays visible.

Selecting a type colors every corner by rank —
<span>1&nbsp;dominant&nbsp;red, 2&nbsp;auxiliary&nbsp;orange,
3&nbsp;tertiary&nbsp;cyan, 4&nbsp;inferior&nbsp;blue</span>, with the shadow
corners (5–8, antipodal by construction) carrying the same hues dimmed.
Each pole is the vertical gradient between its own two corner colors, and
along the home-face axis the surface blends toward its partner pole's
gradient: the type's face and its opposite show crisp columns — dom→inf
beside aux→tert in front, their dimmed shadows behind — while the faces
between them fade bright→dark, continuously through the grooves. All of it
is computed from the corner ranks; there is no per-type configuration
anywhere.

Selecting a type also glides the cube to that type's **home pose**: its face
fronting the camera with the stack laid out as the standard grid — dominant
top-left, auxiliary top-right, tertiary bottom-right, inferior bottom-left.
Here the cube's chirality becomes visible: for eight of the sixteen types the
grid layout is the *mirror image* of their face's rest arrangement, so no
rotation can reach it — the cube flattens through its own face plane and
re-emerges reflected (INTP↔ENTP is such a pair: Ne top-left for ENTP,
top-right for INTP). Labels re-orient every frame, so they stay upright and
un-mirrored throughout.

## Using it

```bash
npm install
npm run dev      # dev server
npm test         # pure-model unit tests (node, no framework)
npm run build    # production bundle in dist/
npm run deploy   # build + deploy to Cloudflare Workers (needs `wrangler login`)
```

- **Dropdown** or **click a face quadrant** to select a type — the cube
  animates to that type's home pose (flipping through the mirror when needed).
- **Drag** to orbit (auto-rotation stops on first interaction), scroll to zoom.
- **Hover a quadrant** to reveal its type badge.
- URL parameters make any view linkable and screenshot-testable:
  `?type=ENTP&spin=0&cam=5,-5,5&yaw=45&n=7&lines=0.1`
  — initial type (the cube starts in its home pose), disable auto-rotation,
  camera position, an explicit cube yaw in degrees (overrides the home
  pose; useful for framing the rest orientation), the superellipsoid
  exponent (default 7), and the equator line opacity (default 0.1).

## Architecture

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
- `src/components/superellipsoid.js` — the pole surface: a subdivided box
  projected radially onto the superellipsoid, with analytic gradient normals.
- `src/components/CognitiveCube.jsx` — react-three-fiber scene: four
  superellipsoid pole meshes sharing one geometry, one shader (per-pole
  corner gradients blended along the home-face axis, with a touch of baked
  view-space lighting), interaction, and the pose
  system — the group's transform is rotation ∘ cube-local mirror, animated by
  slerping the rotation while the mirror's scale component crosses zero, with
  labels re-based to world-upright matrices each frame.
- `src/components/TypeSelector.jsx`, `src/App.jsx` — UI shell and legend.
