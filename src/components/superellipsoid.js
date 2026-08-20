import * as THREE from 'three';

// Superellipsoid |x/rx|^n + |y/ry|^n + |z/rz|^n = 1 — the 3D squircle. At
// n = 2 it is an ellipsoid; as n grows the faces flatten and the corners
// sharpen, with curvature continuous everywhere (no flat-to-arc crease).
//
// Built by projecting a subdivided box radially onto the surface: the box's
// corner cells land on the superellipsoid's corners, keeping vertex density
// where curvature concentrates, and the analytic gradient normals keep the
// shading smooth at modest tessellation.
export function superellipsoidGeometry(rx, ry, rz, n, segments = 48) {
  const geometry = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const radii = [rx, ry, rz];
  const v = [0, 0, 0];
  const g = [0, 0, 0];

  for (let i = 0; i < position.count; i++) {
    v[0] = position.getX(i);
    v[1] = position.getY(i);
    v[2] = position.getZ(i);

    // radial scale t so that Σ |t·v_k / r_k|^n = 1
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += Math.abs(v[k] / radii[k]) ** n;
    const t = sum ** (-1 / n);

    // ∇F ∝ sign(x_k)·|x_k/r_k|^(n-1) / r_k at the surface point x = t·v
    let len = 0;
    for (let k = 0; k < 3; k++) {
      v[k] *= t;
      g[k] = Math.sign(v[k]) * Math.abs(v[k] / radii[k]) ** (n - 1) / radii[k];
      len += g[k] * g[k];
    }
    len = Math.sqrt(len) || 1;

    position.setXYZ(i, v[0], v[1], v[2]);
    normal.setXYZ(i, g[0] / len, g[1] / len, g[2] / len);
  }

  return geometry;
}
