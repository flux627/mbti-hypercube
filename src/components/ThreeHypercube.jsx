import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line, Box, Plane, Billboard } from '@react-three/drei';
import * as THREE from 'three';

// Helper to map MBTI type to face and position information
const getTypeMapping = (type) => {
  const mappings = {
    // Face 0: Ni-Fe-Ti-Se
    'INFJ': { face: 0, faceType: 0, functions: ['Ni', 'Fe', 'Ti', 'Se'], quadrant: 'top-left', dominant: 'Ni', position: 0 },
    'ENFJ': { face: 0, faceType: 0, functions: ['Ni', 'Fe', 'Ti', 'Se'], quadrant: 'top-right', dominant: 'Fe', position: 1 },
    'ISTP': { face: 0, faceType: 0, functions: ['Ni', 'Fe', 'Ti', 'Se'], quadrant: 'bottom-right', dominant: 'Ti', position: 2 },
    'ESTP': { face: 0, faceType: 0, functions: ['Ni', 'Fe', 'Ti', 'Se'], quadrant: 'bottom-left', dominant: 'Se', position: 3 },
    
    // Face 1: Ni-Te-Fi-Se
    'INTJ': { face: 1, faceType: 1, functions: ['Ni', 'Te', 'Fi', 'Se'], quadrant: 'top-left', dominant: 'Ni', position: 0 },
    'ENTJ': { face: 1, faceType: 1, functions: ['Ni', 'Te', 'Fi', 'Se'], quadrant: 'top-right', dominant: 'Te', position: 1 },
    'ISFP': { face: 1, faceType: 1, functions: ['Ni', 'Te', 'Fi', 'Se'], quadrant: 'bottom-right', dominant: 'Fi', position: 2 },
    'ESFP': { face: 1, faceType: 1, functions: ['Ni', 'Te', 'Fi', 'Se'], quadrant: 'bottom-left', dominant: 'Se', position: 3 },
    
    // Face 2: Ne-Te-Fi-Si
    'INFP': { face: 2, faceType: 2, functions: ['Ne', 'Te', 'Fi', 'Si'], quadrant: 'bottom-right', dominant: 'Fi', position: 2 },
    'ENFP': { face: 2, faceType: 2, functions: ['Ne', 'Te', 'Fi', 'Si'], quadrant: 'top-left', dominant: 'Ne', position: 0 },
    'ISTJ': { face: 2, faceType: 2, functions: ['Ne', 'Te', 'Fi', 'Si'], quadrant: 'bottom-left', dominant: 'Si', position: 3 },
    'ESTJ': { face: 2, faceType: 2, functions: ['Ne', 'Te', 'Fi', 'Si'], quadrant: 'top-right', dominant: 'Te', position: 1 },
    
    // Face 3: Ne-Fe-Ti-Si
    'INTP': { face: 3, faceType: 3, functions: ['Ne', 'Fe', 'Ti', 'Si'], quadrant: 'bottom-right', dominant: 'Ti', position: 2 },
    'ENTP': { face: 3, faceType: 3, functions: ['Ne', 'Fe', 'Ti', 'Si'], quadrant: 'top-left', dominant: 'Ne', position: 0 },
    'ISFJ': { face: 3, faceType: 3, functions: ['Ne', 'Fe', 'Ti', 'Si'], quadrant: 'bottom-left', dominant: 'Si', position: 3 },
    'ESFJ': { face: 3, faceType: 3, functions: ['Ne', 'Fe', 'Ti', 'Si'], quadrant: 'top-right', dominant: 'Fe', position: 1 }
  };
  
  return mappings[type];
};

// Helper to determine gradient colors based on type
const getGradientColors = (type) => {
  const colors = {
    red: new THREE.Color('#ff0000'),
    blue: new THREE.Color('#0000ff'),
    orange: new THREE.Color('#ff8a00'),
    cyan: new THREE.Color('#00aeff')
  };
  
  // Direct mapping for each type based on tested configurations
  const gradientMappings = {
    // Face 0: Ni-Fe-Ti-Se
    'INFJ': { 
      color1Start: colors.red, color1End: colors.blue,
      color2Start: colors.orange, color2End: colors.cyan,
      faceType: 0
    },
    'ENFJ': { 
      color1Start: colors.orange, color1End: colors.cyan,
      color2Start: colors.red, color2End: colors.blue,
      faceType: 0
    },
    'ISTP': { 
      color1Start: colors.cyan, color1End: colors.orange,
      color2Start: colors.blue, color2End: colors.red,
      faceType: 0
    },
    'ESTP': { 
      color1Start: colors.blue, color1End: colors.red,
      color2Start: colors.cyan, color2End: colors.orange,
      faceType: 0
    },
    
    // Face 1: Ni-Te-Fi-Se
    'INTJ': { 
      color1Start: colors.orange, color1End: colors.cyan,
      color2Start: colors.red, color2End: colors.blue,
      faceType: 1
    },
    'ENTJ': { 
      color1Start: colors.red, color1End: colors.blue,
      color2Start: colors.orange, color2End: colors.cyan,
      faceType: 1
    },
    'ISFP': { 
      color1Start: colors.blue, color1End: colors.red,
      color2Start: colors.cyan, color2End: colors.orange,
      faceType: 1
    },
    'ESFP': { 
      color1Start: colors.cyan, color1End: colors.orange,
      color2Start: colors.blue, color2End: colors.red,
      faceType: 1
    },
    
    // Face 2: Ne-Te-Fi-Si
    'INFP': { 
      color1Start: colors.red, color1End: colors.blue,
      color2Start: colors.orange, color2End: colors.cyan,
      faceType: 2
    },
    'ENFP': { 
      color1Start: colors.orange, color1End: colors.cyan,
      color2Start: colors.red, color2End: colors.blue,
      faceType: 2
    },
    'ISTJ': { 
      color1Start: colors.cyan, color1End: colors.orange,
      color2Start: colors.blue, color2End: colors.red,
      faceType: 2
    },
    'ESTJ': { 
      color1Start: colors.blue, color1End: colors.red,
      color2Start: colors.cyan, color2End: colors.orange,
      faceType: 2
    },
    
    // Face 3: Ne-Fe-Ti-Si
    'INTP': { 
      color1Start: colors.red, color1End: colors.blue,
      color2Start: colors.orange, color2End: colors.cyan,
      faceType: 3
    },
    'ENTP': { 
      color1Start: colors.orange, color1End: colors.cyan,
      color2Start: colors.red, color2End: colors.blue,
      faceType: 3
    },
    'ISFJ': { 
      color1Start: colors.cyan, color1End: colors.orange,
      color2Start: colors.blue, color2End: colors.red,
      faceType: 3
    },
    'ESFJ': { 
      color1Start: colors.blue, color1End: colors.red,
      color2Start: colors.cyan, color2End: colors.orange,
      faceType: 3
    }
  };
  
  return gradientMappings[type] || null;
};

