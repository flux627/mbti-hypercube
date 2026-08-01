// Run with: npm test  (plain node, no framework)
import assert from 'node:assert/strict';
import {
  CORNERS, FACES, CORNER_UVS, TYPE_STACKS, RANK_COLORS,
  faceOverlay, typeAtCorner,
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

console.log('cubeModel: all tests passed');
