// Pure geometry/color model for the cognitive-function cube. No three.js
// dependency, so it can be unit-tested in plain node.
//
// The 8 cognitive functions sit at the corners of a cube, placed so that:
//   - a function and its opposite (Ni/Ne, Ti/Te, Fi/Fe, Si/Se) are antipodal;
//   - every dominant→inferior and auxiliary→tertiary pair of every type is a
//     vertical edge (the top corners are the Pi/Je functions — dominants of
//     J-types — the bottom corners the Pe/Ji functions);
//   - each side face therefore carries exactly the four functions of one
//     "function set", shared by four types, each type sitting at the corner
//     of its dominant function. The top and bottom faces are not type faces.

import { typeStacks } from '../data/mbtiData.js';

export const TYPE_STACKS = typeStacks;

export const CORNERS = {
  Ni: [-1, 1, -1], Se: [-1, -1, -1],
  Fe: [-1, 1, 1], Ti: [-1, -1, 1],
  Te: [1, 1, -1], Fi: [1, -1, -1],
  Si: [1, 1, 1], Ne: [1, -1, 1],
};

// Stack rank → color: dominant, auxiliary, tertiary, inferior.
// Dominant→inferior reads red→blue, auxiliary→tertiary reads orange→cyan.
export const RANK_COLORS = ['#ff0000', '#ff8a00', '#00aeff', '#0000ff'];

export const FUNCTION_NAMES = {
  Ni: 'Introverted Intuition', Ne: 'Extraverted Intuition',
  Si: 'Introverted Sensing', Se: 'Extraverted Sensing',
  Ti: 'Introverted Thinking', Te: 'Extraverted Thinking',
  Fi: 'Introverted Feeling', Fe: 'Extraverted Feeling',
};
export const RANK_NAMES = ['Dominant', 'Auxiliary', 'Tertiary', 'Inferior'];

// Each face has a canonical UV frame: c00/c10/c01/c11 name the functions at
// uv (0,0), (1,0), (0,1), (1,1). Frames are chosen right-handed
// (uDir × vDir = outward normal), and on side faces +v is world-up, so that
// "columns" (u < 0.5 / u > 0.5) are the two vertical half-faces.
export const FACES = [
  { key: 'x-', normal: [-1, 0, 0], isSide: true, corners: { c00: 'Se', c10: 'Ti', c01: 'Ni', c11: 'Fe' } },
  { key: 'x+', normal: [1, 0, 0], isSide: true, corners: { c00: 'Ne', c10: 'Fi', c01: 'Si', c11: 'Te' } },
  { key: 'z-', normal: [0, 0, -1], isSide: true, corners: { c00: 'Fi', c10: 'Se', c01: 'Te', c11: 'Ni' } },
  { key: 'z+', normal: [0, 0, 1], isSide: true, corners: { c00: 'Ti', c10: 'Ne', c01: 'Fe', c11: 'Si' } },
  { key: 'y+', normal: [0, 1, 0], isSide: false, corners: { c00: 'Fe', c10: 'Si', c01: 'Ni', c11: 'Te' } },
  { key: 'y-', normal: [0, -1, 0], isSide: false, corners: { c00: 'Se', c10: 'Fi', c01: 'Ti', c11: 'Ne' } },
];

export const CORNER_UVS = { c00: [0, 0], c10: [1, 0], c01: [0, 1], c11: [1, 1] };

export const CUBE_EDGES = [
  ['Ni', 'Se'], ['Ni', 'Fe'], ['Ni', 'Te'],
  ['Se', 'Ti'], ['Se', 'Fi'],
  ['Fe', 'Ti'], ['Fe', 'Si'],
  ['Ti', 'Ne'],
  ['Te', 'Fi'], ['Te', 'Si'],
  ['Fi', 'Ne'], ['Si', 'Ne'],
];

