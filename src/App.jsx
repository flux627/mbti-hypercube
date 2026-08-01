import React, { useEffect, useState } from 'react';
import TypeSelector from './components/TypeSelector';
import ThreeHypercube from './components/ThreeHypercube';
import { TYPE_STACKS, RANK_COLORS, RANK_NAMES } from './lib/cubeModel.js';
import './App.css';

// View state can be seeded from the URL: ?type=ENTP&yaw=45&spin=0&cam=5,-5,5
const params = new URLSearchParams(window.location.search);
const initialType = TYPE_STACKS[params.get('type')] ? params.get('type') : 'INFJ';
const initialYaw = (Number(params.get('yaw')) || 0) * (Math.PI / 180);
const initialSpin = params.get('spin') !== '0';
const camParam = (params.get('cam') || '').split(',').map(Number);
const initialCamera = camParam.length === 3 && camParam.every(Number.isFinite)
  ? camParam
  : [5, 5, 5];

function App() {
  const [selectedType, setSelectedType] = useState(initialType);

  useEffect(() => {
    const url = new URL(window.location);
    url.searchParams.set('type', selectedType);
    window.history.replaceState(null, '', url);
  }, [selectedType]);

  const stack = TYPE_STACKS[selectedType];

  return (
    <div className="app">
      <h2>MBTI Cognitive-Function Hypercube</h2>
      <p className="hint">
        The eight cognitive functions sit at the corners of a cube, opposites at
        opposite corners. Each side face carries the four types that share a
        function set, each at the corner of its dominant function. Select a type
        (dropdown, or click a quadrant) to paint its face: one column runs
        dominant&nbsp;→&nbsp;inferior, the other auxiliary&nbsp;→&nbsp;tertiary,
        and both spill over the shared edges onto the neighboring faces.
      </p>

      <div className="type-selector-container">
        <label htmlFor="typeSel"><b>Type:</b></label>
        <TypeSelector selectedType={selectedType} onTypeChange={setSelectedType} />
        <span className="legend">
          {stack.map((fn, i) => (
            <span key={fn} className="legend-item">
              <span className="swatch" style={{ background: RANK_COLORS[i] }} />
              {i + 1}&nbsp;{RANK_NAMES[i]}: <b>{fn}</b>
            </span>
          ))}
        </span>
      </div>

      <ThreeHypercube
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        initialYaw={initialYaw}
        spin={initialSpin}
        cameraPosition={initialCamera}
      />
    </div>
  );
}

export default App;
