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
const FaceQuadrant = ({ position, type, isSelected, onClick, faceNormal, isTopOrBottom }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  const handlePointerDown = (e) => {
    e.stopPropagation();
    setDragStart({ x: e.clientX, y: e.clientY });
    setIsDragging(false);
  };

  const handlePointerMove = (e) => {
    if (dragStart) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - dragStart.x, 2) +
        Math.pow(e.clientY - dragStart.y, 2)
      );
      if (distance > 5) {
        setIsDragging(true);
      }
    }
  };

  const handlePointerUp = (e) => {
    e.stopPropagation();
    if (!isDragging && !isTopOrBottom) {
      onClick(type);
    }
    setDragStart(null);
    setIsDragging(false);
  };

  return (
    <group position={position}>
      <Text
        fontSize={0.15}
        color={isTopOrBottom ? "#666666" : (isSelected ? "white" : "#888888")}
        anchorX="center"
        anchorY="middle"
        rotation={faceNormal}
        fontWeight={isSelected && !isTopOrBottom ? 'bold' : 'normal'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={(e) => { 
          if (!isTopOrBottom) document.body.style.cursor = 'pointer'; 
        }}
        onPointerOut={(e) => { document.body.style.cursor = 'auto'; }}
      >
        {type}
      </Text>
    </group>
  );
};