// Helper to determine face adjacency relationships
const getFaceAdjacency = (selectedFaceTypes, allFaces) => {
  // Map which faces share edges with which faces
  // Debug logging
  // Removed adjacency logging
  
  const adjacencyMap = {
    // Face 0: Ni-Fe-Ti-Se (contains INFJ, ENFJ, ISTP, ESTP)
    'ENFJ,ESTP,INFJ,ISTP': {
      left: 'ENTJ,ESFP,INTJ,ISFP',   // Ni-Te-Fi-Se (shares Ni-Se edge) - should show red-blue (dominant)
      right: 'ENTP,ESFJ,INTP,ISFJ',  // Ne-Fe-Ti-Si (shares Fe-Ti edge) - should show orange-cyan (auxiliary)
    },
    // Face 1: Ni-Te-Fi-Se  
    'ENTJ,ESFP,INTJ,ISFP': {
      left: 'ENFP,ESTJ,INFP,ISTJ',   // Ne-Te-Fi-Si (shares Te-Fi edge)
      right: 'ENFJ,ESTP,INFJ,ISTP',  // Ni-Fe-Ti-Se (shares Ni-Se edge)
    },
    // Face 2: Ne-Te-Fi-Si
    'ENFP,ESTJ,INFP,ISTJ': {
      left: 'ENTP,ESFJ,INTP,ISFJ',   // Ne-Fe-Ti-Si (shares Ne-Si edge)
      right: 'ENTJ,ESFP,INTJ,ISFP',  // Ni-Te-Fi-Se (shares Te-Fi edge)
    },
    // Face 3: Ne-Fe-Ti-Si
    'ENTP,ESFJ,INTP,ISFJ': {
      left: 'ENFJ,ESTP,INFJ,ISTP',   // Ni-Fe-Ti-Se (shares Fe-Ti edge)
      right: 'ENFP,ESTJ,INFP,ISTJ',  // Ne-Te-Fi-Si (shares Ne-Si edge)
    }
  };
  
  const selectedKey = selectedFaceTypes.sort().join(',');
  const adjacency = adjacencyMap[selectedKey] || {};
  
  // Removed adjacency mapping logs
  
  const result = {};
  
  // Check each face in allFaces to see if it's adjacent
  for (const [faceKey, faceData] of Object.entries(allFaces)) {
    if (!faceData.types) continue;
    
    const faceTypes = faceData.types.sort().join(',');
    
    if (faceTypes === adjacency.left) {
      result[faceKey] = { isAdjacent: true, relationship: 'left' };
      // Left adjacent face found
    } else if (faceTypes === adjacency.right) {
      result[faceKey] = { isAdjacent: true, relationship: 'right' };
      // Right adjacent face found
    }
  }
  
  // Check for top/bottom faces (they don't have types array)
  for (const [faceKey, faceData] of Object.entries(allFaces)) {
    if (!faceData.types || faceData.types.length === 0) {
      // This is a top or bottom face
      const ys = new Set(faceData.vertices.map(v => v[1]));
      if (ys.size === 1) {
        const y = Array.from(ys)[0];
        if (y > 0) {
          result[faceKey] = { isTop: true };
        } else {
          result[faceKey] = { isBottom: true };
        }
      }
    }
  }
  
  return result;
};

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
  uniform float faceType;
  
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vec3 finalColor;
    float t;
    vec3 gradient1, gradient2;
    
    if (faceType > 2.5) {
      // Face type 3 (Ne-Fe-Ti-Si)
      // This face has horizontal divider, need to rotate to vertical
      // Use vUv.y for column split, vUv.x for gradient direction
      t = 1.0 - vUv.y;  // gradient along horizontal axis
      
      // Create vertical gradients by using horizontal position for mixing
      vec3 leftGradient = mix(colorStart1, colorEnd1, vUv.y);
      vec3 rightGradient = mix(colorStart2, colorEnd2, vUv.y);
      
      // Split vertically based on x position (flipped)
      if (vUv.x > 0.5) {
        finalColor = rightGradient;  // LEFT column (swapped)
      } else {
        finalColor = leftGradient;  // RIGHT column (swapped)
      }
    } else if (faceType > 1.5) {
      // Face type 2 (Ne-Te-Fi-Si)
      // Need vertical divider with vertical gradients
      // Since UV coordinates are rotated, use vUv.x for vertical gradients
      t = vUv.x;  // flip gradient direction (bottom to top)
      gradient1 = mix(colorStart1, colorEnd1, t);
      gradient2 = mix(colorStart2, colorEnd2, t);
      
      if (vUv.y > 0.5) {
        finalColor = gradient2;  // LEFT column (switched)
      } else {
        finalColor = gradient1;  // RIGHT column (switched)
      }
    } else if (faceType > 0.5) {
      // Face type 1 (Ni-Te-Fi-Se)
      // The UVs are calculated differently, resulting in horizontal gradients
      // We need to rotate the logic
      
      // Use vUv.y for vertical gradients (since it varies left-right)
      // vUv.y goes from 1 (left) to 0 (right)
      t = vUv.y;  // 1 at left, 0 at right - use as-is for top-to-bottom effect
      gradient1 = mix(colorStart1, colorEnd1, t);
      gradient2 = mix(colorStart2, colorEnd2, t);
      
      // Use vUv.x to split into columns (since it varies top-bottom)  
      if (vUv.x < 0.5) {
        // TOP half becomes RIGHT column
        finalColor = gradient2;
      } else {
        // BOTTOM half becomes LEFT column
        finalColor = gradient1;
      }
    } else {
      // Face type 0 (Ni-Fe-Ti-Se): Works correctly
      t = 1.0 - vUv.x;  // Flip: 1 at top, 0 at bottom
      gradient1 = mix(colorStart1, colorEnd1, t);
      gradient2 = mix(colorStart2, colorEnd2, t);
      
      if (vUv.y > 0.5) {
        finalColor = gradient1;
      } else {
        finalColor = gradient2;
      }
    }
    
    gl_FragColor = vec4(finalColor, opacity);
  }
