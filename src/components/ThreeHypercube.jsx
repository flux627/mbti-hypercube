import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line, Box, Plane, Billboard } from '@react-three/drei';
import * as THREE from 'three';

// Gradient shader for selected faces
const gradientVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const gradientFragmentShader = `
  uniform vec3 colorStart1;
  uniform vec3 colorEnd1;
  uniform vec3 colorStart2;
  uniform vec3 colorEnd2;
  uniform vec2 gradientStart1;
  uniform vec2 gradientEnd1;
  uniform vec2 gradientStart2;
  uniform vec2 gradientEnd2;
  uniform float opacity;
  
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    // UV coordinates are swapped - vUv.x is vertical, vUv.y is horizontal
    // Create vertical gradients using vUv.x (which runs vertically)
    float t = vUv.x;  // This should go from top to bottom
    
    // Create the gradients
    vec3 gradient1 = mix(colorStart1, colorEnd1, t);  // Red to blue
    vec3 gradient2 = mix(colorStart2, colorEnd2, t);  // Orange to cyan
    
    // Split into two columns using vUv.y
    vec3 finalColor;
    
    if (vUv.y < 0.5) {
      // LEFT column (but appears as right due to reversal)
      finalColor = gradient2;  // Auxiliary
    } else {
      // RIGHT column (but appears as left due to reversal)
      finalColor = gradient1;  // Dominant
    }
    
    gl_FragColor = vec4(finalColor, opacity);
  }
`;

const CubeVertex = ({ position, label, isActive }) => {
  const meshRef = useRef();
  
  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={isActive ? '#ff4444' : '#4444ff'} />
      </mesh>
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
      depthWrite={true}
      depthTest={true}
    />
  );
};

// Component for each quadrant with its MBTI type label
const FaceQuadrant = ({ position, type, isSelected, onClick, faceNormal, isTopOrBottom }) => {
  return (
    <group position={position}>
      <Text
        fontSize={0.15}
        color={isTopOrBottom ? "#666666" : (isSelected ? "white" : "#888888")}
        anchorX="center"
        anchorY="middle"
        rotation={faceNormal}
        fontWeight={isSelected && !isTopOrBottom ? 'bold' : 'normal'}
      >
        {type}
      </Text>
    </group>
  );
};

