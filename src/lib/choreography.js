// Pure transition choreography for the four-move system. No three.js.
//
// The group transform is always a proper rotation; reflections are realized
// physically by rearranging the poles. Every reachable rearrangement is a
// diagonal sign map L = diag(lx, ly, lz) acting on cube-local space: the
// poles sit at L(slot) and are upside down iff ly = -1. The three dances
// each flip one sign:
//   swap-x  (lx) — the x<0 and x>0 halves trade places
//   swap-z  (lz) — likewise along z
//   flip    (ly) — both halves turn 180° end-for-end where they stand
// A dance is needed exactly when the target pose's parity differs from
// det(L); which dance is chosen by the smallest residual group rotation.

export const identityLattice = () => ({ lx: 1, ly: 1, lz: 1 });

export const latticeDet = L => L.lx * L.ly * L.lz;

export const composeLattice = (D, L) =>
  ({ lx: D.lx * L.lx, ly: D.ly * L.ly, lz: D.lz * L.lz });

export const applyLattice = (L, [x, y, z]) => [L.lx * x, L.ly * y, L.lz * z];

// The three dance generators, keyed by the sign they flip.
export const DANCES = {
  'swap-x': { lx: -1, ly: 1, lz: 1 },
  'swap-z': { lx: 1, ly: 1, lz: -1 },
  flip: { lx: 1, ly: -1, lz: 1 },
};

// ── Lanes ───────────────────────────────────────────────────────────────────
// All lanes take the master animation parameter t ∈ [0,1] (easing applied by
// the caller; the clearance proofs hold for any monotone reparameterization)
// and are expressed in world units: pole width 1.5, half-offset 0.75, pole
// height 3, cube depth 3.

const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = u => { const c = clamp01(u); return c * c * (3 - 2 * c); };

// Progress of the lateral crossing, confined to a window of the timeline so
// the halves only pass each other while fully separated.
export const crossing = (t, [a, b]) => smooth((t - a) / (b - a));

// Swap by orbit: both halves travel half-loop lanes around the center — the
// negative-side half bulging one way, the positive-side half the other
// (point-symmetric). Returns the negative-side half's center: `a` along the
// swap axis, `b` along the bulge (depth) axis; negate both for the other
// half. Clearance: while the crossing happens (|a| < 0.75) the bulge
// separation 2b exceeds the cube depth.
export const SWAP_BULGE = 1.9;
export const SWAP_WINDOW = [0.3, 0.7];
export function swapOrbitCenter(t) {
  return {
    a: -0.75 * Math.cos(Math.PI * crossing(t, SWAP_WINDOW)),
    b: SWAP_BULGE * Math.sin(Math.PI * t),
  };
}

// Swap by hop: the negative-side half rises over the other, which slides
// straight through underneath. Clearance: while the crossing happens the
// hopper's altitude exceeds the pole height.
export const HOP_HEIGHT = 3.5;
export const HOP_WINDOW = [0.35, 0.65];
export function swapHopCenters(t) {
  const x = 0.75 * Math.cos(Math.PI * crossing(t, HOP_WINDOW));
  return {
    hopper: { a: -x, y: HOP_HEIGHT * Math.sin(Math.PI * t) },
    slider: { a: x, y: 0 },
  };
}

// Flip: both halves spread along the split axis and turn 180° about their
// own depth axes, the same direction, staying parallel throughout. Returns
// the half-center distance from the cube center and the turn angle.
// Clearance: a separating-axis bound on two parallel 1.5×3 slabs.
export const FLIP_SPREAD = 1.1;
export function flipPose(t) {
  return {
    c: 0.75 + FLIP_SPREAD * Math.sin(Math.PI * t),
    theta: Math.PI * t,
  };
}

// ── Baked lanes ─────────────────────────────────────────────────────────────
// The runtime plays dances from baked knot tables (see lanes.generated.js:
// hand lanes with their easing pre-applied, and least-action lanes computed
// offline by scripts/optimize-lanes.mjs). Rows are [a, b, y, rot] per half;
// timing is baked, so sample with a linear clock.

export { LANES } from './lanes.generated.js';
import { LANES as _LANES } from './lanes.generated.js';

// Catmull-Rom sample of one track at t ∈ [0, 1].
export function sampleTrack(track, t, out = [0, 0, 0, 0]) {
  const n = track.length;
  const x = Math.min(1, Math.max(0, t)) * (n - 1);
  const lo = Math.min(n - 2, Math.floor(x));
  const f = x - lo;
  const row = i => track[Math.min(n - 1, Math.max(0, i))];
  const p0 = row(lo - 1);
  const p1 = row(lo);
  const p2 = row(lo + 1);
  const p3 = row(lo + 2);
  for (let k = 0; k < 4; k++) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * f
      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f * f
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f * f * f);
  }
  return out;
}

export function sampleLane(name, t, outA, outB) {
  const lane = _LANES[name];
  return {
    rot: lane.rot,
    A: sampleTrack(lane.A, t, outA),
    B: sampleTrack(lane.B, t, outB),
  };
}
