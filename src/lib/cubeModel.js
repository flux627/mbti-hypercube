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
