import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  CORNERS, FACES, CUBE_EDGES, faceOverlay, typeAtCorner, homeOrientation,
} from '../lib/cubeModel.js';

const SCALE = 1.5;
const UP = new THREE.Vector3(0, 1, 0);
// S_x · S_z — re-expresses a cube-local mirror from one axis onto the other.
const FLIP_XZ = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
const ANIM_SECONDS = 1.1;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Selected face: two vertical columns split at the middle grid line, each a
// gradient between the rank colors of its two corners.
const fullFragmentShader = /* glsl */ `
  uniform vec3 c00, c10, c01, c11;
  varying vec2 vUv;
  void main() {
    vec3 color = vUv.x < 0.5 ? mix(c00, c01, vUv.y) : mix(c10, c11, vUv.y);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Neighbor face: continues the shared edge's colors inward, fading out at the
// middle grid line. s runs along the edge, t away from it.
const bleedFragmentShader = /* glsl */ `
  uniform vec3 colorA, colorB;
  uniform vec2 origin, edgeDir, perp;
  uniform float interpolate;
  varying vec2 vUv;
  void main() {
    vec2 d = vUv - origin;
    float s = dot(d, edgeDir);
    float t = dot(d, perp);
    vec3 color = interpolate > 0.5 ? mix(colorA, colorB, s) : (s < 0.5 ? colorA : colorB);
    float alpha = clamp(1.0 - 2.0 * t, 0.0, 1.0);
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

function FaceLabel({ groupRef, position, normal, children, ...textProps }) {
  const ref = useRef();
  useFrame(({ camera }) => {
    const g = groupRef.current;
    const o = ref.current;
    if (!g || !o) return;
    const s = g.scale;
    // cube nearly flat mid-flip, or face nearly horizontal: keep last pose
    if (Math.min(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) < 0.04) return;
    g.updateMatrixWorld();
    _pos.copy(position).applyMatrix4(g.matrixWorld);
    _n.copy(normal).applyMatrix3(_nrm.getNormalMatrix(g.matrixWorld)).normalize();
    // hide labels on faces turned away from the camera — depth occlusion
    // handles this in normal poses, but not while the cube is flattened
    _toCam.copy(camera.position).sub(_pos).normalize();
    o.visible = _n.dot(_toCam) > 0.05;
    if (!o.visible) return;
    const d = UP.dot(_n);
    if (Math.abs(d) > 0.995) return;
    _u.copy(UP).addScaledVector(_n, -d).normalize();
    _r.crossVectors(_u, _n);
    _world.makeBasis(_r, _u, _n).setPosition(_pos);
    o.matrix.multiplyMatrices(_inv.copy(g.matrixWorld).invert(), _world);
  });
  return (
    <Text ref={ref} matrixAutoUpdate={false} {...textProps}>
      {children}
    </Text>
  );
}

// Per-face constants derived from the model's canonical UV frame.
function useFaceFrame(face) {
  return useMemo(() => {
    const p = k => new THREE.Vector3(...CORNERS[face.corners[k]]).multiplyScalar(SCALE);
    const c00 = p('c00'), c10 = p('c10'), c01 = p('c01'), c11 = p('c11');
    const normal = new THREE.Vector3(...face.normal);
    const center = new THREE.Vector3().addVectors(c00, c11).multiplyScalar(0.5);

    const geometry = new THREE.BufferGeometry();
    const tri = (a, b, c) => [...a.toArray(), ...b.toArray(), ...c.toArray()];
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      ...tri(c00, c10, c11), ...tri(c00, c11, c01),
    ]), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    ]), 2));
    geometry.computeVertexNormals();

    return { corners: { c00, c10, c01, c11 }, normal, center, geometry };
  }, [face]);
}

// Position within the face: fraction 0 = face center, 1 = the given corner,
// lifted slightly off the surface to avoid z-fighting.
const towardCorner = (frame, corner, fraction, lift) =>
  new THREE.Vector3()
    .lerpVectors(frame.center, corner, fraction)
    .addScaledVector(frame.normal, lift);

