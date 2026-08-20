import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { superellipsoidGeometry } from './superellipsoid.js';
import {
  CORNERS, FACES, POLES, functionRank, poleOverlay, typeAtCorner, homeOrientation,
} from '../lib/cubeModel.js';

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
// S_x · S_z — re-expresses a cube-local mirror from one axis onto the other.
const FLIP_XZ = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
const ANIM_SECONDS = 1.1;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const poleVertexShader = /* glsl */ `
  uniform vec3 poleCenter;
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position + poleCenter;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A painted pole carries one vertical gradient column, colorBottom→colorTop.
// Weighting each cube-face direction by the surface normal applies the flat
// per-face rules — full strength fronting the type's face, fading toward the
// cube's interior on the outward side face and on both caps — and blends
// them smoothly across the rounded edges; normals facing the cube's interior
// fade the paint out entirely, so color dies inside the grooves.
const poleFragmentShader = /* glsl */ `
  uniform vec3 colorTop, colorBottom;
  uniform vec3 dirFace, dirSide, poleCenter;
  uniform float halfWidth, halfHeight;
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    float ty = clamp((vPos.y + halfHeight) / (2.0 * halfHeight), 0.0, 1.0);
    vec3 grad = mix(colorBottom, colorTop, ty);
    // distance toward the type's face: 1 on that face, 0 at the cube's middle
    float u = dot(vPos - poleCenter, dirFace);
    float fade = clamp((u + halfWidth) / (2.0 * halfWidth), 0.0, 1.0);

    float wFace = max(dot(n, dirFace), 0.0);
    float wSide = max(dot(n, dirSide), 0.0);
    float wTop = max(n.y, 0.0);
    float wBottom = max(-n.y, 0.0);
    float wInner = max(dot(n, -dirFace), 0.0) + max(dot(n, -dirSide), 0.0);

    float paint = wFace + fade * (wSide + wTop + wBottom);
    vec3 color =
      (wFace * grad + fade * (wSide * grad + wTop * colorTop + wBottom * colorBottom))
      / max(paint, 1e-5);
    float alpha = paint / max(wFace + wSide + wTop + wBottom + wInner, 1e-5);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

// The world pose that shows `type` canonically (dominant top-left, stack as
// the standard grid), fronting the camera's current horizontal direction.
// Expressed as rotation ∘ cube-local mirror: { q, sign, axis } where the
// group's scale carries `sign` (±1) on `axis`.
function homePose(type, camera) {
  const { normal, up, right, parity } = homeOrientation(type);
  const h = new THREE.Vector3(camera.position.x, 0, camera.position.z);
  if (h.lengthSq() < 1e-6) h.set(1, 0, 1);
  h.normalize();
  const rho = new THREE.Vector3().crossVectors(UP, h); // screen-right

  const m = new THREE.Matrix4()
    .makeBasis(rho, UP, h)
    .multiply(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...right), new THREE.Vector3(...up), new THREE.Vector3(...normal),
    ).transpose());

  const axis = normal[0] !== 0 ? 'x' : 'z';
  if (parity === -1) {
    // fold the reflection into a cube-local mirror across the face plane,
    // leaving a proper rotation: q = M · S_axis
    m.scale(axis === 'x' ? new THREE.Vector3(-1, 1, 1) : new THREE.Vector3(1, 1, -1));
  }
  return { q: new THREE.Quaternion().setFromRotationMatrix(m), sign: parity, axis };
}

const mirrorScale = (axis, sign) =>
  axis === 'x' ? new THREE.Vector3(sign, 1, 1) : new THREE.Vector3(1, 1, sign);

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

