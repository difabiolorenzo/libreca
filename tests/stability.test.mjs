import { test } from 'node:test';
import assert from 'node:assert/strict';

import { measureMotion, quadDisplacement, isMotionStable } from '../src/pipeline/motion.js';
import { StabilityTracker } from '../src/capture/stability.js';
import { makePageImage } from './helpers/synthetic.mjs';

test('measureMotion returns 0 for identical images', () => {
  const page = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const img = makePageImage(320, 240, page, { seed: 10 });
  const result = measureMotion(img, img);
  assert.equal(result.meanDelta, 0);
  assert.equal(result.movingRatio, 0);
  assert.equal(result.score, 0);
  assert.equal(isMotionStable(result), true);
});

test('measureMotion reports low delta for same scene with sensor noise', () => {
  const page = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const img1 = makePageImage(320, 240, page, { seed: 1 });
  const img2 = makePageImage(320, 240, page, { seed: 2 });
  const result = measureMotion(img1, img2);

  // Background noise produces small pixel diffs (~5), but very few pixels exceed threshold 15.
  assert.ok(result.meanDelta < 7, `meanDelta was ${result.meanDelta}`);
  assert.ok(result.movingRatio < 0.05, `movingRatio was ${result.movingRatio}`);
  assert.equal(isMotionStable(result), true);
});

test('measureMotion reports high delta for a moved page', () => {
  const page1 = [{ x: 160, y: 60 }, { x: 480, y: 60 }, { x: 480, y: 420 }, { x: 160, y: 420 }];
  const page2 = [{ x: 220, y: 120 }, { x: 540, y: 120 }, { x: 540, y: 460 }, { x: 220, y: 460 }];
  const img1 = makePageImage(320, 240, page1, { seed: 1 });
  const img2 = makePageImage(320, 240, page2, { seed: 2 });
  const result = measureMotion(img1, img2);

  assert.ok(result.meanDelta > 30, `expected large delta, got ${result.meanDelta}`);
  assert.ok(result.movingRatio > 0.2, `expected many moving pixels, got ${result.movingRatio}`);
  assert.equal(isMotionStable(result), false);
});

test('measureMotion handles mismatched dimensions safely', () => {
  const img1 = { width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) };
  const img2 = { width: 200, height: 100, data: new Uint8ClampedArray(200 * 100 * 4) };
  const result = measureMotion(img1, img2);
  assert.equal(result.score, 1);
  assert.equal(isMotionStable(result), false);
});

test('quadDisplacement measures corner distance accurately', () => {
  const q1 = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
  const q2 = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

  const zero = quadDisplacement(q1, q2);
  assert.equal(zero.max, 0);
  assert.equal(zero.avg, 0);

  // Shift one corner by 0.05
  const q3 = [{ x: 0.15, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
  const shifted = quadDisplacement(q1, q3);
  assert.ok(Math.abs(shifted.max - 0.05) < 1e-6);
  assert.ok(Math.abs(shifted.avg - 0.0125) < 1e-6);

  // Incomplete quads
  assert.equal(quadDisplacement(null, q1).max, Infinity);
  assert.equal(quadDisplacement(q1, [{ x: 0, y: 0 }]).max, Infinity);
});

test('StabilityTracker detects stable state after consecutive calm frames', () => {
  const tracker = new StabilityTracker({
    minStableFrames: 3,
    minStableDurationMs: 250,
  });

  let time = 1000;
  // Frame 1: motion high (hand or camera moving)
  let res = tracker.add({ motion: { meanDelta: 25, movingRatio: 0.25, score: 0.1 }, timestamp: time });
  assert.equal(res.stable, false);
  assert.equal(res.stableFrames, 0);

  // Frame 2: calm frame 1
  time += 100;
  res = tracker.add({ motion: { meanDelta: 3, movingRatio: 0.01, score: 0.01 }, timestamp: time });
  assert.equal(res.stable, false);
  assert.equal(res.stableFrames, 1);
  assert.equal(res.stableDuration, 0);

  // Frame 3: calm frame 2
  time += 100;
  res = tracker.add({ motion: { meanDelta: 2.5, movingRatio: 0.01, score: 0.01 }, timestamp: time });
  assert.equal(res.stable, false);
  assert.equal(res.stableFrames, 2);
  assert.equal(res.stableDuration, 100);

  // Frame 4: calm frame 3, but duration (200ms) < 250ms
  time += 100;
  res = tracker.add({ motion: { meanDelta: 2.8, movingRatio: 0.01, score: 0.01 }, timestamp: time });
  assert.equal(res.stable, false);
  assert.equal(res.stableFrames, 3);
  assert.equal(res.stableDuration, 200);

  // Frame 5: calm frame 4, duration (300ms) >= 250ms -> STABLE!
  time += 100;
  res = tracker.add({ motion: { meanDelta: 2.1, movingRatio: 0.01, score: 0.01 }, timestamp: time });
  assert.equal(res.stable, true);
  assert.equal(res.stableFrames, 4);
  assert.equal(res.stableDuration, 300);

  // Frame 6: sudden movement -> immediately unstable
  time += 100;
  res = tracker.add({ motion: { meanDelta: 35, movingRatio: 0.3, score: 0.14 }, timestamp: time });
  assert.equal(res.stable, false);
  assert.equal(res.stableFrames, 0);
  assert.equal(res.stableDuration, 0);
});

test('StabilityTracker resets cleanly', () => {
  const tracker = new StabilityTracker();
  tracker.add({ motion: { meanDelta: 1, movingRatio: 0.01, score: 0.005 }, timestamp: 100 });
  tracker.add({ motion: { meanDelta: 1, movingRatio: 0.01, score: 0.005 }, timestamp: 200 });
  tracker.reset();
  assert.equal(tracker.stableFrames, 0);
  assert.equal(tracker.stableSince, null);
  assert.equal(tracker.isStable(), false);
});