function CubeFace({ face, selectedType, onSelect, draggingRef, groupRef }) {
  const frame = useFaceFrame(face);
  const overlay = useMemo(() => faceOverlay(face, selectedType), [face, selectedType]);

  const baseMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: face.isSide ? '#3a3a3a' : '#2a2a2a',
    side: THREE.DoubleSide,
  }), [face.isSide]);

  const fullMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: fullFragmentShader,
    uniforms: {
      c00: { value: new THREE.Color() }, c10: { value: new THREE.Color() },
      c01: { value: new THREE.Color() }, c11: { value: new THREE.Color() },
    },
    side: THREE.DoubleSide,
  }), []);

  const bleedMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: bleedFragmentShader,
    uniforms: {
      colorA: { value: new THREE.Color() }, colorB: { value: new THREE.Color() },
      origin: { value: new THREE.Vector2() }, edgeDir: { value: new THREE.Vector2() },
      perp: { value: new THREE.Vector2() }, interpolate: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => () => {
    frame.geometry.dispose();
    baseMaterial.dispose();
    fullMaterial.dispose();
    bleedMaterial.dispose();
  }, [frame, baseMaterial, fullMaterial, bleedMaterial]);

  useEffect(() => {
    if (overlay?.mode === 'full') {
      for (const k of ['c00', 'c10', 'c01', 'c11']) {
        fullMaterial.uniforms[k].value.set(overlay.colors[k]);
      }
    } else if (overlay?.mode === 'bleed') {
      const u = bleedMaterial.uniforms;
      u.colorA.value.set(overlay.colorA);
      u.colorB.value.set(overlay.colorB);
      u.origin.value.set(...overlay.origin);
      u.edgeDir.value.set(...overlay.edgeDir);
      u.perp.value.set(...overlay.perp);
      u.interpolate.value = overlay.interpolate ? 1 : 0;
    }
  }, [overlay, fullMaterial, bleedMaterial]);

  const handlePointerUp = (e) => {
    e.stopPropagation();
    if (draggingRef.current || !face.isSide || !e.uv) return;
    const cornerKey = e.uv.x < 0.5
      ? (e.uv.y < 0.5 ? 'c00' : 'c01')
      : (e.uv.y < 0.5 ? 'c10' : 'c11');
    const type = typeAtCorner(face, cornerKey);
    if (type) onSelect(type);
  };

  // Middle grid lines dividing the face into its 2×2 sub-squares.
  const gridPoints = useMemo(() => {
    const { c00, c10, c01, c11 } = frame.corners;
    const mid = (a, b) => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
      .addScaledVector(frame.normal, 0.01);
    return [
      [mid(c00, c10), mid(c01, c11)], // across u
      [mid(c00, c01), mid(c10, c11)], // across v
    ];
  }, [frame]);

  const isSelectedFace = overlay?.mode === 'full';

  return (
    <group>
      <mesh
        geometry={frame.geometry}
        material={baseMaterial}
        onPointerUp={handlePointerUp}
        onPointerOver={() => { if (face.isSide) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      />

      {overlay && (
        <mesh
          geometry={frame.geometry}
          material={overlay.mode === 'full' ? fullMaterial : bleedMaterial}
          position={frame.normal.clone().multiplyScalar(0.002)}
          raycast={() => null}
        />
      )}

      {gridPoints.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color={isSelectedFace ? '#ff69b4' : '#ffffff'}
          lineWidth={1}
          side={THREE.DoubleSide}
        />
      ))}

      {face.isSide && Object.entries(frame.corners).map(([key, corner]) => {
        const fn = face.corners[key];
        const type = typeAtCorner(face, key);
        return (
          <group key={key}>
            <FaceLabel
              groupRef={groupRef}
              position={towardCorner(frame, corner, 0.5, 0.02)}
              normal={frame.normal}
              fontSize={0.36}
              color="#cccccc"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="black"
            >
              {fn}
            </FaceLabel>
            {type && (
              <FaceLabel
                groupRef={groupRef}
                position={towardCorner(frame, corner, 0.8, 0.02)}
                normal={frame.normal}
                fontSize={0.15}
                color={type === selectedType ? 'white' : '#999999'}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.01}
                outlineColor="black"
              >
                {type}
              </FaceLabel>
            )}
            {isSelectedFace && (
              <FaceLabel
                groupRef={groupRef}
                position={towardCorner(frame, corner, 0.2, 0.02)}
                normal={frame.normal}
                fontSize={0.225}
                color="white"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="black"
              >
                {String(overlay.ranks[key])}
              </FaceLabel>
            )}
          </group>
        );
      })}
    </group>
  );
}

function HypercubeScene({ selectedType, setSelectedType, initialYaw, spin }) {
  const groupRef = useRef();
  const [autoRotate, setAutoRotate] = useState(spin);
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

  return (
    <>
      <ambientLight intensity={0.7} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />

      <group ref={groupRef}>
        {CUBE_EDGES.map(([a, b]) => (
          <Line
            key={`${a}-${b}`}
            points={[
              new THREE.Vector3(...CORNERS[a]).multiplyScalar(SCALE),
              new THREE.Vector3(...CORNERS[b]).multiplyScalar(SCALE),
            ]}
            color="#666666"
            lineWidth={2}
            side={THREE.DoubleSide}
          />
        ))}

        {FACES.map(face => (
          <CubeFace
            key={face.key}
            face={face}
            selectedType={selectedType}
            onSelect={handleSelect}
            draggingRef={draggingRef}
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

export default function ThreeHypercube({
  selectedType, setSelectedType, initialYaw = null, spin = true, cameraPosition = [5, 5, 5],
}) {
  return (
    <div style={{ width: '100%', height: '600px' }}>
      <Canvas camera={{ position: cameraPosition, fov: 50 }} style={{ background: '#0a0a0a' }}>
        <HypercubeScene
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          initialYaw={initialYaw}
          spin={spin}
        />
      </Canvas>
    </div>
  );
}
