import { test } from 'node:test';
import assert from 'node:assert/strict';

import { laplacianVariance, isSharp, DEFAULT_SHARPNESS_THRESHOLD } from '../src/pipeline/sharpness.js';
import { toNormalized } from '../src/pipeline/geometry.js';
import { hasOpenCV, loadOpenCvForTests } from './helpers/opencv.mjs';
import { makePageImage } from './helpers/synthetic.mjs';

const skip = (await hasOpenCV()) ? false : 'src/vendor/opencv/opencv.js missing';

test('laplacianVariance returns high variance for a sharp page with text', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const img = makePageImage(640, 480, page);
  const variance = laplacianVariance(cv, img);
  assert.ok(variance > 2000, `expected high variance for sharp text, got ${variance}`);
  assert.equal(isSharp(variance), true);
});

test('laplacianVariance drops drastically when an image is blurred', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const img = makePageImage(640, 480, page);

  // Sharp variance
  const sharpVar = laplacianVariance(cv, img);

  // Apply Gaussian blur via OpenCV
  const mat = cv.matFromImageData(img);
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  const blurredGray = new cv.Mat();
  cv.GaussianBlur(gray, blurredGray, new cv.Size(15, 15), 0);

  const blurVar = laplacianVariance(cv, blurredGray);
  mat.delete();
  gray.delete();
  blurredGray.delete();

  assert.ok(blurVar < sharpVar * 0.05, `expected blurVar (${blurVar}) < 5% of sharpVar (${sharpVar})`);
  assert.equal(isSharp(blurVar, DEFAULT_SHARPNESS_THRESHOLD), false);
});

test('laplacianVariance with quad focuses on the page content', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const img = makePageImage(640, 480, page);
  const quad = toNormalized(page, 640, 480);

  const pageOnlyVar = laplacianVariance(cv, img, { quad });
  // The page has high-contrast text lines across its area, so page-only variance is very high.
  assert.ok(pageOnlyVar > 10000, `expected high page variance, got ${pageOnlyVar}`);
});

test('laplacianVariance returns 0 for a flat uniform image', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const flat = {
    width: 100,
    height: 100,
    data: new Uint8ClampedArray(100 * 100 * 4).fill(200),
  };
  const variance = laplacianVariance(cv, flat);
  assert.equal(variance, 0);
  assert.equal(isSharp(variance), false);
});

test('laplacianVariance respects maxSide downscaling', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const img = makePageImage(640, 480, page);

  const vFull = laplacianVariance(cv, img, { maxSide: 640 });
  const vSmall = laplacianVariance(cv, img, { maxSide: 200 });

  assert.ok(vFull > 0);
  assert.ok(vSmall > 0);
  assert.ok(Number.isFinite(vSmall));
});

test('isSharp uses threshold correctly', () => {
  assert.equal(isSharp(200, 150), true);
  assert.equal(isSharp(150, 150), true);
  assert.equal(isSharp(149.9, 150), false);
  assert.equal(isSharp(0), false);
  assert.equal(isSharp(NaN), false);
  assert.equal(isSharp(Infinity), false);
});