function SurfaceLabel({ groupRef, position, normal, visible = true, children }) {
  const ref = useRef();
  useFrame(({ camera }) => {
    const g = groupRef.current;
    const o = ref.current;
    if (!g || !o) return;
    const s = g.scale;
    // cube nearly flat mid-flip: keep last pose
    if (Math.min(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) < 0.04) return;
    g.updateMatrixWorld();
    _pos.copy(position).applyMatrix4(g.matrixWorld);
    _n.copy(normal).applyMatrix3(_nrm.getNormalMatrix(g.matrixWorld)).normalize();
    // hide labels on faces turned away from the camera — depth occlusion
    // handles this in normal poses, but not while the cube is flattened
    _toCam.copy(camera.position).sub(_pos).normalize();
    o.visible = visible && _n.dot(_toCam) > 0.05;
    if (!o.visible) return;
    const d = UP.dot(_n);
    if (Math.abs(d) > 0.995) {
      // horizontal face: no world-up to align with — read like a page on a
      // table, text-up pointing away from the camera horizontally
      _u.set(_pos.x - camera.position.x, 0, _pos.z - camera.position.z);
      if (_u.lengthSq() < 1e-6) return;
      _u.normalize();
    } else {
      _u.copy(UP).addScaledVector(_n, -d).normalize();
    }
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

// Position within a face at `fraction` from center toward `corner` — laid
// on the pole's superellipsoid surface (a face-plane position would float
// where the surface recedes toward the edges), lifted slightly to avoid
// z-fighting.
function towardCorner(face, frame, corner, fraction, lift, exponent) {
  const p = new THREE.Vector3().lerpVectors(frame.center, corner, fraction);
  const halfW = POLE_WIDTH / 2;
  if (face.isSide) {
    const a = face.normal[0] !== 0 ? 'x' : 'z';
    const t = a === 'x' ? 'z' : 'x';
    const lt = p[t] - Math.sign(p[t]) * halfW;
    // outward coordinate: pole axis offset + surface extent from that axis
    p[a] = Math.sign(face.normal[a === 'x' ? 0 : 2])
      * (halfW + poleExtent(lt, p.y, exponent) + lift);
  } else {
    // cap: solve the superellipsoid for height at the in-cap offsets
    const lx = p.x - Math.sign(p.x) * halfW;
    const lz = p.z - Math.sign(p.z) * halfW;
    const rest = 1
      - Math.abs(lx / halfW) ** exponent
      - Math.abs(lz / halfW) ** exponent;
    p.y = Math.sign(face.normal[1])
      * ((POLE_HEIGHT / 2) * Math.max(rest, 1e-4) ** (1 / exponent) + lift);
  }
  return p;
}

function Pole({ pole, geometry, exponent, lineOpacity, selectedType, onSelect, onHover, draggingRef }) {
  const center = useMemo(
    () => new THREE.Vector3(pole.sx * POLE_WIDTH / 2, 0, pole.sz * POLE_WIDTH / 2),
    [pole],
  );
  const overlay = useMemo(() => poleOverlay(pole, selectedType), [pole, selectedType]);

  const baseMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4d4d4d',
    roughness: 0.45,
    metalness: 0.25,
    side: THREE.DoubleSide,
  }), []);

  const overlayMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: poleVertexShader,
    fragmentShader: poleFragmentShader,
    uniforms: {
      colorTop: { value: new THREE.Color() },
      colorBottom: { value: new THREE.Color() },
      dirFace: { value: new THREE.Vector3() },
      dirSide: { value: new THREE.Vector3() },
      poleCenter: { value: center.clone() },
      halfWidth: { value: POLE_WIDTH / 2 },
      halfHeight: { value: POLE_HEIGHT / 2 },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  }), [center]);

  useEffect(() => () => {
    baseMaterial.dispose();
    overlayMaterial.dispose();
  }, [baseMaterial, overlayMaterial]);

  useEffect(() => {
    if (!overlay) return;
    const u = overlayMaterial.uniforms;
    u.colorTop.value.set(overlay.colorTop);
    u.colorBottom.value.set(overlay.colorBottom);
    u.dirFace.value.set(...overlay.dirFace);
    u.dirSide.value.set(...overlay.dirSide);
  }, [overlay, overlayMaterial]);

  // The cube face this event's surface belongs to — null for caps, and for
  // rounded regions facing another pole (grooves), which don't select.
  const hitSideFace = (e) => {
    const n = e.face?.normal;
    if (!n) return null;
    if (Math.abs(n.y) >= Math.max(Math.abs(n.x), Math.abs(n.z))) return null;
    const axis = Math.abs(n.x) >= Math.abs(n.z) ? 0 : 2;
    const sign = Math.sign(axis === 0 ? n.x : n.z);
    if (sign !== (axis === 0 ? pole.sx : pole.sz)) return null;
    return FACES.find(f => f.normal[axis] === sign);
  };

  // The type whose quadrant this event's surface point belongs to, if any.
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
    <group position={center}>
      <mesh
        geometry={geometry}
        material={baseMaterial}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
      />
      {overlay && (
        <mesh geometry={geometry} material={overlayMaterial} raycast={() => null} />
      )}
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

