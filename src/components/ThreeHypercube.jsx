import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  CORNERS, FACES, CUBE_EDGES, faceOverlay, typeAtCorner,
} from '../lib/cubeModel.js';

const SCALE = 1.5;

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

// Per-face constants derived from the model's canonical UV frame.
function useFaceFrame(face) {
  return useMemo(() => {
    const p = k => new THREE.Vector3(...CORNERS[face.corners[k]]).multiplyScalar(SCALE);
    const c00 = p('c00'), c10 = p('c10'), c01 = p('c01'), c11 = p('c11');
    const normal = new THREE.Vector3(...face.normal);
    const center = new THREE.Vector3().addVectors(c00, c11).multiplyScalar(0.5);

    const right = new THREE.Vector3().subVectors(c10, c00).normalize();
    const up = new THREE.Vector3().subVectors(c01, c00).normalize();
    const rotation = new THREE.Euler().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, normal),
    );

    const geometry = new THREE.BufferGeometry();
    const tri = (a, b, c) => [...a.toArray(), ...b.toArray(), ...c.toArray()];
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      ...tri(c00, c10, c11), ...tri(c00, c11, c01),
    ]), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    ]), 2));
    geometry.computeVertexNormals();

    return { corners: { c00, c10, c01, c11 }, normal, center, rotation, geometry };
  }, [face]);
}

// Position within the face: fraction 0 = face center, 1 = the given corner,
// lifted slightly off the surface to avoid z-fighting.
const towardCorner = (frame, corner, fraction, lift) =>
  new THREE.Vector3()
    .lerpVectors(frame.center, corner, fraction)
    .addScaledVector(frame.normal, lift);

function CubeFace({ face, selectedType, onSelect, draggingRef }) {
  const frame = useFaceFrame(face);
  const overlay = useMemo(() => faceOverlay(face, selectedType), [face, selectedType]);

  const baseMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: face.isSide ? '#3a3a3a' : '#2a2a2a',
  }), [face.isSide]);

  const fullMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: fullFragmentShader,
    uniforms: {
      c00: { value: new THREE.Color() }, c10: { value: new THREE.Color() },
      c01: { value: new THREE.Color() }, c11: { value: new THREE.Color() },
    },
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
        />
      ))}

      {face.isSide && Object.entries(frame.corners).map(([key, corner]) => {
        const fn = face.corners[key];
        const type = typeAtCorner(face, key);
        return (
          <group key={key}>
            <Text
              position={towardCorner(frame, corner, 0.5, 0.02)}
              fontSize={0.36}
              color="#cccccc"
              anchorX="center"
              anchorY="middle"
              rotation={frame.rotation}
              outlineWidth={0.02}
              outlineColor="black"
            >
              {fn}
            </Text>
            {type && (
              <Text
                position={towardCorner(frame, corner, 0.8, 0.02)}
                fontSize={0.15}
                color={type === selectedType ? 'white' : '#999999'}
                anchorX="center"
                anchorY="middle"
                rotation={frame.rotation}
                outlineWidth={0.01}
                outlineColor="black"
              >
                {type}
              </Text>
            )}
            {isSelectedFace && (
              <Text
                position={towardCorner(frame, corner, 0.2, 0.02)}
                fontSize={0.225}
                color="white"
                anchorX="center"
                anchorY="middle"
                rotation={frame.rotation}
                outlineWidth={0.02}
                outlineColor="black"
              >
                {String(overlay.ranks[key])}
              </Text>
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
  const { gl } = useThree();

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

  useFrame((_, delta) => {
    if (groupRef.current && autoRotate) groupRef.current.rotation.y += delta * 0.2;
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

      <group ref={groupRef} rotation={[0, initialYaw, 0]}>
        {CUBE_EDGES.map(([a, b]) => (
          <Line
            key={`${a}-${b}`}
            points={[
              new THREE.Vector3(...CORNERS[a]).multiplyScalar(SCALE),
              new THREE.Vector3(...CORNERS[b]).multiplyScalar(SCALE),
            ]}
            color="#666666"
            lineWidth={2}
          />
        ))}

        {FACES.map(face => (
          <CubeFace
            key={face.key}
            face={face}
            selectedType={selectedType}
            onSelect={handleSelect}
            draggingRef={draggingRef}
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
  selectedType, setSelectedType, initialYaw = 0, spin = true, cameraPosition = [5, 5, 5],
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
