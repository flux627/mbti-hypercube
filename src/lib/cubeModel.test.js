// Run with: npm test  (plain node, no framework)
import assert from 'node:assert/strict';
import {
  CORNERS, FACES, CORNER_UVS, POLES, TYPE_STACKS, RANK_COLORS, SHADOW_DIM,
  faceOverlay, poleShading, cornerColor, typeAtCorner, homeOrientation,
  flipAttitude, functionRank,
} from './cubeModel.js';

const types = Object.keys(TYPE_STACKS);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// ── Corner layout ───────────────────────────────────────────────────────────
// Opposite functions are antipodal.
for (const [a, b] of [['Ni', 'Ne'], ['Si', 'Se'], ['Ti', 'Te'], ['Fi', 'Fe']]) {
  assert.deepEqual(CORNERS[a].map(v => -v), CORNERS[b], `${a}/${b} antipodal`);
}
// Every dominant–inferior and auxiliary–tertiary pair is a vertical edge.
for (const t of types) {
  const s = TYPE_STACKS[t];
  for (const [i, j] of [[0, 3], [1, 2]]) {
    const d = sub(CORNERS[s[i]], CORNERS[s[j]]);
    assert.deepEqual([d[0], d[2]], [0, 0], `${t}: ${s[i]}–${s[j]} vertical`);
    assert.equal(Math.abs(d[1]), 2, `${t}: ${s[i]}–${s[j]} is an edge`);
  }
}

// ── Face frames ─────────────────────────────────────────────────────────────
for (const face of FACES) {
  const p = k => CORNERS[face.corners[k]];
  const du = sub(p('c10'), p('c00'));
  const dv = sub(p('c01'), p('c00'));
  // c11 closes the square
  assert.deepEqual(p('c11'), p('c00').map((v, i) => v + du[i] + dv[i]), `${face.key} square`);
  // right-handed frame: uDir × vDir points along the outward normal
  assert.deepEqual(cross(du, dv).map(v => Math.sign(v) || 0), face.normal, `${face.key} handedness`);
  // side faces: +v is world-up
  if (face.isSide) assert.deepEqual([dv[0], dv[2]], [0, 0], `${face.key} v is vertical`);
}

// ── Type placement ──────────────────────────────────────────────────────────
// Each side face hosts exactly 4 distinct types, one per corner; each type
// appears on exactly one face, at its dominant function's corner.
const seen = new Map();
for (const face of FACES.filter(f => f.isSide)) {
  const hosted = Object.keys(face.corners).map(k => typeAtCorner(face, k));
  assert.ok(hosted.every(Boolean), `${face.key} hosts a type at every corner`);
  assert.equal(new Set(hosted).size, 4, `${face.key} types distinct`);
  for (const [k, t] of Object.entries(face.corners).map(([k], i) => [k, hosted[i]])) {
    assert.equal(TYPE_STACKS[t][0], face.corners[k], `${t} sits at its dominant`);
    assert.ok(!seen.has(t), `${t} on one face only`);
    seen.set(t, face.key);
  }
}
assert.equal(seen.size, 16, 'all 16 types placed');

// ── Overlays ────────────────────────────────────────────────────────────────
for (const t of types) {
  let full = 0, bleed = 0, none = 0;
  for (const face of FACES) {
    const o = faceOverlay(face, t);
    if (!o) { none++; continue; }
    if (o.mode === 'full') {
      full++;
      assert.ok(face.isSide, `${t} full overlay on a side face`);
      // corner colors are exactly the four rank colors
      assert.deepEqual(
        new Set(Object.values(o.colors)),
        new Set(RANK_COLORS),
        `${t} uses all four rank colors`,
      );
    } else {
      bleed++;
      // the two colored corners share a face edge (differ in exactly one uv)
      assert.equal(Math.abs(o.edgeDir[0]) + Math.abs(o.edgeDir[1]), 1, `${t}/${face.key} edge`);
      // perp is perpendicular to the edge and unit-length
      assert.equal(o.edgeDir[0] * o.perp[0] + o.edgeDir[1] * o.perp[1], 0);
      // side-face bleeds interpolate bottom→top; top/bottom faces hard-split
      assert.equal(o.interpolate, face.isSide, `${t}/${face.key} interpolate`);
      if (face.isSide) assert.deepEqual(o.edgeDir, [0, 1], `${t}/${face.key} vertical bleed`);
    }
  }
  // one home face, one opposite face, four bleeding neighbors
  assert.deepEqual([full, bleed, none], [1, 4, 1], `${t} overlay counts`);
}

