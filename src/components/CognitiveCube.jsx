import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  uniform, positionLocal, normalView, vec3, vec4, mix, clamp, dot, normalize,
  sRGBTransferEOTF,
} from 'three/tsl';
import { superellipsoidGeometry } from './superellipsoid.js';
import {
  CORNERS, FACES, POLES, functionRank, poleShading, typeAtCorner, homeOrientation,
} from '../lib/cubeModel.js';
import {
  identityLattice, latticeDet, composeLattice, DANCES, sampleLane,
} from '../lib/choreography.js';
import { KIND_FAVORITES, allowedDances } from '../lib/favorites.js';

const SCALE = 1.5;
// The cube is drawn as the four POLES: vertical columns of two stacked
// octants each, one superellipsoid per pole — inherently seamless at the
// octant junction, corners rounded with Apple-squircle continuous curvature.
// The exponent controls sharpness: 2 = ellipsoid, ~5 = iOS-icon curvature,
// higher = approaching a sharp box.
const POLE_WIDTH = SCALE;      // the full cube edge is 2·SCALE
const POLE_HEIGHT = 2 * SCALE;
export const EXPONENT_MIN = 2;
export const EXPONENT_MAX = 12;

// Outward extent of the pole surface at horizontal offset `lt` from the
// pole's axis and height `y` — the superellipsoid solved for the third axis.
function poleExtent(lt, y, exponent) {
  const rest = 1
    - Math.abs(lt / (POLE_WIDTH / 2)) ** exponent
    - Math.abs(y / (POLE_HEIGHT / 2)) ** exponent;
  return (POLE_WIDTH / 2) * Math.max(rest, 1e-4) ** (1 / exponent);
}
const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_ANIM_SECONDS = 1.1;
// The transition clock, adjustable via the ?dur= URL param (slow-motion
// review); every animated quantity — slerp, dance lanes, color crossfade —
// shares it.
export const animClock = { seconds: DEFAULT_ANIM_SECONDS };
// Minimum-jerk quintic: zero velocity and acceleration at both endpoints,
// continuous jerk throughout — the least-action point-to-point profile.
const minJerk = t => t * t * t * (10 + t * (-15 + 6 * t));
// The former cubic profile, reachable via ?ease=cubic for A/B review; its
// acceleration jumps sign at the midpoint (a jerk spike the quintic avoids).
const cubicInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOut = new URLSearchParams(window.location.search).get('ease') === 'cubic'
  ? cubicInOut
  : minJerk;

// Every pole is fully painted: the vertical gradient between its own two
// corner colors, blended along the home-face axis toward its partner pole's
// gradient — so the home face and its opposite show crisp columns while the
// faces between them fade bright→dark, continuously through the grooves.
// A touch of view-space lighting keeps the rounded form legible.
//
// TSL port of the former GLSL ShaderMaterial, same uniforms and math. The
// GLSL shader wrote its values raw to the drawing buffer; the node pipeline
// instead runs every fragment through an output pass (tone mapping + the
// sRGB OETF), so the final color is pre-inverted with the EOTF — with tone
// mapping flat, the output pass restores exactly the raw values, and the
// rendered bytes match the WebGL build.
function makePoleMaterial(center) {
  const uniforms = {
    nearTop: uniform(new THREE.Color()),
    nearBottom: uniform(new THREE.Color()),
    farTop: uniform(new THREE.Color()),
    farBottom: uniform(new THREE.Color()),
    dirFace: uniform(new THREE.Vector3()),
    poleCenter: uniform(center.clone()),
    halfHeight: uniform(POLE_HEIGHT / 2),
    halfSpan: uniform(SCALE),
    blendSides: uniform(1), // 1 = blend across side faces, 0 = hard boundaries
    ownWeight: uniform(1), // 1 if this pole is on the home-face side
  };
  const u = uniforms;
  const vPos = positionLocal.add(u.poleCenter);
  const ty = clamp(vPos.y.add(u.halfHeight).div(u.halfHeight.mul(2)), 0, 1);
  const nearC = mix(u.nearBottom, u.nearTop, ty);
  const farC = mix(u.farBottom, u.farTop, ty);
  const wBlend = clamp(dot(vPos, u.dirFace).div(u.halfSpan).add(1).mul(0.5), 0, 1);
  // hard boundaries: the pole shows its own gradient at full strength
  const w = mix(u.ownWeight, wBlend, u.blendSides);
  const base = mix(farC, nearC, w);

  const n = normalize(normalView);
  const lightDir = normalize(vec3(0.35, 0.5, 0.8));
  const diff = dot(n, lightDir).max(0);
  const spec = dot(n, normalize(lightDir.add(vec3(0, 0, 1)))).max(0).pow(48);
  const color = base.mul(diff.mul(0.28).add(0.72)).add(spec.mul(0.12));

  const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.fragmentNode = vec4(sRGBTransferEOTF(color), 1);
  material.uniforms = uniforms;
  return material;
}

// The world pose that shows `type` canonically (dominant top-left, stack as
// the standard grid), fronting the camera's current horizontal direction.
// The group is always a proper rotation: any reflection in the home
// orientation is carried by the pole lattice L, so the returned quaternion
// is the home matrix times L — proper whenever det(L) matches the type's
// parity, which the transition planner guarantees.
function homePoseQuat(type, camera, lattice) {
  const { normal, up, right } = homeOrientation(type);
  const h = new THREE.Vector3(camera.position.x, 0, camera.position.z);
  if (h.lengthSq() < 1e-6) h.set(1, 0, 1);
  h.normalize();
  const rho = new THREE.Vector3().crossVectors(UP, h); // screen-right

  const m = new THREE.Matrix4()
    .makeBasis(rho, UP, h)
    .multiply(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...right), new THREE.Vector3(...up), new THREE.Vector3(...normal),
    ).transpose());
  m.scale(new THREE.Vector3(lattice.lx, lattice.ly, lattice.lz));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// The lattice a freshly-mounted cube should hold for a type: identity for
// proper home poses; for mirrored types, the swap across the home face's
// in-plane horizontal axis.
function initialLatticeFor(type) {
  const { normal, parity } = homeOrientation(type);
  if (parity === 1) return identityLattice();
  return composeLattice(DANCES[normal[0] !== 0 ? 'swap-z' : 'swap-x'], identityLattice());
}

