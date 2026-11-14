import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  orderCorners, polygonArea, quadSize, toPixels, toNormalized, FULL_QUAD,
  fitLine, lineDistance, intersectLines, refineQuad,
} from '../src/pipeline/geometry.js';

const TL = { x: 10, y: 10 };
const TR = { x: 90, y: 15 };
const BR = { x: 95, y: 80 };
const BL = { x: 5, y: 85 };

test('orderCorners returns TL, TR, BR, BL whatever the input order', () => {
  for (const input of [[TL, TR, BR, BL], [BR, TL, BL, TR], [BL, BR, TR, TL], [TR, BL, TL, BR]]) {
    assert.deepEqual(orderCorners(input), [TL, TR, BR, BL]);
  }
});

test('orderCorners rejects anything but 4 points', () => {
  assert.throws(() => orderCorners([TL, TR, BR]), RangeError);
});

test('polygonArea of a rectangle', () => {
  assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]), 12);
  assert.equal(polygonArea(FULL_QUAD), 1);
});

test('quadSize keeps the longest opposite edges', () => {
  const quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 120, y: 50 }, { x: 0, y: 50 }];
  assert.deepEqual(quadSize(/** @type {any} */ (quad)), { width: 120, height: 54 });
});

test('toPixels and toNormalized are inverse (and clamp)', () => {
  const px = toPixels(FULL_QUAD, 640, 480);
  assert.deepEqual(px[2], { x: 640, y: 480 });
  assert.deepEqual(toNormalized(px, 640, 480), [...FULL_QUAD]);
  assert.deepEqual(toNormalized([{ x: -5, y: 900 }], 640, 480), [{ x: 0, y: 1 }]);
});

test('fitLine handles vertical lines and intersectLines finds the corner', () => {
  const vertical = fitLine([{ x: 5, y: 0 }, { x: 5, y: 10 }, { x: 5, y: 20 }]);
  assert.ok(lineDistance({ x: 5, y: 99 }, vertical) < 1e-9);
  const horizontal = fitLine([{ x: 0, y: 7 }, { x: 10, y: 7 }]);
  const p = intersectLines(vertical, horizontal);
  assert.ok(Math.abs(p.x - 5) < 1e-9 && Math.abs(p.y - 7) < 1e-9);
  assert.equal(intersectLines(horizontal, fitLine([{ x: 0, y: 9 }, { x: 4, y: 9 }])), null);
});

test('refineQuad recovers a corner hidden on the outline', () => {
  // Square outline 0..100, bottom-left corner missing (as under a thumb).
  const points = [];
  for (let i = 0; i <= 100; i++) {
    points.push({ x: i, y: 0 }, { x: 100, y: i });
    if (i > 25) points.push({ x: i, y: 100 });
    if (i < 75) points.push({ x: 0, y: i });
  }
  // Rough quad with the bottom-left corner cut off.
  const rough = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 25, y: 100 }];
  const refined = refineQuad(/** @type {any} */ (rough), points, 5);
  assert.ok(Math.hypot(refined[3].x, refined[3].y - 100) < 1, JSON.stringify(refined[3]));
  assert.ok(Math.hypot(refined[2].x - 100, refined[2].y - 100) < 1);
});
