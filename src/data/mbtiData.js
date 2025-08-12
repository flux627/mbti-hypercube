export const coords = [
  [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
  [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1]
];

export const cubeEdges = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5],
  [2, 3], [2, 6], [3, 7], [4, 5], [4, 6],
  [5, 7], [6, 7]
];

export const functions = ["Ni", "Se", "Fe", "Ti", "Te", "Fi", "Si", "Ne"];

export const funcToIdx = {};
functions.forEach((fn, i) => funcToIdx[fn] = i);

export const typeStacks = {
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

export const groups = [
  { label: 'Functions: {Ni, Fe, Ti, Se}', types: ['INFJ', 'ENFJ', 'ISTP', 'ESTP'] },
  { label: 'Functions: {Ni, Te, Fi, Se}', types: ['INTJ', 'ENTJ', 'ISFP', 'ESFP'] },
  { label: 'Functions: {Fi, Ne, Si, Te}', types: ['INFP', 'ENFP', 'ISTJ', 'ESTJ'] },
  { label: 'Functions: {Ti, Ne, Si, Fe}', types: ['INTP', 'ENTP', 'ISFJ', 'ESFJ'] },
];

export const mbtiData = typeStacks;

export const typeToQuadrant = {
  'INFJ': 'Ni-Fe-Ti-Se', 'ENFJ': 'Ni-Fe-Ti-Se', 'ISTP': 'Ni-Fe-Ti-Se', 'ESTP': 'Ni-Fe-Ti-Se',
  'INTJ': 'Ni-Te-Fi-Se', 'ENTJ': 'Ni-Te-Fi-Se', 'ISFP': 'Ni-Te-Fi-Se', 'ESFP': 'Ni-Te-Fi-Se',
  'INFP': 'Ne-Te-Fi-Si', 'ENFP': 'Ne-Te-Fi-Si', 'ISTJ': 'Ne-Te-Fi-Si', 'ESTJ': 'Ne-Te-Fi-Si',
  'INTP': 'Ne-Fe-Ti-Si', 'ENTP': 'Ne-Fe-Ti-Si', 'ISFJ': 'Ne-Fe-Ti-Si', 'ESFJ': 'Ne-Fe-Ti-Si'
};

export const getActiveFunctions = (type) => {
  return typeStacks[type] || [];
};