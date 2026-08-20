// Offline least-action lane optimizer. Regenerates src/lib/lanes.generated.js:
//
//   node scripts/optimize-lanes.mjs
//
// Each dance is a trajectory of the two half-cubes; this solves for the
// minimum-jerk trajectory (the rest-to-rest smoothness functional of motor
// control) under the physical metric — translation charged by mass,
// rotation by the slab's inertia — subject to non-penetration with margin,
// by direct collocation: uniform time knots, third-difference jerk
// objective, separating-axis clearance as a ramped penalty, Adam descent
// from the hand-authored lane as the seed (which also selects the homotopy
// class: planar, over/under, or one-over). The hand lanes are exported in
// the same baked format (their easing pre-applied) so the runtime plays
// every variant identically with a linear clock.
//
// Determinism: no randomness, no clocks — same output every run.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  swapOrbitCenter, swapHopCenters, flipPose,
} from '../src/lib/choreography.js';

const N = 81;                 // knots
const PIN = 3;                // knots pinned at each end (rest-to-rest)
const MARGIN = 0.16;
const MASS = 1;
const INERTIA = 0.9375;       // uniform 1.5×3 slab about its center, unit mass
const HALF_W = 1.5;           // slab extent along the swap/split axis
const HALF_D = 3;             // slab extent along the other axis of its plane
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Separating-axis clearance for two congruent parallel w×d rectangles at
// the same angle, centers offset by (dx, dy) in their plane: positive =
// disjoint by that much along the better axis.
function parallelClearance(dx, dy, angle, w, d) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const along = Math.abs(dx * c + dy * s) - w;
  const across = Math.abs(-dx * s + dy * c) - d;
  return Math.max(along, across);
}

// ── Variant definitions ─────────────────────────────────────────────────────
// Each: dims (names for the emitted rows), per-dim jerk weights, start/end
// configs for track A (the half starting on the negative side), clearance
// as a function of A's config (B is derived), and a seed from the hand lane.
// Track meanings: a = position along the swap/split axis, b = along the
// other horizontal axis, y = vertical, rot = the variant's rotation angle.

const VARIANTS = {
  'action-planar': {
    dims: ['a', 'b'],
    weights: [MASS, MASS],
    start: [-0.75, 0],
    end: [0.75, 0],
    seed: t => { const { a, b } = swapOrbitCenter(t); return [a, b]; },
    clearance: q => parallelClearance(2 * q[0], 2 * q[1], 0, HALF_W, HALF_D),
    mirror: { A: q => [q[0], q[1], 0, 0], B: q => [-q[0], -q[1], 0, 0] },
    rot: 'none',
  },
  // A 'shoulder' variant (planar swap with a yaw DOF, seeded in the yawed
  // basin) was explored and rejected: turning to present a narrower profile
  // costs ~1.8× the planar jerk under the slab inertia and digs its corners
  // into the near-rest margin. The planar and vertical solutions below use
  // effectively zero rotation.
  'action-vertical': {
    dims: ['a', 'y', 'pitch'],
    weights: [MASS, MASS, INERTIA],
    start: [-0.75, 0, 0],
    end: [0.75, 0, 0],
    seed: t => {
      const { hopper } = swapHopCenters(t);
      return [hopper.a, 1.7 * Math.sin(Math.PI * t), 0];
    },
    clearance: q => parallelClearance(2 * q[0], 2 * q[1], q[2], HALF_W, HALF_D),
    mirror: { A: q => [q[0], 0, q[1], q[2]], B: q => [-q[0], 0, -q[1], q[2]] },
    rot: 'pitch',
  },
  'action-hop': {
    dims: ['aA', 'yA', 'aB'],
    weights: [MASS, MASS, MASS],
    start: [-0.75, 0, 0.75],
    end: [0.75, 0, -0.75],
    seed: t => {
      const { hopper, slider } = swapHopCenters(t);
      return [hopper.a, hopper.y, slider.a];
    },
    clearance: q => parallelClearance(q[0] - q[2], q[1], 0, HALF_W, HALF_D),
    mirror: { A: q => [q[0], 0, q[1], 0], B: q => [q[2], 0, 0, 0] },
    rot: 'none',
  },
  'action-flip': {
    dims: ['c', 'theta'],
    weights: [MASS, INERTIA],
    start: [0.75, 0],
    end: [0.75, Math.PI],
    seed: t => { const { c, theta } = flipPose(t); return [c, theta]; },
    clearance: q => parallelClearance(2 * q[0], 0, q[1], HALF_W, HALF_D),
    mirror: { A: q => [-q[0], 0, 0, q[1]], B: q => [q[0], 0, 0, q[1]] },
    rot: 'pitch',
  },
};

