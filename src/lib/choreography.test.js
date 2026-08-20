// Run with: npm test  (plain node, no framework)
import assert from 'node:assert/strict';
import {
  identityLattice, latticeDet, composeLattice, applyLattice, DANCES,
  swapOrbitCenter, swapHopCenters, flipPose, LANES, sampleTrack,
} from './choreography.js';
import { POLES, TYPE_STACKS, homeOrientation } from './cubeModel.js';

// ── Lattice algebra ─────────────────────────────────────────────────────────
{
  const id = identityLattice();
  assert.equal(latticeDet(id), 1);
  for (const [name, D] of Object.entries(DANCES)) {
    assert.equal(latticeDet(D), -1, `${name} is a reflection`);
    // dances are involutions
    assert.deepEqual(composeLattice(D, D), id, `${name} squared`);
    // one dance flips the lattice parity
    assert.equal(latticeDet(composeLattice(D, id)), -1, `${name} parity`);
  }
  // swap ∘ flip = roll (a proper map): never needed as a lattice change
  const roll = composeLattice(DANCES['swap-x'], DANCES.flip);
  assert.equal(latticeDet(roll), 1, 'swap∘flip is proper');
  // slot mapping: swap-x moves poles across x and keeps them upright
  assert.deepEqual(applyLattice(DANCES['swap-x'], [0.75, 1.5, -0.75]), [-0.75, 1.5, -0.75]);
  // flip inverts in place
  assert.deepEqual(applyLattice(DANCES.flip, [0.75, 1.5, -0.75]), [0.75, -1.5, -0.75]);
}

// A dance is needed exactly when the target parity differs from det(L):
// walking any type sequence, parity bookkeeping stays consistent.
{
  const types = Object.keys(TYPE_STACKS);
  let L = identityLattice();
  for (const t of types) {
    const parity = homeOrientation(t).parity;
    if (parity !== latticeDet(L)) L = composeLattice(DANCES['swap-x'], L);
    assert.equal(latticeDet(L), parity, `${t} lattice parity matches pose parity`);
  }
}

// ── Clearance ───────────────────────────────────────────────────────────────
// Half slab footprints, world units: 1.5 wide along the swap/split axis,
// 3 along the bulge/depth axis, 3 tall. The squircle corners give real
// margin beyond these rectangular bounds, so touching (≥, not >) passes.
const N = 2000;
const EPS = 1e-9;

// Swap by orbit: halves at ±(a, b); disjoint iff separated along the swap
// axis (2|a| ≥ 1.5) or along the bulge axis (2|b| ≥ 3).
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const { a, b } = swapOrbitCenter(t);
  const ok = 2 * Math.abs(a) >= 1.5 - EPS || 2 * Math.abs(b) >= 3 - EPS;
  assert.ok(ok, `orbit clearance at t=${t}: a=${a}, b=${b}`);
}

// Swap by hop: hopper at (aH, y), slider at (aS, 0); disjoint iff separated
// along the swap axis or vertically (Δy ≥ pole height 3).
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const { hopper, slider } = swapHopCenters(t);
  const ok = Math.abs(hopper.a - slider.a) >= 1.5 - EPS || hopper.y >= 3 - EPS;
  assert.ok(ok, `hop clearance at t=${t}: Δa=${hopper.a - slider.a}, y=${hopper.y}`);
}

// Flip: two parallel congruent 1.5×3 slabs at centers ±c, both at angle
// theta; separating-axis test on their shared axes.
for (let i = 0; i <= N; i++) {
  const t = i / N;
  const { c, theta } = flipPose(t);
  const d = 2 * c;
  const ok = d * Math.abs(Math.cos(theta)) >= 1.5 - EPS
    || d * Math.abs(Math.sin(theta)) >= 3 - EPS;
  assert.ok(ok, `flip clearance at t=${t}: c=${c}, theta=${theta}`);
}

