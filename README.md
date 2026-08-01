# MBTI Cognitive-Function Hypercube

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

Selecting a type paints its face by stack rank at each corner —
<span>1&nbsp;dominant&nbsp;red, 2&nbsp;auxiliary&nbsp;orange,
3&nbsp;tertiary&nbsp;cyan, 4&nbsp;inferior&nbsp;blue</span> — as two vertical
gradient columns: one running dominant→inferior, the other
auxiliary→tertiary. The colors continue over the face's four edges onto the
neighboring faces, fading out: side neighbors continue the gradient columns,
the top and bottom faces continue the columns' end colors. All of it is
computed from the corner ranks; there is no per-type configuration anywhere.

## Using it

```bash
npm install
npm run dev      # dev server
npm test         # pure-model unit tests (node, no framework)
npm run build    # production bundle in dist/
```

- **Dropdown** or **click a face quadrant** to select a type.
- **Drag** to orbit (auto-rotation stops on first interaction), scroll to zoom.
- URL parameters make any view linkable and screenshot-testable:
  `?type=ENTP&yaw=45&spin=0&cam=5,-5,5`
  — initial type, initial cube yaw in degrees, disable auto-rotation, and
  camera position.

## Architecture

- `src/data/mbtiData.js` — the 16 stacks and the four function-set groups.
- `src/lib/cubeModel.js` — pure model, no three.js: corner layout, the six
  faces with canonical UV frames, and `faceOverlay(face, type)`, which reduces
  everything drawn to one rule (corner colors from stack ranks; a face shows a
  full two-column gradient if it holds all 4 stack functions, an edge bleed if
  it holds 2, nothing if 0).
- `src/lib/cubeModel.test.js` — asserts the geometric invariants the
  visualization relies on (vertical dom–inf edges, type placement, overlay
  counts, reference colors).
- `src/components/ThreeHypercube.jsx` — react-three-fiber scene: face meshes,
  two small shaders (full-face columns, edge bleed), labels, and interaction.
- `src/components/TypeSelector.jsx`, `src/App.jsx` — UI shell and legend.
