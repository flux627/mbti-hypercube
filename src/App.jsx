import React, { useState } from 'react';
import TypeSelector from './components/TypeSelector';
import HypercubePlot from './components/HypercubePlot';
import './App.css';

function App() {
  const [selectedType, setSelectedType] = useState('INFJ');

  return (
    <div className="app">
      <h2>MBTI Cognitive‑Function Hypercube</h2>
      <p className="hint">
        Types are grouped by the <em>set</em> of four functions they share (order differs). 
        Selecting a type shades its face and shows <b>1–4</b> on the face's sub‑squares. 
        Corner <b>function labels</b> stay visible, larger, and offset from the corners for legibility.
      </p>
      
      <div className="type-selector-container">
        <label htmlFor="typeSel"><b>Type:</b></label>
        <TypeSelector 
          selectedType={selectedType} 
          onTypeChange={setSelectedType} 
        />
      </div>

      <HypercubePlot selectedType={selectedType} />
    </div>
  );
}

export default App;