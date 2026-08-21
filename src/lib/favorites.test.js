import assert from 'node:assert';
import { KIND_FAVORITES, resolveRole, allowedDances } from './favorites.js';

// table shape: mirror favorites select by kind match, turn favorites
// carry only a direction sign
for (const [sig, fav] of Object.entries(KIND_FAVORITES)) {
  const [family] = sig.split('|');
  if (family === 'mirror') assert.strictEqual(fav.match, 'kind', sig);
  if (family === 'turn') assert.ok(fav.dd === 1 || fav.dd === -1, sig);
}

// role resolution against the target face's normal axis
assert.strictEqual(resolveRole('swap-normal', 'z'), 'swap-z');
assert.strictEqual(resolveRole('swap-normal', 'x'), 'swap-x');
assert.strictEqual(resolveRole('swap-lateral', 'z'), 'swap-x');
assert.strictEqual(resolveRole('swap-lateral', 'x'), 'swap-z');
assert.strictEqual(resolveRole('flip', 'x'), 'flip');

// the kind-matching candidate is selected uniquely
const ds90 = [
  { name: 'swap-x', deg: 90, cls: 'up' },
  { name: 'swap-z', deg: 90, cls: 'down' },
  { name: 'flip', deg: 180, cls: 'vertical' },
];
assert.deepStrictEqual(
  allowedDances(KIND_FAVORITES['mirror|90|up'], ds90, 90, 'up', 'x'),
  ['swap-x'],
);
assert.deepStrictEqual(
  allowedDances(KIND_FAVORITES['mirror|90|down'], ds90, 90, 'down', 'x'),
  ['swap-z'],
);

// a tie of two matching swaps is resolved by the favorite's role
const ds180 = [
  { name: 'swap-x', deg: 180, cls: 'diagonal' },
  { name: 'swap-z', deg: 180, cls: 'diagonal' },
  { name: 'flip', deg: 180, cls: 'vertical' },
];
assert.deepStrictEqual(
  allowedDances(KIND_FAVORITES['mirror|180|diagonal'], ds180, 180, 'diagonal', 'z'),
  ['swap-z'],
);
assert.deepStrictEqual(
  allowedDances(KIND_FAVORITES['mirror|180|diagonal'], ds180, 180, 'diagonal', 'x'),
  ['swap-x'],
);

// no favorite (or nothing matching) leaves the dance unconstrained
assert.strictEqual(allowedDances(null, ds90, 90, 'up', 'x'), null);
assert.strictEqual(
  allowedDances(KIND_FAVORITES['mirror|90|up'], ds90, 90, 'left', 'x'),
  null,
);

console.log('favorites: all tests passed');