// Rest transforms for every pole under a lattice L: position L(slot), and
// upside down when L flips y (the flip axis is arbitrary — invisible).
const Q_INVERT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
function restsForLattice(lattice) {
  const rests = {};
  for (const pole of POLES) {
    rests[pole.key] = {
      position: new THREE.Vector3(
        lattice.lx * pole.sx * (POLE_WIDTH / 2), 0, lattice.lz * pole.sz * (POLE_WIDTH / 2),
      ),
      quaternion: lattice.ly === 1 ? new THREE.Quaternion() : Q_INVERT.clone(),
    };
  }
  return rests;
}

// Text that lies in its face's plane but is re-oriented every frame to stay
// world-upright — and, because its world matrix is rebuilt from an orthonormal
// basis, never mirror-imaged even while the cube's transform is improper.
const _pos = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _world = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _nrm = new THREE.Matrix3();

const _toCam = new THREE.Vector3();
const _hitN = new THREE.Vector3();
const _danceQ = new THREE.Quaternion();
const _resQ = new THREE.Quaternion();
const _rowA = [0, 0, 0, 0];
const _rowB = [0, 0, 0, 0];
const _halfPos = new THREE.Vector3();
const _halfOff = new THREE.Vector3();
const _viewV = new THREE.Vector3();
const _viewQ = new THREE.Quaternion();

// plan: candidate selection rule. 'motion' scores each dance (and, near
// 180°, each rotation direction) by the world motion of the composite it
// would produce; 'residual' is the legacy smallest-residual-angle rule,
// kept for A/B comparison via ?plan=residual.
const _params = new URLSearchParams(window.location.search);
const PLAN_MODE = _params.get('plan') === 'residual' ? 'residual' : 'motion';
// Review overrides restricting the planner's candidate set: ?dance= pins
// the generator, ?db= the orbit side, ?dy= the over/under or flip-turn
// direction, ?dd= the rotation direction (1 or -1 each). An override that
// matches no candidate is ignored.
const _sign = v => (v === '-1' ? -1 : v === '1' ? 1 : null);
const FORCE = {
  dance: ['swap-x', 'swap-z', 'flip'].includes(_params.get('dance')) ? _params.get('dance') : null,
  b: _sign(_params.get('db')),
  y: _sign(_params.get('dy')),
  dir: _sign(_params.get('dd')),
};
// explicit ?swap=/?flip= lane params beat a kind favorite's lane choice
const SWAP_LANE_FORCED = _params.has('swap');
const FLIP_LANE_FORCED = _params.has('flip');

// The residual rotation from one orientation to another, as axis + angle
// (the w >= 0 representative, so angle is the short way in [0, pi]).
// Near 180° the representative's axis sign is numerical noise (u and −u
// are the same rotation), so it is canonicalized against the screen frame
// — up, else toward the viewer, else screen-right — making direction
// choices (dd) mean the same thing for every pair of a kind.
function residualOf(fromQ, toQ, camera) {
  const res = fromQ.clone().invert().multiply(toQ);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(res.w)));
  const axis = new THREE.Vector3(res.x, res.y, res.z);
  if (res.w < 0) axis.negate();
  if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0);
  axis.normalize();
  if (angle > 2.96 && camera) {
    const n = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
    let d = axis.dot(UP);
    if (Math.abs(d) < 0.3) d = axis.dot(n);
    if (Math.abs(d) < 0.3) d = axis.dot(new THREE.Vector3().crossVectors(UP, n));
    if (d < 0) axis.negate();
  }
  return { axis, angle };
}

// The screen-frame class of a residual axis, matching the taxonomy of
// scripts/enumerate-kinds.mjs: signed classes below 180°, unsigned at 180°.
function residualAxisClass(axis, angle, camera) {
  const deg = angle * 180 / Math.PI;
  const n = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
  const r = new THREE.Vector3().crossVectors(UP, n);
  const y = axis.dot(UP);
  const nn = axis.dot(n);
  const rr = axis.dot(r);
  if (deg > 178) {
    if (Math.abs(y) > 0.9) return 'vertical';
    if (Math.abs(nn) > 0.9) return 'normal';
    if (Math.abs(rr) > 0.9) return 'lateral';
    return 'diagonal';
  }
  const comps = [
    ['up', y], ['down', -y], ['toward', nn], ['away', -nn], ['right', rr], ['left', -rr],
  ].filter(([, v]) => v > 0.9);
  return comps.length ? comps[0][0] : 'diagonal';
}

// Interim state of the WebGPU port: troika Text and drei's Line patch GLSL
// shaders and cannot run on the node material system, so they are skipped
// under the WebGPU renderer until their node-based replacements land
// (labels via canvas textures, equator lines via a node line material).
const PORT_PENDING = { labels: true, lines: true };

// UI swap-style values → baked lane names
const SWAP_LANES = {
  orbit: 'hand-orbit',
  hop: 'hand-hop',
  planar: 'action-planar',
  vertical: 'action-vertical',
  'action-hop': 'action-hop',
};

