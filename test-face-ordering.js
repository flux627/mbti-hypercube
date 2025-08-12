// Test file to debug face ordering issues

// MBTI type stacks - each type with its 4-function stack
const mbtiData = {
  "INFJ": ["Ni", "Fe", "Ti", "Se"],
  "ENFJ": ["Fe", "Ni", "Se", "Ti"],
  "ISTP": ["Ti", "Se", "Ni", "Fe"],
  "ESTP": ["Se", "Ti", "Fe", "Ni"],
  "INTJ": ["Ni", "Te", "Fi", "Se"],
  "ENTJ": ["Te", "Ni", "Se", "Fi"],
  "ISFP": ["Fi", "Se", "Ni", "Te"],
  "ESFP": ["Se", "Fi", "Te", "Ni"],
  "INFP": ["Fi", "Ne", "Si", "Te"],
  "ENFP": ["Ne", "Fi", "Te", "Si"],
  "ISTJ": ["Si", "Te", "Fi", "Ne"],
  "ESTJ": ["Te", "Si", "Ne", "Fi"],
  "INTP": ["Ti", "Ne", "Si", "Fe"],
  "ENTP": ["Ne", "Ti", "Fe", "Si"],
  "ISFJ": ["Si", "Fe", "Ti", "Ne"],
  "ESFJ": ["Fe", "Si", "Ne", "Ti"]
};

// The actual 3D coordinates after rotation
const scale = 1.5;
const corners = {
  'Ni': [-1 * scale, 1 * scale, -1 * scale],
  'Se': [-1 * scale, -1 * scale, -1 * scale],
  'Fe': [-1 * scale, 1 * scale, 1 * scale],
  'Ti': [-1 * scale, -1 * scale, 1 * scale],
  'Te': [1 * scale, 1 * scale, -1 * scale],
  'Fi': [1 * scale, -1 * scale, -1 * scale],
  'Si': [1 * scale, 1 * scale, 1 * scale],
  'Ne': [1 * scale, -1 * scale, 1 * scale]
};

// Function to order face vertices counter-clockwise
function orderFaceVertices(funcs, corners) {
  const funcToCoord = {
    'Ni': 0, 'Se': 1, 'Fe': 2, 'Ti': 3, 
    'Te': 4, 'Fi': 5, 'Si': 6, 'Ne': 7
  };
  
  const indices = funcs.map(f => funcToCoord[f]);
  const verts = funcs.map(f => corners[f]);
  
  // Calculate center
  const center = verts.reduce((acc, v) => 
    acc.map((c, i) => c + v[i]), [0, 0, 0]).map(c => c / 4);
  
  // Determine which axis is constant
  const xs = new Set(verts.map(v => v[0]));
  const ys = new Set(verts.map(v => v[1]));
  const zs = new Set(verts.map(v => v[2]));
  const axis = xs.size === 1 ? 'x' : (ys.size === 1 ? 'y' : 'z');
  
  console.log(`Face ${funcs.join('-')}: axis=${axis}, center=[${center.map(c => c.toFixed(1)).join(', ')}]`);
  
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
    const angle = Math.atan2(dy, dx);
    return { func: funcs[idx], v, angle, dx, dy };
  }).sort((a, b) => a.angle - b.angle);
  
  console.log('  Sorted order:');
  sorted.forEach(s => {
    console.log(`    ${s.func}: angle=${(s.angle * 180 / Math.PI).toFixed(1)}°, pos=[${s.v.map(c => c.toFixed(1)).join(', ')}]`);
  });
  
  return sorted.map(s => s.v);
}

// Test each face
console.log('\n=== FACE ANALYSIS ===\n');

const faces = {
  'Ni-Fe-Ti-Se': ['Ni', 'Fe', 'Ti', 'Se'],
  'Ni-Te-Fi-Se': ['Ni', 'Te', 'Fi', 'Se'],
  'Ne-Te-Fi-Si': ['Ne', 'Te', 'Fi', 'Si'],
  'Ne-Fe-Ti-Si': ['Ne', 'Fe', 'Ti', 'Si']
};

// Analyze what types should be at each corner
console.log('\n=== TYPE MAPPING ===\n');

// Group types by dominant function
const typesByDominant = {};
Object.entries(mbtiData).forEach(([type, stack]) => {
  const dominant = stack[0];
  if (!typesByDominant[dominant]) {
    typesByDominant[dominant] = [];
  }
  typesByDominant[dominant].push(type);
});

console.log('Types grouped by dominant function:');
Object.entries(typesByDominant).forEach(([func, types]) => {
  console.log(`  ${func}: ${types.join(', ')}`);
});

