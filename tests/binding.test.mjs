// Binding detection and double page split.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findBinding, findGutter } from '../src/pipeline/binding.js';
import { squareToQuad, splitQuad, toNormalized } from '../src/pipeline/geometry.js';
import { detectPage } from '../src/pipeline/detect-page.js';
import { warpPage } from '../src/pipeline/perspective.js';
import { hasOpenCV, loadOpenCvForTests } from './helpers/opencv.mjs';
import { makeTextPage } from './helpers/synthetic.mjs';

const skip = (await hasOpenCV()) ? false : 'src/vendor/opencv/opencv.js missing';

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
const near = (a, b, tolerance = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) < tolerance;

test('squareToQuad maps the corners and the middle of a rectangle', () => {
  const quad = [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 70 }];
  assert.ok(near(squareToQuad(quad, 0, 0), quad[0]));
  assert.ok(near(squareToQuad(quad, 1, 0), quad[1]));
  assert.ok(near(squareToQuad(quad, 1, 1), quad[2]));
  assert.ok(near(squareToQuad(quad, 0, 1), quad[3]));
  assert.ok(near(squareToQuad(quad, 0.5, 0.5), { x: 60, y: 45 }));
});

test('squareToQuad follows perspective: the middle of a trapezoid is not the middle of its edges', () => {
  // Far edge (top) shorter than the near edge (bottom).
  const quad = [{ x: 40, y: 0 }, { x: 60, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  assert.ok(near(squareToQuad(quad, 0, 0), quad[0]));
  assert.ok(near(squareToQuad(quad, 1, 0), quad[1]));
  assert.ok(near(squareToQuad(quad, 1, 1), quad[2]));
  assert.ok(near(squareToQuad(quad, 0, 1), quad[3]));
  // Symmetric trapezoid: the vertical middle line stays at x = 50.
  assert.ok(Math.abs(squareToQuad(quad, 0.5, 0.3).x - 50) < 1e-9);
  // The flat middle (v = 0.5) is nearer the far edge than y = 50.
  assert.ok(squareToQuad(quad, 0.5, 0.5).y < 50);
});

test('splitQuad cuts a double page into two pages sharing the binding', () => {
  const quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const [left, right] = splitQuad(quad, 0.4);
  assert.ok(near(left[1], { x: 0.4, y: 0 }) && near(left[2], { x: 0.4, y: 1 }));
  assert.ok(near(right[0], left[1]) && near(right[3], left[2]));
  assert.ok(near(left[0], quad[0]) && near(right[2], quad[2]));
});

test('findBinding: a single page is not split', () => {
  assert.deepEqual(findBinding(makeTextPage(300, 420, { seed: 1 })), { spread: false, gutter: null });
});

test('findBinding finds the binding of a double page', () => {
  for (const gutter of [0.5, 0.44, 0.57]) {
    const spread = makeTextPage(560, 400, { seed: 4, gutterShadow: gutter });
    const found = findBinding(spread);
    assert.equal(found.spread, true);
    assert.ok(Math.abs(/** @type {number} */ (found.gutter) - gutter) < 0.02, `gutter ${found.gutter} vs ${gutter}`);
  }
});

test('findGutter without a shadow still lands between the two text blocks', () => {
  const spread = makeTextPage(560, 400, { seed: 6, gutterShadow: 0.5 });
  // Remove the shadow: paint the middle band with paper.
  for (let y = 0; y < spread.height; y++) {
    for (let x = Math.round(0.47 * 560); x < Math.round(0.53 * 560); x++) spread.data.set([235, 232, 225], (y * 560 + x) * 4);
  }
  const gutter = findGutter(spread);
  assert.ok(Math.abs(gutter - 0.5) < 0.05, `gutter ${gutter}`);
});

test('a double page photographed in perspective is split at its binding', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  // Lay a flat double page into a dark photo, in perspective.
  const flat = makeTextPage(560, 400, { seed: 8, gutterShadow: 0.5 });
  const corners = [{ x: 120, y: 70 }, { x: 760, y: 90 }, { x: 800, y: 540 }, { x: 80, y: 520 }];
  const photo = placeInPhoto(cv, flat, corners, 880, 600);
  const quad = detectPage(cv, photo);
  assert.ok(quad, 'no page detected');
  const { spread, gutter } = findBinding(warpPage(cv, photo, quad, { maxSide: 800 }));
  assert.equal(spread, true);
  assert.ok(Math.abs(/** @type {number} */ (gutter) - 0.5) < 0.03, `gutter ${gutter}`);
  const [left, right] = splitQuad(quad, /** @type {number} */ (gutter));
  // The binding top and bottom land on the true middle of the flat page.
  const truth = /** @type {any} */ (toNormalized(corners, 880, 600));
  assert.ok(near(left[1], squareToQuad(truth, 0.5, 0), 0.02), `top ${JSON.stringify(left[1])}`);
  assert.ok(near(right[3], squareToQuad(truth, 0.5, 1), 0.02), `bottom ${JSON.stringify(right[3])}`);
});

/**
 * Warp a flat image onto a quad of a dark photo.
 * @param {any} cv
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} flat
 * @param {{x:number,y:number}[]} corners TL, TR, BR, BL in pixels
 * @param {number} width @param {number} height
 */
function placeInPhoto(cv, flat, corners, width, height) {
  const src = cv.matFromImageData(flat);
  const dst = new cv.Mat(height, width, cv.CV_8UC4, new cv.Scalar(45, 45, 45, 255));
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, flat.width, 0, flat.width, flat.height, 0, flat.height]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => [p.x, p.y]));
  const matrix = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_TRANSPARENT, new cv.Scalar());
    return { width, height, data: new Uint8ClampedArray(dst.data) };
  } finally {
    for (const m of [src, dst, from, to, matrix]) m.delete();
  }
}