// ── Reference: INFJ, matching the original hand-tuned implementation ────────
// INFJ face x-: Ni top-left red, Fe top-right orange, Ti bottom-right cyan,
// Se bottom-left blue.
{
  const face = FACES.find(f => f.key === 'x-');
  const o = faceOverlay(face, 'INFJ');
  assert.equal(o.mode, 'full');
  assert.deepEqual(o.colors, {
    c01: '#ff0000', // Ni dominant
    c11: '#ff8a00', // Fe auxiliary
    c10: '#00aeff', // Ti tertiary
    c00: '#0000ff', // Se inferior
  });
  // top face bleeds red|orange along the Ni–Fe edge
  const top = faceOverlay(FACES.find(f => f.key === 'y+'), 'INFJ');
  assert.equal(top.mode, 'bleed');
  assert.equal(top.interpolate, false);
  assert.deepEqual(new Set([top.colorA, top.colorB]), new Set(['#ff0000', '#ff8a00']));
  // right neighbor (z+) bleeds the auxiliary column: orange→cyan up the Fe–Ti edge
  const zp = faceOverlay(FACES.find(f => f.key === 'z+'), 'INFJ');
  assert.equal(zp.mode, 'bleed');
  assert.deepEqual([zp.colorA, zp.colorB], ['#00aeff', '#ff8a00']); // Ti bottom, Fe top
  assert.deepEqual(zp.origin, [0, 0]);
  assert.deepEqual(zp.perp, [1, 0]);
}

// ── Home orientations ───────────────────────────────────────────────────────
// The home pose must lay out every stack as the canonical grid: dominant
// top-left, auxiliary top-right, tertiary bottom-right, inferior bottom-left.
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + 0; // +0 folds -0
let mirrored = 0;
for (const t of types) {
  const { faceKey, normal, up, right, parity } = homeOrientation(t);
  const face = FACES.find(f => f.key === faceKey);
  assert.ok(face.isSide, `${t} home face is a side face`);
  for (const v of [up, right]) assert.equal(Math.hypot(...v), 1, `${t} unit vectors`);
  assert.equal(dot(up, normal), 0, `${t} up ⟂ normal`);
  assert.equal(dot(right, normal), 0, `${t} right ⟂ normal`);
  assert.equal(dot(right, up), 0, `${t} right ⟂ up`);
  assert.ok(parity === 1 || parity === -1, `${t} parity is ±1`);
  if (parity === -1) mirrored++;

  // corner positions under the pose, in (screen-x, screen-y) coordinates
  const stack = TYPE_STACKS[t];
  const pos = fn => {
    const off = CORNERS[fn].map((v, i) => v - normal[i]);
    return [dot(off, right), dot(off, up)];
  };
  assert.deepEqual(pos(stack[0]), [-1, 1], `${t} dominant top-left`);
  assert.deepEqual(pos(stack[1]), [1, 1], `${t} auxiliary top-right`);
  assert.deepEqual(pos(stack[2]), [1, -1], `${t} tertiary bottom-right`);
  assert.deepEqual(pos(stack[3]), [-1, -1], `${t} inferior bottom-left`);
}
// Exactly half the types are chirally flipped relative to their face.
assert.equal(mirrored, 8, 'eight types need the mirror');
// The user-visible pair: ENTP reaches the grid by rotation, INTP needs the flip.
assert.equal(homeOrientation('ENTP').parity, 1);
assert.equal(homeOrientation('INTP').parity, -1);
assert.equal(homeOrientation('INFJ').parity, 1);
assert.equal(homeOrientation('ENFJ').parity, -1);

// ── Poles ───────────────────────────────────────────────────────────────────
// The stacked-octant pairs are exactly the four vertical cube edges.
assert.equal(POLES.length, 4);
assert.deepEqual(
  new Set(POLES.map(p => `${p.top}/${p.bottom}`)),
  new Set(['Ni/Se', 'Fe/Ti', 'Te/Fi', 'Si/Ne']),
);
for (const p of POLES) {
  assert.deepEqual(CORNERS[p.top], [p.sx, 1, p.sz], `${p.key} top corner`);
  assert.deepEqual(CORNERS[p.bottom], [p.sx, -1, p.sz], `${p.key} bottom corner`);
}

