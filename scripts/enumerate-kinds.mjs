// Enumerate the kinds of transformation: classify all 240 type-to-type
// transitions (each from its home pose at the canonical camera) by what
// the viewer sees — whether a dance is needed, the residual rotation
// magnitude, and its axis in screen terms — and emit public/kinds.json
// for the Transition Explorer's favorites list. Deterministic; rerun via
// `npm run kinds` after model changes.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as THREE from 'three';
import { TYPE_STACKS, homeOrientation } from '../src/lib/cubeModel.js';
import {
  identityLattice, latticeDet, composeLattice, DANCES,
} from '../src/lib/choreography.js';
import { KIND_FAVORITES, allowedDances } from '../src/lib/favorites.js';

const UP = new THREE.Vector3(0, 1, 0);
const CAM = new THREE.Vector3(5, 5, 5);
const types = Object.keys(TYPE_STACKS);

function homePoseQuat(type, lattice) {
  const { normal, up, right } = homeOrientation(type);
  const h = new THREE.Vector3(CAM.x, 0, CAM.z).normalize();
  const rho = new THREE.Vector3().crossVectors(UP, h);
  const m = new THREE.Matrix4()
    .makeBasis(rho, UP, h)
    .multiply(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...right), new THREE.Vector3(...up), new THREE.Vector3(...normal),
    ).transpose());
  m.scale(new THREE.Vector3(lattice.lx, lattice.ly, lattice.lz));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function initialLatticeFor(type) {
  const { normal, parity } = homeOrientation(type);
  if (parity === 1) return identityLattice();
  return composeLattice(DANCES[normal[0] !== 0 ? 'swap-z' : 'swap-x'], identityLattice());
}

function residualOf(fromQ, toQ) {
  const res = fromQ.clone().invert().multiply(toQ);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(res.w)));
  const axis = new THREE.Vector3(res.x, res.y, res.z);
  if (res.w < 0) axis.negate();
  if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0);
  axis.normalize();
  return { axis, angle };
}

// screen frame at the canonical camera: n = toward viewer (horizontal),
// r = screen-right, UP = vertical
const N = new THREE.Vector3(CAM.x, 0, CAM.z).normalize();
const R = new THREE.Vector3().crossVectors(UP, N);

function axisClass(axis, deg) {
  const y = axis.dot(UP);
  const n = axis.dot(N);
  const r = axis.dot(R);
  // at 180 degrees the axis sign is meaningless (u and -u are the same
  // rotation), so collapse to unsigned classes
  if (deg > 178) {
    if (Math.abs(y) > 0.99) return 'vertical';
    if (Math.abs(n) > 0.99) return 'normal';
    if (Math.abs(r) > 0.99) return 'lateral';
    return 'diagonal';
  }
  const comps = [
    ['up', y], ['down', -y],
    ['toward', n], ['away', -n],
    ['right', r], ['left', -r],
  ].filter(([, v]) => v > 0.99);
  return comps.length ? comps[0][0] : 'diagonal';
}

const kinds = new Map();
for (const from of types) {
  const L = initialLatticeFor(from);
  const qFrom = homePoseQuat(from, L);
  for (const to of types) {
    if (to === from) continue;
    const danced = homeOrientation(to).parity !== latticeDet(L);
    let sig;
    let deg;
    let ax;
    if (danced) {
      // signature from the smallest-residual candidate (deterministic);
      // zero-residual kinds split by which dance realizes them — a swap
      // mirror and a flip stack-reversal look nothing alike
      let bestA = null;
      for (const name of ['swap-x', 'swap-z', 'flip']) {
        const Lc = composeLattice(DANCES[name], L);
        const res = residualOf(qFrom, homePoseQuat(to, Lc));
        if (!bestA || res.angle < bestA.angle - 1e-9) bestA = { ...res, name };
      }
      deg = Math.round(bestA.angle * 180 / Math.PI);
      ax = deg === 0
        ? (bestA.name === 'flip' ? 'flip' : 'swap')
        : axisClass(bestA.axis, deg);
    } else {
      const res = residualOf(qFrom, homePoseQuat(to, L));
      deg = Math.round(res.angle * 180 / Math.PI);
      ax = deg === 0 ? 'none' : axisClass(res.axis, deg);
    }
    sig = `${danced ? 'mirror' : 'turn'}|${deg}|${ax}`;
    if (!kinds.has(sig)) {
      kinds.set(sig, { sig, danced, deg, axis: ax, count: 0, pairs: [] });
    }
    const k = kinds.get(sig);
    k.count += 1;
    k.pairs.push([from, to]);
  }
}