function SurfaceLabel({ groupRef, position, normal, visible = true, children }) {
  const ref = useRef();
  // starts at 0 so labels fade in on mount — including remapped labels
  // surfacing on a newly-outward face after a dance
  const fadeRef = useRef(0);
  useFrame(({ camera }, delta) => {
    const g = groupRef.current;
    const o = ref.current;
    if (!g || !o) return;
    const s = g.scale;
    // cube nearly flat mid-flip: keep last pose
    if (Math.min(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) < 0.04) return;
    // visibility fades in and out rather than popping
    const target = visible ? 1 : 0;
    const f = fadeRef.current + (target - fadeRef.current) * Math.min(1, delta * 10);
    fadeRef.current = Math.abs(f - target) < 0.005 ? target : f;
    g.updateMatrixWorld();
    _pos.copy(position).applyMatrix4(g.matrixWorld);
    _n.copy(normal).applyMatrix3(_nrm.getNormalMatrix(g.matrixWorld)).normalize();
    // hide labels on faces turned away from the camera — depth occlusion
    // handles this in normal poses, but not while the cube is flattened
    _toCam.copy(camera.position).sub(_pos).normalize();
    o.visible = fadeRef.current > 0.01 && _n.dot(_toCam) > 0.05;
    if (!o.visible) return;
    for (const text of o.children) {
      text.fillOpacity = fadeRef.current;
      text.outlineOpacity = fadeRef.current;
    }
    const d = UP.dot(_n);
    if (Math.abs(d) > 0.995) return;
    _u.copy(UP).addScaledVector(_n, -d).normalize();
    _r.crossVectors(_u, _n).normalize();
    _u.crossVectors(_n, _r);
    _world.makeBasis(_r, _u, _n).setPosition(_pos);
    o.matrix.multiplyMatrices(_inv.copy(g.matrixWorld).invert(), _world);
  });
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

// A function abbreviation with its rank as a trailing subscript, positioned
// from the glyphs' measured widths (a fixed offset reads differently after
// "Si" than after "Ne") and centered as a composite.
const SUB_GAP = 0.025;
const FnRankLabel = React.memo(function FnRankLabel({ fn, rank }) {
  const mainRef = useRef();
  const subRef = useRef();
  const widths = useRef({ main: 0, sub: 0 });

  const layout = () => {
    const { main, sub } = widths.current;
    if (!main || !sub || !mainRef.current || !subRef.current) return;
    const mainX = -(SUB_GAP + sub) / 2;
    mainRef.current.position.x = mainX;
    subRef.current.position.x = mainX + main / 2 + SUB_GAP;
  };
  const measure = key => t => {
    const b = t.textRenderInfo.blockBounds;
    widths.current[key] = b[2] - b[0];
    layout();
  };

  return (
    <>
      <Text
        ref={mainRef}
        onSync={measure('main')}
        raycast={() => null}
        fontSize={0.36}
        color="#cccccc"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="black"
      >
        {fn}
      </Text>
      <Text
        ref={subRef}
        onSync={measure('sub')}
        raycast={() => null}
        position={[0.16, -0.11, 0]}
        fontSize={0.2}
        color="#cccccc"
        anchorX="left"
        anchorY="middle"
        outlineWidth={0.015}
        outlineColor="black"
      >
        {String(rank)}
      </Text>
    </>
  );
});

// Position within a side face at `fraction` from center toward `corner` —
// laid on the pole's superellipsoid surface (a face-plane position would
// float where the surface recedes toward the edges), lifted slightly to
// avoid z-fighting.
function towardCorner(face, frame, corner, fraction, lift, exponent) {
  const p = new THREE.Vector3().lerpVectors(frame.center, corner, fraction);
  const halfW = POLE_WIDTH / 2;
  const a = face.normal[0] !== 0 ? 'x' : 'z';
  const t = a === 'x' ? 'z' : 'x';
  const lt = p[t] - Math.sign(p[t]) * halfW;
  // outward coordinate: pole axis offset + surface extent from that axis
  p[a] = Math.sign(face.normal[a === 'x' ? 0 : 2])
    * (halfW + poleExtent(lt, p.y, exponent) + lift);
  return p;
}

function Pole({
  pole, geometry, exponent, lineOpacity, shadowDim, shadowSat, blendSides,
  selectedType, hoveredType, onSelect, onHover, draggingRef, latticeRef, registerGroup,
  restsRef, restEpoch,
}) {
  const localGroupRef = useRef();
  const center = useMemo(
    () => new THREE.Vector3(pole.sx * POLE_WIDTH / 2, 0, pole.sz * POLE_WIDTH / 2),
    [pole],
  );
  const shading = useMemo(
    () => poleShading(pole, selectedType, shadowDim, shadowSat),
    [pole, selectedType, shadowDim, shadowSat],
  );

  const material = useMemo(() => makePoleMaterial(center), [center]);

  useEffect(() => () => material.dispose(), [material]);

  // Colors crossfade to the new shading on the same clock and easing as the
  // transition itself, starting from whatever is currently displayed.
  const colorAnimRef = useRef(null);
  const colorsInitRef = useRef(false);
  useEffect(() => {
    const u = material.uniforms;
    const to = {
      nearTop: new THREE.Color(shading.nearTop),
      nearBottom: new THREE.Color(shading.nearBottom),
      farTop: new THREE.Color(shading.farTop),
      farBottom: new THREE.Color(shading.farBottom),
      dirFace: new THREE.Vector3(...shading.dirFace),
      ownWeight: shading.isNear ? 1 : 0,
    };
    if (!colorsInitRef.current) {
      colorsInitRef.current = true;
      u.nearTop.value.copy(to.nearTop);
      u.nearBottom.value.copy(to.nearBottom);
      u.farTop.value.copy(to.farTop);
      u.farBottom.value.copy(to.farBottom);
      u.dirFace.value.copy(to.dirFace);
      u.ownWeight.value = to.ownWeight;
      return;
    }
    colorAnimRef.current = {
      t: 0,
      from: {
        nearTop: u.nearTop.value.clone(),
        nearBottom: u.nearBottom.value.clone(),
        farTop: u.farTop.value.clone(),
        farBottom: u.farBottom.value.clone(),
        dirFace: u.dirFace.value.clone(),
        ownWeight: u.ownWeight.value,
      },
      to,
    };
  }, [shading, material]);

  useEffect(() => {
    material.uniforms.blendSides.value = blendSides ? 1 : 0;
  }, [blendSides, material]);

  useFrame((_, delta) => {
    const a = colorAnimRef.current;
    if (!a) return;
    a.t = Math.min(1, a.t + delta / animClock.seconds);
    const e = easeInOut(a.t);
    const u = material.uniforms;
    u.nearTop.value.lerpColors(a.from.nearTop, a.to.nearTop, e);
    u.nearBottom.value.lerpColors(a.from.nearBottom, a.to.nearBottom, e);
    u.farTop.value.lerpColors(a.from.farTop, a.to.farTop, e);
    u.farBottom.value.lerpColors(a.from.farBottom, a.to.farBottom, e);
    u.dirFace.value.lerpVectors(a.from.dirFace, a.to.dirFace, e);
    u.ownWeight.value = a.from.ownWeight + (a.to.ownWeight - a.from.ownWeight) * e;
    if (a.t >= 1) colorAnimRef.current = null;
  });

  // The semantic cube face this event's surface belongs to — null for caps,
  // and for rounded regions facing another pole (grooves), which don't
  // select. The hit normal is geometry-local; the pole's own transform maps
  // it to cube-local, and the lattice maps that to semantic space, where
  // the pole always sits at its own slot.
  const hitSideFace = (e) => {
    const n = e.face?.normal;
    if (!n) return null;
    const L = latticeRef.current;
    _hitN.copy(n).applyQuaternion(localGroupRef.current.quaternion);
    _hitN.set(L.lx * _hitN.x, L.ly * _hitN.y, L.lz * _hitN.z);
    if (Math.abs(_hitN.y) >= Math.max(Math.abs(_hitN.x), Math.abs(_hitN.z))) return null;
    const axis = Math.abs(_hitN.x) >= Math.abs(_hitN.z) ? 0 : 2;
    const sign = Math.sign(axis === 0 ? _hitN.x : _hitN.z);
    if (sign !== (axis === 0 ? pole.sx : pole.sz)) return null;
    return FACES.find(f => f.normal[axis] === sign);
  };

  // The type whose quadrant this event's surface point belongs to, if any.
  // The octant test lives in geometry space: the pole's own top half is
  // always its top function, however the pole is placed.
  const typeAt = (e) => {
    const face = hitSideFace(e);
    if (!face) return null;
    const fn = e.object.worldToLocal(e.point.clone()).y >= 0 ? pole.top : pole.bottom;
    const cornerKey = Object.keys(face.corners).find(k => face.corners[k] === fn);
    return typeAtCorner(face, cornerKey);
  };

  const handlePointerUp = (e) => {
    e.stopPropagation();
    if (draggingRef.current) return;
    const type = typeAt(e);
    if (type) onSelect(type);
  };

  const handlePointerMove = (e) => {
    // only the nearest pole may claim the hover — without this, the ray
    // continues through the cube and the poles BEHIND overwrite it
    e.stopPropagation();
    const type = typeAt(e);
    onHover(type);
    document.body.style.cursor = type ? 'pointer' : 'auto';
  };

  // Labels ride the pole: their positions are fixed in the pole's own
  // geometry frame, so they stay attached to their quadrants through every
  // dance and slerp (the world-upright re-basing keeps them readable even
  // mid-flip). Each pole carries the labels of its four quadrants — its two
  // functions on each of its two side faces. Which geometry face carries
  // them depends on the pole's current rest, not its home slot: a swap
  // translates a pole to the mirrored slot without rotating it, so the
  // face that was outward ends up buried in a groove and the opposite face
  // surfaces. Rest quaternions are always axis→±axis maps (products of π
  // rotations), so each semantic side face lands on exactly one geometry
  // face; restEpoch remaps after every dance.
  const labels = useMemo(() => {
    const rest = restsRef.current[pole.key];
    const qInv = rest.quaternion.clone().invert();
    const geoDir = (axis) => {
      const v = new THREE.Vector3();
      v[axis] = Math.sign(axis === 'x' ? rest.position.x : rest.position.z) || 1;
      v.applyQuaternion(qInv);
      v.set(Math.round(v.x), Math.round(v.y), Math.round(v.z));
      return v;
    };
    const gx = geoDir('x');
    const gz = geoDir('z');
    // the pole's footprint quadrant in its own geometry frame
    const gsx = gx.x !== 0 ? gx.x : gz.x;
    const gsz = gx.x !== 0 ? gz.z : gx.z;
    const gCenter = new THREE.Vector3(gsx * POLE_WIDTH / 2, 0, gsz * POLE_WIDTH / 2);
    const out = [];
    for (const face of FACES) {
      if (!face.isSide) continue;
      const onPole = face.normal[0] !== 0
        ? face.normal[0] === pole.sx
        : face.normal[2] === pole.sz;
      if (!onPole) continue;
      const normal = face.normal[0] !== 0 ? gx : gz;
      const gFace = { normal: [normal.x, 0, normal.z] };
      const a = normal.x !== 0 ? 'x' : 'z';
      const aSign = a === 'x' ? normal.x : normal.z;
      const frame = { center: normal.clone().multiplyScalar(SCALE) };
      for (const fn of [pole.top, pole.bottom]) {
        const cornerKey = Object.keys(face.corners).find(k => face.corners[k] === fn);
        // the pole's top function is at +y in its geometry frame, always
        const ySign = fn === pole.top ? 1 : -1;
        const corner = new THREE.Vector3(gsx, ySign, gsz).multiplyScalar(SCALE);
        // badge: horizontally centered on the pole so its placement is
        // invariant under every rearrangement, 72% toward the octant's end
        const badgePos = new THREE.Vector3();
        badgePos.y = ySign * SCALE * 0.72;
        badgePos[a] = aSign * (poleExtent(0, badgePos.y, exponent) + 0.06);
        out.push({
          key: `${face.key}:${fn}:${a}${aSign}`,
          fn,
          normal,
          fnPos: towardCorner(gFace, frame, corner, 0.5, 0.02, exponent).sub(gCenter),
          badgePos,
          type: typeAtCorner(face, cornerKey),
        });
      }
    }
    return out;
  }, [pole, exponent, restEpoch]);

  // Equator: the pole's full y = 0 cross-section (a superellipse), one
  // closed loop splitting the pole into its two type octants — the only
  // quadrant boundary that needs drawing, since the grooves between poles
  // mark the vertical splits. Lifted along the cross-section's own normal;
  // the neighboring poles occlude the stretch deep inside each groove.
  const equator = useMemo(() => {
    const a = POLE_WIDTH / 2;
    const samples = 128;
    return Array.from({ length: samples + 1 }, (_, i) => {
      const th = (i / samples) * 2 * Math.PI;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const x = Math.sign(c) * Math.abs(c) ** (2 / exponent) * a;
      const z = Math.sign(s) * Math.abs(s) ** (2 / exponent) * a;
      const gx = Math.sign(x) * Math.abs(x / a) ** (exponent - 1);
      const gz = Math.sign(z) * Math.abs(z / a) ** (exponent - 1);
      const gl = Math.hypot(gx, gz) || 1;
      return new THREE.Vector3(x + 0.01 * gx / gl, 0, z + 0.01 * gz / gl);
    });
  }, [exponent]);

  return (
    <group
      position={center}
      ref={(g) => { localGroupRef.current = g; registerGroup(pole.key, g); }}
    >
      <mesh
        geometry={geometry}
        material={material}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
      />
      {!PORT_PENDING.lines && lineOpacity > 0 && (
        <Line
          points={equator}
          color="#ffffff"
          transparent
          opacity={lineOpacity}
          lineWidth={1}
          side={THREE.DoubleSide}
        />
      )}
      {!PORT_PENDING.labels && labels.map(l => (
        <group key={l.key}>
          <SurfaceLabel groupRef={localGroupRef} position={l.fnPos} normal={l.normal}>
            <FnRankLabel fn={l.fn} rank={functionRank(selectedType, l.fn)} />
          </SurfaceLabel>
          {l.type && (
            <SurfaceLabel
              groupRef={localGroupRef}
              position={l.badgePos}
              normal={l.normal}
              visible={l.type === hoveredType}
            >
              <Text
                raycast={() => null}
                fontSize={0.15}
                color={l.type === selectedType ? 'white' : '#bbbbbb'}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.01}
                outlineColor="black"
              >
                {l.type}
              </Text>
            </SurfaceLabel>
          )}
        </group>
      ))}
    </group>
  );
}

