import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { superellipsoidGeometry } from './superellipsoid.js';
import {
  CORNERS, FACES, POLES, functionRank, poleShading, typeAtCorner, homeOrientation,
} from '../lib/cubeModel.js';
import {
  identityLattice, latticeDet, composeLattice, DANCES,
  swapOrbitCenter, swapHopCenters, flipPose,
} from '../lib/choreography.js';

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
const ANIM_SECONDS = 1.1;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const poleVertexShader = /* glsl */ `
  uniform vec3 poleCenter;
  varying vec3 vPos;
  varying vec3 vViewNormal;
  void main() {
    vPos = position + poleCenter;
    vViewNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Every pole is fully painted: the vertical gradient between its own two
// corner colors, blended along the home-face axis toward its partner pole's
// gradient — so the home face and its opposite show crisp columns while the
// faces between them fade bright→dark, continuously through the grooves.
// A touch of view-space lighting keeps the rounded form legible.
const poleFragmentShader = /* glsl */ `
  uniform vec3 nearTop, nearBottom, farTop, farBottom;
  uniform vec3 dirFace;
  uniform float halfHeight, halfSpan;
  uniform float blendSides;  // 1 = blend across side faces, 0 = hard boundaries
  uniform float ownWeight;   // 1 if this pole is on the home-face side
  varying vec3 vPos;
  varying vec3 vViewNormal;
  void main() {
    float ty = clamp((vPos.y + halfHeight) / (2.0 * halfHeight), 0.0, 1.0);
    vec3 nearC = mix(nearBottom, nearTop, ty);
    vec3 farC = mix(farBottom, farTop, ty);
    float w = clamp((dot(vPos, dirFace) / halfSpan + 1.0) * 0.5, 0.0, 1.0);
    // hard boundaries: the pole shows its own gradient at full strength
    w = mix(ownWeight, w, blendSides);
    vec3 color = mix(farC, nearC, w);

    vec3 n = normalize(vViewNormal);
    vec3 lightDir = normalize(vec3(0.35, 0.5, 0.8));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(n, normalize(lightDir + vec3(0.0, 0.0, 1.0))), 0.0), 48.0);
    color = color * (0.72 + 0.28 * diff) + vec3(0.12) * spec;
    gl_FragColor = vec4(color, 1.0);
  }
