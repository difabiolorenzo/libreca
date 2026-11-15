import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nearestCorner } from '../src/ui/corner-editor.js';

const QUAD = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

test('nearestCorner picks the corner a tap without choice moves', () => {
  assert.equal(nearestCorner(QUAD, { x: 0, y: 0 }), 0);
  assert.equal(nearestCorner(QUAD, { x: 0.8, y: 0.2 }), 1);
  assert.equal(nearestCorner(QUAD, { x: 0.6, y: 0.95 }), 2);
  assert.equal(nearestCorner(QUAD, { x: 0.2, y: 0.7 }), 3);
});