// ── Optimizer ───────────────────────────────────────────────────────────────
// Objective: J = JERK_SCALE · Σ w_k (Δ³q_k)²  +  λ · Σ relu(MARGIN − clear)²
// with the jerk term in physical units (Δ³q ≈ jerk·h³, h = 1/(N−1), and the
// time integral contributing another h): JERK_SCALE = (N−1)⁵.

const JERK_SCALE = (N - 1) ** 5;

// The halves sit flush at rest, so contact is legal at the endpoints; the
// required gap ramps in over the first/last 15% of the timeline.
function requiredMargin(t) {
  const u = Math.min(1, Math.min(t, 1 - t) / 0.15);
  return MARGIN * u * u * (3 - 2 * u);
}

// clearance penalty over knots and midpoints that involve knot index `i`
function localPenalty(v, knots, d, i, cfg) {
  let P = 0;
  for (let j = Math.max(0, 2 * i - 1); j <= Math.min(2 * N - 2, 2 * i + 1); j++) {
    for (let k = 0; k < d; k++) {
      cfg[k] = j % 2 === 0
        ? knots[(j / 2) * d + k]
        : 0.5 * (knots[((j - 1) / 2) * d + k] + knots[((j + 1) / 2) * d + k]);
    }
    const p = requiredMargin(j / (2 * N - 2)) - v.clearance(cfg);
    if (p > 0) P += p * p;
  }
  return P;
}

function optimize(name, v) {
  const d = v.dims.length;
  const knots = new Float64Array(N * d);
  for (let i = 0; i < N; i++) {
    const s = v.seed(i / (N - 1));
    for (let k = 0; k < d; k++) knots[i * d + k] = s[k];
  }
  for (let k = 0; k < d; k++) {
    for (let i = 0; i < PIN; i++) {
      knots[i * d + k] = v.start[k];
      knots[(N - 1 - i) * d + k] = v.end[k];
    }
  }

  const grad = new Float64Array(knots.length);
  const m = new Float64Array(knots.length);
  const s2 = new Float64Array(knots.length);
  const cfg = new Array(d);
  const B1 = 0.9;
  const B2 = 0.999;
  let step = 0;
  for (const lambda of [1e2, 1e3, 1e4, 1e5, 1e7]) {
    for (let iter = 0; iter < 4000; iter++) {
      step++;
      const lr = 0.002 / (1 + step / 12000);
      grad.fill(0);
      // analytic jerk gradient: transpose of the third-difference stencil
      for (let i = 0; i + 3 < N; i++) {
        for (let k = 0; k < d; k++) {
          const j = knots[(i + 3) * d + k] - 3 * knots[(i + 2) * d + k]
            + 3 * knots[(i + 1) * d + k] - knots[i * d + k];
          const g = 2 * JERK_SCALE * v.weights[k] * j;
          grad[i * d + k] -= g;
          grad[(i + 1) * d + k] += 3 * g;
          grad[(i + 2) * d + k] -= 3 * g;
          grad[(i + 3) * d + k] += g;
        }
      }
      // numeric penalty gradient, local to each knot
      for (let i = PIN; i < N - PIN; i++) {
        for (let k = 0; k < d; k++) {
          const idx = i * d + k;
          const h = 1e-5;
          const orig = knots[idx];
          knots[idx] = orig + h;
          const fp = localPenalty(v, knots, d, i, cfg);
          knots[idx] = orig - h;
          const fm = localPenalty(v, knots, d, i, cfg);
          knots[idx] = orig;
          grad[idx] += lambda * (fp - fm) / (2 * h);
        }
      }
      // Adam step on free knots
      for (let i = PIN; i < N - PIN; i++) {
        for (let k = 0; k < d; k++) {
          const idx = i * d + k;
          m[idx] = B1 * m[idx] + (1 - B1) * grad[idx];
          s2[idx] = B2 * s2[idx] + (1 - B2) * grad[idx] * grad[idx];
          knots[idx] -= lr * m[idx] / (Math.sqrt(s2[idx]) + 1e-9);
        }
      }
    }
  }

  // diagnostics on the runtime's own interpolation (Catmull-Rom):
  // worst shortfall against the ramped requirement, and the true interior gap
  let shortfall = 0;
  let interiorClear = Infinity;
  const maxAbs = new Array(d).fill(0);
  const knot = (i, k) => knots[Math.min(N - 1, Math.max(0, i)) * d + k];
  for (let i = 0; i < 8 * N; i++) {
    const u = i / (8 * N - 1);
    const t = u * (N - 1);
    const lo = Math.min(N - 2, Math.floor(t));
    const f = t - lo;
    for (let k = 0; k < d; k++) {
      const p0 = knot(lo - 1, k);
      const p1 = knot(lo, k);
      const p2 = knot(lo + 1, k);
      const p3 = knot(lo + 2, k);
      cfg[k] = 0.5 * ((2 * p1) + (-p0 + p2) * f
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f
        + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
      maxAbs[k] = Math.max(maxAbs[k], Math.abs(cfg[k]));
    }
    const c = v.clearance(cfg);
    shortfall = Math.max(shortfall, requiredMargin(u) - c);
    if (u > 0.25 && u < 0.75) interiorClear = Math.min(interiorClear, c);
  }
  const minClear = -shortfall;
  let minKnotClear = Infinity;
  let argmin = 0;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < d; k++) cfg[k] = knots[i * d + k];
    const c = v.clearance(cfg);
    if (c < minKnotClear) { minKnotClear = c; argmin = i; }
  }
  console.log(`  knots: minClear=${minKnotClear.toFixed(3)} at knot ${argmin}/${N - 1}`
    + ` cfg=[${Array.from({ length: d }, (_, k) => knots[argmin * d + k].toFixed(3)).join(', ')}]`);

  let jerkCost = 0;
  for (let i = 0; i + 3 < N; i++) {
    for (let k = 0; k < d; k++) {
      const j = knots[(i + 3) * d + k] - 3 * knots[(i + 2) * d + k]
        + 3 * knots[(i + 1) * d + k] - knots[i * d + k];
      jerkCost += JERK_SCALE * v.weights[k] * j * j;
    }
  }
  console.log(`${name}: shortfall=${(-minClear).toFixed(3)} `
    + `interiorGap=${interiorClear.toFixed(3)} jerk=${jerkCost.toFixed(0)} `
    + v.dims.map((n, k) => `max|${n}|=${maxAbs[k].toFixed(3)}`).join(' '));

  // expand to explicit A/B tracks [a, b, y, rot]
  const A = [];
  const B = [];
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < d; k++) cfg[k] = knots[i * d + k];
    A.push(v.mirror.A(cfg).map(x => Number(x.toFixed(5))));
    B.push(v.mirror.B(cfg).map(x => Number(x.toFixed(5))));
  }
  return { rot: v.rot, A, B };
}

