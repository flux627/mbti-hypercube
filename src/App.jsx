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
// p3: paint into the display's full P3 gamut where supported (?p3=0
// reverts to sRGB) — the raw channel values are reinterpreted as Display
// P3, pushing the fully saturated rank colors beyond the sRGB gamut
const wideGamut = params.get('p3') !== '0';
const p3Supported = typeof CSS !== 'undefined'
  && CSS.supports('color', 'color(display-p3 1 1 1)');
// a hex color re-expressed with the same channel values as P3 primaries,
// so the key's swatches match what the wide-gamut canvas shows
const p3 = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `color(display-p3 ${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255})`;
};
const swatchColor = wideGamut && p3Supported ? p3 : (hex) => hex;
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
  : [5.9, 2.5, 5.9];

const shorthand = type => TYPE_STACKS[type][0] + TYPE_STACKS[type][1];

// Which key ranks are on the currently viewed side — its face's four
// corners.
const VIEW_RANKS = {
  Preferred: [1, 2, 3, 4],
  "Dominant's Complement": [1, 4, 6, 7],
  "Auxiliary's Complement": [2, 3, 5, 8],
  Shadow: [5, 6, 7, 8],
};

// The other end of a function's axis: the antipodal function (letter and
// attitude both flipped — Ne↔Si, Ti↔Fe, …).
const FLIP_LETTER = { N: 'S', S: 'N', T: 'F', F: 'T' };
const oppositeFn = fn => FLIP_LETTER[fn[0]] + (fn[1] === 'i' ? 'e' : 'i');

// The related types listed for each viewed side, derived from the selected
// type's dominant/auxiliary pair. Each finder is unique: every function is
// dominant for exactly two types and auxiliary for exactly two.
function relatedForView(type, side) {
  const [dom, aux] = TYPE_STACKS[type];
  const find = pred => Object.keys(TYPE_STACKS).find(t => t !== type && pred(TYPE_STACKS[t]));
  switch (side) {
    case 'Preferred':
      return [
        [find(s => s[0] === aux && s[1] === dom), 'Shares both axes with flipped dominance'],
        [find(s => s[0] === oppositeFn(dom) && s[1] === oppositeFn(aux)),
          'Shares both axes with flipped polarity'],
      ];
    case "Dominant's Complement":
      return [
        [find(s => s[0] === dom), 'Shares dominant axis'],
        [find(s => s[1] === dom && s[0] !== aux), "Auxiliary axis same as parent's dominant"],
      ];
    case "Auxiliary's Complement":
      return [
        [find(s => s[1] === aux), 'Shares auxiliary axis'],
        [find(s => s[0] === aux && s[1] !== dom), "Dominant axis same as parent's auxiliary"],
      ];
    case 'Shadow':
      return [
        [find(s => s[0] === flipAttitude(dom) && s[1] === flipAttitude(aux)),
          'Shares all functions with opposite attitude'],
      ];
    default:
      return [];
  }
}

function App() {
  const [selectedType, setSelectedType] = useState(initialType);
  // which side of the cube fronts the camera, relative to the selected
  // type — seeded with the home pose's answer so the first paint already
  // dims 5-8 instead of flashing all rows bright; the per-frame tracker
  // corrects it immediately when ?yaw= starts the cube elsewhere
  const [viewedSide, setViewedSide] = useState('Preferred');

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
      wideGamut={wideGamut}
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
      </div>
      <div className="overlay">
        <div className="top-row">
          <h1>Cognitive Cube</h1>
          <TypeSelector selectedType={selectedType} onTypeChange={setSelectedType} />
        </div>
        <div className="view-info">
          <div className="view-label">Viewing functions:</div>
          <div className="view-indent face-name">{viewedSide}</div>
          {viewedSide && (
            <>
              <div className="view-label related-label">Related types in this view:</div>
              {relatedForView(selectedType, viewedSide).map(([t, desc]) => (
                <a
                  key={t}
                  className="related-row"
                  href={`?type=${t}`}
                  onClick={(e) => { e.preventDefault(); setSelectedType(t); }}
                >
                  <span className="related-type">{shorthand(t)} ({t})</span>
                  <span className="related-desc"> - {desc}</span>
                </a>
              ))}
            </>
          )}
        </div>
        <div className="legend">
          {keyRows.map(({ rank, fn, color }) => (
            <div
              key={rank}
              className={`legend-row${
                VIEW_RANKS[viewedSide] && !VIEW_RANKS[viewedSide].includes(rank)
                  ? ' out-of-view' : ''}`}
            >
              <span className="rank">{rank}</span>
              <span className="swatch" style={{ background: swatchColor(color) }} />
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
