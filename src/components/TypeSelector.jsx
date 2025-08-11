import React from 'react';
import { groups } from '../data/mbtiData';

function TypeSelector({ selectedType, onTypeChange }) {
  return (
    <select 
      id="typeSel" 
      value={selectedType} 
      onChange={(e) => onTypeChange(e.target.value)}
    >
      {groups.map((group, groupIndex) => (
        <optgroup key={groupIndex} label={group.label}>
          {group.types.slice().sort().map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default TypeSelector;