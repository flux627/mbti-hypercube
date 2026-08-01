// Function stacks in order: Dominant, Auxiliary, Tertiary, Inferior.
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

// Types grouped by shared function set — one group per cube face.
export const groups = [
  { label: 'Functions: {Ni, Fe, Ti, Se}', types: ['INFJ', 'ENFJ', 'ISTP', 'ESTP'] },
  { label: 'Functions: {Ni, Te, Fi, Se}', types: ['INTJ', 'ENTJ', 'ISFP', 'ESFP'] },
  { label: 'Functions: {Fi, Ne, Si, Te}', types: ['INFP', 'ENFP', 'ISTJ', 'ESTJ'] },
  { label: 'Functions: {Ti, Ne, Si, Fe}', types: ['INTP', 'ENTP', 'ISFJ', 'ESFJ'] },
];