// For each face, determine which types belong where
console.log('\n=== FACE TYPE ASSIGNMENTS ===\n');

Object.entries(faces).forEach(([faceName, funcs]) => {
  console.log(`\nFace ${faceName}:`);
  const orderedVerts = orderFaceVertices(funcs, corners);
  
  // Find which function each ordered vertex represents
  console.log('\n  Vertex to Type mapping:');
  orderedVerts.forEach((vert, idx) => {
    // Find which function this vertex represents
    let vertFunc = null;
    for (const [func, coord] of Object.entries(corners)) {
      if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
        vertFunc = func;
        break;
      }
    }
    
    if (vertFunc) {
      // Find types with this dominant function that use all face functions
      const candidates = typesByDominant[vertFunc] || [];
      const matchingType = candidates.find(type => {
        const stack = mbtiData[type];
        return funcs.every(f => stack.includes(f));
      });
      
      console.log(`    Position ${idx}: ${vertFunc} corner → ${matchingType || 'NO MATCH'}`);
    }
  });
});

// Verify the function stacks
console.log('\n=== VERIFICATION ===\n');

const expectedMappings = {
  'Ni-Fe-Ti-Se': {
    'Ni': 'INFJ',  // Ni dominant with Fe-Ti-Se
    'Fe': 'ENFJ',  // Fe dominant with Ni-Se-Ti
    'Ti': 'ISTP',  // Ti dominant with Se-Ni-Fe
    'Se': 'ESTP'   // Se dominant with Ti-Fe-Ni
  },
  'Ni-Te-Fi-Se': {
    'Ni': 'INTJ',  // Ni dominant with Te-Fi-Se
    'Te': 'ENTJ',  // Te dominant with Ni-Se-Fi
    'Fi': 'ISFP',  // Fi dominant with Se-Ni-Te
    'Se': 'ESFP'   // Se dominant with Fi-Te-Ni
  },
  'Ne-Te-Fi-Si': {
    'Ne': 'ENFP',  // Ne dominant with Fi-Te-Si
    'Te': 'ESTJ',  // Te dominant with Si-Ne-Fi
    'Fi': 'INFP',  // Fi dominant with Ne-Si-Te
    'Si': 'ISTJ'   // Si dominant with Te-Fi-Ne
  },
  'Ne-Fe-Ti-Si': {
    'Ne': 'ENTP',  // Ne dominant with Ti-Fe-Si
    'Fe': 'ESFJ',  // Fe dominant with Si-Ne-Ti
    'Ti': 'INTP',  // Ti dominant with Ne-Si-Fe
    'Si': 'ISFJ'   // Si dominant with Fe-Ti-Ne
  }
};

console.log('Expected mappings for each face:');
Object.entries(expectedMappings).forEach(([face, mapping]) => {
  console.log(`\n${face}:`);
  Object.entries(mapping).forEach(([func, type]) => {
    const stack = mbtiData[type];
    console.log(`  ${func} → ${type} (stack: ${stack.join('-')})`);
  });
});

// Now let's verify what the component is actually doing
console.log('\n=== COMPONENT HARDCODED VALUES ===\n');

const componentMappings = {
  'Ni-Fe-Ti-Se': ['ESTP', 'INFJ', 'ENFJ', 'ISTP'], // Se, Ni, Fe, Ti order
  'Ni-Te-Fi-Se': ['ESFP', 'ISFP', 'ENTJ', 'INTJ'], // Se, Fi, Te, Ni order
  'Ne-Te-Fi-Si': ['INFP', 'ESTJ', 'ISTJ', 'ENFP'], // Fi, Te, Si, Ne order
  'Ne-Fe-Ti-Si': ['INTP', 'ENTP', 'ISFJ', 'ESFJ']  // Ti, Ne, Si, Fe order
};

console.log('Current component mappings vs expected:');
Object.entries(faces).forEach(([faceName, funcs]) => {
  console.log(`\n${faceName}:`);
  const orderedVerts = orderFaceVertices(funcs, corners);
  const currentTypes = componentMappings[faceName];
  
  orderedVerts.forEach((vert, idx) => {
    // Find which function this vertex represents
    let vertFunc = null;
    for (const [func, coord] of Object.entries(corners)) {
      if (coord[0] === vert[0] && coord[1] === vert[1] && coord[2] === vert[2]) {
        vertFunc = func;
        break;
      }
    }
    
    const currentType = currentTypes[idx];
    const expectedType = expectedMappings[faceName][vertFunc];
    const match = currentType === expectedType ? '✓' : '✗';
    
    console.log(`  Position ${idx}: ${vertFunc} → Current: ${currentType}, Expected: ${expectedType} ${match}`);
  });
});