const CubeFace = ({ vertices, quadrant, types, selectedType, onTypeSelect, mbtiData, corners, isTopOrBottom, isDragging }) => {
  const meshRef = useRef();
  const { camera } = useThree();
  const [isHovered, setIsHovered] = useState(false);
  
  const isActive = types.includes(selectedType) && !isTopOrBottom;
  
  // Create gradient material for selected faces with correct uniforms
  const [gradientMaterial, setGradientMaterial] = useState(null);
  
  // Create material with correct gradient positions based on selected type
  useEffect(() => {
    if (isActive && !isTopOrBottom && types.includes(selectedType) && mbtiData[selectedType]) {
      const stack = mbtiData[selectedType];
      
      // Find which functions are at each vertex
      const vertexFunctionMap = {};
      vertices.forEach((vert, idx) => {
        for (const [func, coord] of Object.entries(corners)) {
          if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
            vertexFunctionMap[idx] = func;
            console.log(`  Vertex ${idx}: ${func} at position [${vert}]`);
            break;
          }
        }
      });
      
      // Map each function in the stack to its position on this face
      const functionPositions = {};
      stack.forEach((func, stackIdx) => {
        Object.entries(vertexFunctionMap).forEach(([vertIdx, vertFunc]) => {
          if (vertFunc === func) {
            functionPositions[stackIdx] = parseInt(vertIdx);
          }
        });
      });
      
      // Calculate UV coordinates for gradient start/end points
      const v0 = new THREE.Vector3(...vertices[0]);
      const v1 = new THREE.Vector3(...vertices[1]);
      const v3 = new THREE.Vector3(...vertices[3]);
      
      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v3, v0);
      
      const calculateUV = (vertexIndex) => {
        const vertex = new THREE.Vector3(...vertices[vertexIndex]);
        const vec = new THREE.Vector3().subVectors(vertex, v0);
        const u = vec.dot(edge1) / edge1.lengthSq();
        const v = vec.dot(edge2) / edge2.lengthSq();
        return [u, v];
      };
      
      const uvMap = vertices.map((_, idx) => calculateUV(idx));
      
      // Calculate gradient positions based on the selected type's stack
      const gradientStart1 = functionPositions[0] !== undefined ? uvMap[functionPositions[0]] : [0, 0];
      const gradientEnd1 = functionPositions[3] !== undefined ? uvMap[functionPositions[3]] : [1, 1];
      const gradientStart2 = functionPositions[1] !== undefined ? uvMap[functionPositions[1]] : [0, 1];
      const gradientEnd2 = functionPositions[2] !== undefined ? uvMap[functionPositions[2]] : [1, 0];
      
      console.log(`Creating material for face [${types.join(',')}] with selected type: ${selectedType}`);
      console.log(`  Stack: ${stack.join(' -> ')}`);
      console.log(`  Vertex function map:`, vertexFunctionMap);
      console.log(`  Function positions:`, functionPositions);
      console.log(`  UV map:`, uvMap);
      console.log(`  Vertex positions in 3D:`, vertices);
      console.log(`  Dominant axis (${stack[0]} to ${stack[3]}):`);
      console.log(`    ${stack[0]} at vertex ${functionPositions[0]} UV [${gradientStart1}]`);
      console.log(`    ${stack[3]} at vertex ${functionPositions[3]} UV [${gradientEnd1}]`);
      console.log(`    Direction: [${gradientEnd1[0] - gradientStart1[0]}, ${gradientEnd1[1] - gradientStart1[1]}]`);
      console.log(`  Auxiliary axis (${stack[1]} to ${stack[2]}):`);
      console.log(`    ${stack[1]} at vertex ${functionPositions[1]} UV [${gradientStart2}]`);
      console.log(`    ${stack[2]} at vertex ${functionPositions[2]} UV [${gradientEnd2}]`);
      console.log(`    Direction: [${gradientEnd2[0] - gradientStart2[0]}, ${gradientEnd2[1] - gradientStart2[1]}]`);
      
      // Calculate what we expect to see
      const expectedVisual = `${selectedType} should show: TOP=${stack[1]}->${stack[2]} (orange->cyan), BOTTOM=${stack[0]}->${stack[3]} (red->blue)`;
      console.log(expectedVisual);
      
      // Create a new material with the correct gradient positions
      // Add unique ID to track material instances
      const materialId = `${types.join(',')}-${selectedType}-${Date.now()}`;
      console.log(`Creating material with ID: ${materialId}`);
      
      // Determine if gradients should be swapped based on selected type
      // For testing: swap colors for ENFJ vs INFJ
      const shouldSwap = selectedType === 'ENFJ' || selectedType === 'ESTP';
      
      const newMaterial = new THREE.ShaderMaterial({
        uniforms: {
          colorStart1: { value: shouldSwap ? new THREE.Color('#ff8a00') : new THREE.Color('#ff0000') },
          colorEnd1: { value: shouldSwap ? new THREE.Color('#00aeff') : new THREE.Color('#0000ff') },
          colorStart2: { value: shouldSwap ? new THREE.Color('#ff0000') : new THREE.Color('#ff8a00') },
          colorEnd2: { value: shouldSwap ? new THREE.Color('#0000ff') : new THREE.Color('#00aeff') },
          gradientStart1: { value: new THREE.Vector2(...gradientStart1) },
          gradientEnd1: { value: new THREE.Vector2(...gradientEnd1) },
          gradientStart2: { value: new THREE.Vector2(...gradientStart2) },
          gradientEnd2: { value: new THREE.Vector2(...gradientEnd2) },
          opacity: { value: 1.0 }
        },
        vertexShader: gradientVertexShader,
        fragmentShader: gradientFragmentShader,
        side: THREE.FrontSide,
        transparent: false
      });
      
      // Store ID on material for debugging
      newMaterial.userData = { id: materialId, selectedType };
      
      setGradientMaterial(newMaterial);
      
      // Force Three.js to recognize the new material
      newMaterial.needsUpdate = true;
      
      // Cleanup function disposes the material
      return () => {
        newMaterial.dispose();
      };
    } else {
      // Clear material when not active
      setGradientMaterial(null);
    }
  }, [isActive, isTopOrBottom, selectedType, types.join(','), vertices, corners, mbtiData]);
  
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      ...vertices[0], ...vertices[1], ...vertices[2],
      ...vertices[0], ...vertices[2], ...vertices[3]
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    
    // Calculate proper UV coordinates based on vertex positions
    // We need to map the 3D vertex positions to 2D UV coordinates
    // Find two edge vectors to create a 2D coordinate system on the face
    const v0 = new THREE.Vector3(...vertices[0]);
    const v1 = new THREE.Vector3(...vertices[1]);
    const v2 = new THREE.Vector3(...vertices[2]);
    const v3 = new THREE.Vector3(...vertices[3]);
    
    // Create edge vectors
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v3, v0);
    
    // Calculate UV coordinates for each vertex
    const calculateUV = (vertex) => {
      const vec = new THREE.Vector3().subVectors(vertex, v0);
      const u = vec.dot(edge1) / edge1.lengthSq();
      const v = vec.dot(edge2) / edge2.lengthSq();
      return [u, v];
    };
    
    const uv0 = calculateUV(v0);
    const uv1 = calculateUV(v1);
    const uv2 = calculateUV(v2);
    const uv3 = calculateUV(v3);
    
    const uvs = new Float32Array([
      ...uv0,  // vertex 0
      ...uv1,  // vertex 1
      ...uv2,  // vertex 2
      ...uv0,  // vertex 0 (repeated)
      ...uv2,  // vertex 2 (repeated)
      ...uv3   // vertex 3
    ]);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    
    geo.computeVertexNormals();
    return geo;
  }, [vertices]);

  // Calculate function label positions (in center of each quadrant)
  const functionLabelPositions = useMemo(() => {
    // Calculate center of face
    const faceCenter = vertices.reduce((acc, v) => 
      acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
    
    // Calculate face normal for offset
    const [v0, v1, v2] = vertices;
    const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
    const edge2 = new THREE.Vector3(...v2).sub(new THREE.Vector3(...v0));
    let normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Ensure normal points outward from cube center (0,0,0)
    const faceCenterVec = new THREE.Vector3(...faceCenter);
    if (normal.dot(faceCenterVec) < 0) {
      normal.multiplyScalar(-1);
    }
    
    // Position function labels in the center of each quadrant (halfway between vertex and center)
    // with slight offset along normal to prevent z-fighting
    const positions = vertices.map(v => {
      const basePos = v.map((c, i) => (v[i] + faceCenter[i]) / 2);
      return [
        basePos[0] + normal.x * 0.02,
        basePos[1] + normal.y * 0.02,
        basePos[2] + normal.z * 0.02
      ];
    });
    
    return positions;
  }, [vertices]);

  // Calculate quadrant positions (for type labels)
  const quadrantPositions = useMemo(() => {
    // Calculate center of face
    const faceCenter = vertices.reduce((acc, v) => 
      acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
    
    // Calculate face normal for offset
    const [v0, v1, v2] = vertices;
    const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
    const edge2 = new THREE.Vector3(...v2).sub(new THREE.Vector3(...v0));
    let normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Ensure normal points outward from cube center (0,0,0)
    const faceCenterVec = new THREE.Vector3(...faceCenter);
    if (normal.dot(faceCenterVec) < 0) {
      normal.multiplyScalar(-1);
    }
    
    // Position for each type's label
    // Horizontal: 75% toward vertex (for width)
    // Vertical: 82% toward vertex (compensating for text height being smaller than width)
    // with slight offset along normal to prevent z-fighting
    const positions = vertices.map(v => {
      // Different ratios for different axes to account for text shape
      const basePos = [
        v[0] * 0.75 + faceCenter[0] * 0.25,  // X axis - 75%
        v[1] * 0.82 + faceCenter[1] * 0.18,  // Y axis - 82% (closer to edge vertically)
        v[2] * 0.75 + faceCenter[2] * 0.25   // Z axis - 75%
      ];
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
    // Calculate center of face
    const faceCenter = vertices.reduce((acc, v) => 
      acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
    
    // Determine rotation based on face center position
    // Text should face outward from the cube center
    if (Math.abs(faceCenter[0]) > Math.abs(faceCenter[1]) && Math.abs(faceCenter[0]) > Math.abs(faceCenter[2])) {
      // X face (left or right)
      if (faceCenter[0] < 0) {
        // Left face (-X)
        return [0, -Math.PI / 2, 0];
      } else {
        // Right face (+X)
        return [0, Math.PI / 2, 0];
      }
    } else if (Math.abs(faceCenter[1]) > Math.abs(faceCenter[0]) && Math.abs(faceCenter[1]) > Math.abs(faceCenter[2])) {
      // Y face (top or bottom)
      if (faceCenter[1] < 0) {
        // Bottom face (-Y)
        return [-Math.PI / 2, 0, 0];
      } else {
        // Top face (+Y)
        return [Math.PI / 2, 0, 0];
      }
    } else {
      // Z face (front or back)
      if (faceCenter[2] < 0) {
        // Back face (-Z)
        return [0, Math.PI, 0];
      } else {
        // Front face (+Z)
        return [0, 0, 0];
      }
    }
  }, [vertices]);

  // Calculate number positions (near grid intersection when selected)
  const numberPositions = useMemo(() => {
    if (!isActive) return [];
    
    // Calculate center of face
    const faceCenter = vertices.reduce((acc, v) => 
      acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
    
    // Calculate face normal for offset
    const [v0, v1, v2] = vertices;
    const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
    const edge2 = new THREE.Vector3(...v2).sub(new THREE.Vector3(...v0));
    let normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Ensure normal points outward from cube center (0,0,0)
    const faceCenterVec = new THREE.Vector3(...faceCenter);
    if (normal.dot(faceCenterVec) < 0) {
      normal.multiplyScalar(-1);
    }
    
    // Position numbers much closer to center (20% from center toward vertex)
    // with slight offset along normal to prevent z-fighting
    return vertices.map(v => {
      const basePos = v.map((c, i) => v[i] * 0.2 + faceCenter[i] * 0.8);
      return [
        basePos[0] + normal.x * 0.02,
        basePos[1] + normal.y * 0.02,
        basePos[2] + normal.z * 0.02
      ];
    });
  }, [vertices, isActive]);

  // Check if face is visible to camera
  const isFaceVisible = useMemo(() => {
    if (!vertices || vertices.length < 3) return false;
    
    // Calculate face center
    const faceCenter = vertices.reduce((acc, v) => 
      acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / vertices.length);
    
    // Calculate face normal using first three vertices
    // Vertices are ordered counter-clockwise when viewed from outside
    const [v0, v1, v2, v3] = vertices;
    const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
    const edge2 = new THREE.Vector3(...v3).sub(new THREE.Vector3(...v0));
    let normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Ensure normal points outward from cube center (0,0,0)
    const faceCenterVec = new THREE.Vector3(...faceCenter);
    if (normal.dot(faceCenterVec) < 0) {
      normal.multiplyScalar(-1);
    }
    
    // Check if face normal points toward camera
    // Face is visible if the face normal points toward the camera
    const cameraDirection = new THREE.Vector3().subVectors(camera.position, faceCenterVec).normalize();
    const dotProduct = normal.dot(cameraDirection);
    
    // Only visible if facing camera (dot product > 0)
    return dotProduct > 0.1; // Small threshold to avoid edge cases
  }, [vertices, camera.position]);

  // Handle pointer up - only select if not dragging
  const handlePointerUp = (event) => {
    // Stop propagation to prevent multiple faces from processing the same click
    event.stopPropagation();
    
    console.log(`Click on face with types: ${types.join(', ')}, isDragging=${isDragging}, isTopOrBottom=${isTopOrBottom}`);
    
    if (!isDragging && !isTopOrBottom) {
      // Get the click point in world space
      const clickPoint = event.point;
      
      // Calculate face center
      const faceCenter = vertices.reduce((acc, v) => 
        acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
      
      // Create a 2D coordinate system on the face plane
      // Use first two edges as basis vectors
      const v0 = new THREE.Vector3(...vertices[0]);
      const v1 = new THREE.Vector3(...vertices[1]);
      const v3 = new THREE.Vector3(...vertices[3]);
      
      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v3, v0);
      
      // Project click point onto face coordinate system
      const clickVec = new THREE.Vector3().subVectors(new THREE.Vector3(...clickPoint), v0);
      const u = clickVec.dot(edge1) / edge1.lengthSq();
      const v = clickVec.dot(edge2) / edge2.lengthSq();
      
      // Find which function is at each vertex
      const vertexFunctions = vertices.map((vert, idx) => {
        for (const [func, coord] of Object.entries(corners)) {
          if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
            return func;
          }
        }
        return 'unknown';
      });
      
      // Find which type has its dominant function at the clicked position
      // The vertices form a quad with UV coordinates mapping as follows:
      // Vertex 0: (0,0) - bottom-left
      // Vertex 1: (1,0) - bottom-right  
      // Vertex 2: (1,1) - top-right
      // Vertex 3: (0,1) - top-left
      
      let clickedVertexIndex;
      if (u < 0.5 && v < 0.5) {
        clickedVertexIndex = 0; // Bottom-left vertex
      } else if (u >= 0.5 && v < 0.5) {
        clickedVertexIndex = 1; // Bottom-right vertex
      } else if (u >= 0.5 && v >= 0.5) {
        clickedVertexIndex = 2; // Top-right vertex
      } else {
        clickedVertexIndex = 3; // Top-left vertex
      }
      
      const clickedFunction = vertexFunctions[clickedVertexIndex];
      
      // Find which type has this function as dominant (position 0 in stack)
      let clickedType = null;
      for (const type of types) {
        if (mbtiData[type] && mbtiData[type][0] === clickedFunction) {
          clickedType = type;
          break;
        }
      }
      
      console.log(`Clicked vertex ${clickedVertexIndex} (u=${u.toFixed(2)}, v=${v.toFixed(2)})`);
      console.log(`  Function at vertex: ${clickedFunction}`);
      console.log(`  Type with ${clickedFunction} dominant: ${clickedType}`);
      
      if (clickedType) {
        onTypeSelect(clickedType);
      }
    }
  };

  // Use default material when gradient is not needed
  const defaultMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isTopOrBottom ? '#2a2a2a' : '#3a3a3a',
      opacity: 1.0,
      transparent: false,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true
    });
  }, [isTopOrBottom]);

  // Choose which material to use
  const material = isActive && gradientMaterial ? gradientMaterial : defaultMaterial;

  // Force material update by using a unique key that includes face info
  const faceId = types.join('-');
  const meshKey = isActive ? `${faceId}-${selectedType}-active` : `${faceId}-inactive`;

  return (
    <group>
      <mesh 
        key={meshKey}
        ref={meshRef} 
        geometry={geometry}
        material={material}
        onPointerUp={handlePointerUp}
        onPointerOver={(e) => { 
          if (!isTopOrBottom) {
            document.body.style.cursor = 'pointer';
            setIsHovered(true);
          }
        }}
        onPointerOut={(e) => { 
          document.body.style.cursor = 'auto';
          setIsHovered(false);
        }}
      />
      
      {/* Function labels in center of each quadrant - only for side faces */}
      {!isTopOrBottom && vertices.map((vert, idx) => {
        // Find which function this vertex represents
        let func = null;
        for (const [f, coord] of Object.entries(corners)) {
          if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
            func = f;
            break;
          }
        }
        
        if (!func) return null;
        
        return (
          <Text
            key={`func-${idx}`}
            position={functionLabelPositions[idx]}
            fontSize={0.36}
            color="#cccccc"
            anchorX="center"
            anchorY="middle"
            rotation={faceNormal}
            outlineWidth={0.02}
            outlineColor="black"
          >
            {func}
          </Text>
        );
      })}
      
      {/* Type labels for each quadrant - only for side faces */}
      {!isTopOrBottom && types.map((type, idx) => (
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
              fontSize={0.225}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="black"
              rotation={faceNormal}
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  
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
      if (!funcs) {
        // For top/bottom faces, return null
        return null;
      }
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
    // For faces that need reversed winding, we reverse the vertices AND adjust the type mapping
    const niFeTiSeVerts = orderFaceVertices(['Ni', 'Fe', 'Ti', 'Se']);
    const niTeFiSeVerts = orderFaceVertices(['Ni', 'Te', 'Fi', 'Se']);
    
    const quadrantFaces = {
      'Ni-Fe-Ti-Se': {
        vertices: [...niFeTiSeVerts].reverse(), // Reverse winding order for correct face normal
        types: ['ISTP', 'ENFJ', 'INFJ', 'ESTP'] // Types in reversed vertex order
      },
      'Ni-Te-Fi-Se': {
        vertices: [...niTeFiSeVerts].reverse(), // Reverse winding order for correct face normal
        types: ['INTJ', 'ENTJ', 'ISFP', 'ESFP'] // Types in reversed vertex order
      },
      'Ne-Te-Fi-Si': {
        vertices: orderFaceVertices(['Ne', 'Te', 'Fi', 'Si']),
        types: ['INFP', 'ESTJ', 'ISTJ', 'ENFP'] // Fi, Te, Si, Ne order
      },
      'Ne-Fe-Ti-Si': {
        vertices: orderFaceVertices(['Ne', 'Fe', 'Ti', 'Si']),
        types: ['INTP', 'ENTP', 'ISFJ', 'ESFJ'] // Ti, Ne, Si, Fe order
      },
      // Top face (Y = 1.5) - Functions with Y = 1.5: Ni, Fe, Te, Si
      'top': {
        vertices: [
          corners['Ni'], // [-1.5, 1.5, -1.5]
          corners['Fe'], // [-1.5, 1.5, 1.5]
          corners['Si'], // [1.5, 1.5, 1.5]
          corners['Te']  // [1.5, 1.5, -1.5]
        ], // Counter-clockwise when viewed from above
        types: [] // No types on top/bottom
      },
      // Bottom face (Y = -1.5) - Functions with Y = -1.5: Se, Ti, Fi, Ne
      'bottom': {
        vertices: [
          corners['Se'], // [-1.5, -1.5, -1.5]
          corners['Fi'], // [1.5, -1.5, -1.5]
          corners['Ne'], // [1.5, -1.5, 1.5]
          corners['Ti']  // [-1.5, -1.5, 1.5]
        ],
        types: [] // No types on top/bottom
      }
    };
    return quadrantFaces;
  }, [corners, mbtiData]);
  
  const activeFunctions = useMemo(() => 
    selectedType ? getActiveFunctions(selectedType) : [],
    [selectedType, getActiveFunctions]
  );
  
  const handleTypeSelect = (type) => {
    // Only select if not dragging
    if (!isDragging) {
      setSelectedType(type);
      setAutoRotate(false);
    }
  };
  
  // Global pointer handlers for drag detection
  const handlePointerDown = (e) => {
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
  
  const handlePointerUp = () => {
    setDragStart(null);
    // Only reset dragging if we didn't actually drag
    if (!isDragging) {
      setIsDragging(false);
    } else {
      // Reset drag state after a frame to prevent immediate re-selection
      requestAnimationFrame(() => {
        setIsDragging(false);
      });
    }
  };
  
  return (
    <group 
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <ambientLight intensity={0.7} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      
      <group ref={groupRef}>
        {edges.map(([start, end], idx) => (
          <CubeEdge
            key={idx}
            start={corners[start]}
            end={corners[end]}
          />
        ))}
        
        {Object.entries(faces).map(([quadrant, { vertices, types }]) => {
          const isActive = types.includes(selectedType);
          
          // Skip faces with no vertices (shouldn't happen but let's check)
          if (!vertices || vertices.length === 0) {
            console.warn(`Face ${quadrant} has no vertices!`);
            return null;
          }
          
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
                isDragging={isDragging}
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
    </group>
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