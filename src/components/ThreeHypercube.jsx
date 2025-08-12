import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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

// Component for each quadrant with its MBTI type label
const FaceQuadrant = ({ position, type, isSelected, onClick, faceNormal }) => {
  const handleClick = (e) => {
    e.stopPropagation();
    onClick(type);
  };

  return (
    <group position={position}>
      <mesh onClick={handleClick}>
        <planeGeometry args={[0.75, 0.75]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <Text
        fontSize={0.15}
        color={isSelected ? "white" : "#888888"}
        anchorX="center"
        anchorY="middle"
        rotation={faceNormal}
        fontWeight={isSelected ? 'bold' : 'normal'}
      >
        {type}
      </Text>
    </group>
  );
};

const CubeFace = ({ vertices, quadrant, types, selectedType, onTypeSelect }) => {
  const meshRef = useRef();
  const numberRefs = useRef([]);
  
  const isActive = types.includes(selectedType);
  
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

  // Calculate quadrant positions
  const quadrantPositions = useMemo(() => {
    const [v0, v1, v2, v3] = vertices;
    const e1 = v1.map((c, i) => c - v0[i]);
    const e3 = v3.map((c, i) => c - v0[i]);
    
    // Position for each type's label (in the center of its quadrant)
    const positions = [
      v0.map((c, i) => c + 0.25 * e1[i] + 0.25 * e3[i]), // Bottom-left
      v0.map((c, i) => c + 0.75 * e1[i] + 0.25 * e3[i]), // Bottom-right
      v0.map((c, i) => c + 0.75 * e1[i] + 0.75 * e3[i]), // Top-right
      v0.map((c, i) => c + 0.25 * e1[i] + 0.75 * e3[i]), // Top-left
    ];
    
    return positions;
  }, [vertices]);

  // Calculate face normal for text rotation
  const faceNormal = useMemo(() => {
    const [v0, v1, v2] = vertices;
    const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
    const edge2 = new THREE.Vector3(...v2).sub(new THREE.Vector3(...v0));
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Determine rotation based on which face this is
    if (Math.abs(normal.x) > 0.9) return [0, Math.PI / 2 * Math.sign(normal.x), 0];
    if (Math.abs(normal.y) > 0.9) return [Math.PI / 2 * Math.sign(normal.y), 0, 0];
    if (Math.abs(normal.z) > 0.9) return [0, 0, 0];
    return [0, 0, 0];
  }, [vertices]);

  // Calculate number positions (near grid intersection when selected)
  const numberPositions = useMemo(() => {
    if (!isActive) return [];
    
    const [v0, v1, v2, v3] = vertices;
    const center = v0.map((c, i) => (c + v1[i] + v2[i] + v3[i]) / 4);
    const e1 = v1.map((c, i) => c - v0[i]);
    const e3 = v3.map((c, i) => c - v0[i]);
    
    // Position numbers closer to center
    return [
      v0.map((c, i) => c + 0.4 * e1[i] + 0.4 * e3[i]), // 1
      v0.map((c, i) => c + 0.6 * e1[i] + 0.4 * e3[i]), // 2
      v0.map((c, i) => c + 0.4 * e1[i] + 0.6 * e3[i]), // 3
      v0.map((c, i) => c + 0.6 * e1[i] + 0.6 * e3[i]), // 4
    ];
  }, [vertices, isActive]);

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
          color={isActive ? '#ff8800' : '#333333'}
          opacity={isActive ? 0.6 : 0.3}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Type labels for each quadrant */}
      {types.map((type, idx) => (
        <FaceQuadrant
          key={type}
          position={quadrantPositions[idx]}
          type={type}
          isSelected={type === selectedType}
          onClick={onTypeSelect}
          faceNormal={faceNormal}
        />
      ))}
      
      {/* Function stack numbers (only when active) */}
      {isActive && numberPositions.map((pos, idx) => {
        const typeIndex = types.indexOf(selectedType);
        if (typeIndex === -1) return null;
        
        // Map the numbers based on which type is selected
        const numberMap = {
          0: [1, 2, 3, 4],
          1: [2, 1, 4, 3],
          2: [4, 3, 2, 1],
          3: [3, 4, 1, 2]
        };
        
        const number = numberMap[typeIndex][idx];
        
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
              {number}
            </Text>
          </group>
        );
      })}
    </group>
  );
};

