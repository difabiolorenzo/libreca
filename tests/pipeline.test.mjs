// Page detection and perspective correction, on synthetic images.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectPage } from '../src/pipeline/detect-page.js';
import { warpPage } from '../src/pipeline/perspective.js';
import { FULL_QUAD, toNormalized } from '../src/pipeline/geometry.js';
import { hasOpenCV, loadOpenCvForTests } from './helpers/opencv.mjs';
import { makePageImage } from './helpers/synthetic.mjs';

const skip = (await hasOpenCV()) ? false : 'src/vendor/opencv/opencv.js missing';

/**
 * @param {{x:number,y:number}[]} actual normalized
 * @param {{x:number,y:number}[]} expected normalized
 * @param {number} tolerance
 */
function assertCornersNear(actual, expected, tolerance) {
  assert.ok(actual, 'no page detected');
  actual.forEach((p, i) => {
    const d = Math.hypot(p.x - expected[i].x, p.y - expected[i].y);
    assert.ok(d < tolerance, `corner ${i}: ${JSON.stringify(p)} vs ${JSON.stringify(expected[i])}`);
  });
}

test('detectPage finds a straight page', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const quad = detectPage(cv, makePageImage(640, 480, page));
  assertCornersNear(quad, toNormalized(page, 640, 480), 0.02);
});

test('detectPage finds a tilted page in perspective', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 200, y: 50 }, { x: 560, y: 110 }, { x: 500, y: 450 }, { x: 110, y: 400 }];
  const quad = detectPage(cv, makePageImage(640, 480, page));
  assertCornersNear(quad, toNormalized(page, 640, 480), 0.02);
});

test('detectPage works on a large frame (internal downscale)', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 400, y: 150 }, { x: 1500, y: 120 }, { x: 1560, y: 1000 }, { x: 350, y: 1020 }];
  const quad = detectPage(cv, makePageImage(1920, 1080, page));
  assertCornersNear(quad, toNormalized(page, 1920, 1080), 0.02);
});

test('detectPage returns null without a page', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  assert.equal(detectPage(cv, makePageImage(640, 480, null)), null);
});

test('warpPage straightens the page to its own size', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const page = [{ x: 200, y: 50 }, { x: 560, y: 110 }, { x: 500, y: 450 }, { x: 110, y: 400 }];
  const image = makePageImage(640, 480, page);
  const out = warpPage(cv, image, toNormalized(page, 640, 480));
  // Longest opposite edges: top 365, bottom 393; left 361, right 345.
  assert.ok(Math.abs(out.width - 393) <= 2, `width ${out.width}`);
  assert.ok(Math.abs(out.height - 361) <= 2, `height ${out.height}`);
  assert.equal(out.data.length, out.width * out.height * 4);
  // The border of the result is paper (light), not background (dark).
  const px = (x, y) => out.data[(y * out.width + x) * 4];
  for (const [x, y] of [[3, 3], [out.width - 4, 3], [3, out.height - 4], [out.width - 4, out.height - 4]]) {
    assert.ok(px(x, y) > 180, `pixel ${x},${y} = ${px(x, y)}`);
  }
});

test('warpPage with the full quad keeps the image size', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const out = warpPage(cv, makePageImage(320, 240, null), FULL_QUAD);
  assert.deepEqual([out.width, out.height], [320, 240]);
});

test('warpPage caps the output size', { skip }, async () => {
  const cv = await loadOpenCvForTests();
  const out = warpPage(cv, makePageImage(400, 200, null), FULL_QUAD, { maxSide: 100 });
  assert.deepEqual([out.width, out.height], [100, 50]);
});

// --- Fingers and hands on the page -------------------------------------

const STRAIGHT = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
const TILTED = [{ x: 200, y: 50 }, { x: 560, y: 110 }, { x: 500, y: 450 }, { x: 110, y: 400 }];
const HAND_CASES = {
  'fingers across the left edge': [STRAIGHT, [
    { x1: 0, y1: 260, x2: 200, y2: 240, r: 14 },
    { x1: 0, y1: 300, x2: 195, y2: 290, r: 14 },
    { x1: 0, y1: 230, x2: 60, y2: 290, r: 45 },
  ]],
  'thumb hiding the bottom-left corner': [STRAIGHT, [{ x1: 60, y1: 479, x2: 175, y2: 405, r: 18 }]],
  'hands on both sides of a tilted page': [TILTED, [
    { x1: 0, y1: 230, x2: 175, y2: 230, r: 15 },
    { x1: 639, y1: 300, x2: 510, y2: 290, r: 15 },
    { x1: 639, y1: 260, x2: 600, y2: 330, r: 40 },
  ]],
};
const SKIN_TONES = { light: [222, 168, 138], dark: [140, 90, 60] };
const PAPERS = { white: [235, 235, 235], cream: [250, 228, 192] };

for (const [name, [page, fingers]] of Object.entries(HAND_CASES)) {
  for (const [tone, skin] of Object.entries(SKIN_TONES)) {
    for (const [paperName, paper] of Object.entries(PAPERS)) {
      test(`detectPage ignores ${name} (${tone} skin, ${paperName} paper)`, { skip }, async () => {
        const cv = await loadOpenCvForTests();
        const image = makePageImage(640, 480, page, { fingers, skin, paper, background: [70, 55, 45] });
        assertCornersNear(detectPage(cv, image), toNormalized(page, 640, 480), 0.02);
      });
    }
  }
}
