import React from 'react';
import { groups } from '../data/mbtiData';
import { TYPE_STACKS } from '../lib/cubeModel.js';

const shorthand = type => TYPE_STACKS[type][0] + TYPE_STACKS[type][1];

function TypeSelector({ selectedType, onTypeChange }) {
  return (
    <select
      id="typeSel"
      value={selectedType}
      onChange={(e) => onTypeChange(e.target.value)}
    >
      {groups.map((group, groupIndex) => (
        <optgroup key={groupIndex} label={group.label}>
          {group.types.slice()
            .sort((a, b) => shorthand(a).localeCompare(shorthand(b)))
            .map(type => (
              <option key={type} value={type}>
                {shorthand(type)} ({type})
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export default TypeSelector;
