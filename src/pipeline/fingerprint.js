/**
 * Page fingerprint, to tell a new page from the one already captured.
 *
 * The straightened page is reduced to a small grid of mean luminance cells,
 * then normalized (zero mean, unit variance) so a change of light or
 * exposure does not count as a new page. Two fingerprints are compared by
 * correlation: the same page gives a distance close to 0, a turned page a
 * clearly larger one (other paragraphs, line ends, titles, pictures).
 *
 * Pure functions, no OpenCV: runs in the worker and in Node tests.
 */

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/**
 * @typedef {object} Fingerprint
 * @property {number} cols
 * @property {number} rows
 * @property {Float32Array} values cells minus their column mean, unit variance; all 0 for a blank page
 * @property {number} mean mean luminance of the page (0..255), before normalization
 */

/** Distance above which the page is taken as a new one (to calibrate on real photos). */
export const DEFAULT_CHANGE_THRESHOLD = 0.12;

/**
 * @param {RgbaImage} image straightened page (or any image)
 * @param {{ cols?: number, rows?: number }} [options] grid size
 * @returns {Fingerprint}
 */
export function pageFingerprint(image, { cols = 16, rows = 24 } = {}) {
  const { width, height, data } = image;
  const sums = new Float64Array(cols * rows);
  const counts = new Uint32Array(cols * rows);
  // Sample about 160 px per side at most: plenty for a 16 × 24 grid.
  const step = Math.max(1, Math.floor(Math.max(width, height) / 160));
  for (let y = 0; y < height; y += step) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / height));
    for (let x = 0; x < width; x += step) {
      const col = Math.min(cols - 1, Math.floor((x * cols) / width));
      const i = (y * width + x) * 4;
      sums[row * cols + col] += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      counts[row * cols + col]++;
    }
  }
  const values = new Float32Array(cols * rows);
  let total = 0;
  for (let k = 0; k < values.length; k++) {
    values[k] = counts[k] ? sums[k] / counts[k] : 0;
    total += values[k];
  }
  const mean = total / values.length;
  // Remove each column's mean: the margins and the text block, alike on
  // every page of a book, would otherwise hide what differs (line ends,
  // paragraph breaks, titles, pictures).
  for (let c = 0; c < cols; c++) {
    let column = 0;
    for (let r = 0; r < rows; r++) column += values[r * cols + c];
    column /= rows;
    for (let r = 0; r < rows; r++) values[r * cols + c] -= column;
  }
  let variance = 0;
  for (const v of values) variance += v * v;
  const std = Math.sqrt(variance / values.length);
  // A blank page (or a flat image) has no structure to compare.
  for (let k = 0; k < values.length; k++) values[k] = std > 1 ? values[k] / std : 0;
  return { cols, rows, values, mean };
}

/**
 * Distance between two fingerprints: 0 = same page, 0.5 = unrelated,
 * 1 = negative image. Two blank pages are the same (0); a blank page and a
 * printed page are unrelated (0.5).
 * @param {Fingerprint | null | undefined} a
 * @param {Fingerprint | null | undefined} b
 * @returns {number} distance in 0..1 (1 when a fingerprint is missing or the grids differ)
 */
export function fingerprintDistance(a, b) {
  if (!a || !b || a.cols !== b.cols || a.rows !== b.rows) return 1;
  let dot = 0;
  let blankA = true;
  let blankB = true;
  for (let k = 0; k < a.values.length; k++) {
    dot += a.values[k] * b.values[k];
    if (a.values[k] !== 0) blankA = false;
    if (b.values[k] !== 0) blankB = false;
  }
  if (blankA && blankB) return 0;
  const correlation = dot / a.values.length;
  return Math.min(1, Math.max(0, (1 - correlation) / 2));
}

/**
 * @param {Fingerprint | null | undefined} current
 * @param {Fingerprint | null | undefined} captured fingerprint of the last captured page
 * @param {number} [threshold]
 */
export function isNewPage(current, captured, threshold = DEFAULT_CHANGE_THRESHOLD) {
  if (!captured) return true;
  return fingerprintDistance(current, captured) > threshold;
}
