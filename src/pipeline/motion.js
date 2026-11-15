/**
 * Motion measurement between consecutive images and page quads.
 * Used to detect when the scene is settled and stable before triggering
 * automatic capture.
 *
 * Computes:
 * - Pixel motion: average luminance difference and ratio of moving pixels
 * - Quad motion: corner displacement between two detected page outlines
 *
 * Pure functions: no OpenCV dependency required, runs anywhere
 * (worker, main thread, Node tests).
 */

import { distance } from './geometry.js';

/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {import('./geometry.js').Quad} Quad */
/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/**
 * @typedef {object} MotionResult
 * @property {number} meanDelta average absolute luminance difference (0..255)
 * @property {number} movingRatio fraction of evaluated pixels that moved above threshold (0..1)
 * @property {number} score normalized motion score (0..1)
 */

/**
 * @typedef {object} MotionOptions
 * @property {number} [threshold] minimum pixel luminance difference to count as moving (default 15)
 * @property {number} [step] subsampling step (default auto-scaled to ~320px)
 */

/**
 * Measure pixel motion between two images of identical dimensions.
 *
 * @param {RgbaImage} prev previous frame
 * @param {RgbaImage} curr current frame
 * @param {MotionOptions} [options]
 * @returns {MotionResult}
 */
export function measureMotion(prev, curr, { threshold = 15, step } = {}) {
  if (!prev || !curr || prev.width !== curr.width || prev.height !== curr.height) {
    return { meanDelta: 255, movingRatio: 1, score: 1 };
  }
  const { width, height } = prev;
  const d1 = prev.data;
  const d2 = curr.data;
  const s = step ?? Math.max(1, Math.floor(Math.max(width, height) / 320));

  let sum = 0;
  let moved = 0;
  let count = 0;

  for (let y = 0; y < height; y += s) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += s) {
      const i = rowOffset + x * 4;
      // Fast luminance: 0.299 R + 0.587 G + 0.114 B
      const y1 = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2];
      const y2 = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
      const diff = Math.abs(y1 - y2);
      sum += diff;
      if (diff > threshold) moved++;
      count++;
    }
  }

  if (count === 0) return { meanDelta: 0, movingRatio: 0, score: 0 };
  const meanDelta = sum / count;
  const movingRatio = moved / count;
  const score = Math.min(1, meanDelta / 255);
  return { meanDelta, movingRatio, score };
}

/**
 * @typedef {object} QuadDisplacement
 * @property {number} max maximum displacement among corresponding corners (in normalized 0..1 units)
 * @property {number} avg average displacement across all 4 corners (in normalized 0..1 units)
 */

/**
 * Compute the displacement between two normalized quadrilaterals.
 * Both quads should already be ordered (top-left, top-right, bottom-right, bottom-left).
 *
 * @param {readonly Point[] | null} prev
 * @param {readonly Point[] | null} curr
 * @returns {QuadDisplacement}
 */
export function quadDisplacement(prev, curr) {
  if (!prev || !curr || prev.length !== 4 || curr.length !== 4) {
    return { max: Infinity, avg: Infinity };
  }
  let sum = 0;
  let max = 0;
  for (let i = 0; i < 4; i++) {
    const d = distance(prev[i], curr[i]);
    sum += d;
    if (d > max) max = d;
  }
  return { max, avg: sum / 4 };
}

/**
 * Check if motion measurements satisfy stability thresholds.
 *
 * @param {MotionResult} motion
 * @param {object} [options]
 * @param {number} [options.maxMeanDelta] default 8
 * @param {number} [options.maxMovingRatio] default 0.05
 * @returns {boolean}
 */
export function isMotionStable(motion, { maxMeanDelta = 8, maxMovingRatio = 0.05 } = {}) {
  return Boolean(motion) && motion.meanDelta <= maxMeanDelta && motion.movingRatio <= maxMovingRatio;
}
