/**
 * Sharpness measurement: variance of the Laplacian.
 * A higher variance means crisp text and fine details; a low variance
 * means blur (motion blur, out of focus, poor lighting).
 *
 * When a page quad is provided, the sharpness is evaluated on the
 * straightened page alone, ignoring the background and surroundings.
 *
 * Pure function: takes the OpenCV module and an RGBA image (or cv.Mat),
 * returns the Laplacian variance as a non-negative number.
 */

import { warpPage } from './perspective.js';

/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/** Default variance threshold above which an image is considered sharp. */
export const DEFAULT_SHARPNESS_THRESHOLD = 150;

/**
 * @typedef {object} SharpnessOptions
 * @property {readonly Point[]} [quad] normalized page corners; if set, sharpness is evaluated on the straightened page
 * @property {number} [maxSide] work on a copy no larger than this (speed)
 * @property {number} [ksize] aperture size for Laplacian (default 1)
 */

/**
 * Compute the variance of the Laplacian.
 *
 * @param {any} cv OpenCV.js module
 * @param {RgbaImage | any} image RGBA image or cv.Mat
 * @param {SharpnessOptions} [options]
 * @returns {number} variance of the Laplacian (>= 0)
 */
export function laplacianVariance(cv, image, { quad, maxSide = 500, ksize = 1 } = {}) {
  /** @type {{ delete(): void }[]} */
  const mats = [];
  /** @template {{ delete(): void }} M @param {M} m @returns {M} */
  const keep = (m) => { mats.push(m); return m; };

  try {
    let targetMat = null;

    // 1. If quad is given and image is an RgbaImage, warp the page first.
    if (quad && image && 'data' in image && 'width' in image && 'height' in image) {
      try {
        const warped = warpPage(cv, image, quad, { maxSide });
        targetMat = keep(cv.matFromImageData(warped));
      } catch {
        targetMat = null;
      }
    }

    // 2. Otherwise use the source image/Mat directly.
    if (!targetMat) {
      const isMat = Boolean(image && typeof image === 'object' && 'rows' in image && 'cols' in image);
      const srcMat = isMat ? image : keep(cv.matFromImageData(image));

      const w = srcMat.cols;
      const h = srcMat.rows;
      if (w <= 0 || h <= 0) return 0;

      const scale = Math.min(1, maxSide / Math.max(w, h));
      if (scale < 1) {
        targetMat = keep(new cv.Mat());
        const size = new cv.Size(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
        cv.resize(srcMat, targetMat, size, 0, 0, cv.INTER_AREA);
      } else {
        targetMat = srcMat;
      }
    }

    // 3. Convert to single-channel 8-bit grayscale.
    let gray;
    const channels = targetMat.channels();
    if (channels === 1) {
      gray = targetMat;
    } else {
      gray = keep(new cv.Mat());
      if (channels === 4) cv.cvtColor(targetMat, gray, cv.COLOR_RGBA2GRAY);
      else if (channels === 3) cv.cvtColor(targetMat, gray, cv.COLOR_RGB2GRAY);
      else return 0;
    }

    // 4. Compute Laplacian into 32-bit float.
    const lap = keep(new cv.Mat());
    cv.Laplacian(gray, lap, cv.CV_32F, ksize);

    // 5. Compute mean and standard deviation.
    const mean = keep(new cv.Mat());
    const stddev = keep(new cv.Mat());
    cv.meanStdDev(lap, mean, stddev);

    const std = stddev.data64F ? stddev.data64F[0] : (stddev.data32F ? stddev.data32F[0] : 0);
    return std * std;
  } finally {
    for (const m of mats) m.delete();
  }
}

/**
 * Check if a variance meets the sharpness threshold.
 *
 * @param {number} variance
 * @param {number} [threshold] default 150
 * @returns {boolean}
 */
export function isSharp(variance, threshold = DEFAULT_SHARPNESS_THRESHOLD) {
  return Number.isFinite(variance) && variance >= threshold;
}
