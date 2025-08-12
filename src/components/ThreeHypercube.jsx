import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Line, Box, Plane, Billboard } from '@react-three/drei';
import * as THREE from 'three';

const CubeVertex = ({ position, label, isActive }) => {
  const meshRef = useRef();
  const textRef = useRef();
  
  // Check if this vertex is at the bottom (Y = -1 * scale)
  const isBottom = position[1] < 0;
  const labelOffset = isBottom ? -0.25 : 0.25;
  
  // Manual billboard implementation - make text face the camera
  useFrame(({ camera }) => {
    if (textRef.current) {
      // Make the text look at the camera
      textRef.current.lookAt(camera.position);
    }
  });
  
  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={isActive ? '#ff4444' : '#4444ff'} />
      </mesh>
      <group ref={textRef} position={[0, labelOffset, 0]}>
        <Text
          fontSize={0.2}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="black"
          renderOrder={2}
        >
          <meshBasicMaterial attach="material" depthTest={false} />
          {label}
        </Text>
      </group>
    </group>
  );
};

const CubeEdge = ({ start, end }) => {
  const points = useMemo(() => [start, end], [start, end]);
  
  return (
    <Line
      points={points}
      color="#666666"
      lineWidth={2}
      dashed={false}
    />
  );
};

const CubeFace = ({ vertices, isActive, functionStack, typePositions }) => {
  const meshRef = useRef();
  const numberRefs = useRef([]);
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      ...vertices[0], ...vertices[1], ...vertices[2],
      ...vertices[0], ...vertices[2], ...vertices[3]
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }, [vertices]);

  // Billboard effect for numbers
  useFrame(({ camera }) => {
    numberRefs.current.forEach(ref => {
      if (ref) {
        ref.lookAt(camera.position);
      }
    });
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color={isActive ? '#ff8800' : '#222222'}
          opacity={isActive ? 0.6 : 0.1}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {isActive && functionStack && (
        <>
          {functionStack.map((func, idx) => {
            const pos = typePositions[idx];
            if (!pos) return null;
            
            return (
              <group 
                key={idx} 
                position={pos}
                ref={el => numberRefs.current[idx] = el}
              >
                <Text
                  fontSize={0.25}
                  color="white"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.02}
                  outlineColor="black"
                  renderOrder={1}
                >
                  <meshBasicMaterial attach="material" depthTest={false} />
                  {idx + 1}
                </Text>
              </group>
            );
          })}
        </>
      )}
    </group>
  );
};

const GridLines = ({ face, isActive }) => {
  if (!isActive) return null;
  
  const geometry = useMemo(() => {
    const [v0, v1, v2, v3] = face;
    
    // Calculate face normal to offset lines slightly
    const center = v0.map((c, i) => (c + v1[i] + v2[i] + v3[i]) / 4);
    const normal = center.map(c => c > 0 ? 0.01 : -0.01);
    
    // Horizontal line through the middle
    const mid01 = v0.map((c, i) => (c + v1[i]) / 2 + normal[i]);
    const mid23 = v3.map((c, i) => (c + v2[i]) / 2 + normal[i]);
    
    // Vertical line through the middle
    const mid03 = v0.map((c, i) => (c + v3[i]) / 2 + normal[i]);
    const mid12 = v1.map((c, i) => (c + v2[i]) / 2 + normal[i]);
    
    const positions = new Float32Array([
      ...mid01, ...mid23,  // Horizontal line
      ...mid03, ...mid12   // Vertical line
    ]);
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
    
    return geo;
  }, [face]);
  
  return (
    <lineSegments 
      geometry={geometry} 
      renderOrder={1}
      frustumCulled={false}
    >
      <lineBasicMaterial 
        color="#ff69b4"
        depthWrite={false}
        depthTest={false}
        transparent={false}
      />
    </lineSegments>
  );
};

