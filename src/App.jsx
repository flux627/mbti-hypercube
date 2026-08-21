import React, { useEffect, useState } from 'react';
import TypeSelector from './components/TypeSelector';
import CognitiveCube, { EXPONENT_MIN, EXPONENT_MAX, animClock } from './components/CognitiveCube';
import {
  TYPE_STACKS, RANK_COLORS, FUNCTION_NAMES, cornerColor, flipAttitude,
} from './lib/cubeModel.js';
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
const SWAP_STYLES = ['orbit', 'hop', 'planar', 'vertical', 'action-hop'];
const initialSwapStyle = SWAP_STYLES.includes(params.get('swap'))
  ? params.get('swap')
  : 'orbit';
// flip: hand-authored or least-action flip lane
const initialFlipStyle = params.get('flip') === 'action' ? 'action' : 'hand';
// dur: transition duration in seconds (slow-motion review)
const durParam = Number(params.get('dur'));
if (params.has('dur') && Number.isFinite(durParam)) {
  animClock.seconds = Math.min(20, Math.max(0.2, durParam));
}
// bare: render only the cube, no page chrome (for the explorer iframe)
const bare = params.get('bare') === '1';
// to/play: auto-play a transition after load — the cube starts at ?type=
// and selects ?to= after ?play= milliseconds (explorer support)
const autoTo = TYPE_STACKS[params.get('to')] ? params.get('to') : null;
const autoDelay = Number(params.get('play')) || 2500;
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
  // which side of the cube fronts the camera, relative to the selected type
  const [viewedSide, setViewedSide] = useState(null);

  useEffect(() => {
    const url = new URL(window.location);
    url.searchParams.set('type', selectedType);
    window.history.replaceState(null, '', url);
  }, [selectedType]);

  useEffect(() => {
    if (!autoTo) return undefined;
    const id = setTimeout(() => setSelectedType(autoTo), autoDelay);
    return () => clearTimeout(id);
  }, []);

  const stack = TYPE_STACKS[selectedType];

  const cube = (
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
      swapStyle={initialSwapStyle}
      flipStyle={initialFlipStyle}
      onViewedSide={bare ? null : setViewedSide}
    />
  );

  if (bare) return cube;

  // The key: ranks 1–4 are the stack, 5–8 the attitude-flipped shadows,
  // each swatch matching the corner color the cube itself paints.
  const keyRows = [
    ...stack.map((fn, i) => ({ rank: i + 1, fn, color: RANK_COLORS[i] })),
    ...stack.map((fn, i) => {
      const sh = flipAttitude(fn);
      return { rank: i + 5, fn: sh, color: cornerColor(selectedType, sh, shadowDim, shadowSat) };
    }),
  ];

  return (
    <div className="app">
      <div className="cube-layer">{cube}</div>
      <div className="header">
        <div className="type-name">
          {stack[0] + stack[1]} <span className="type-code">({selectedType})</span>
        </div>
        <div className="face-name">{viewedSide}</div>
      </div>
      <div className="overlay">
        <h1>Cognitive Cube</h1>
        <TypeSelector selectedType={selectedType} onTypeChange={setSelectedType} />
        <div className="legend">
          {keyRows.map(({ rank, fn, color }) => (
            <div key={rank} className="legend-row">
              <span className="rank">{rank}</span>
              <span className="swatch" style={{ background: color }} />
              <span className="fname">{FUNCTION_NAMES[fn]}</span>
              <span className="fcode">{fn}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
