// "Digital book" quality: cleaning, cropping, curvature, on synthetic pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanPage, otsuThreshold, luminance } from '../src/pipeline/clean.js';
import { contentBox, cropMargins } from '../src/pipeline/crop.js';
import { dewarpPage, measureCurvature, fitParabola } from '../src/pipeline/dewarp.js';
import { enhancePage } from '../src/pipeline/enhance.js';
import { hasOpenCV, loadOpenCvForTests } from './helpers/opencv.mjs';

const skip = (await hasOpenCV()) ? false : 'src/vendor/opencv/opencv.js missing';

/**
 * A straightened page: paper with text lines (dashes, gaps), optional
 * shadow on the left and line curvature (row offset = bend·(x/w − 0.5)²·h).
 * @param {{ width?: number, height?: number, paper?: number[], shadow?: boolean, bend?: number, margin?: number }} [o]
 */
function makePage({ width = 400, height = 560, paper = [235, 225, 200], shadow = false, bend = 0, margin = 60 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width - 0.5;
      const ly = y - bend * u * u * height; // row in the flat page
      const inText = x >= margin && x < width - margin && ly >= margin && ly < height - margin;
      const line = inText && ((ly - margin) % 18) < 5 && (Math.floor(x / 23) % 4 !== 3);
      const light = shadow ? 0.45 + 0.55 * Math.min(1, x / (width * 0.6)) : 1;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = (line ? 30 : paper[c]) * light;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** @param {{ width: number, data: Uint8ClampedArray }} img @param {number} x @param {number} y */
const lum = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return luminance(img.data[i], img.data[i + 1], img.data[i + 2]);
};

test('otsuThreshold splits two groups', () => {
  const h = new Uint32Array(256);
  h[30] = 100;
  h[220] = 900;
  const t = otsuThreshold(h);
  assert.ok(t >= 30 && t < 220, String(t));
});

test('cleanPage whitens yellowed paper and removes a shadow, keeps the ink', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = makePage({ shadow: true });
  const out = cleanPage(cv, page);
  // Paper in the shadow and in the light: both near white.
  assert.ok(lum(out, 10, 10) > 240, `shadowed paper ${lum(out, 10, 10)}`);
  assert.ok(lum(out, 390, 10) > 240, `lit paper ${lum(out, 390, 10)}`);
  const i = (10 * 400 + 390) * 4;
  assert.ok(out.data[i + 2] > 240, 'blue channel restored (no yellow tint)');
  // Ink stays dark.
  assert.ok(lum(out, 100, 62) < 80, `ink ${lum(out, 100, 62)}`);
});

test('cleanPage colour modes: grey and black and white', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = makePage();
  const gray = cleanPage(cv, page, { color: 'gray' });
  for (let i = 0; i < gray.data.length; i += 4) {
    assert.ok(gray.data[i] === gray.data[i + 1] && gray.data[i] === gray.data[i + 2]);
  }
  const bw = cleanPage(cv, page, { color: 'bw' });
  for (let i = 0; i < bw.data.length; i += 4) assert.ok(bw.data[i] === 0 || bw.data[i] === 255);
  const untouched = cleanPage(cv, page, { clean: false, color: 'color' });
  assert.deepEqual(untouched.data, page.data);
});

test('contentBox finds the text block, cropMargins makes uniform margins', () => {
  const page = makePage({ margin: 60 });
  const box = contentBox(page);
  assert.ok(box);
  assert.ok(Math.abs(box.left - 60) <= 2 && Math.abs(box.top - 60) <= 2, JSON.stringify(box));
  const out = cropMargins(page, { margin: 0.05 });
  assert.ok(out.cropped);
  const pad = Math.round(400 * 0.05);
  const inner = contentBox(out, { ignore: 0 });
  assert.ok(inner);
  const margins = [inner.left, inner.top, out.width - inner.right, out.height - inner.bottom];
  for (const m of margins) assert.ok(Math.abs(m - pad) <= 3, `margins ${margins}`);
});

test('cropMargins leaves a blank page alone', () => {
  const blank = makePage({ margin: 300 });
  const out = cropMargins(blank);
  assert.equal(out.cropped, false);
  assert.equal(out.width, blank.width);
});

test('fitParabola recovers a parabola', () => {
  const xs = [-0.4, -0.2, 0, 0.2, 0.4];
  const fit = fitParabola(xs, xs.map((x) => 3 * x * x - x + 2));
  assert.ok(fit);
  [3, -1, 2].forEach((v, i) => assert.ok(Math.abs(fit[i] - v) < 1e-6));
});

test('dewarpPage straightens curved text lines', () => {
  const curved = makePage({ bend: 0.06 });
  const before = measureCurvature(curved).max;
  assert.ok(before > 5, `curvature measured ${before}`);
  const out = dewarpPage(curved);
  assert.ok(out.corrected);
  const after = measureCurvature(out).max;
  assert.ok(after < before / 3, `before ${before}, after ${after}`);
});

test('dewarpPage leaves a flat page alone', () => {
  const flat = makePage();
  const out = dewarpPage(flat);
  assert.equal(out.corrected, false);
  assert.deepEqual(out.data, flat.data);
});

test('enhancePage runs the chosen corrections and reports them', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = makePage({ bend: 0.05, shadow: true });
  const all = enhancePage(cv, page);
  assert.deepEqual(all.applied, { dewarp: true, clean: true, crop: true });
  const none = enhancePage(cv, page, { dewarp: false, clean: false, crop: false });
  assert.deepEqual(none.applied, { dewarp: false, clean: false, crop: false });
  assert.deepEqual(none.data, page.data);
});
