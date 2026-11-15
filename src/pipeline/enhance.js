/**
 * "Digital book" quality: the straightened page goes through the chosen
 * corrections, in order: curvature, cleaning (with the colour mode), then
 * cropping with uniform margins. Each correction can be turned off.
 */

import { dewarpPage } from './dewarp.js';
import { cleanPage } from './clean.js';
import { cropMargins } from './crop.js';

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */
/** @typedef {import('./clean.js').ColorMode} ColorMode */

/**
 * @typedef {object} Corrections
 * @property {boolean} dewarp straighten curved text lines
 * @property {boolean} clean white background, no shadows, more contrast
 * @property {boolean} crop crop with uniform margins
 * @property {ColorMode} color colour, grey or black and white
 */

/** Names of the corrections that can be turned on and off, in order. */
export const CORRECTIONS = /** @type {const} */ (['dewarp', 'clean', 'crop']);

/** @type {Corrections} */
export const DEFAULT_CORRECTIONS = { dewarp: true, clean: true, crop: true, color: 'color' };

/**
 * @param {any} cv OpenCV.js module
 * @param {RgbaImage} image straightened page
 * @param {Partial<Corrections>} [corrections]
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, applied: Record<'dewarp' | 'clean' | 'crop', boolean> }}
 *   `applied`: the corrections that changed something
 */
export function enhancePage(cv, image, corrections = {}) {
  const { dewarp, clean, crop, color } = { ...DEFAULT_CORRECTIONS, ...corrections };
  /** @type {RgbaImage} */
  let current = image;
  const applied = { dewarp: false, clean: false, crop: false };
  if (dewarp) {
    const result = dewarpPage(current);
    applied.dewarp = result.corrected;
    current = result;
  }
  if (clean || color !== 'color') {
    current = cleanPage(cv, current, { clean, color });
    applied.clean = clean;
  }
  if (crop) {
    const result = cropMargins(current);
    applied.crop = result.cropped;
    current = result;
  }
  const { width, height } = current;
  const data = current === image ? new Uint8ClampedArray(image.data) : current.data;
  return { width, height, data: /** @type {Uint8ClampedArray} */ (data), applied };
}