`;

// Shader for adjacent vertical gradient columns with transparency fade
const adjacentVerticalShader = `
  uniform vec3 colorStart;
  uniform vec3 colorEnd;
  uniform float fadeDirection; // 1.0 for left-to-right fade, -1.0 for right-to-left
  uniform float columnPosition; // 0.0 for left column, 1.0 for right column
  uniform float flipGradient; // 1.0 to flip gradient direction
  uniform float rotateGradient; // 1.0 to rotate 90 degrees clockwise
  
  varying vec2 vUv;
  
  void main() {
    vec2 uv = vUv;
    
    // Apply 90 degree clockwise rotation if needed
    if (rotateGradient > 0.5) {
      // 90 degrees clockwise: new_x = 1 - old_y, new_y = old_x
      uv = vec2(1.0 - vUv.y, vUv.x);
    }
    
    // Vertical gradient - flip if needed for face orientation
    float gradientT = flipGradient > 0.5 ? (1.0 - uv.y) : uv.y;
    vec3 gradientColor = mix(colorStart, colorEnd, gradientT);
    
    // Calculate position within the column (0 to 1 within the half)
    float columnU;
    if (columnPosition < 0.5) {
      // Left column
      columnU = uv.x * 2.0; // Map 0-0.5 to 0-1
    } else {
      // Right column
      columnU = (uv.x - 0.5) * 2.0; // Map 0.5-1 to 0-1
    }
    
    // Horizontal opacity fade within the column
    float opacity;
    if (fadeDirection > 0.0) {
      // Fade from left to right within column
      opacity = 1.0 - columnU;
    } else {
      // Fade from right to left within column
      opacity = columnU;
    }
    
    // Show gradient only in the specified column
    float columnMask;
    if (columnPosition < 0.5) {
      // Left column - show on left half
      columnMask = uv.x < 0.5 ? 1.0 : 0.0;
    } else {
      // Right column - show on right half
      columnMask = uv.x >= 0.5 ? 1.0 : 0.0;
    }
    
    // Mix gradient color with black based on opacity
    vec3 finalColor = mix(vec3(0.0, 0.0, 0.0), gradientColor, opacity);
    
    // Apply column mask for visibility
    float finalOpacity = columnMask;
    gl_FragColor = vec4(finalColor, finalOpacity);
  }
