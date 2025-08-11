import { coords, functions, funcToIdx } from '../data/mbtiData';

export function orderFace(indices) {
  const xs = indices.map(i => coords[i][0]);
  const ys = indices.map(i => coords[i][1]);
  const zs = indices.map(i => coords[i][2]);
  
  const axis = new Set(xs).size === 1 ? 'x' : (new Set(ys).size === 1 ? 'y' : 'z');
  const c = indices.reduce((a, i) => [
    a[0] + coords[i][0],
    a[1] + coords[i][1],
    a[2] + coords[i][2]
  ], [0, 0, 0]).map(v => v / 4);
  
  return indices.map(i => {
    const [x, y, z] = coords[i];
    let dx, dy;
    if (axis === 'x') {
      dx = y - c[1];
      dy = z - c[2];
    } else if (axis === 'y') {
      dx = x - c[0];
      dy = z - c[2];
    } else {
      dx = x - c[0];
      dy = y - c[1];
    }
    return { i, ang: Math.atan2(dy, dx) };
  }).sort((a, b) => a.ang - b.ang).map(o => o.i);
}

export function buildFaceNumberAnnotations(stack, orderedVerts) {
  const cornerFns = orderedVerts.map(idx => functions[idx]);
  const numForFn = {};
  stack.forEach((fn, rank) => numForFn[fn] = rank + 1);

  const v0 = coords[orderedVerts[0]];
  const v1 = coords[orderedVerts[1]];
  const v2 = coords[orderedVerts[2]];
  const v3 = coords[orderedVerts[3]];
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e3 = [v3[0] - v0[0], v3[1] - v0[1], v3[2] - v0[2]];

  const UV = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
  const pts = UV.map(([u, v]) => [
    v0[0] + u * e1[0] + v * e3[0],
    v0[1] + u * e1[1] + v * e3[1],
    v0[2] + u * e1[2] + v * e3[2]
  ]);

  const anns = [];
  for (let k = 0; k < 4; k++) {
    const fn = cornerFns[k];
    const n = numForFn[fn];
    const [x, y, z] = pts[k];
    anns.push({
      x, y, z,
      text: String(n),
      showarrow: false,
      font: { size: 18, color: '#111' },
      bgcolor: 'rgba(255,255,255,0.65)',
      bordercolor: 'rgba(0,0,0,0.2)',
      borderwidth: 1,
      borderpad: 2
    });
  }
  return anns;
}

export function buildFunctionLabelAnnotations(stack) {
  const inset = 0.12;
  return functions.map(fn => {
    const i = funcToIdx[fn];
    const [x, y, z] = coords[i];
    const pos = [x * (1 - inset), y * (1 - inset), z * (1 - inset)];
    const inStack = stack.includes(fn);
    return {
      x: pos[0],
      y: pos[1],
      z: pos[2],
      text: fn,
      showarrow: false,
      font: { size: 16, color: inStack ? '#b22222' : '#222' },
      bgcolor: 'rgba(255,255,255,0.85)',
      bordercolor: 'rgba(0,0,0,0.15)',
      borderwidth: 1,
      borderpad: 2
    };
  });
}

export function buildFaceGridLines(orderedVerts) {
  const v0 = coords[orderedVerts[0]];
  const v1 = coords[orderedVerts[1]];
  const v2 = coords[orderedVerts[2]];
  const v3 = coords[orderedVerts[3]];
  
  const m01 = [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2, (v0[2] + v1[2]) / 2];
  const m23 = [(v2[0] + v3[0]) / 2, (v2[1] + v3[1]) / 2, (v2[2] + v3[2]) / 2];
  const m03 = [(v0[0] + v3[0]) / 2, (v0[1] + v3[1]) / 2, (v0[2] + v3[2]) / 2];
  const m12 = [(v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2, (v1[2] + v2[2]) / 2];
  
  return {
    line1: { x: [m01[0], m23[0]], y: [m01[1], m23[1]], z: [m01[2], m23[2]] },
    line2: { x: [m03[0], m12[0]], y: [m03[1], m12[1]], z: [m03[2], m12[2]] }
  };
}