const LABELS = {
  'turn|90|up': 'quarter turn ⟲',
  'turn|90|down': 'quarter turn ⟳',
  'turn|180|vertical': 'half turn',
  'turn|180|normal': 'in-plane roll',
  'turn|180|lateral': 'somersault',
  'turn|180|diagonal': 'half turn, diagonal axis',
  'mirror|0|swap': 'mirror — swap in place',
  'mirror|0|flip': 'stack reversal — flip in place',
  'mirror|90|up': 'quarter turn ⟲ + mirror',
  'mirror|90|down': 'quarter turn ⟳ + mirror',
  'mirror|180|diagonal': 'half turn + mirror',
};

const out = [...kinds.values()]
  .sort((a, b) =>
    (a.danced !== b.danced ? (a.danced ? 1 : -1) : a.deg - b.deg || a.axis.localeCompare(b.axis)))
  .map(k => ({
    ...k,
    label: LABELS[k.sig] || k.sig,
    // what there is to choose: mirrors have the full dance/direction space,
    // 180-degree turns only the rotation direction, 90-degree turns nothing
    choices: k.danced ? 'full' : (k.deg > 178 ? 'direction' : 'none'),
    pairs: k.pairs.sort((p, q) =>
      (p[0] === 'ENTP' ? -1 : q[0] === 'ENTP' ? 1 : 0)),
  }));
const __dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  resolve(__dir, '../public/kinds.json'),
  JSON.stringify(out, null, 1),
);
for (const k of out) {
  console.log(
    `${k.sig.padEnd(24)} count=${String(k.count).padStart(3)}  e.g. ${k.pairs[0].join('->')}  [${k.choices}]`,
  );
}
console.log(`${out.length} kinds -> public/kinds.json`);

// Validate the favorites encoding: on every pair of a kind, the
// favorite's selector must pin the dance to exactly one generator (via
// the residual-matches-kind rule, plus tieRole where two swaps match).
let bad = 0;
for (const k of out) {
  const fav = KIND_FAVORITES[k.sig];
  if (!k.danced || !fav) continue;
  const picks = new Map(); // selected dance type -> count
  for (const [from, to] of k.pairs) {
    const L = initialLatticeFor(from);
    const qFrom = homePoseQuat(from, L);
    const tna = homeOrientation(to).normal[0] !== 0 ? 'x' : 'z';
    const descriptors = ['swap-x', 'swap-z', 'flip'].map(name => {
      const Lc = composeLattice(DANCES[name], L);
      const res = residualOf(qFrom, homePoseQuat(to, Lc));
      const deg = Math.round(res.angle * 180 / Math.PI);
      return { name, deg, cls: deg === 0 ? (name === 'flip' ? 'flip' : 'swap') : axisClass(res.axis, deg) };
    });
    const names = allowedDances(fav, descriptors, k.deg, k.axis, tna);
    const key = !names ? 'UNRESOLVED'
      : names.length !== 1 ? `AMBIGUOUS(${names.join('+')})`
        : (names[0] === 'flip' ? 'flip' : 'swap');
    picks.set(key, (picks.get(key) || 0) + 1);
    if (!names || names.length !== 1) bad += 1;
  }
  console.log(`favorite ${k.sig.padEnd(22)} selects ${[...picks].map(([t, n]) => `${t}x${n}`).join(' ')}`);
}
if (bad) {
  console.error(`${bad} pair(s) where the favorite fails to pin one dance`);
  process.exit(1);
}
