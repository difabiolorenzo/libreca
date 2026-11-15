import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_ORIENTATION, normalizeRotation, rotate, toggleMirror, orientedSize, orientationTransform,
} from '../src/lib/orientation.js';

test('normalizeRotation keeps quarter turns in 0..270', () => {
  assert.equal(normalizeRotation(0), 0);
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(360), 0);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(Number.NaN), 0);
  assert.equal(normalizeRotation(/** @type {any} */ ('oops')), 0);
});

test('rotate turns both ways and wraps around', () => {
  assert.equal(rotate(NO_ORIENTATION, 90).rotation, 90);
  assert.equal(rotate(NO_ORIENTATION, -90).rotation, 270);
  let o = NO_ORIENTATION;
  for (let i = 0; i < 4; i++) o = rotate(o, 90);
  assert.deepEqual(o, { rotation: 0, mirror: false });
});

test('toggleMirror flips and keeps the rotation', () => {
  const o = toggleMirror({ rotation: 180, mirror: false });
  assert.deepEqual(o, { rotation: 180, mirror: true });
  assert.deepEqual(toggleMirror(o), { rotation: 180, mirror: false });
});

test('orientedSize swaps sides on a quarter turn', () => {
  assert.deepEqual(orientedSize(1920, 1080, { rotation: 90, mirror: false }), { width: 1080, height: 1920 });
  assert.deepEqual(orientedSize(1920, 1080, { rotation: 180, mirror: true }), { width: 1920, height: 1080 });
});

test('orientationTransform mirrors before rotating', () => {
  assert.equal(orientationTransform(NO_ORIENTATION), 'rotate(0deg)');
  assert.equal(orientationTransform({ rotation: 270, mirror: true }), 'rotate(270deg) scaleX(-1)');
});