// The four poles: pairs of octants stacked along y, i.e. the two ends of each
// vertical cube edge (Ni/Se, Fe/Ti, Te/Fi, Si/Ne). The visualization renders
// each pole as one continuous column — rounded everywhere except the seam
// where its two octants meet — so the stacked pairs read as units. sx/sz are
// the pole's horizontal corner signs.
export const POLES = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => {
  const at = y => Object.keys(CORNERS).find(fn => {
    const [x, cy, z] = CORNERS[fn];
    return x === sx && cy === y && z === sz;
  });
  return { key: `${sx > 0 ? 'x+' : 'x-'}${sz > 0 ? 'z+' : 'z-'}`, sx, sz, top: at(1), bottom: at(-1) };
});

// The canonical viewing pose for a type: its face fronting the viewer with
// the stack laid out as the standard grid — dominant top-left, auxiliary
// top-right, tertiary bottom-right, inferior bottom-left. The dominant–
// inferior edge must land on the left, the auxiliary–tertiary edge on the
// right; for half the types the rest layout has the opposite chirality, so
// no rotation can achieve this and the cube must MIRROR (parity −1).
//
// Returns rest-space unit vectors describing the (possibly improper)
// transform: `up` maps to world-up, `right` to screen-right, `normal` to the
// viewer; `parity` is the transform's determinant (+1 pure rotation, −1
// requires a reflection).
export function homeOrientation(type) {
  const stack = TYPE_STACKS[type];
  const face = FACES.find(f =>
    f.isSide && Object.values(f.corners).every(fn => stack.includes(fn)));

  // Offsets of the dominant/inferior corners from the face center (= normal
  // on the unit cube). Their difference is the vertical dom→inf edge; their
  // midpoint tells which side of the face that edge sits on at rest.
  const n = face.normal;
  const off = fn => CORNERS[fn].map((v, i) => v - n[i]);
  const o1 = off(stack[0]);
  const o4 = off(stack[3]);

  // up: rest direction that must map to world-up (dominant above inferior)
  const sigma = Math.sign(o1[1] - o4[1]);
  const up = [0, sigma, 0];

  // right: rest direction that must map to screen-right (the dom–inf edge —
  // at the horizontal offset (o1+o4)/2 — must land on the LEFT)
  const right = [-(o1[0] + o4[0]) / 2, 0, -(o1[2] + o4[2]) / 2];

  // parity: determinant of the orthonormal frame [right, up, normal]
  return { faceKey: face.key, normal: n, up, right, parity: detSign(right, up, n) };
}

function detSign(a, b, c) {
  return Math.sign(
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]),
  );
}

// Attitude flip: Ni ↔ Ne, Ti ↔ Te, etc. Because opposite functions are
// antipodal, a function's flip sits at the diagonally opposite corner.
export const flipAttitude = fn => fn[0] + (fn[1] === 'i' ? 'e' : 'i');

// Rank 1–8 of any of the eight functions for a type: the stack ranks 1–4,
// and the shadow — the stack's attitude-flips in order — ranks 5–8.
export function functionRank(type, fn) {
  const stack = TYPE_STACKS[type];
  if (!stack) return null;
  const i = stack.indexOf(fn);
  return i !== -1 ? i + 1 : stack.indexOf(flipAttitude(fn)) + 5;
}

// The type sitting at a given corner of a face: the one whose dominant
// function is that corner and whose whole stack lives on the face.
export function typeAtCorner(face, cornerKey) {
  const fn = face.corners[cornerKey];
  const faceFns = Object.values(face.corners);
  return Object.keys(TYPE_STACKS).find(t => {
    const stack = TYPE_STACKS[t];
    return stack[0] === fn && faceFns.every(f => stack.includes(f));
  }) || null;
}

// Shadow corners carry a darkened, optionally desaturated version of their
// attitude-partner's rank color: rank 5 shades rank 1's color, 6 shades
// 2's, 7 shades 3's, 8 shades 4's.
export const SHADOW_DIM = 0.73;
export const SHADOW_SAT = 0.9;

function shade(hex, dimFactor, satFactor) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return '#' + rgb
    .map(v => Math.round((luma + (v - luma) * satFactor) * dimFactor))
    .map(v => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0'))
    .join('');
}