// ── Hand lanes in the same baked format (easing pre-applied) ───────────────

function bakeHand(sample) {
  const A = [];
  const B = [];
  for (let i = 0; i < N; i++) {
    const t = easeInOut(i / (N - 1));
    const { A: a, B: b } = sample(t);
    A.push(a.map(x => Number(x.toFixed(5))));
    B.push(b.map(x => Number(x.toFixed(5))));
  }
  return { A, B };
}

const HAND = {
  'hand-orbit': {
    rot: 'none',
    ...bakeHand(t => {
      const { a, b } = swapOrbitCenter(t);
      return { A: [a, b, 0, 0], B: [-a, -b, 0, 0] };
    }),
  },
  'hand-hop': {
    rot: 'none',
    ...bakeHand(t => {
      const { hopper, slider } = swapHopCenters(t);
      return { A: [hopper.a, 0, hopper.y, 0], B: [slider.a, 0, 0, 0] };
    }),
  },
  'hand-flip': {
    rot: 'pitch',
    ...bakeHand(t => {
      const { c, theta } = flipPose(t);
      return { A: [-c, 0, 0, theta], B: [c, 0, 0, theta] };
    }),
  },
};

// ── Emit ────────────────────────────────────────────────────────────────────

const lanes = { ...HAND };
for (const [name, v] of Object.entries(VARIANTS)) lanes[name] = optimize(name, v);

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'lib', 'lanes.generated.js');
const body = Object.entries(lanes)
  .map(([name, l]) => `  '${name}': {\n    rot: '${l.rot}',\n`
    + `    A: ${JSON.stringify(l.A)},\n    B: ${JSON.stringify(l.B)},\n  },`)
  .join('\n');
writeFileSync(out, `// Generated by scripts/optimize-lanes.mjs — do not edit.
// Baked dance lanes, one row per uniform time knot: [a, b, y, rot], where
// a is the swap/split axis, b the other horizontal axis, y vertical, and
// rot the variant's rotation angle (about the vertical axis for 'yaw',
// about the b axis for 'pitch'). Track A is the half starting on the
// negative side of the swap axis; timing is baked in — play with a linear
// clock. Action lanes are minimum-jerk trajectories under the physical
// metric, computed by direct collocation with separating-axis clearance.
export const LANES = {
${body}
};
`);
console.log(`wrote ${out}`);
