// The recorded taste for each kind of transformation — the planner's
// selection rule. Kinds are the 11 visual equivalence classes of
// transitions (see scripts/enumerate-kinds.mjs and public/kinds.json);
// favorites were chosen by eye in the Transition Explorer.
//
// The load-bearing discovery of that exploration: for every danced kind
// the preferred generator is the one whose residual rotation MATCHES the
// kind's signature (the zero-residual dance for in-place kinds, the
// quarter-turn one for 90° kinds — which is a swap on some pairs and the
// flip on others). `match: 'kind'` encodes that. Only the 180° kind needs
// more: both swaps match there, and `tieRole` picks by role —
// 'swap-normal' is the swap whose axis is the target face's normal (the
// front/back halves trade), 'swap-lateral' the in-plane one.
//
// Direction signs were judged per dance type, so they apply conditionally:
// `whenSwap` / `whenFlip` constrain only candidates of that type
// (db = orbit side, dy = over/under or flip turn). Fields left free are
// chosen by the motion scorer. swapLane / flipLane name the baked lane
// the selected dance plays.
//
// Turn kinds (no dance) record only dd, the rotation direction about the
// kind's canonicalized axis (180° axes are sign-normalized: up, else
// toward the viewer, else screen-right).
export const KIND_FAVORITES = {
  'mirror|180|diagonal': { match: 'kind', tieRole: 'swap-normal', swapLane: 'vertical', flipLane: 'action' },
  'mirror|90|up': { match: 'kind', swapLane: 'planar', flipLane: 'action' },
  'mirror|90|down': { match: 'kind', whenFlip: { dy: -1 }, swapLane: 'vertical', flipLane: 'action' },
  'mirror|0|swap': { match: 'kind', whenSwap: { db: 1 }, swapLane: 'planar', flipLane: 'action' },
  'mirror|0|flip': { match: 'kind', whenFlip: { dy: -1 }, swapLane: 'planar', flipLane: 'action' },
  'turn|180|vertical': { dd: -1 },
  'turn|180|normal': { dd: -1 },
  'turn|180|lateral': { dd: 1 },
  'turn|180|diagonal': { dd: 1 },
};

// Resolve a role name to a concrete swap generator, given the axis of the
// target face's normal ('x' or 'z').
export function resolveRole(role, targetNormalAxis) {
  if (!role) return null;
  if (role === 'flip') return 'flip';
  const other = targetNormalAxis === 'x' ? 'z' : 'x';
  return `swap-${role === 'swap-normal' ? targetNormalAxis : other}`;
}

// The generator names a kind favorite allows, out of the per-dance
// residual descriptors [{name, deg, cls}] and the kind's own signature
// (minDeg, minCls). Returns null when the favorite does not constrain the
// dance (or nothing matches — the caller falls back to scoring).
export function allowedDances(fav, descriptors, minDeg, minCls, targetNormalAxis) {
  if (!fav || fav.match !== 'kind') return null;
  let names = descriptors
    .filter(d => d.deg === minDeg && d.cls === minCls)
    .map(d => d.name);
  if (names.length > 1 && fav.tieRole) {
    const pick = resolveRole(fav.tieRole, targetNormalAxis);
    if (names.includes(pick)) names = [pick];
  }
  return names.length ? names : null;
}