// The color of any corner for a type: the stack's rank colors 1–4 at full
// strength, their shadows 5–8 shaded.
export function cornerColor(type, fn, dimFactor = SHADOW_DIM, satFactor = SHADOW_SAT) {
  const rank = functionRank(type, fn);
  return rank <= 4
    ? RANK_COLORS[rank - 1]
    : shade(RANK_COLORS[rank - 5], dimFactor, satFactor);
}

// What a pole displays for the selected type. Every corner has a color
// (bright stack ranks, dimmed shadows); each pole carries the vertical
// gradient between its own corners' colors, and along the home-face axis
// (dirFace) the surface blends from the near pair's gradient to the far
// pair's — so the home face and its opposite show crisp columns while the
// faces between them fade bright→dark. The two poles that share a
// perpendicular sign return the same near/far colors, keeping the field
// continuous across the groove between them; the split perpendicular to
// dirFace stays hard, carried by the pole boundaries themselves.
export function poleShading(pole, type, dimFactor = SHADOW_DIM, satFactor = SHADOW_SAT) {
  const dirFace = homeOrientation(type).normal;
  // this pole's partner across the blend axis: same perpendicular sign
  const partner = POLES.find(p =>
    p !== pole && (dirFace[0] !== 0 ? p.sz === pole.sz : p.sx === pole.sx));
  const isNear = (dirFace[0] !== 0 ? pole.sx * dirFace[0] : pole.sz * dirFace[2]) > 0;
  const [near, far] = isNear ? [pole, partner] : [partner, pole];
  return {
    nearTop: cornerColor(type, near.top, dimFactor, satFactor),
    nearBottom: cornerColor(type, near.bottom, dimFactor, satFactor),
    farTop: cornerColor(type, far.top, dimFactor, satFactor),
    farBottom: cornerColor(type, far.bottom, dimFactor, satFactor),
    dirFace,
    // whether this pole is the near one — lets the renderer snap the pole
    // to its own gradient when side-face blending is off
    isNear,
  };
}

// What a face displays for the selected type. A face contains either 4, 2, or
// 0 of the stack's functions:
//   4 → this is the type's face: both vertical columns painted, each a
//       gradient between the rank colors of its two corners ('full');
//   2 → the two corners always form an edge shared with the type's face: the
//       face continues that edge's colors inward with a fade ('bleed');
//   0 → the opposite face: nothing.
export function faceOverlay(face, type) {
  const stack = TYPE_STACKS[type];
  if (!stack) return null;

  const rankColor = fn => RANK_COLORS[stack.indexOf(fn)];
  const colored = Object.entries(face.corners).filter(([, fn]) => stack.includes(fn));

  if (colored.length === 4) {
    const colors = {};
    const ranks = {}; // 1 = dominant … 4 = inferior
    for (const [k, fn] of Object.entries(face.corners)) {
      colors[k] = rankColor(fn);
      ranks[k] = stack.indexOf(fn) + 1;
    }
    return { mode: 'full', colors, ranks };
  }

  if (colored.length === 2) {
    let [a, b] = colored; // [cornerKey, functionName]
    // On side faces the shared edge is vertical; order A bottom → B top so the
    // bleed gradient matches the source column's direction.
    if (face.isSide && CORNER_UVS[a[0]][1] > CORNER_UVS[b[0]][1]) [a, b] = [b, a];
    const pA = CORNER_UVS[a[0]];
    const pB = CORNER_UVS[b[0]];
    const edgeDir = [pB[0] - pA[0], pB[1] - pA[1]];
    // Perpendicular pointing from the shared edge into the face interior.
    const perp = edgeDir[0] === 0
      ? [pA[0] === 0 ? 1 : -1, 0]
      : [0, pA[1] === 0 ? 1 : -1];
    return {
      mode: 'bleed',
      colorA: rankColor(a[1]),
      colorB: rankColor(b[1]),
      origin: pA,
      edgeDir,
      perp,
      // Side neighbors continue a gradient column, so interpolate along the
      // edge; top/bottom continue the columns' end colors, so hard-split.
      interpolate: face.isSide,
    };
  }

  return null;
}