`;

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

function SurfaceLabel({ groupRef, position, normal, visible = true, children }) {
  const ref = useRef();
  const fadeRef = useRef(visible ? 1 : 0);
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

// Per-face constants derived from the model's canonical UV frame.
function useFaceFrame(face) {
  return useMemo(() => {
    const p = k => new THREE.Vector3(...CORNERS[face.corners[k]]).multiplyScalar(SCALE);
    const corners = { c00: p('c00'), c10: p('c10'), c01: p('c01'), c11: p('c11') };
    const normal = new THREE.Vector3(...face.normal);
    const center = new THREE.Vector3().addVectors(corners.c00, corners.c11).multiplyScalar(0.5);
    return { corners, normal, center };
  }, [face]);
}

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
  selectedType, onSelect, onHover, draggingRef, latticeRef, registerGroup,
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

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: poleVertexShader,
    fragmentShader: poleFragmentShader,
    uniforms: {
      nearTop: { value: new THREE.Color() },
      nearBottom: { value: new THREE.Color() },
      farTop: { value: new THREE.Color() },
      farBottom: { value: new THREE.Color() },
      dirFace: { value: new THREE.Vector3() },
      poleCenter: { value: center.clone() },
      halfHeight: { value: POLE_HEIGHT / 2 },
      halfSpan: { value: SCALE },
      blendSides: { value: 1 },
      ownWeight: { value: 1 },
    },
    side: THREE.DoubleSide,
  }), [center]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const u = material.uniforms;
    u.nearTop.value.set(shading.nearTop);
    u.nearBottom.value.set(shading.nearBottom);
    u.farTop.value.set(shading.farTop);
    u.farBottom.value.set(shading.farBottom);
    u.dirFace.value.set(...shading.dirFace);
    u.ownWeight.value = shading.isNear ? 1 : 0;
    u.blendSides.value = blendSides ? 1 : 0;
  }, [shading, blendSides, material]);

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
      {lineOpacity > 0 && (
        <Line
          points={equator}
          color="#ffffff"
          transparent
          opacity={lineOpacity}
          lineWidth={1}
          side={THREE.DoubleSide}
        />
      )}
    </group>
  );
}

// A side face's non-geometry dressing: the labels (the quadrant boundaries
// are geometry — the grooves between poles and each pole's equator line).
// Each quadrant labels its function with the selected type's rank as a
// subscript (stack 1–4, shadow 5–8), plus the type badge, shown only for
// the selected type or while the quadrant is hovered.
function FaceAnnotations({ face, exponent, selectedType, hoveredType, lattice, groupRef }) {
  const frame = useFaceFrame(face);
  // labels live where the lattice has physically put the poles
  const mapL = v => new THREE.Vector3(lattice.lx * v.x, lattice.ly * v.y, lattice.lz * v.z);
  const mappedNormal = mapL(frame.normal);

  return (
    <group>
      {Object.entries(frame.corners).map(([key, corner]) => {
        const fn = face.corners[key];
        const type = typeAtCorner(face, key);
        return (
          <group key={key}>
            <SurfaceLabel
              groupRef={groupRef}
              position={mapL(towardCorner(face, frame, corner, 0.5, 0.02, exponent))}
              normal={mappedNormal}
            >
              <FnRankLabel fn={fn} rank={functionRank(selectedType, fn)} />
            </SurfaceLabel>
            {type && (
              <SurfaceLabel
                groupRef={groupRef}
                position={mapL(towardCorner(face, frame, corner, 0.72, 0.06, exponent))}
                normal={mappedNormal}
                visible={type === selectedType || type === hoveredType}
              >
                <Text
                  raycast={() => null}
                  fontSize={0.15}
                  color={type === selectedType ? 'white' : '#bbbbbb'}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.01}
                  outlineColor="black"
                >
                  {type}
                </Text>
              </SurfaceLabel>
            )}
          </group>
        );
      })}
    </group>
  );
}

function CubeScene({
  selectedType, setSelectedType, initialYaw, spin, swapStyle,
  exponent, lineOpacity, shadowDim, shadowSat, blendSides,
}) {
  const groupRef = useRef();
  const [autoRotate, setAutoRotate] = useState(spin);
  const [hoveredType, setHoveredType] = useState(null);
  const draggingRef = useRef(false);
  const animRef = useRef(null);
  const mountedRef = useRef(false);
  const { gl, camera } = useThree();

  // The lattice: which reflection the pole arrangement currently realizes.
  // State for the labels/interaction, a ref for the frame loop and handlers.
  const [lattice, setLattice] = useState(() =>
    initialYaw !== null ? identityLattice() : initialLatticeFor(selectedType));
  const latticeRef = useRef(lattice);
  const restsRef = useRef(restsForLattice(lattice));
  const poleGroupsRef = useRef({});
  const swapStyleRef = useRef(swapStyle);
  swapStyleRef.current = swapStyle;

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

  // Selection → plan the transition: one proper slerp, plus at most one
  // dance when the target parity differs from the lattice's. The dance is
  // whichever of {swap-x, swap-z, flip} leaves the smallest residual
  // rotation for the slerp.
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const g = groupRef.current;

    // a retargeted mid-dance transition snap-finishes the previous dance
    if (animRef.current?.dance) {
      restsRef.current = animRef.current.dance.toRests;
    }

    const parity = homeOrientation(selectedType).parity;
    let L = latticeRef.current;
    let dance = null;

    if (parity !== latticeDet(L)) {
      let best = null;
      for (const name of ['swap-x', 'swap-z', 'flip']) {
        const Lc = composeLattice(DANCES[name], L);
        const q = homePoseQuat(selectedType, camera, Lc);
        const angle = q.angleTo(g.quaternion);
        if (!best || angle < best.angle) best = { name, Lc, q, angle };
      }
      L = best.Lc;

      const fromRests = {};
      const toRests = {};
      const isFlip = best.name === 'flip';
      // flip splits along the target face's in-plane horizontal axis and
      // turns about the face-normal axis — the user-facing left/right split
      const faceNormal = homeOrientation(selectedType).normal;
      const axis = isFlip
        ? (faceNormal[0] !== 0 ? 'z' : 'x')
        : (best.name === 'swap-x' ? 'x' : 'z');
      const turnAxis = isFlip
        ? new THREE.Vector3(Math.abs(faceNormal[0]), 0, Math.abs(faceNormal[2]))
        : null;
      const bulgeAxis = axis === 'x' ? 'z' : 'x';
      for (const pole of POLES) {
        const from = restsRef.current[pole.key];
        fromRests[pole.key] = {
          position: from.position.clone(),
          quaternion: from.quaternion.clone(),
        };
        const p = from.position.clone();
        const q = from.quaternion.clone();
        if (isFlip) q.premultiply(new THREE.Quaternion().setFromAxisAngle(turnAxis, Math.PI));
        else p[axis] *= -1;
        toRests[pole.key] = { position: p, quaternion: q };
      }
      // the hop must rise in world-up terms, whichever way the cube hangs
      const localUp = UP.clone().applyQuaternion(g.quaternion.clone().invert());
      dance = {
        kind: isFlip ? 'flip' : swapStyleRef.current,
        axis, bulgeAxis, turnAxis, fromRests, toRests,
        hopSign: Math.sign(localUp.y) || 1,
      };
      latticeRef.current = L;
      setLattice(L);
      animRef.current = { fromQ: g.quaternion.clone(), toQ: best.q, t: 0, dance };
    } else {
      animRef.current = {
        fromQ: g.quaternion.clone(),
        toQ: homePoseQuat(selectedType, camera, L),
        t: 0,
        dance: null,
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

  // Cube-local pole transforms for one dance frame, driven by the pure lanes.
  const applyDance = (dance, t) => {
    for (const pole of POLES) {
      const pg = poleGroupsRef.current[pole.key];
      const from = dance.fromRests[pole.key];
      if (!pg || !from) continue;
      const s = Math.sign(from.position[dance.axis]);
      pg.position.copy(from.position);
      if (dance.kind === 'flip') {
        const { c, theta } = flipPose(t);
        pg.position[dance.axis] = s * c;
        _danceQ.setFromAxisAngle(dance.turnAxis, theta);
        pg.quaternion.copy(_danceQ).multiply(from.quaternion);
      } else if (dance.kind === 'hop') {
        const { hopper, slider } = swapHopCenters(t);
        const h = s < 0;
        pg.position[dance.axis] = h ? hopper.a : slider.a;
        pg.position.y = h ? dance.hopSign * hopper.y : 0;
        pg.quaternion.copy(from.quaternion);
      } else { // orbit
        const { a, b } = swapOrbitCenter(t);
        pg.position[dance.axis] = s < 0 ? a : -a;
        pg.position[dance.bulgeAxis] += s < 0 ? b : -b;
        pg.quaternion.copy(from.quaternion);
      }
    }
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

  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const anim = animRef.current;
    if (anim) {
      anim.t = Math.min(1, anim.t + delta / ANIM_SECONDS);
      const e = easeInOut(anim.t);
      g.quaternion.slerpQuaternions(anim.fromQ, anim.toQ, e);
      if (anim.dance) applyDance(anim.dance, e);
      else applyRests();
      if (anim.t >= 1) {
        if (anim.dance) restsRef.current = anim.dance.toRests;
        animRef.current = null;
      }
    } else {
      applyRests();
      if (autoRotate) g.quaternion.premultiply(spinQ.setFromAxisAngle(UP, delta * 0.2));
    }
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
            onSelect={handleSelect}
            onHover={setHoveredType}
            draggingRef={draggingRef}
            latticeRef={latticeRef}
            registerGroup={registerGroup}
          />
        ))}

        {FACES.filter(face => face.isSide).map(face => (
          <FaceAnnotations
            key={face.key}
            face={face}
            exponent={exponent}
            selectedType={selectedType}
            hoveredType={hoveredType}
            lattice={lattice}
            groupRef={groupRef}
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

export default function CognitiveCube({
  selectedType, setSelectedType, initialYaw = null, spin = true, cameraPosition = [5, 5, 5],
  exponent = 7, lineOpacity = 0.1, shadowDim = 0.73, shadowSat = 0.9, blendSides = false,
  swapStyle = 'orbit',
}) {
  return (
    <div style={{ width: '100%', height: '600px' }}>
      <Canvas camera={{ position: cameraPosition, fov: 50 }} style={{ background: '#0a0a0a' }}>
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
        />
      </Canvas>
    </div>
  );
}