function CubeScene({
  selectedType, setSelectedType, initialYaw, spin, swapStyle, flipStyle,
  exponent, lineOpacity, shadowDim, shadowSat, blendSides, onViewedSide,
}) {
  const groupRef = useRef();
  const [autoRotate, setAutoRotate] = useState(spin);
  const [hoveredType, setHoveredType] = useState(null);
  const draggingRef = useRef(false);
  const animRef = useRef(null);
  const mountedRef = useRef(false);
  // the type whose home pose the cube last settled toward — the anchor for
  // drift-free kind classification
  const prevTypeRef = useRef(selectedType);
  const { gl, camera } = useThree();

  // The lattice: which reflection the pole arrangement currently realizes.
  // A ref only — labels ride the pole groups, so nothing re-renders on it.
  const latticeRef = useRef(null);
  if (!latticeRef.current) {
    latticeRef.current = initialYaw !== null
      ? identityLattice()
      : initialLatticeFor(selectedType);
  }
  const restsRef = useRef(null);
  if (!restsRef.current) restsRef.current = restsForLattice(latticeRef.current);
  // bumped whenever restsRef changes, so pole labels remap to the faces
  // that are outward in the new arrangement
  const [restEpoch, setRestEpoch] = useState(0);
  const poleGroupsRef = useRef({});
  const swapStyleRef = useRef(swapStyle);
  swapStyleRef.current = swapStyle;
  const flipStyleRef = useRef(flipStyle);
  flipStyleRef.current = flipStyle;

  const registerGroup = (key, g) => { poleGroupsRef.current[key] = g; };

  // Initial pose: explicit yaw if given, else snap to the selected type's home.
  useLayoutEffect(() => {
    const g = groupRef.current;
    if (initialYaw !== null) {
      g.quaternion.setFromAxisAngle(UP, initialYaw);
    } else {
      g.quaternion.copy(homePoseQuat(selectedType, camera, latticeRef.current));
    }
  }, []);

  // Construct the dance descriptor for one generator from the current rests.
  // favLanes carries the kind favorite's lane choices; explicit URL lane
  // params (and the UI selectors they encode) take precedence.
  const buildDance = (name, targetType, currentQ, bulgeSign = 1, ySign = 1, favLanes = null) => {
    const fromRests = {};
    const toRests = {};
    const isFlip = name === 'flip';
    // flip splits along the target face's in-plane horizontal axis and
    // turns about the face-normal axis — the user-facing left/right split
    const faceNormal = homeOrientation(targetType).normal;
    const axis = isFlip
      ? (faceNormal[0] !== 0 ? 'z' : 'x')
      : (name === 'swap-x' ? 'x' : 'z');
    const bulgeAxis = axis === 'x' ? 'z' : 'x';
    const bulgeVec = new THREE.Vector3(bulgeAxis === 'x' ? 1 : 0, 0, bulgeAxis === 'z' ? 1 : 0);
    for (const pole of POLES) {
      const from = restsRef.current[pole.key];
      fromRests[pole.key] = {
        position: from.position.clone(),
        quaternion: from.quaternion.clone(),
      };
      const p = from.position.clone();
      const q = from.quaternion.clone();
      if (isFlip) q.premultiply(new THREE.Quaternion().setFromAxisAngle(bulgeVec, Math.PI));
      else p[axis] *= -1;
      toRests[pole.key] = { position: p, quaternion: q };
    }
    // vertical motion must read as world-up, whichever way the cube hangs
    const localUp = UP.clone().applyQuaternion(currentQ.clone().invert());
    const uiLane = isFlip
      ? (flipStyleRef.current === 'action' ? 'action-flip' : 'hand-flip')
      : (SWAP_LANES[swapStyleRef.current] || 'hand-orbit');
    const laneForced = isFlip ? FLIP_LANE_FORCED : SWAP_LANE_FORCED;
    const favLane = isFlip ? favLanes?.flip : favLanes?.swap;
    return {
      lane: laneForced ? uiLane : (favLane || uiLane),
      isFlip, axis, bulgeAxis, bulgeVec, fromRests, toRests,
      hopSign: Math.sign(localUp.y) || 1,
      bulgeSign, ySign,
    };
  };

  // Selection → plan the transition: one proper rotation, plus at most one
  // dance when the target parity differs from the lattice's. Every
  // candidate — each of {swap-x, swap-z, flip}, and near-180° residuals
  // both rotation directions — is scored by the world motion its composite
  // would produce; PLAN_MODE picks by that motion (default) or by the
  // legacy smallest-residual rule.
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const g = groupRef.current;

    // a retargeted mid-dance transition snap-finishes the previous dance
    if (animRef.current?.dance) {
      restsRef.current = animRef.current.dance.toRests;
      setRestEpoch(e => e + 1);
    }

    const parity = homeOrientation(selectedType).parity;
    const L = latticeRef.current;
    // The transition's KIND is classified from a canonical anchor, never
    // from the live pose: auto-spin, a manual orbit, or a mid-flight
    // retarget all add an arbitrary yaw that would otherwise skew the
    // signature (mirror|113|down instead of mirror|90|down) and silently
    // miss the favorites table. The anchor is the previous type's home
    // pose under the current lattice and camera, world-yawed by whichever
    // quarter turn lies nearest the live pose — so a deliberate orbit to
    // another face re-anchors classification to the face being looked at
    // (selecting a type on the viewed face is an in-place kind, not a
    // 180° one), while the leftover drift stays under 45° and rides the
    // concurrent rotation. The actual residuals used for animation and
    // scoring still come from the live pose below.
    let qCanon = homePoseQuat(prevTypeRef.current, camera, L);
    {
      let bestAng = Infinity;
      let bestQ = qCanon;
      for (let k = 0; k < 4; k++) {
        const q = qCanon.clone().premultiply(_resQ.setFromAxisAngle(UP, k * Math.PI / 2));
        const ang = q.angleTo(g.quaternion);
        if (ang < bestAng) { bestAng = ang; bestQ = q; }
      }
      qCanon = bestQ;
    }
    prevTypeRef.current = selectedType;

    if (parity !== latticeDet(L)) {
      // per-dance residuals first: the smallest one defines the
      // transition's kind, which selects the recorded favorite
      const base = [];
      for (const name of ['swap-x', 'swap-z', 'flip']) {
        const Lc = composeLattice(DANCES[name], L);
        const q = homePoseQuat(selectedType, camera, Lc);
        const { axis, angle } = residualOf(g.quaternion, q, camera);
        base.push({ name, Lc, q, axis, angle, canon: residualOf(qCanon, q, camera) });
      }
      const descriptors = base.map(b => {
        const deg = Math.round(b.canon.angle * 180 / Math.PI);
        return {
          name: b.name,
          deg,
          cls: deg === 0
            ? (b.name === 'flip' ? 'flip' : 'swap')
            : residualAxisClass(b.canon.axis, b.canon.angle, camera),
        };
      });
      // Fixed handedness: quarter rotations play clockwise seen from
      // above whenever a candidate with that sense exists (the two swaps
      // always carry opposite senses, so for swap-carried pairs it always
      // does). A transition and its reverse then use the SAME turning
      // sense — repeated selections cycle like a revolving door instead
      // of shuttling back and forth. Where geometry forces the other
      // sense (the flip is the lone quarter carrier on return trips),
      // the simpler quarter still wins over a 180° alternative.
      const minRaw = descriptors.reduce((m, d) => (d.deg < m.deg ? d : m), descriptors[0]);
      const minD = (minRaw.deg === 90
        && descriptors.find(d => d.deg === 90 && d.cls === 'down')) || minRaw;
      const sig = `mirror|${minD.deg}|${minD.cls}`;
      const fav = PLAN_MODE === 'motion' ? KIND_FAVORITES[sig] || null : null;
      const targetNormalAxis = homeOrientation(selectedType).normal[0] !== 0 ? 'x' : 'z';
      const favNames = allowedDances(fav, descriptors, minD.deg, minD.cls, targetNormalAxis);
      const favLanes = fav && {
        swap: fav.swapLane ? SWAP_LANES[fav.swapLane] || null : null,
        flip: fav.flipLane ? (fav.flipLane === 'action' ? 'action-flip' : 'hand-flip') : null,
      };

      const candidates = [];
      for (const b of base) {
        // near 180° the short way is ambiguous — score both directions
        const dirs = b.angle > 2.96 ? [b.angle, b.angle - 2 * Math.PI] : [b.angle];
        for (const bulgeSign of [1, -1]) {
          for (const ySign of [1, -1]) {
            const dance = buildDance(b.name, selectedType, g.quaternion, bulgeSign, ySign, favLanes);
            for (const a of dirs) {
              candidates.push({
                name: b.name, Lc: b.Lc, q: b.q, dance, axis: b.axis, angle: a, bulgeSign, ySign,
                legacy: bulgeSign === 1 && ySign === 1 && a === b.angle,
                motion: compositeMotion(dance, g.quaternion, b.axis, a),
              });
            }
          }
        }
      }
      // constraints: explicit URL overrides beat the favorite; the
      // favorite's direction signs apply per dance type (whenSwap /
      // whenFlip); whatever is left free, the motion score decides
      const allowed = FORCE.dance ? [FORCE.dance] : favNames;
      // resolve a db of 'cw' to the concrete orbit side whose sweep is
      // clockwise from the top, probed on the allowed dance
      let cwB = null;
      if (FORCE.b === null && fav?.whenSwap?.db === 'cw' && allowed?.length === 1 && allowed[0] !== 'flip') {
        const probe = candidates.find(c =>
          c.name === allowed[0] && c.bulgeSign === 1 && c.ySign === 1);
        if (probe) {
          const s = danceYawSense(probe.dance, g.quaternion, probe.axis, probe.angle);
          cwB = s < 0 ? 1 : -1;
        }
      }
      let pool = candidates.filter(c => {
        const f = (c.name === 'flip' ? fav?.whenFlip : fav?.whenSwap) || {};
        const fb = f.db === 'cw' ? cwB : f.db;
        const b = FORCE.b ?? fb ?? null;
        const y = FORCE.y ?? f.dy ?? null;
        const d = FORCE.dir ?? f.dd ?? fav?.dd ?? null;
        return (!allowed || allowed.includes(c.name))
          && (b === null || c.bulgeSign === b)
          && (y === null || c.ySign === y)
          && (d === null || c.angle === 0 || Math.sign(c.angle) === d);
      });
      if (!pool.length) pool = candidates;
      let best = null;
      for (const c of pool) {
        if (PLAN_MODE === 'residual' && !c.legacy) continue;
        const better = !best || (PLAN_MODE === 'motion'
          ? c.motion < best.motion - 1e-9
          : Math.abs(c.angle) < Math.abs(best.angle) - 1e-9);
        if (better) best = c;
      }
      if (!best) best = pool[0];
      window.__lastPlan = {
        mode: PLAN_MODE,
        target: selectedType,
        sig,
        favored: !!fav,
        lane: best.dance.lane,
        chosen: `${best.name} b${best.bulgeSign} y${best.ySign}`,
        chosenDeg: Math.round(best.angle * 180 / Math.PI),
        chosenMotion: Math.round(best.motion * 100) / 100,
        candidates: candidates.map(c => ({
          name: c.name,
          b: c.bulgeSign,
          y: c.ySign,
          deg: Math.round(c.angle * 180 / Math.PI),
          axisY: Math.round(c.axis.y * 100) / 100,
          motion: Math.round(c.motion * 100) / 100,
        })),
      };
      latticeRef.current = best.Lc;
      animRef.current = {
        fromQ: g.quaternion.clone(), toQ: best.q,
        resAxis: best.axis.clone(), resAngle: best.angle,
        t: 0, dance: best.dance,
      };
    } else {
      const q = homePoseQuat(selectedType, camera, L);
      const { axis, angle } = residualOf(g.quaternion, q, camera);
      // for a near-180° pure rotation both directions are equal cost; the
      // kind's recorded favorite picks one, ?dd= overrides
      const canon = residualOf(qCanon, q, camera);
      const deg = Math.round(canon.angle * 180 / Math.PI);
      const sig = `turn|${deg}|${deg === 0 ? 'none' : residualAxisClass(canon.axis, canon.angle, camera)}`;
      const fav = PLAN_MODE === 'motion' ? KIND_FAVORITES[sig] || null : null;
      const dir = FORCE.dir ?? fav?.dd ?? null;
      const resAngle = dir === -1 && angle > 2.96 ? angle - 2 * Math.PI : angle;
      window.__lastPlan = {
        mode: PLAN_MODE, target: selectedType, sig, favored: !!fav, chosen: 'slerp-only',
        chosenDeg: Math.round(resAngle * 180 / Math.PI), candidates: [],
      };
      animRef.current = {
        fromQ: g.quaternion.clone(), toQ: q,
        resAxis: axis, resAngle,
        t: 0, dance: null,
      };
    }
  }, [selectedType, camera]);

  // Drag detection on the canvas itself, so orbiting never triggers a select.
  useEffect(() => {
    const el = gl.domElement;
    let start = null;
    const down = (e) => { start = [e.clientX, e.clientY]; draggingRef.current = false; };
    const move = (e) => {
      if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) {
        draggingRef.current = true;
      }
    };
    const up = () => {
      start = null;
      requestAnimationFrame(() => { draggingRef.current = false; });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [gl]);

  // Cube-local pose of one pole for a sampled dance frame. A row is the
  // half-center's [a, b, y, rot]; the pole is its half's center plus its
  // own offset, rotated with the half. bulgeSign and ySign mirror the lane
  // across the bulge plane / the horizontal plane — legal because lane
  // endpoints sit at b = y = rot = 0, and separating-axis clearance is
  // reflection-invariant. They select the dance's direction: which way an
  // orbit goes around, which half passes over, which way a flip turns.
  const danceLocalPose = (dance, lane, from, outPos, outQuat) => {
    const s = Math.sign(from.position[dance.axis]);
    const row = s < 0 ? lane.A : lane.B;
    if (lane.rot === 'yaw') outQuat.setFromAxisAngle(UP, row[3] * dance.bulgeSign);
    else if (lane.rot === 'pitch') {
      outQuat.setFromAxisAngle(
        dance.bulgeVec,
        row[3] * (dance.isFlip ? 1 : dance.hopSign) * dance.ySign,
      );
    } else outQuat.identity();
    outPos.set(0, dance.hopSign * dance.ySign * row[2], 0);
    outPos[dance.axis] = row[0];
    outPos[dance.bulgeAxis] += row[1] * dance.bulgeSign;
    _halfOff.set(0, 0, 0);
    _halfOff[dance.bulgeAxis] = from.position[dance.bulgeAxis];
    _halfOff.applyQuaternion(outQuat);
    outPos.add(_halfOff);
    outQuat.multiply(from.quaternion);
  };

  const applyDance = (dance, t) => {
    const lane = sampleLane(dance.lane, t, _rowA, _rowB);
    for (const pole of POLES) {
      const pg = poleGroupsRef.current[pole.key];
      const from = dance.fromRests[pole.key];
      if (!pg || !from) continue;
      danceLocalPose(dance, lane, from, pg.position, pg.quaternion);
    }
  };

  // The angular sense of a candidate composite's pole motion about
  // world-up: positive = counterclockwise seen from the top. Used to
  // resolve a favorite's db 'cw' — the orbit side whose sweep reads
  // clockwise from above — since the lane-frame sign's screen sense flips
  // with the swap axis.
  const danceYawSense = (dance, fromQ, resAxis, resAngle) => {
    const G = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const rowA = [0, 0, 0, 0];
    const rowB = [0, 0, 0, 0];
    const prev = {};
    let sense = 0;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      spin.setFromAxisAngle(resAxis, resAngle * easeInOut(t));
      G.copy(fromQ).multiply(spin);
      const lane = sampleLane(dance.lane, t, rowA, rowB);
      for (const pole of POLES) {
        const from = dance.fromRests[pole.key];
        danceLocalPose(dance, lane, from, pos, quat);
        pos.applyQuaternion(G);
        const p = prev[pole.key];
        if (p) {
          sense += p.z * pos.x - p.x * pos.z; // cross(prev, pos) · up
          p.copy(pos);
        } else {
          prev[pole.key] = pos.clone();
        }
      }
    }
    return Math.sign(sense);
  };

  // The total world motion — translation plus gyration-weighted rotation of
  // all four poles — that a candidate composite would produce: the dance
  // lane playing while the group turns by resAngle about resAxis. This is
  // what detects a frame rotation that cancels the dance's motion versus
  // one that exaggerates it.
  const GYRATION = 0.97;
  const compositeMotion = (dance, fromQ, resAxis, resAngle) => {
    const STEPS = 12;
    const G = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const rowA = [0, 0, 0, 0];
    const rowB = [0, 0, 0, 0];
    const prev = {};
    let cost = 0;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      spin.setFromAxisAngle(resAxis, resAngle * easeInOut(t));
      G.copy(fromQ).multiply(spin);
      const lane = sampleLane(dance.lane, t, rowA, rowB);
      for (const pole of POLES) {
        const from = dance.fromRests[pole.key];
        danceLocalPose(dance, lane, from, pos, quat);
        pos.applyQuaternion(G);
        quat.premultiply(G);
        const p = prev[pole.key];
        if (p) {
          cost += pos.distanceTo(p.pos) + GYRATION * p.quat.angleTo(quat);
          p.pos.copy(pos);
          p.quat.copy(quat);
        } else {
          prev[pole.key] = { pos: pos.clone(), quat: quat.clone() };
        }
      }
    }
    return cost;
  };

  const applyRests = () => {
    for (const pole of POLES) {
      const pg = poleGroupsRef.current[pole.key];
      const rest = restsRef.current[pole.key];
      if (!pg || !rest) continue;
      pg.position.copy(rest.position);
      pg.quaternion.copy(rest.quaternion);
    }
  };

  // Which side face fronts the camera, tracked with hysteresis so the
  // readout doesn't flicker on corner-on views.
  const viewSideRef = useRef(null);
  const viewLabelRef = useRef(null);
  const trackViewedSide = (g) => {
    _viewV.copy(camera.position).normalize()
      .applyQuaternion(_viewQ.copy(g.quaternion).invert());
    const L = latticeRef.current;
    // semantic direction: geometric mapped through the lattice, as in
    // hitSideFace
    const sx = L.lx * _viewV.x;
    const sz = L.lz * _viewV.z;
    const facing = [
      { ax: 'x', sign: 1, dot: sx }, { ax: 'x', sign: -1, dot: -sx },
      { ax: 'z', sign: 1, dot: sz }, { ax: 'z', sign: -1, dot: -sz },
    ];
    const best = facing.reduce((a, b) => (b.dot > a.dot ? b : a));
    const cur = viewSideRef.current;
    const curDot = cur ? (cur.ax === 'x' ? sx : sz) * cur.sign : -Infinity;
    if (!cur || best.dot > curDot + 0.05) viewSideRef.current = { ax: best.ax, sign: best.sign };
    const side = viewSideRef.current;
    const face = FACES.find(f => f.normal[side.ax === 'x' ? 0 : 2] === side.sign);
    const ranks = Object.values(face.corners).map(fn => functionRank(selectedType, fn));
    const has1 = ranks.includes(1);
    const has2 = ranks.includes(2);
    const label = has1 && has2 ? 'Preferred'
      : has1 ? "Dominant's Complement"
        : has2 ? "Auxiliary's Complement"
          : 'Shadow';
    if (label !== viewLabelRef.current) {
      viewLabelRef.current = label;
      onViewedSide(label);
    }
  };

  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const anim = animRef.current;
    if (anim) {
      anim.t = Math.min(1, anim.t + delta / animClock.seconds);
      const e = easeInOut(anim.t);
      // explicit axis-angle rather than slerp: the planner chooses the
      // rotation direction, which slerp's shortest-arc would override
      if (anim.t >= 1) g.quaternion.copy(anim.toQ);
      else {
        _resQ.setFromAxisAngle(anim.resAxis, anim.resAngle * e);
        g.quaternion.copy(anim.fromQ).multiply(_resQ);
      }
      // lanes carry their own timing — play them on the linear clock
      if (anim.dance) applyDance(anim.dance, anim.t);
      else applyRests();
      if (anim.t >= 1) {
        if (anim.dance) {
          restsRef.current = anim.dance.toRests;
          setRestEpoch(v => v + 1);
        }
        animRef.current = null;
      }
    } else {
      applyRests();
      if (autoRotate) g.quaternion.premultiply(spinQ.setFromAxisAngle(UP, delta * 0.2));
    }
    if (onViewedSide) trackViewedSide(g);
  });

  const handleSelect = (type) => {
    setSelectedType(type);
    setAutoRotate(false);
  };

  // One geometry shared by all four poles, rebuilt when the exponent changes.
  const poleGeometry = useMemo(
    () => superellipsoidGeometry(POLE_WIDTH / 2, POLE_HEIGHT / 2, POLE_WIDTH / 2, exponent),
    [exponent],
  );
  useEffect(() => () => poleGeometry.dispose(), [poleGeometry]);

  return (
    <>
      <group ref={groupRef}>
        {POLES.map(pole => (
          <Pole
            key={pole.key}
            pole={pole}
            geometry={poleGeometry}
            exponent={exponent}
            lineOpacity={lineOpacity}
            shadowDim={shadowDim}
            shadowSat={shadowSat}
            blendSides={blendSides}
            selectedType={selectedType}
            hoveredType={hoveredType}
            onSelect={handleSelect}
            onHover={setHoveredType}
            draggingRef={draggingRef}
            latticeRef={latticeRef}
            registerGroup={registerGroup}
            restsRef={restsRef}
            restEpoch={restEpoch}
          />
        ))}
      </group>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={2}
        maxDistance={10}
        onStart={() => setAutoRotate(false)}
      />
    </>
  );
}