// Lane endpoints: every dance starts and ends on the lattice slots.
{
  const s0 = swapOrbitCenter(0), s1 = swapOrbitCenter(1);
  assert.ok(Math.abs(s0.a + 0.75) < 1e-9 && Math.abs(s0.b) < 1e-9, 'orbit start');
  assert.ok(Math.abs(s1.a - 0.75) < 1e-9 && Math.abs(s1.b) < 1e-6, 'orbit end');
  const h0 = swapHopCenters(0), h1 = swapHopCenters(1);
  assert.ok(Math.abs(h0.hopper.a + 0.75) < 1e-9 && Math.abs(h0.hopper.y) < 1e-9, 'hop start');
  assert.ok(Math.abs(h1.hopper.a - 0.75) < 1e-9 && Math.abs(h1.hopper.y) < 1e-6, 'hop end');
  const f0 = flipPose(0), f1 = flipPose(1);
  assert.ok(Math.abs(f0.c - 0.75) < 1e-9 && f0.theta === 0, 'flip start');
  assert.ok(Math.abs(f1.c - 0.75) < 1e-6 && Math.abs(f1.theta - Math.PI) < 1e-9, 'flip end');
}

// Sanity: POLES slots are the half-offsets the lanes assume.
for (const p of POLES) {
  assert.ok(Math.abs(p.sx) === 1 && Math.abs(p.sz) === 1);
}

// ── Baked lanes ─────────────────────────────────────────────────────────────
// Clearance between the halves at one sampled moment, rows [a, b, y, rot]
// per half sharing the rotation angle: separating-axis over the rotation
// plane's axes plus the unrotated third axis. Extents: 1.5 along a, 3
// along b and y.
function rowClearance(rot, A, B) {
  const da = A[0] - B[0];
  const db = A[1] - B[1];
  const dy = A[2] - B[2];
  const ang = A[3];
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  if (rot === 'yaw') {
    return Math.max(
      Math.abs(da * c + db * s) - 1.5,
      Math.abs(-da * s + db * c) - 3,
      Math.abs(dy) - 3,
    );
  }
  return Math.max(
    Math.abs(da * c + dy * s) - 1.5,
    Math.abs(-da * s + dy * c) - 3,
    Math.abs(db) - 3,
  );
}

for (const [name, lane] of Object.entries(LANES)) {
  const S = 800;
  const A = [0, 0, 0, 0];
  const B = [0, 0, 0, 0];
  let interior = Infinity;
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    sampleTrack(lane.A, t, A);
    sampleTrack(lane.B, t, B);
    assert.ok(Math.abs(A[3] - B[3]) < 1e-6, `${name} halves share the angle`);
    const c = rowClearance(lane.rot, A, B);
    // never intersecting beyond the squircle corner grace, at any moment
    assert.ok(c >= -0.03, `${name} clearance at t=${t}: ${c}`);
    if (t > 0.25 && t < 0.75) interior = Math.min(interior, c);
  }
  // least-action lanes hold a real passing gap through the crossing
  if (name.startsWith('action')) {
    assert.ok(interior >= 0.08, `${name} interior gap: ${interior}`);
  }
  // endpoints: rest configuration, at rest (near-zero first differences)
  const first = lane.A[0];
  const last = lane.A[lane.A.length - 1];
  assert.ok(Math.abs(first[0] + 0.75) < 1e-4 && Math.abs(first[1]) < 1e-4
    && Math.abs(first[2]) < 1e-4 && Math.abs(first[3]) < 1e-4, `${name} start`);
  assert.ok(Math.abs(Math.abs(last[0]) - 0.75) < 1e-3 && Math.abs(last[1]) < 1e-3
    && Math.abs(last[2]) < 1e-3, `${name} end position`);
  assert.ok(Math.abs(last[3]) < 1e-3 || Math.abs(last[3] - Math.PI) < 1e-3,
    `${name} end rotation`);
  for (const track of [lane.A, lane.B]) {
    const n = track.length;
    for (let k = 0; k < 4; k++) {
      assert.ok(Math.abs(track[1][k] - track[0][k]) < 2e-3, `${name} rest at start`);
      assert.ok(Math.abs(track[n - 1][k] - track[n - 2][k]) < 2e-3, `${name} rest at end`);
    }
  }
}

console.log('choreography: all tests passed');
