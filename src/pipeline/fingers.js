/**
 * Fingers on the text: share of skin pixels inside the straightened page,
 * away from its edges. Fingers holding the book by the margins are normal;
 * a finger on the text hides words and must be moved before capturing.
 *
 * Pure function, no OpenCV: runs in the worker and in Node tests.
 */

import { skinMask } from './skin.js';

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/** Skin share above which a finger is taken as lying on the text. */
export const DEFAULT_FINGER_THRESHOLD = 0.004;

/**
 * @param {RgbaImage} page straightened page
 * @param {{ margin?: number }} [options] share of each side left out (the margins)
 * @returns {number} share of skin pixels in the inner area (0..1)
 */
export function fingerCoverage(page, { margin = 0.08 } = {}) {
  const { width, height } = page;
  const mask = skinMask(page);
  const x0 = Math.floor(width * margin);
  const x1 = Math.ceil(width * (1 - margin));
  const y0 = Math.floor(height * margin);
  const y1 = Math.ceil(height * (1 - margin));
  let skin = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // A lone pixel is paper noise: count skin only with a skin neighbour on the right.
      if (mask[y * width + x] && mask[y * width + x + 1]) skin++;
      total++;
    }
  }
  return total ? skin / total : 0;
}