const CubeFace = ({ vertices, quadrant, types, selectedType, onTypeSelect, mbtiData, corners, isTopOrBottom }) => {
  const meshRef = useRef();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  
  const isActive = types.includes(selectedType) && !isTopOrBottom;
  
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
    // Calculate center of face
    const center = vertices.reduce((acc, v) => 
      acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
    
    // Calculate face normal for offset
    const [v0, v1, v2] = vertices;
    const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
    const edge2 = new THREE.Vector3(...v2).sub(new THREE.Vector3(...v0));
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Position for each type's label (halfway between vertex and center)
    // with slight offset along normal to prevent z-fighting
    const positions = vertices.map(v => {
      const basePos = v.map((c, i) => (c + center[i]) / 2);
      return [
        basePos[0] + normal.x * 0.02,
        basePos[1] + normal.y * 0.02,
        basePos[2] + normal.z * 0.02
      ];
    });
    
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
    
    // Calculate center of face
    const center = vertices.reduce((acc, v) => 
      acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
    
    // Calculate face normal for offset
    const [v0, v1, v2] = vertices;
    const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
    const edge2 = new THREE.Vector3(...v2).sub(new THREE.Vector3(...v0));
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Position numbers between each vertex and center (closer to center)
    // with slight offset along normal to prevent z-fighting
    return vertices.map(v => {
      const basePos = v.map((c, i) => c * 0.3 + center[i] * 0.7);
      return [
        basePos[0] + normal.x * 0.02,
        basePos[1] + normal.y * 0.02,
        basePos[2] + normal.z * 0.02
      ];
    });
  }, [vertices, isActive]);

  // Removed billboard effect - numbers now stay flat on face

  // Handle pointer down to track drag start
  const handlePointerDown = (event) => {
    setDragStart({ x: event.clientX, y: event.clientY });
    setIsDragging(false);
  };

  // Handle pointer move to detect dragging
  const handlePointerMove = (event) => {
    if (dragStart) {
      const distance = Math.sqrt(
        Math.pow(event.clientX - dragStart.x, 2) +
        Math.pow(event.clientY - dragStart.y, 2)
      );
      if (distance > 5) { // Threshold for drag detection
        setIsDragging(true);
      }
    }
  };

  // Handle pointer up - only select if not dragging
  const handlePointerUp = (event) => {
    if (!isDragging && !isTopOrBottom) {
      // Get click position relative to face
      const point = event.point;
      
      // Simple distance-based detection to nearest quadrant center
      let minDist = Infinity;
      let closestType = null;
      
      quadrantPositions.forEach((pos, idx) => {
        const dist = Math.sqrt(
          Math.pow(point.x - pos[0], 2) +
          Math.pow(point.y - pos[1], 2) +
          Math.pow(point.z - pos[2], 2)
        );
        if (dist < minDist) {
          minDist = dist;
          closestType = types[idx];
        }
      });
      
      if (closestType) {
        onTypeSelect(closestType);
      }
    }
    setDragStart(null);
    setIsDragging(false);
  };

  return (
    <group>
      <mesh 
        ref={meshRef} 
        geometry={geometry}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={(e) => { 
          if (!isTopOrBottom) document.body.style.cursor = 'pointer'; 
        }}
        onPointerOut={(e) => { document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial
          color={isTopOrBottom ? '#2a2a2a' : (isActive ? '#ff8800' : '#3a3a3a')}
          opacity={1.0}
          transparent={false}
          side={THREE.DoubleSide}
          depthWrite={true}
          depthTest={true}
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
          isTopOrBottom={isTopOrBottom}
        />
      ))}
      
      {/* Function stack numbers (only when active) */}
      {isActive && selectedType && (() => {
        const stack = mbtiData[selectedType];
        if (!stack) return null;
        
        // Get the ordered functions for this face from vertices
        const orderedFuncs = [];
        vertices.forEach(vert => {
          for (const [func, coord] of Object.entries(corners)) {
            if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
              orderedFuncs.push(func);
              break;
            }
          }
        });
        
        // Map each position to its function number in the stack
        return numberPositions.map((pos, idx) => {
          const func = orderedFuncs[idx];
          const stackPosition = stack.indexOf(func);
          if (stackPosition === -1) return null;
          
          return (
            <Text
              key={idx}
              position={pos}
              fontSize={0.25}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="black"
              rotation={faceNormal}
              renderOrder={1}
            >
              {stackPosition + 1}
            </Text>
          );
        });
      })() }
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
      renderOrder={0.5}
      frustumCulled={false}
    >
      <lineBasicMaterial 
        color={isActive ? "#ff69b4" : "#ffffff"}
        depthWrite={true}
        depthTest={true}
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
    
    // Based on our test, here are the correct ordered mappings
    const quadrantFaces = {
      'Ni-Fe-Ti-Se': {
        vertices: orderFaceVertices(['Ni', 'Fe', 'Ti', 'Se']),
        types: ['ESTP', 'INFJ', 'ENFJ', 'ISTP'] // Se, Ni, Fe, Ti order
      },
      'Ni-Te-Fi-Se': {
        vertices: orderFaceVertices(['Ni', 'Te', 'Fi', 'Se']),
        types: ['ESFP', 'ISFP', 'ENTJ', 'INTJ'] // Se, Fi, Te, Ni order
      },
      'Ne-Te-Fi-Si': {
        vertices: orderFaceVertices(['Ne', 'Te', 'Fi', 'Si']),
        types: ['INFP', 'ESTJ', 'ISTJ', 'ENFP'] // Fi, Te, Si, Ne order
      },
      'Ne-Fe-Ti-Si': {
        vertices: orderFaceVertices(['Ne', 'Fe', 'Ti', 'Si']),
        types: ['INTP', 'ENTP', 'ISFJ', 'ESFJ'] // Ti, Ne, Si, Fe order
      }
    };
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
      <ambientLight intensity={0.7} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      
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
          
          // Check if this is a top or bottom face (constant Y coordinate)
          const ys = new Set(vertices.map(v => v[1]));
          const isTopOrBottom = ys.size === 1;
          
          return (
            <React.Fragment key={quadrant}>
              <CubeFace
                vertices={vertices}
                quadrant={quadrant}
                types={types}
                selectedType={selectedType}
                onTypeSelect={handleTypeSelect}
                mbtiData={mbtiData}
                corners={corners}
                isTopOrBottom={isTopOrBottom}
              />
              <GridLines
                face={vertices}
                isActive={isActive && !isTopOrBottom}
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