const GridLines = ({ face, isActive }) => {
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
        color={isActive ? "#ff69b4" : "#ffffff"}
        depthWrite={false}
        depthTest={false}
        transparent={false}
      />
    </lineSegments>
  );
};

const HypercubeScene = ({ selectedType, setSelectedType, mbtiData, typeToQuadrant, getActiveFunctions }) => {
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
    
    // Map types to their dominant function corner
    // The order should match the ordered vertices
    const getTypesForFace = (funcs, orderedVerts) => {
      const typesByDominant = {
        'Ni': ['INFJ', 'INTJ'],
        'Ne': ['ENFP', 'ENTP'],
        'Si': ['ISFJ', 'ISTJ'],
        'Se': ['ESFP', 'ESTP'],
        'Ti': ['INTP', 'ISTP'],
        'Te': ['ENTJ', 'ESTJ'],
        'Fi': ['INFP', 'ISFP'],
        'Fe': ['ENFJ', 'ESFJ']
      };
      
      // For each ordered vertex, find the type with that dominant function
      // that also belongs to this face
      const faceTypes = [];
      orderedVerts.forEach(vert => {
        // Find which function this vertex represents
        for (const [func, coord] of Object.entries(corners)) {
          if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
            // Find types with this dominant function that use all face functions
            const candidates = typesByDominant[func] || [];
            for (const type of candidates) {
              const stack = mbtiData[type];
              if (stack && funcs.every(f => stack.includes(f))) {
                faceTypes.push(type);
                break;
              }
            }
            break;
          }
        }
      });
      
      return faceTypes;
    };
    
    const quadrantFaces = {
      'Ni-Fe-Ti-Se': {
        vertices: orderFaceVertices(['Ni', 'Fe', 'Ti', 'Se']),
        types: []
      },
      'Ni-Te-Fi-Se': {
        vertices: orderFaceVertices(['Ni', 'Te', 'Fi', 'Se']),
        types: []
      },
      'Ne-Te-Fi-Si': {
        vertices: orderFaceVertices(['Ne', 'Te', 'Fi', 'Si']),
        types: []
      },
      'Ne-Fe-Ti-Si': {
        vertices: orderFaceVertices(['Ne', 'Fe', 'Ti', 'Si']),
        types: []
      }
    };
    
    // Now populate the types in the correct order
    quadrantFaces['Ni-Fe-Ti-Se'].types = getTypesForFace(['Ni', 'Fe', 'Ti', 'Se'], quadrantFaces['Ni-Fe-Ti-Se'].vertices);
    quadrantFaces['Ni-Te-Fi-Se'].types = getTypesForFace(['Ni', 'Te', 'Fi', 'Se'], quadrantFaces['Ni-Te-Fi-Se'].vertices);
    quadrantFaces['Ne-Te-Fi-Si'].types = getTypesForFace(['Ne', 'Te', 'Fi', 'Si'], quadrantFaces['Ne-Te-Fi-Si'].vertices);
    quadrantFaces['Ne-Fe-Ti-Si'].types = getTypesForFace(['Ne', 'Fe', 'Ti', 'Si'], quadrantFaces['Ne-Fe-Ti-Si'].vertices);
    return quadrantFaces;
  }, [corners, mbtiData]);
  
  const activeFunctions = useMemo(() => 
    selectedType ? getActiveFunctions(selectedType) : [],
    [selectedType, getActiveFunctions]
  );
  
  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setAutoRotate(false);
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
        
        {Object.entries(faces).map(([quadrant, { vertices, types }]) => {
          const isActive = types.includes(selectedType);
          return (
            <React.Fragment key={quadrant}>
              <CubeFace
                vertices={vertices}
                quadrant={quadrant}
                types={types}
                selectedType={selectedType}
                onTypeSelect={handleTypeSelect}
              />
              <GridLines
                face={vertices}
                isActive={isActive}
              />
            </React.Fragment>
          );
        })}
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

const ThreeHypercube = ({ selectedType, setSelectedType, mbtiData, typeToQuadrant, getActiveFunctions }) => {
  return (
    <div style={{ width: '100%', height: '600px' }}>
      <Canvas
        camera={{ position: [5, 5, 5], fov: 50 }}
        style={{ background: '#0a0a0a' }}
      >
        <HypercubeScene
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          mbtiData={mbtiData}
          typeToQuadrant={typeToQuadrant}
          getActiveFunctions={getActiveFunctions}
        />
      </Canvas>
    </div>
  );
};

export default ThreeHypercube;