// Every corner has a color: bright rank colors for the stack, the same hue
// dimmed by SHADOW_DIM for the shadow at the antipodal corner.
const dimHex = hex => '#' + [1, 3, 5]
  .map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * SHADOW_DIM)
    .toString(16).padStart(2, '0')).join('');
for (const t of types) {
  const s = TYPE_STACKS[t];
  for (let i = 0; i < 4; i++) {
    assert.equal(cornerColor(t, s[i]), RANK_COLORS[i], `${t} rank ${i + 1} color`);
    assert.equal(
      cornerColor(t, flipAttitude(s[i])),
      dimHex(RANK_COLORS[i]),
      `${t} shadow ${i + 5} is dimmed rank ${i + 1}`,
    );
  }
}

for (const t of types) {
  const { normal } = homeOrientation(t);
  for (const p of POLES) {
    const sh = poleShading(p, t);
    assert.deepEqual(sh.dirFace, normal, `${t}/${p.key} blend axis`);
    // near pair are the home-face poles' corner colors, far the shadows'
    const isNear = dot([p.sx, 0, p.sz], normal) === 1;
    const own = isNear ? ['nearTop', 'nearBottom'] : ['farTop', 'farBottom'];
    assert.equal(sh[own[0]], cornerColor(t, p.top), `${t}/${p.key} own top`);
    assert.equal(sh[own[1]], cornerColor(t, p.bottom), `${t}/${p.key} own bottom`);
    // the pole across the blend axis shares the same field, so the color
    // is continuous through the groove between them
    const partner = POLES.find(q =>
      q !== p && (normal[0] !== 0 ? q.sz === p.sz : q.sx === p.sx));
    assert.deepEqual(poleShading(partner, t), sh, `${t}/${p.key} continuous pair`);
  }
}

// Reference: INFJ — near pair Ni/Se (red→blue) and Fe/Ti (orange→cyan);
// far pair carries the dimmed shadow colors (Te₇ dark cyan over Fi₆ dark
// orange, Si₈ dark blue over Ne₅ dark red).
{
  const niSe = poleShading(POLES.find(p => p.top === 'Ni'), 'INFJ');
  assert.deepEqual(niSe, {
    nearTop: '#ff0000', nearBottom: '#0000ff',
    farTop: dimHex('#00aeff'), farBottom: dimHex('#ff8a00'),
    dirFace: [-1, 0, 0],
  });
  const siNe = poleShading(POLES.find(p => p.top === 'Si'), 'INFJ');
  assert.deepEqual(siNe, {
    nearTop: '#ff8a00', nearBottom: '#00aeff',
    farTop: dimHex('#0000ff'), farBottom: dimHex('#ff0000'),
    dirFace: [-1, 0, 0],
  });
}

// ── Function ranks 1–8 ──────────────────────────────────────────────────────
const allFns = Object.keys(CORNERS);
for (const [a, b] of [['Ni', 'Ne'], ['Ti', 'Te'], ['Fi', 'Fe'], ['Si', 'Se']]) {
  assert.equal(flipAttitude(a), b);
  assert.equal(flipAttitude(b), a);
}
for (const t of types) {
  const s = TYPE_STACKS[t];
  // the eight functions carry each rank exactly once
  assert.deepEqual(
    new Set(allFns.map(fn => functionRank(t, fn))),
    new Set([1, 2, 3, 4, 5, 6, 7, 8]),
    `${t} ranks are a permutation`,
  );
  for (let i = 0; i < 4; i++) {
    assert.equal(functionRank(t, s[i]), i + 1, `${t} stack rank ${i + 1}`);
    assert.equal(functionRank(t, flipAttitude(s[i])), i + 5, `${t} shadow rank ${i + 5}`);
    // shadow functions sit at the antipodal corners of their stack partners
    assert.deepEqual(
      CORNERS[flipAttitude(s[i])],
      CORNERS[s[i]].map(v => -v),
      `${t} shadow ${i + 5} antipodal`,
    );
  }
}
// Reference: ENTP is Ne₁ Ti₂ Fe₃ Si₄ with shadow Ni₅ Te₆ Fi₇ Se₈.
assert.deepEqual(
  ['Ne', 'Ti', 'Fe', 'Si', 'Ni', 'Te', 'Fi', 'Se'].map(fn => functionRank('ENTP', fn)),
  [1, 2, 3, 4, 5, 6, 7, 8],
);

console.log('cubeModel: all tests passed');
