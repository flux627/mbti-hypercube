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
  // the three 180° mirror kinds below are unreachable from canonical
  // anchors (the coverage sweep in scripts/enumerate-kinds.mjs proves the
  // reachable set), but a live camera near a threshold boundary can bin
  // the axis class differently — these entries make that degrade to the
  // same recorded 180° treatment instead of an unconstrained fallback
  'mirror|180|vertical': { match: 'kind', tieRole: 'swap-normal', swapLane: 'vertical', flipLane: 'action' },
  'mirror|180|lateral': { match: 'kind', tieRole: 'swap-normal', swapLane: 'vertical', flipLane: 'action' },
  'mirror|180|normal': { match: 'kind', tieRole: 'swap-normal', swapLane: 'vertical', flipLane: 'action' },
  // Quarter-mirror kinds follow the fixed-handedness rule: turn clockwise
  // seen from above, so a transition and its reverse use the same sense
  // and repeated selections cycle rather than shuttle. The planner
  // prefers the clockwise carrier whenever one exists; the 'up' kind
  // survives only where geometry forces the other sense (the flip is the
  // lone quarter carrier on the return leg of flip-carried pairs). The
  // flip turn direction is fixed the same way in both entries, so a flip
  // pair's two directions turn identically — two same-sense flips are
  // one full turn.
  'mirror|90|up': { match: 'kind', whenFlip: { dy: -1 }, swapLane: 'planar', flipLane: 'action' },
  'mirror|90|down': { match: 'kind', whenFlip: { dy: -1 }, swapLane: 'planar', flipLane: 'action' },
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