`;

// Shader for top/bottom solid colors with transparency fade
const solidColorFadeShader = `
  uniform vec3 colorLeft;
  uniform vec3 colorRight;
  uniform float fadeDirection; // 1.0 for bottom-to-top, -1.0 for top-to-bottom
  uniform float isBottomFace; // 1.0 for bottom face, 0.0 for top face
  uniform float rotateMode; // 1.0 for clockwise, -1.0 for counter-clockwise, 0.0 for none
  
  varying vec2 vUv;
  
  void main() {
    // Adjust UV coordinates based on face and rotation mode
    vec2 adjustedUV = vUv;
    vec3 color;
    
    // Apply rotations based on mode
    if (isBottomFace > 0.5) {
      // Bottom face
      if (rotateMode > 0.5) {
        // Ne-Fe-Ti-Si selected: apply 90 clockwise from current normal position
        // Normal bottom has no rotation, so from there apply 90 CW
        // But we need to go from no rotation to 90 CW
        // Try going to 180 degrees first
        adjustedUV = vec2(1.0 - vUv.x, 1.0 - vUv.y);
        color = adjustedUV.x < 0.5 ? colorLeft : colorRight;
      } else {
        // Normal bottom face: no rotation from base
        adjustedUV = vUv;
        color = adjustedUV.x < 0.5 ? colorRight : colorLeft;
      }
    } else {
      // Top face
      if (rotateMode > 1.5) {
        // Ne-Fe-Ti-Si selected: apply 270 degree rotation (90 clockwise)
        adjustedUV = vec2(1.0 - vUv.y, vUv.x);
        color = adjustedUV.x < 0.5 ? colorLeft : colorRight;
      } else if (rotateMode < -0.5) {
        // Old counter-clockwise rotation (not used anymore)
        adjustedUV = vec2(vUv.y, 1.0 - vUv.x);
        color = adjustedUV.x < 0.5 ? colorLeft : colorRight;
      } else {
        // Normal top face: rotate 180 degrees
        adjustedUV = vec2(1.0 - vUv.x, 1.0 - vUv.y);
        color = adjustedUV.x < 0.5 ? colorRight : colorLeft;
      }
    }
    
    // Vertical opacity fade (only one row)
    float opacity;
    float rowHeight = 0.5; // Half height for one row (was 0.25, now 0.5)
    
    if (fadeDirection > 0.0) {
      // Fade from bottom to top (for top face)
      if (adjustedUV.y < (1.0 - rowHeight)) {
        opacity = 0.0;
      } else {
        opacity = (adjustedUV.y - (1.0 - rowHeight)) / rowHeight;
      }
    } else {
      // Fade from top to bottom (for bottom face)
      if (adjustedUV.y > rowHeight) {
        opacity = 0.0;
      } else {
        opacity = (rowHeight - adjustedUV.y) / rowHeight;
      }
    }
    
    // Mix color with black based on opacity
    vec3 finalColor = mix(vec3(0.0, 0.0, 0.0), color, opacity);
    
    // Use full opacity for the visible parts (we're controlling the fade through color mixing)
    float finalOpacity = opacity > 0.0 ? 1.0 : 0.0;
    gl_FragColor = vec4(finalColor, finalOpacity);
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
  // Logging removed - comparison happens in click handler
  
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

const CubeFace = ({ vertices, quadrant, types, selectedType, onTypeSelect, mbtiData, corners, isTopOrBottom, isDragging, adjacencyInfo }) => {
  const meshRef = useRef();
  const { camera } = useThree();
  const [isHovered, setIsHovered] = useState(false);
  
  const isActive = types.includes(selectedType) && !isTopOrBottom;
  const hasAdjacencyEffect = adjacencyInfo && (adjacencyInfo.isAdjacent || adjacencyInfo.isTop || adjacencyInfo.isBottom);
  
  // Create gradient material for selected faces with correct uniforms
  const [gradientMaterial, setGradientMaterial] = useState(null);
  const [adjacencyMaterial, setAdjacencyMaterial] = useState(null);
  
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
            // Removed vertex logging to reduce noise
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
      
      // Material creation details removed from logs
      
      // Calculate what we expect to see
      const expectedVisual = `${selectedType} should show: TOP=${stack[1]}->${stack[2]} (orange->cyan), BOTTOM=${stack[0]}->${stack[3]} (red->blue)`;
      // Expected visual logging removed
      
      // Create a new material with the correct gradient positions
      // Add unique ID to track material instances
      const materialId = `${types.join(',')}-${selectedType}-${Date.now()}`;
      // Material ID logging removed
      
      // Based on the logs, we need to swap gradients for certain types
      // The issue is that the function positions change, affecting which gradient goes where
      
      // Determine face type based on which types are on this face
      let faceType = 0;
      if (types.includes('INTJ') || types.includes('ENTJ')) {
        faceType = 1; // Face 2: Ni-Te-Fi-Se
      } else if (types.includes('INFP') || types.includes('ENFP')) {
        faceType = 2; // Face 3: Ne-Te-Fi-Si
      } else if (types.includes('INTP') || types.includes('ENTP')) {
        faceType = 3; // Face 4: Ne-Fe-Ti-Si
      }
      // Removed face type logging to reduce noise
      
      // Determine gradient colors based on the selected type
      let color1Start, color1End, color2Start, color2End;
      
      // Try using the helper first
      const gradientConfig = getGradientColors(selectedType);
      if (gradientConfig) {
        ({ color1Start, color1End, color2Start, color2End } = gradientConfig);
        // faceType is already set above
      } else {
        // Fallback to manual configuration if helper doesn't have the type
        if (selectedType === 'INFJ') {
        // INFJ: Left=Dominant(red->blue), Right=Auxiliary(orange->cyan)
        color1Start = new THREE.Color('#ff0000');  // Red
        color1End = new THREE.Color('#0000ff');    // Blue
        color2Start = new THREE.Color('#ff8a00');  // Orange
        color2End = new THREE.Color('#00aeff');    // Cyan
      } else if (selectedType === 'ENFJ') {
        // ENFJ: Left=Auxiliary(orange->cyan), Right=Dominant(red->blue)
        color1Start = new THREE.Color('#ff8a00');  // Orange
        color1End = new THREE.Color('#00aeff');    // Cyan
        color2Start = new THREE.Color('#ff0000');  // Red
        color2End = new THREE.Color('#0000ff');    // Blue
      } else if (selectedType === 'ISTP') {
        // ISTP: Like ENFJ but with gradients inverted (bottom to top)
        color1Start = new THREE.Color('#00aeff');  // Cyan (start at bottom)
        color1End = new THREE.Color('#ff8a00');    // Orange (end at top)
        color2Start = new THREE.Color('#0000ff');  // Blue (start at bottom)
        color2End = new THREE.Color('#ff0000');    // Red (end at top)
      } else if (selectedType === 'ESTP') {
        // ESTP: Like INFJ but with gradients inverted (bottom to top)
        color1Start = new THREE.Color('#0000ff');  // Blue (start at bottom)
        color1End = new THREE.Color('#ff0000');    // Red (end at top)
        color2Start = new THREE.Color('#00aeff');  // Cyan (start at bottom)
        color2End = new THREE.Color('#ff8a00');    // Orange (end at top)
      }
      // Face 2: Ni-Te-Fi-Se
      // Note: The shader assigns gradient1 to left, gradient2 to right
      // But the visual appearance might be swapped
      else if (selectedType === 'INTJ') {
        // INTJ (top right): Right=Red->Blue, Left=Orange->Cyan (top to bottom)
        // Since gradient1 goes to left, gradient2 goes to right:
        color1Start = new THREE.Color('#ff8a00');  // Orange (left)
        color1End = new THREE.Color('#00aeff');    // Cyan (left)
        color2Start = new THREE.Color('#ff0000');  // Red (right)
        color2End = new THREE.Color('#0000ff');    // Blue (right)
      } else if (selectedType === 'ENTJ') {
        // ENTJ (top left): Swap columns from INTJ
        color1Start = new THREE.Color('#ff0000');  // Red (left)
        color1End = new THREE.Color('#0000ff');    // Blue (left)
        color2Start = new THREE.Color('#ff8a00');  // Orange (right)
        color2End = new THREE.Color('#00aeff');    // Cyan (right)
      } else if (selectedType === 'ISFP') {
        // ISFP (bottom left): Left=Red->Blue, Right=Orange->Cyan (bottom to top)
        color1Start = new THREE.Color('#0000ff');  // Blue (left, start at bottom)
        color1End = new THREE.Color('#ff0000');    // Red (left, end at top)
        color2Start = new THREE.Color('#00aeff');  // Cyan (right, start at bottom)
        color2End = new THREE.Color('#ff8a00');    // Orange (right, end at top)
      } else if (selectedType === 'ESFP') {
        // ESFP (bottom right): Right=Red->Blue, Left=Orange->Cyan (bottom to top)
        color1Start = new THREE.Color('#00aeff');  // Cyan (left, start at bottom)
        color1End = new THREE.Color('#ff8a00');    // Orange (left, end at top)
        color2Start = new THREE.Color('#0000ff');  // Blue (right, start at bottom)
        color2End = new THREE.Color('#ff0000');    // Red (right, end at top)
      }
      // Face 3: Ne-Te-Fi-Si (INFP, ENFP, ISTJ, ESTJ)
      else if (selectedType === 'INFP') {
        // INFP: Fi-Ne-Si-Te
        // Test with actual gradient colors
        color1Start = new THREE.Color('#ff0000');  // Red
        color1End = new THREE.Color('#0000ff');    // Blue
        color2Start = new THREE.Color('#ff8a00');  // Orange
        color2End = new THREE.Color('#00aeff');    // Cyan
      } else if (selectedType === 'ENFP') {
        // ENFP: Ne(dom)-Fi(aux)-Te(ter)-Si(inf)
        // Left column: Auxiliary axis (Fi→Te) = Orange→Cyan
        // Right column: Dominant axis (Ne→Si) = Red→Blue
        color1Start = new THREE.Color('#ff8a00');  // Orange (Fi)
        color1End = new THREE.Color('#00aeff');    // Cyan (Te)
        color2Start = new THREE.Color('#ff0000');  // Red (Ne)
        color2End = new THREE.Color('#0000ff');    // Blue (Si)
      } else if (selectedType === 'ISTJ') {
        // ISTJ: Si(dom)-Te(aux)-Fi(ter)-Ne(inf)
        // Left column: Auxiliary axis (Te→Fi) = Cyan→Orange (inverted)
        // Right column: Dominant axis (Si→Ne) = Blue→Red (inverted)
        color1Start = new THREE.Color('#00aeff');  // Cyan (Te, bottom)
        color1End = new THREE.Color('#ff8a00');    // Orange (Fi, top)
        color2Start = new THREE.Color('#0000ff');  // Blue (Si, bottom)
        color2End = new THREE.Color('#ff0000');    // Red (Ne, top)
      } else if (selectedType === 'ESTJ') {
        // ESTJ: Te(dom)-Si(aux)-Ne(ter)-Fi(inf)
        // Left column: Dominant axis (Te→Fi) = Blue→Red (inverted)
        // Right column: Auxiliary axis (Si→Ne) = Cyan→Orange (inverted)
        color1Start = new THREE.Color('#0000ff');  // Blue (Te, bottom)
        color1End = new THREE.Color('#ff0000');    // Red (Fi, top)
        color2Start = new THREE.Color('#00aeff');  // Cyan (Si, bottom)
        color2End = new THREE.Color('#ff8a00');    // Orange (Ne, top)
      }
      // Face 4: Ne-Fe-Ti-Si (INTP, ENTP, ISFJ, ESFJ)
      else if (selectedType === 'INTP') {
        // INTP: Ti(dom)-Ne(aux)-Si(ter)-Fe(inf)
        // Testing with actual gradient colors
        color1Start = new THREE.Color('#ff0000');  // Red
        color1End = new THREE.Color('#0000ff');    // Blue
        color2Start = new THREE.Color('#ff8a00');  // Orange
        color2End = new THREE.Color('#00aeff');    // Cyan
      } else if (selectedType === 'ENTP') {
        // ENTP: Ne(dom)-Ti(aux)-Fe(ter)-Si(inf)
        // Left column: Auxiliary axis (Ti→Fe) = Orange→Cyan
        // Right column: Dominant axis (Ne→Si) = Red→Blue
        color1Start = new THREE.Color('#ff8a00');  // Orange (Ti)
        color1End = new THREE.Color('#00aeff');    // Cyan (Fe)
        color2Start = new THREE.Color('#ff0000');  // Red (Ne)
        color2End = new THREE.Color('#0000ff');    // Blue (Si)
      } else if (selectedType === 'ISFJ') {
        // ISFJ: Si(dom)-Fe(aux)-Ti(ter)-Ne(inf)
        // Left column: Auxiliary axis (Fe→Ti) = Cyan→Orange (inverted)
        // Right column: Dominant axis (Si→Ne) = Blue→Red (inverted)
        color1Start = new THREE.Color('#00aeff');  // Cyan (Fe, bottom)
        color1End = new THREE.Color('#ff8a00');    // Orange (Ti, top)
        color2Start = new THREE.Color('#0000ff');  // Blue (Si, bottom)
        color2End = new THREE.Color('#ff0000');    // Red (Ne, top)
      } else if (selectedType === 'ESFJ') {
        // ESFJ: Fe(dom)-Si(aux)-Ne(ter)-Ti(inf)
        // Left column: Dominant axis (Fe→Ti) = Blue→Red (inverted)
        // Right column: Auxiliary axis (Si→Ne) = Cyan→Orange (inverted)
        color1Start = new THREE.Color('#0000ff');  // Blue (Fe, bottom)
        color1End = new THREE.Color('#ff0000');    // Red (Ti, top)
        color2Start = new THREE.Color('#00aeff');  // Cyan (Si, bottom)
        color2End = new THREE.Color('#ff8a00');    // Orange (Ne, top)
      }
      // Default for other faces (temporary)
      else {
        color1Start = new THREE.Color('#ff0000');
        color1End = new THREE.Color('#0000ff');
        color2Start = new THREE.Color('#ff8a00');
        color2End = new THREE.Color('#00aeff');
      }
      } // End of manual configuration fallback
      
      // Now create the material with the determined colors
      const newMaterial = new THREE.ShaderMaterial({
        uniforms: {
          colorStart1: { value: color1Start },
          colorEnd1: { value: color1End },
          colorStart2: { value: color2Start },
          colorEnd2: { value: color2End },
          gradientStart1: { value: new THREE.Vector2(...gradientStart1) },
          gradientEnd1: { value: new THREE.Vector2(...gradientEnd1) },
          gradientStart2: { value: new THREE.Vector2(...gradientStart2) },
          gradientEnd2: { value: new THREE.Vector2(...gradientEnd2) },
          opacity: { value: 1.0 },
          faceType: { value: faceType }
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
  
  // Create adjacency effect materials
  useEffect(() => {
    if (hasAdjacencyEffect && adjacencyInfo) {
      if (adjacencyInfo.isAdjacent) {
        // Side face with vertical gradient column
        const selectedTypeConfig = getGradientColors(adjacencyInfo.selectedType);
        if (!selectedTypeConfig) return;
        
        // Removed debug logging for adjacency materials
        
        // Determine which gradient to show based on relationship
        let colorStart, colorEnd, fadeDirection, columnPosition, flipGradient;
        
        // Check face orientation - different faces may have different UV orientations
        // Log which types are where to debug the issue
        
        // Check if this is the Ne-Fe-Ti-Si face (contains ENTP, ISFJ) which needs gradient flip
        const needsFlip = types.includes('ENTP') && types.includes('ISFJ');
        flipGradient = needsFlip ? 1.0 : 0.0;
        
        // Check if this is an adjacent face to Ne-Fe-Ti-Si that needs rotation
        const selectedFaceIsNeFeTiSi = adjacencyInfo.selectedFaceTypes && adjacencyInfo.selectedFaceTypes.includes('ENTP');
        const isNiFeTiSeFaceAdjacent = types.includes('INFJ') && types.includes('ENFJ');  // Left adjacent
        const isNeTeFiSiFaceAdjacent = types.includes('INFP') && types.includes('ENFP');  // Right adjacent
        let rotateGradient = 0.0;
        
        if (selectedFaceIsNeFeTiSi && (isNiFeTiSeFaceAdjacent || isNeTeFiSiFaceAdjacent)) {
          // Both adjacent faces to Ne-Fe-Ti-Si need 90 degree clockwise rotation
          rotateGradient = 1.0;
        }
        
        
        // Check which face this is to determine correct column position
        const isNiTeFiSeFace = types.includes('INTJ') && types.includes('ENTJ');
        const isNiFeTiSeFace = types.includes('INFJ') && types.includes('ENFJ');
        
        if (adjacencyInfo.relationship === 'left') {
          // This face is to the LEFT of the selected face
          // Need to determine which gradient based on which edge is shared
          
          // For Ne-Fe-Ti-Si face, left adjacent is Ni-Fe-Ti-Se (shares Fe-Ti edge)
          // For ISFJ/ESFJ, Fe-Ti gradient is in color1
          // For INTP/ENTP, Fe-Ti gradient is in color2
          const isNeFeTiSiFace = adjacencyInfo.selectedFaceTypes && adjacencyInfo.selectedFaceTypes.includes('ENTP');
          
          if (isNeFeTiSiFace) {
            // On Ne-Fe-Ti-Si face, determine which gradient represents Fe-Ti
            const selectedType = adjacencyInfo.selectedType;
            if (selectedType === 'ISFJ' || selectedType === 'ESFJ') {
              // For ISFJ/ESFJ, Fe-Ti is color1
              colorStart = selectedTypeConfig.color1Start;
              colorEnd = selectedTypeConfig.color1End;
            } else if (selectedType === 'INTP') {
              // For INTP, Ti→Fe is dominant (color1: red→blue)
              colorStart = selectedTypeConfig.color1Start;
              colorEnd = selectedTypeConfig.color1End;
            } else if (selectedType === 'ENTP') {
              // For ENTP, Ti→Fe is auxiliary (color1: orange→cyan)
              colorStart = selectedTypeConfig.color1Start;
              colorEnd = selectedTypeConfig.color1End;
            }
          } else {
            // Default behavior for other faces
            colorStart = selectedTypeConfig.color1Start;
            colorEnd = selectedTypeConfig.color1End;
          }
          
          // For certain faces, the shared edge position determines the column
          // Ni-Te-Fi-Se: shared edge is on the left (where INTJ/ENTJ are)
          // Ni-Fe-Ti-Se: shared edge is on the right (where INFJ/ISTP are)
          if (isNiTeFiSeFace) {
            fadeDirection = 1.0; // Fade left-to-right (100% at left, 0% at right)
            columnPosition = 0.0; // Left column of this face
          } else if (isNiFeTiSeFace) {
            fadeDirection = -1.0; // Fade right-to-left (100% at right, 0% at left)
            columnPosition = 1.0; // Right column of this face
          } else {
            // Default: left adjacent shows on right column
            fadeDirection = -1.0; // Fade right-to-left (100% at right, 0% at left)
            columnPosition = 1.0; // Right column of this face
          }
        } else {
          // This face is to the RIGHT of the selected face
          // Need to determine which gradient based on which edge is shared
          
          // For Ne-Fe-Ti-Si face, right adjacent is Ne-Te-Fi-Si (shares Ne-Si edge)
          // For ISFJ/ESFJ, Ne-Si gradient is in color2
          // For INTP/ENTP, Ne-Si gradient is in color1
          const isNeFeTiSiFace = adjacencyInfo.selectedFaceTypes && adjacencyInfo.selectedFaceTypes.includes('ENTP');
          
          if (isNeFeTiSiFace) {
            // On Ne-Fe-Ti-Si face, determine which gradient represents Ne-Si
            const selectedType = adjacencyInfo.selectedType;
            if (selectedType === 'ISFJ' || selectedType === 'ESFJ') {
              // For ISFJ/ESFJ, Ne-Si is color2
              colorStart = selectedTypeConfig.color2Start;
              colorEnd = selectedTypeConfig.color2End;
            } else if (selectedType === 'INTP') {
              // For INTP, Ne→Si is auxiliary (color2: orange→cyan)
              colorStart = selectedTypeConfig.color2Start;
              colorEnd = selectedTypeConfig.color2End;
            } else if (selectedType === 'ENTP') {
              // For ENTP, Ne→Si is dominant (color2: red→blue)
              colorStart = selectedTypeConfig.color2Start;
              colorEnd = selectedTypeConfig.color2End;
            }
          } else {
            // Default behavior for other faces
            colorStart = selectedTypeConfig.color2Start;
            colorEnd = selectedTypeConfig.color2End;
          }
          
          fadeDirection = 1.0; // Fade left-to-right (100% at left, 0% at right)
          columnPosition = 0.0; // Left column of this face
        }
        
        const material = new THREE.ShaderMaterial({
          vertexShader: gradientVertexShader,
          fragmentShader: adjacentVerticalShader,
          uniforms: {
            colorStart: { value: colorStart },
            colorEnd: { value: colorEnd },
            fadeDirection: { value: fadeDirection },
            columnPosition: { value: columnPosition },
            flipGradient: { value: flipGradient },
            rotateGradient: { value: rotateGradient }
          },
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        
        setAdjacencyMaterial(material);
        
        return () => {
          material.dispose();
        };
      } else if (adjacencyInfo.isTop || adjacencyInfo.isBottom) {
        // Top/bottom face with solid colors
        const selectedTypeConfig = getGradientColors(adjacencyInfo.selectedType);
        if (!selectedTypeConfig) return;
        
        let colorLeft, colorRight, fadeDirection, isBottomFace, rotateMode;
        
        // Check if selected face is Ne-Fe-Ti-Si (needs rotation and color swap)
        const selectedFaceIsNeFeTiSi = adjacencyInfo.selectedFaceTypes && adjacencyInfo.selectedFaceTypes.includes('ENTP');
        
        if (adjacencyInfo.isTop) {
          // Use start colors (top of gradients)
          if (selectedFaceIsNeFeTiSi) {
            // For Ne-Fe-Ti-Si face, some types have inverted gradients
            const selectedType = adjacencyInfo.selectedType;
            if (selectedType === 'ISFJ' || selectedType === 'ESFJ') {
              // These types have inverted gradients, so use end colors for top and swap
              colorLeft = selectedTypeConfig.color2End;    // Swapped
              colorRight = selectedTypeConfig.color1End;   // Swapped
            } else {
              // INTP/ENTP use END colors (opposite of ISFJ/ESFJ) and swap
              colorLeft = selectedTypeConfig.color2End;    // Swapped
              colorRight = selectedTypeConfig.color1End;   // Swapped
            }
            rotateMode = 2.0; // 180 degree rotation
            console.log('Top face: applying counter-clockwise rotation for Ne-Fe-Ti-Si');
          } else {
            colorLeft = selectedTypeConfig.color1Start;  // Normal
            colorRight = selectedTypeConfig.color2Start; // Normal
            rotateMode = 0.0; // No rotation
          }
          fadeDirection = 1.0; // Fade bottom-to-top
          isBottomFace = 0.0;
        } else {
          // Use end colors (bottom of gradients)
          if (selectedFaceIsNeFeTiSi) {
            // For Ne-Fe-Ti-Si face, some types have inverted gradients
            const selectedType = adjacencyInfo.selectedType;
            if (selectedType === 'ISFJ' || selectedType === 'ESFJ') {
              // These types have inverted gradients, so use start colors for bottom and swap
              colorLeft = selectedTypeConfig.color2Start;   // Swapped
              colorRight = selectedTypeConfig.color1Start;  // Swapped
            } else {
              // INTP/ENTP use START colors (opposite of ISFJ/ESFJ) and swap
              colorLeft = selectedTypeConfig.color2Start;   // Swapped
              colorRight = selectedTypeConfig.color1Start;   // Swapped
            }
            rotateMode = 1.0; // Clockwise rotation
            console.log('Bottom face: applying clockwise rotation for Ne-Fe-Ti-Si');
          } else {
            colorLeft = selectedTypeConfig.color1End;    // Normal
            colorRight = selectedTypeConfig.color2End;   // Normal
            rotateMode = 0.0; // No rotation
          }
          fadeDirection = -1.0; // Fade top-to-bottom
          isBottomFace = 1.0;
        }
        
        const material = new THREE.ShaderMaterial({
          vertexShader: gradientVertexShader,
          fragmentShader: solidColorFadeShader,
          uniforms: {
            colorLeft: { value: colorLeft },
            colorRight: { value: colorRight },
            fadeDirection: { value: fadeDirection },
            isBottomFace: { value: isBottomFace },
            rotateMode: { value: rotateMode }
          },
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        
        setAdjacencyMaterial(material);
        
        return () => {
          material.dispose();
        };
      }
    } else {
      setAdjacencyMaterial(null);
    }
  }, [hasAdjacencyEffect, adjacencyInfo]);
  
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
    
    // Removed verbose click log to reduce noise
    
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

  // Choose which material to use for base mesh
  const material = isActive && gradientMaterial ? gradientMaterial : 
                   hasAdjacencyEffect && adjacencyMaterial ? adjacencyMaterial : 
                   defaultMaterial;

  // Force material update by using a unique key that includes face info
  const faceId = types.join('-');
  const meshKey = isActive ? `${faceId}-${selectedType}-active` : 
                  hasAdjacencyEffect ? `${faceId}-${selectedType}-adjacent` :
                  `${faceId}-inactive`;

  return (
    <group>
      {/* Base mesh with black background - only for faces with adjacency effects */}
      {hasAdjacencyEffect && (
        <mesh 
          key={`${meshKey}-base`}
          ref={meshRef} 
          geometry={geometry}
          material={defaultMaterial}
          renderOrder={0}
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
      )}
      
      {/* Main mesh for active gradients or adjacency effects */}
      {(isActive || hasAdjacencyEffect) && (() => {
        // Calculate face normal for offset to prevent z-fighting
        const [v0, v1, v2] = vertices;
        const edge1 = new THREE.Vector3(...v1).sub(new THREE.Vector3(...v0));
        const edge2 = new THREE.Vector3(...v2).sub(new THREE.Vector3(...v0));
        const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
        
        // Ensure normal points outward from cube center
        const faceCenter = vertices.reduce((acc, v) => 
          acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
        const faceCenterVec = new THREE.Vector3(...faceCenter);
        if (normal.dot(faceCenterVec) < 0) {
          normal.multiplyScalar(-1);
        }
        
        const offset = hasAdjacencyEffect ? normal.multiplyScalar(0.001) : new THREE.Vector3(0, 0, 0);
        
        return (
          <mesh 
            key={meshKey}
            geometry={geometry}
            material={material}
            renderOrder={1}
            position={[offset.x, offset.y, offset.z]}
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
        );
      })()}
      
      {/* Default mesh for inactive faces without effects */}
      {!isActive && !hasAdjacencyEffect && (
        <mesh 
          key={`${meshKey}-default`}
          ref={meshRef}
          geometry={geometry}
          material={defaultMaterial}
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
      )}
      
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
      {!isTopOrBottom && (() => {
        // Create an ordered types array where each type is at the vertex position 
        // where its dominant function is located
        const orderedTypes = [];
        
        // For each vertex, find which type has its dominant function there
        vertices.forEach(vert => {
          // Find the function at this vertex
          let vertexFunction = null;
          for (const [func, coord] of Object.entries(corners)) {
            if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
              vertexFunction = func;
              break;
            }
          }
          
          // Find which type has this function as dominant (position 0 in stack)
          for (const type of types) {
            if (mbtiData[type] && mbtiData[type][0] === vertexFunction) {
              orderedTypes.push(type);
              break;
            }
          }
        });
        
        return orderedTypes.map((type, idx) => (
          <FaceQuadrant
            key={type}
            position={quadrantPositions[idx]}
            type={type}
            isSelected={type === selectedType}
            onClick={onTypeSelect}
            faceNormal={faceNormal}
            isTopOrBottom={isTopOrBottom}
          />
        ));
      })()}
      
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
        types: ['ENTP', 'ESFJ', 'INTP', 'ISFJ'] // Ne, Fe, Ti, Si vertex order
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
          
          // Determine if this face has adjacency effects
          let adjacencyInfo = null;
          if (!isActive) {
            // Find which face is currently selected
            const selectedFace = Object.entries(faces).find(([_, data]) => 
              data.types && data.types.includes(selectedType)
            );
            
            if (selectedFace) {
              const [selectedQuadrant, selectedData] = selectedFace;
              const adjacencyMap = getFaceAdjacency(selectedData.types, faces);
              
              // Check if current face is adjacent to selected face
              if (adjacencyMap[quadrant]) {
                adjacencyInfo = {
                  ...adjacencyMap[quadrant],
                  selectedType: selectedType,
                  selectedFaceTypes: selectedData.types
                };
              } else if (isTopOrBottom) {
                // Top/bottom faces should show gradient effects when any face is selected
                const y = vertices[0][1]; // All vertices have same y for top/bottom
                adjacencyInfo = {
                  isTop: y > 0,
                  isBottom: y < 0,
                  selectedType: selectedType,
                  selectedFaceTypes: selectedData.types
                };
              }
            }
          }
          
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
                adjacencyInfo={adjacencyInfo}
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