// Reinterpret the drawing buffer as Display P3 where the browser
// supports it: channel values are unchanged, so the fully saturated rank
// colors land on the display's P3 primaries instead of sRGB's. On the
// WebGPU backend that means re-issuing the canvas configure call with
// colorSpace 'display-p3' (three's own configure leaves it at 'srgb');
// on the WebGL2 fallback backend, the classic drawingBufferColorSpace
// reinterpretation, guarded per-frame in case anything resets it.
function WideGamut() {
  const { gl } = useThree();
  useEffect(() => {
    if (!gl.backend?.isWebGPUBackend) return;
    const context = gl.backend.context;
    const config = context.getConfiguration?.();
    if (!config) return;
    context.configure({
      device: config.device,
      format: config.format,
      usage: config.usage,
      alphaMode: config.alphaMode,
      toneMapping: config.toneMapping,
      colorSpace: 'display-p3',
    });
  }, [gl]);
  useFrame(() => {
    if (gl.backend?.isWebGPUBackend) return;
    const ctx = gl.backend?.gl;
    if (ctx && 'drawingBufferColorSpace' in ctx && ctx.drawingBufferColorSpace !== 'display-p3') {
      ctx.drawingBufferColorSpace = 'display-p3';
    }
  });
  return null;
}

// Keep the cube framed on portrait viewports: the vertical fov widens as
// the aspect narrows so the cube's sides aren't cropped. The exponent
// under-compensates the aspect — 1 would preserve the landscape
// horizontal framing exactly; below 1 zooms portrait in a little while
// staying continuous at square aspect.
const BASE_FOV = 50;
const PORTRAIT_ZOOM = 0.6;
function ResponsiveFraming() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    camera.fov = aspect >= 1
      ? BASE_FOV
      : THREE.MathUtils.radToDeg(
        2 * Math.atan(
          Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / aspect ** PORTRAIT_ZOOM,
        ),
      );
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export default function CognitiveCube({
  selectedType, setSelectedType, initialYaw = null, spin = true, cameraPosition = [5, 5, 5],
  exponent = 7, lineOpacity = 0.1, shadowDim = 0.73, shadowSat = 0.9, blendSides = false,
  swapStyle = 'orbit', flipStyle = 'hand', onViewedSide = null, wideGamut = true,
}) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: cameraPosition, fov: BASE_FOV }}
        style={{ background: '#0a0a0a' }}
        // flat = NoToneMapping: the output pass must apply only the sRGB
        // OETF, which the pole material pre-inverts for byte parity with
        // the former raw-writing GLSL pipeline
        flat
        gl={(props) => {
          // r3f v9 async renderer init; three falls back to its WebGL2
          // backend automatically where WebGPU is unavailable
          const renderer = new WebGPURenderer({ ...props, antialias: true });
          return renderer.init().then(() => renderer);
        }}
      >
        {wideGamut && <WideGamut />}
        <ResponsiveFraming />
        <CubeScene
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          initialYaw={initialYaw}
          spin={spin}
          exponent={exponent}
          lineOpacity={lineOpacity}
          shadowDim={shadowDim}
          shadowSat={shadowSat}
          blendSides={blendSides}
          swapStyle={swapStyle}
          flipStyle={flipStyle}
          onViewedSide={onViewedSide}
        />
      </Canvas>
    </div>
  );
}
