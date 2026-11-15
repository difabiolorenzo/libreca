// Page fingerprint, finger on the text and automatic capture decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pageFingerprint, fingerprintDistance, isNewPage, DEFAULT_CHANGE_THRESHOLD } from '../src/pipeline/fingerprint.js';
import { fingerCoverage, DEFAULT_FINGER_THRESHOLD } from '../src/pipeline/fingers.js';
import { AutoCapture } from '../src/capture/auto-capture.js';
import { makeTextPage, paintFinger, relight } from './helpers/synthetic.mjs';

test('the same page gives a near-zero distance, even under other light', () => {
  const page = makeTextPage(400, 560, { seed: 3 });
  const a = pageFingerprint(page);
  assert.ok(fingerprintDistance(a, a) < 1e-6);
  const darker = pageFingerprint(relight(page, 0.7, 10));
  const d = fingerprintDistance(a, darker);
  assert.ok(d < 0.02, `distance ${d}`);
  assert.equal(isNewPage(darker, a), false);
});

test('the same page, smaller or slightly shifted, stays the same page', () => {
  const page = makeTextPage(400, 560, { seed: 5 });
  const a = pageFingerprint(page);
  for (const other of [resize(page, 0, 0, 1, 1, 220, 300), resize(page, 0.015, 0.01, 0.995, 1, 300, 420)]) {
    const d = fingerprintDistance(a, pageFingerprint(other));
    assert.ok(d < DEFAULT_CHANGE_THRESHOLD / 2, `distance ${d}`);
  }
});

test('a turned page is a new page', () => {
  const pages = [1, 2, 3, 4].map((seed) => pageFingerprint(makeTextPage(400, 560, { seed })));
  for (let i = 1; i < pages.length; i++) {
    const d = fingerprintDistance(pages[i - 1], pages[i]);
    assert.ok(d > DEFAULT_CHANGE_THRESHOLD, `pages ${i} and ${i + 1}: distance ${d}`);
    assert.equal(isNewPage(pages[i], pages[i - 1]), true);
  }
});

test('blank pages and missing fingerprints', () => {
  const blank = pageFingerprint(makeTextPage(100, 140, { seed: 1, ink: [235, 232, 225] }));
  assert.ok(blank.values.every((v) => v === 0));
  assert.equal(fingerprintDistance(blank, blank), 0);
  assert.equal(fingerprintDistance(blank, null), 1);
  assert.equal(isNewPage(blank, null), true);
  assert.ok(blank.mean > 200, `mean ${blank.mean}`);
});

test('fingerCoverage: a fingertip on the text, not on the margin', () => {
  const clean = makeTextPage(300, 420, { seed: 2 });
  assert.ok(fingerCoverage(clean) < DEFAULT_FINGER_THRESHOLD / 4, `clean ${fingerCoverage(clean)}`);
  const onText = paintFinger(makeTextPage(300, 420, { seed: 2 }), 150, 200, 14);
  assert.ok(fingerCoverage(onText) > DEFAULT_FINGER_THRESHOLD, `on text ${fingerCoverage(onText)}`);
  const onMargin = paintFinger(makeTextPage(300, 420, { seed: 2 }), 6, 200, 12);
  assert.ok(fingerCoverage(onMargin) < DEFAULT_FINGER_THRESHOLD, `on margin ${fingerCoverage(onMargin)}`);
});

test('AutoCapture: captures a still, sharp page once, then waits for the next page', () => {
  const first = pageFingerprint(makeTextPage(200, 280, { seed: 1 }));
  const second = pageFingerprint(makeTextPage(200, 280, { seed: 2 }));
  const auto = new AutoCapture({ cooldownMs: 1000 });
  const base = { found: true, stable: true, sharp: true, finger: false, fingerprint: first, now: 0 };

  assert.equal(auto.evaluate({ ...base, found: false }), 'noPage');
  assert.equal(auto.evaluate({ ...base, stable: false }), 'moving');
  assert.equal(auto.evaluate({ ...base, sharp: false }), 'blurry');
  assert.equal(auto.evaluate({ ...base, finger: true }), 'finger');
  assert.equal(auto.evaluate(base), 'ready');

  auto.markCaptured(first, 0);
  assert.equal(auto.evaluate({ ...base, now: 5000 }), 'samePage');
  // The next page right away: wait for the cooldown.
  assert.equal(auto.evaluate({ ...base, fingerprint: second, now: 500 }), 'wait');
  assert.equal(auto.evaluate({ ...base, fingerprint: second, now: 1500 }), 'ready');

  auto.reset();
  assert.equal(auto.evaluate({ ...base, now: 1 }), 'ready');
});

/**
 * Part of an image (normalized box), resized by nearest neighbour.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} img
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} width @param {number} height
 */
function resize(img, x0, y0, x1, y1, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x0 + ((x + 0.5) / width) * (x1 - x0)) * img.width));
      const sy = Math.min(img.height - 1, Math.floor((y0 + ((y + 0.5) / height) * (y1 - y0)) * img.height));
      data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}
