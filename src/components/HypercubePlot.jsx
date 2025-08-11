import React, { useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';
import { coords, cubeEdges, functions, funcToIdx, typeStacks } from '../data/mbtiData';
import { 
  orderFace, 
  buildFaceNumberAnnotations, 
  buildFunctionLabelAnnotations, 
  buildFaceGridLines 
} from '../utils/hypercubeUtils';

function HypercubePlot({ selectedType }) {
  const stack = typeStacks[selectedType];
  
  const baseTraces = useMemo(() => {
    return cubeEdges.map(([i, j]) => ({
      type: 'scatter3d',
      mode: 'lines',
      x: [coords[i][0], coords[j][0]],
      y: [coords[i][1], coords[j][1]],
      z: [coords[i][2], coords[j][2]],
      line: { width: 1, color: '#888' },
      hoverinfo: 'none',
      showlegend: false
    }));
  }, []);

  const plotData = useMemo(() => {
    const ordered = orderFace(stack.map(fn => funcToIdx[fn]));
    const xs = ordered.map(i => coords[i][0]);
    const ys = ordered.map(i => coords[i][1]);
    const zs = ordered.map(i => coords[i][2]);
    
    const faceTrace = {
      type: 'mesh3d',
      x: xs,
      y: ys,
      z: zs,
      i: [0, 0],
      j: [1, 2],
      k: [2, 3],
      opacity: 0.35,
      color: '#ff7f0e',
      flatshading: true,
      hoverinfo: 'skip',
      showlegend: false
    };

    const grid = buildFaceGridLines(ordered);
    const grid1 = {
      type: 'scatter3d',
      mode: 'lines',
      x: grid.line1.x,
      y: grid.line1.y,
      z: grid.line1.z,
      line: { width: 2, color: '#bbb' },
      hoverinfo: 'none',
      showlegend: false
    };

    const grid2 = {
      type: 'scatter3d',
      mode: 'lines',
      x: grid.line2.x,
      y: grid.line2.y,
      z: grid.line2.z,
      line: { width: 2, color: '#bbb' },
      hoverinfo: 'none',
      showlegend: false
    };

    const markerColors = functions.map(fn => stack.includes(fn) ? '#b22222' : '#1f77b4');
    const markers = {
      type: 'scatter3d',
      mode: 'markers',
      x: coords.map(c => c[0]),
      y: coords.map(c => c[1]),
      z: coords.map(c => c[2]),
      marker: { size: 6, color: markerColors },
      hoverinfo: 'none',
      showlegend: false
    };

    return [...baseTraces, faceTrace, grid1, grid2, markers];
  }, [selectedType, stack, baseTraces]);

  const layout = useMemo(() => {
    const ordered = orderFace(stack.map(fn => funcToIdx[fn]));
    const labelAnns = buildFunctionLabelAnnotations(stack);
    const numAnns = buildFaceNumberAnnotations(stack, ordered);

    return {
      title: 'Type ' + selectedType,
      scene: {
        projection: { type: 'orthographic' },
        aspectmode: 'cube',
        xaxis: { visible: false },
        yaxis: { visible: false },
        zaxis: { visible: false },
        bgcolor: '#ffffff',
        annotations: [...labelAnns, ...numAnns]
      },
      paper_bgcolor: '#ffffff',
      margin: { l: 0, r: 0, t: 40, b: 0 },
      height: 650
    };
  }, [selectedType, stack]);

  return (
    <Plot
      data={plotData}
      layout={layout}
      config={{ displayModeBar: false }}
      style={{ width: '100%', height: '650px' }}
    />
  );
}

export default HypercubePlot;