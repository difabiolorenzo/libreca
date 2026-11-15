/**
 * Cropping with uniform margins: find the printed area of the page, cut
 * around it and add the same margin on every side, in the paper colour.
 * Pure JavaScript (no OpenCV).
 */

import { luminance } from './clean.js';

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/**
 * @typedef {object} CropOptions
 * @property {number} [margin] margin added, as a share of the page width
 * @property {number} [ignore] edge band ignored (page edges, shadows), share of each side
 * @property {number} [minInk] share of a row or column that must be ink to count
 */

/**
 * Bounding box of the dark content, or null on a blank page.
 * @param {RgbaImage} image
 * @param {CropOptions} [options]
 * @returns {{ left: number, top: number, right: number, bottom: number } | null} pixels, right/bottom exclusive
 */
export function contentBox(image, { ignore = 0.03, minInk = 0.004 } = {}) {
  const { width, height, data } = image;
  const x0 = Math.floor(width * ignore);
  const x1 = Math.ceil(width * (1 - ignore));
  const y0 = Math.floor(height * ignore);
  const y1 = Math.ceil(height * (1 - ignore));
  // Ink: clearly darker than the median paper.
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 16) histogram[Math.round(luminance(data[i], data[i + 1], data[i + 2]))]++;
  let paper = 255;
  for (let count = 0, half = data.length / 32; paper > 0; paper--) {
    count += histogram[paper];
    if (count >= half) break;
  }
  const limit = paper * 0.7;
  const rows = new Uint32Array(height);
  const cols = new Uint32Array(width);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (luminance(data[i], data[i + 1], data[i + 2]) < limit) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const rowMin = Math.max(1, (x1 - x0) * minInk);
  const colMin = Math.max(1, (y1 - y0) * minInk);
  let top = y0;
  while (top < y1 && rows[top] < rowMin) top++;
  let bottom = y1;
  while (bottom > top && rows[bottom - 1] < rowMin) bottom--;
  let left = x0;
  while (left < x1 && cols[left] < colMin) left++;
  let right = x1;
  while (right > left && cols[right - 1] < colMin) right--;
  if (bottom - top < 2 || right - left < 2) return null;
  return { left, top, right, bottom };
}

/**
 * Median colour of the light pixels (the paper).
 * @param {RgbaImage} image
 * @returns {[number, number, number]}
 */
function paperColor({ data }) {
  /** @type {number[][]} */
  const channels = [[], [], []];
  for (let i = 0; i < data.length; i += 64) {
    if (luminance(data[i], data[i + 1], data[i + 2]) > 128) for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
  }
  if (!channels[0].length) return [255, 255, 255];
  return /** @type {[number, number, number]} */ (channels.map((v) => v.sort((a, b) => a - b)[v.length >> 1]));
}

/**
 * @param {RgbaImage} image
 * @param {CropOptions} [options]
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, cropped: boolean }}
 */
export function cropMargins(image, { margin = 0.08, ...options } = {}) {
  const box = contentBox(image, options);
  if (!box) return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data), cropped: false };
  const pad = Math.round(image.width * margin);
  const width = box.right - box.left + 2 * pad;
  const height = box.bottom - box.top + 2 * pad;
  const data = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = paperColor(image);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  const rowBytes = (box.right - box.left) * 4;
  for (let y = box.top; y < box.bottom; y++) {
    const from = (y * image.width + box.left) * 4;
    data.set(image.data.subarray(from, from + rowBytes), ((y - box.top + pad) * width + pad) * 4);
  }
  return { width, height, data, cropped: true };
}
