import React, { useEffect, useState } from 'react';
import TypeSelector from './components/TypeSelector';
import CognitiveCube, { EXPONENT_MIN, EXPONENT_MAX } from './components/CognitiveCube';
import { TYPE_STACKS, RANK_COLORS, RANK_NAMES } from './lib/cubeModel.js';
import './App.css';

// View state can be seeded from the URL: ?type=ENTP&yaw=45&spin=0&cam=5,-5,5&n=5
const params = new URLSearchParams(window.location.search);
const initialType = TYPE_STACKS[params.get('type')] ? params.get('type') : 'INFJ';
// n: pole superellipsoid exponent (2 = ellipsoid, higher = sharper corners)
const nParam = Number(params.get('n'));
const exponent = params.has('n') && Number.isFinite(nParam)
  ? Math.min(Math.max(nParam, EXPONENT_MIN), EXPONENT_MAX)
  : 7;
// lines: equator line opacity, 0 (hidden) to 1
const linesParam = Number(params.get('lines'));
const lineOpacity = params.has('lines') && Number.isFinite(linesParam)
  ? Math.min(Math.max(linesParam, 0), 1)
  : 0.1;
// dim: shadow-pole brightness relative to the stack colors
const dimParam = Number(params.get('dim'));
const shadowDim = params.has('dim') && Number.isFinite(dimParam)
  ? Math.min(Math.max(dimParam, 0), 1)
  : 0.73;
// sat: shadow-pole saturation, 1 = full hue, 0 = gray
const satParam = Number(params.get('sat'));
const shadowSat = params.has('sat') && Number.isFinite(satParam)
  ? Math.min(Math.max(satParam, 0), 1)
  : 0.9;
// blend: 1 blends the side faces front-to-back instead of keeping the
// hard pole boundaries
const blendSides = params.get('blend') === '1';
// swap: choreography of the half-cube swap dance
const initialSwapStyle = params.get('swap') === 'hop' ? 'hop' : 'orbit';
// yaw absent → the cube snaps to the selected type's home pose instead
const initialYaw = params.has('yaw')
  ? (Number(params.get('yaw')) || 0) * (Math.PI / 180)
  : null;
const initialSpin = params.get('spin') !== '0';
const camParam = (params.get('cam') || '').split(',').map(Number);
const initialCamera = camParam.length === 3 && camParam.every(Number.isFinite)
  ? camParam
  : [5, 5, 5];

function App() {
  const [selectedType, setSelectedType] = useState(initialType);
  const [swapStyle, setSwapStyle] = useState(initialSwapStyle);

  useEffect(() => {
    const url = new URL(window.location);
    url.searchParams.set('type', selectedType);
    url.searchParams.set('swap', swapStyle);
    window.history.replaceState(null, '', url);
  }, [selectedType, swapStyle]);

  const stack = TYPE_STACKS[selectedType];

  return (
    <div className="app">
      <h2>Cognitive Cube</h2>
      <p className="hint">
        The eight MBTI cognitive functions sit at the corners of a cube, opposites at
        opposite corners. Vertically stacked pairs — Si/Ne, Fe/Ti, Ni/Se, Te/Fi —
        form four continuous poles, kept seamless while every other edge rounds
        off. Each side face carries the four types that share a
        function set, each at the corner of its dominant function. Select a type
        (dropdown, or click a quadrant) to paint the cube: one pole runs
        dominant&nbsp;→&nbsp;inferior, the other auxiliary&nbsp;→&nbsp;tertiary,
        and the shadow poles behind carry the same hues dimmed (ranks 5–8).
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

      <div className="swap-control">
        <b>Swap path:</b>
        <label>
          <input
            type="radio"
            name="swapStyle"
            checked={swapStyle === 'orbit'}
            onChange={() => setSwapStyle('orbit')}
          />
          orbit
        </label>
        <label>
          <input
            type="radio"
            name="swapStyle"
            checked={swapStyle === 'hop'}
            onChange={() => setSwapStyle('hop')}
          />
          hop over
        </label>
      </div>

      <CognitiveCube
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        initialYaw={initialYaw}
        spin={initialSpin}
        cameraPosition={initialCamera}
        exponent={exponent}
        lineOpacity={lineOpacity}
        shadowDim={shadowDim}
        shadowSat={shadowSat}
        blendSides={blendSides}
        swapStyle={swapStyle}
      />
    </div>
  );
}

export default App;