// A face's non-geometry dressing: the labels (the quadrant boundaries are
// geometry — the grooves between poles and each pole's equator line). Every
// face labels its four corner functions with the selected type's rank as a
// subscript (stack 1–4, shadow 5–8); side faces add the type badge, shown
// only for the selected type or the hovered quadrant.
function FaceAnnotations({ face, exponent, selectedType, hoveredType, groupRef }) {
  const frame = useFaceFrame(face);

  return (
    <group>
      {Object.entries(frame.corners).map(([key, corner]) => {
        const fn = face.corners[key];
        const rank = functionRank(selectedType, fn);
        const type = face.isSide ? typeAtCorner(face, key) : null;
        return (
          <group key={key}>
            <SurfaceLabel
              groupRef={groupRef}
              position={towardCorner(face, frame, corner, 0.5, 0.02, exponent)}
              normal={frame.normal}
            >
              <Text
                position={[-0.07, 0, 0]}
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
            </SurfaceLabel>
            {type && (
              <SurfaceLabel
                groupRef={groupRef}
                position={towardCorner(face, frame, corner, 0.72, 0.06, exponent)}
                normal={frame.normal}
                visible={type === selectedType || type === hoveredType}
              >
                <Text
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

function CubeScene({ selectedType, setSelectedType, initialYaw, spin, exponent, lineOpacity }) {
  const groupRef = useRef();
  const [autoRotate, setAutoRotate] = useState(spin);
  const [hoveredType, setHoveredType] = useState(null);
  const draggingRef = useRef(false);
  const poseAxisRef = useRef('x'); // cube-local axis any mirror currently lives on
  const animRef = useRef(null);
  const mountedRef = useRef(false);
  const { gl, camera } = useThree();

  // Initial pose: explicit yaw if given, else snap to the selected type's home.
  useLayoutEffect(() => {
    const g = groupRef.current;
    if (initialYaw !== null) {
      g.quaternion.setFromAxisAngle(UP, initialYaw);
    } else {
      const { q, sign, axis } = homePose(selectedType, camera);
      g.quaternion.copy(q);
      g.scale.copy(mirrorScale(axis, sign));
      poseAxisRef.current = axis;
    }
  }, []);

  // Selection → glide (and, when chirality differs, flip) to the home pose.
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    const g = groupRef.current;
    const target = homePose(selectedType, camera);
    const fromQ = g.quaternion.clone();
    const fromScale = g.scale.clone();

    let axis = target.sign === -1 ? target.axis : poseAxisRef.current;
    if (axis !== poseAxisRef.current) {
      const curSign = poseAxisRef.current === 'x' ? g.scale.x : g.scale.z;
      if (curSign === -1) {
        // same world transform, mirror re-expressed on the new axis
        fromQ.multiply(FLIP_XZ);
        fromScale.copy(mirrorScale(axis, -1));
      }
      // mid-flip cross-axis retargets fall through to a plain component lerp
    }
    poseAxisRef.current = axis;
    animRef.current = {
      fromQ, toQ: target.q,
      fromScale, toScale: mirrorScale(axis, target.sign),
      t: 0,
    };
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

  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const anim = animRef.current;
    if (anim) {
      anim.t = Math.min(1, anim.t + delta / ANIM_SECONDS);
      const e = easeInOut(anim.t);
      g.quaternion.slerpQuaternions(anim.fromQ, anim.toQ, e);
      g.scale.lerpVectors(anim.fromScale, anim.toScale, e);
      if (anim.t >= 1) animRef.current = null;
    } else if (autoRotate) {
      g.quaternion.premultiply(spinQ.setFromAxisAngle(UP, delta * 0.2));
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
      <ambientLight intensity={0.9} />
      <directionalLight position={[6, 10, 7]} intensity={1.6} />
      <directionalLight position={[-8, -4, -6]} intensity={0.5} />

      <group ref={groupRef}>
        {POLES.map(pole => (
          <Pole
            key={pole.key}
            pole={pole}
            geometry={poleGeometry}
            exponent={exponent}
            lineOpacity={lineOpacity}
            selectedType={selectedType}
            onSelect={handleSelect}
            onHover={setHoveredType}
            draggingRef={draggingRef}
          />
        ))}

        {FACES.map(face => (
          <FaceAnnotations
            key={face.key}
            face={face}
            exponent={exponent}
            selectedType={selectedType}
            hoveredType={hoveredType}
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
  exponent = 7, lineOpacity = 0.1,
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
        />
      </Canvas>
    </div>
  );
}