const HypercubeScene = ({ selectedType, mbtiData, typeToQuadrant, getActiveFunctions }) => {
  const groupRef = useRef();
  const [autoRotate, setAutoRotate] = useState(true);
  
  useFrame((state, delta) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += delta * 0.2;
    }
  });
  
  const scale = 1.5;
  const corners = useMemo(() => {
    // Rotate 90 degrees clockwise: swap Y and Z, then negate new Y
    // Original coords had Y as vertical, we want Z as vertical
    // So: (x, y, z) -> (x, -z, y)
    return {
      'Ni': [-1 * scale, 1 * scale, -1 * scale],   // was [-1, -1, -1] -> [-1, 1, -1]
      'Se': [-1 * scale, -1 * scale, -1 * scale],  // was [-1, -1, 1] -> [-1, -1, -1]
      'Fe': [-1 * scale, 1 * scale, 1 * scale],    // was [-1, 1, -1] -> [-1, 1, 1]
      'Ti': [-1 * scale, -1 * scale, 1 * scale],   // was [-1, 1, 1] -> [-1, -1, 1]
      'Te': [1 * scale, 1 * scale, -1 * scale],    // was [1, -1, -1] -> [1, 1, -1]
      'Fi': [1 * scale, -1 * scale, -1 * scale],   // was [1, -1, 1] -> [1, -1, -1]
      'Si': [1 * scale, 1 * scale, 1 * scale],     // was [1, 1, -1] -> [1, 1, 1]
      'Ne': [1 * scale, -1 * scale, 1 * scale]     // was [1, 1, 1] -> [1, -1, 1]
    };
  }, []);
  
  const edges = useMemo(() => {
    // Map the edge indices to function names
    // cubeEdges: [0,1], [0,2], [0,4], [1,3], [1,5], [2,3], [2,6], [3,7], [4,5], [4,6], [5,7], [6,7]
    const functionsByIndex = ['Ni', 'Se', 'Fe', 'Ti', 'Te', 'Fi', 'Si', 'Ne'];
    return [
      ['Ni', 'Se'], // [0,1]
      ['Ni', 'Fe'], // [0,2]
      ['Ni', 'Te'], // [0,4]
      ['Se', 'Ti'], // [1,3]
      ['Se', 'Fi'], // [1,5]
      ['Fe', 'Ti'], // [2,3]
      ['Fe', 'Si'], // [2,6]
      ['Ti', 'Ne'], // [3,7]
      ['Te', 'Fi'], // [4,5]
      ['Te', 'Si'], // [4,6]
      ['Fi', 'Ne'], // [5,7]
      ['Si', 'Ne']  // [6,7]
    ];
  }, []);
  
  const faces = useMemo(() => {
    // For each type, we need to order the vertices correctly using the orderFace algorithm
    const funcToCoord = {
      'Ni': 0, 'Se': 1, 'Fe': 2, 'Ti': 3, 
      'Te': 4, 'Fi': 5, 'Si': 6, 'Ne': 7
    };
    
    const orderFaceVertices = (funcs) => {
      const indices = funcs.map(f => funcToCoord[f]);
      const verts = indices.map(i => corners[Object.keys(corners)[i]]);
      
      // Calculate center
      const center = verts.reduce((acc, v) => 
        acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
      
      // Determine which axis is constant
      const xs = new Set(verts.map(v => v[0]));
      const ys = new Set(verts.map(v => v[1]));
      const zs = new Set(verts.map(v => v[2]));
      const axis = xs.size === 1 ? 'x' : (ys.size === 1 ? 'y' : 'z');
      
      // Sort vertices counter-clockwise
      const sorted = verts.map((v, idx) => {
        let dx, dy;
        if (axis === 'x') {
          dx = v[1] - center[1];
          dy = v[2] - center[2];
        } else if (axis === 'y') {
          dx = v[0] - center[0];
          dy = v[2] - center[2];
        } else {
          dx = v[0] - center[0];
          dy = v[1] - center[1];
        }
        return { v, idx: funcs[idx], angle: Math.atan2(dy, dx) };
      }).sort((a, b) => a.angle - b.angle);
      
      return sorted.map(s => corners[s.idx]);
    };
    
    const quadrantFaces = {
      'Ni-Fe-Ti-Se': orderFaceVertices(['Ni', 'Fe', 'Ti', 'Se']),
      'Ni-Te-Fi-Se': orderFaceVertices(['Ni', 'Te', 'Fi', 'Se']),
      'Ne-Te-Fi-Si': orderFaceVertices(['Ne', 'Te', 'Fi', 'Si']),
      'Ne-Fe-Ti-Si': orderFaceVertices(['Ne', 'Fe', 'Ti', 'Si'])
    };
    return quadrantFaces;
  }, [corners]);
  
  const activeFunctions = useMemo(() => 
    selectedType ? getActiveFunctions(selectedType) : [],
    [selectedType, getActiveFunctions]
  );
  
  const activeQuadrant = selectedType ? typeToQuadrant[selectedType] : null;
  
  const getTypePositions = (quadrant) => {
    if (!activeQuadrant || quadrant !== activeQuadrant) return {};
    
    const face = faces[quadrant];
    const [v0, v1, v2, v3] = face;
    
    const stack = mbtiData[selectedType];
    if (!stack) return {};
    
    // Build the annotation positions using the same UV mapping as Plotly
    const e1 = v1.map((c, i) => c - v0[i]);
    const e3 = v3.map((c, i) => c - v0[i]);
    
    const UV = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
    const pts = UV.map(([u, v]) => [
      v0[0] + u * e1[0] + v * e3[0],
      v0[1] + u * e1[1] + v * e3[1],
      v0[2] + u * e1[2] + v * e3[2]
    ]);
    
    // Map each corner function to its number
    const cornerFuncs = face.map(vert => {
      // Find which function this vertex represents
      for (const [func, coord] of Object.entries(corners)) {
        if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
          return func;
        }
      }
    });
    
    const positions = {};
    cornerFuncs.forEach((func, cornerIdx) => {
      const stackIdx = stack.indexOf(func);
      if (stackIdx !== -1) {
        positions[stackIdx] = pts[cornerIdx];
      }
    });
    
    return positions;
  };
  
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} />
      
      <group ref={groupRef}>
        {Object.entries(corners).map(([func, pos]) => (
          <CubeVertex
            key={func}
            position={pos}
            label={func}
            isActive={activeFunctions.includes(func)}
          />
        ))}
        
        {edges.map(([start, end], idx) => (
          <CubeEdge
            key={idx}
            start={corners[start]}
            end={corners[end]}
          />
        ))}
        
        {Object.entries(faces).map(([quadrant, vertices]) => (
          <React.Fragment key={quadrant}>
            <CubeFace
              vertices={vertices}
              isActive={quadrant === activeQuadrant}
              functionStack={quadrant === activeQuadrant ? mbtiData[selectedType] : null}
              typePositions={getTypePositions(quadrant)}
            />
            <GridLines
              face={vertices}
              isActive={quadrant === activeQuadrant}
            />
          </React.Fragment>
        ))}
      </group>
      
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={10}
        onStart={() => setAutoRotate(false)}
      />
    </>
  );
};

const ThreeHypercube = ({ selectedType, mbtiData, typeToQuadrant, getActiveFunctions }) => {
  return (
    <div style={{ width: '100%', height: '600px' }}>
      <Canvas
        camera={{ position: [5, 5, 5], fov: 50 }}
        style={{ background: '#0a0a0a' }}
      >
        <HypercubeScene
          selectedType={selectedType}
          mbtiData={mbtiData}
          typeToQuadrant={typeToQuadrant}
          getActiveFunctions={getActiveFunctions}
        />
      </Canvas>
    </div>
  );
};

export default ThreeHypercube;