/**
 * Simple curvature correction from the text lines. Near the binding, lines
 * of a book bend: the page is cut into vertical strips, the darkness profile
 * of each strip (ink per row) is compared with its neighbour to find how far
 * the lines moved up or down, a smooth curve is fitted through these shifts,
 * and every column is moved back so the lines become straight.
 *
 * Done in a few horizontal bands (the top and bottom of a page bend
 * differently), blended from one band to the next. Pure JavaScript.
 */

import { luminance } from './clean.js';

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/** Side of the image used to measure the curvature. */
const ANALYSIS_SIDE = 800;

/**
 * @typedef {object} DewarpOptions
 * @property {number} [strips] vertical strips
 * @property {number} [bands] horizontal bands
 * @property {number} [maxStep] largest shift between two neighbour strips, share of the height
 * @property {number} [minShift] below this many pixels, the page is left as is
 */

/**
 * Small grey version of the image (inverted: ink is high).
 * @param {RgbaImage} image
 * @returns {{ width: number, height: number, ink: Float32Array, scale: number }}
 */
function inkMap(image) {
  const scale = Math.min(1, ANALYSIS_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const ink = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const i = (sy * image.width + Math.min(image.width - 1, Math.floor(x / scale))) * 4;
      ink[y * width + x] = 255 - luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
    }
  }
  return { width, height, ink, scale };
}

/**
 * Mean-free ink profile of a strip (one value per row).
 * @param {{ width: number, ink: Float32Array }} map
 * @param {number} x0 @param {number} x1 @param {number} y0 @param {number} y1
 */
function profile({ width, ink }, x0, x1, y0, y1) {
  const p = new Float32Array(y1 - y0);
  let mean = 0;
  for (let y = y0; y < y1; y++) {
    let s = 0;
    for (let x = x0; x < x1; x++) s += ink[y * width + x];
    p[y - y0] = s;
    mean += s;
  }
  mean /= p.length || 1;
  for (let i = 0; i < p.length; i++) p[i] -= mean;
  return p;
}

/**
 * Shift s (rows) such that b[i + s] best matches a[i], or null if they do
 * not look alike (blank strip, no lines).
 * @param {Float32Array} a @param {Float32Array} b @param {number} range
 */
function bestShift(a, b, range) {
  let energyA = 0;
  let energyB = 0;
  for (let i = 0; i < a.length; i++) {
    energyA += a[i] * a[i];
    energyB += b[i] * b[i];
  }
  if (!energyA || !energyB) return null;
  let best = -Infinity;
  let shift = 0;
  for (let s = -range; s <= range; s++) {
    let sum = 0;
    for (let i = Math.max(0, -s); i < a.length && i + s < b.length; i++) sum += a[i] * b[i + s];
    if (sum > best) {
      best = sum;
      shift = s;
    }
  }
  return best / Math.sqrt(energyA * energyB) > 0.3 ? shift : null;
}

/**
 * Least-squares parabola through points; returns its coefficients [a, b, c]
 * of a·x² + b·x + c, or null with too few points.
 * @param {number[]} xs @param {number[]} ys
 */
export function fitParabola(xs, ys) {
  if (xs.length < 3) return null;
  // Normal equations, 3 × 3, solved by Cramer's rule.
  const s = [0, 0, 0, 0, 0];
  const t = [0, 0, 0];
  xs.forEach((x, i) => {
    for (let k = 0; k < 5; k++) s[k] += x ** k;
    for (let k = 0; k < 3; k++) t[k] += ys[i] * x ** k;
  });
  const m = [[s[4], s[3], s[2]], [s[3], s[2], s[1]], [s[2], s[1], s[0]]];
  const v = [t[2], t[1], t[0]];
  /** @param {number[][]} a */
  const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
    - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
    + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return null;
  return [0, 1, 2].map((col) => det(m.map((row, r) => row.map((val, c) => (c === col ? v[r] : val)))) / d);
}

/**
 * Vertical shift of the text lines across the page, per band.
 * @param {RgbaImage} image
 * @param {DewarpOptions} [options]
 * @returns {{ bands: { y: number, shift: Float32Array }[], max: number }}
 *   for each band, its centre row and the shift (pixels of the full image) of every column
 */
export function measureCurvature(image, { strips = 12, bands = 3, maxStep = 0.02 } = {}) {
  const map = inkMap(image);
  const stripWidth = map.width / strips;
  const bandHeight = map.height / bands;
  const range = Math.max(1, Math.round(map.height * maxStep));
  const middle = Math.floor(strips / 2);
  const result = [];
  let max = 0;
  for (let b = 0; b < bands; b++) {
    const y0 = Math.round(b * bandHeight);
    const y1 = Math.round((b + 1) * bandHeight);
    const profiles = Array.from({ length: strips }, (_, s) =>
      profile(map, Math.round(s * stripWidth), Math.round((s + 1) * stripWidth), y0, y1));
    // Walk out from the middle strip, adding the shift to each neighbour.
    /** @type {(number | null)[]} */
    const shifts = new Array(strips).fill(null);
    shifts[middle] = 0;
    for (const dir of [-1, 1]) {
      let total = 0;
      for (let s = middle + dir; s >= 0 && s < strips; s += dir) {
        const step = bestShift(profiles[s - dir], profiles[s], range);
        if (step === null) break;
        total += step;
        shifts[s] = total;
      }
    }
    const xs = [];
    const ys = [];
    shifts.forEach((v, s) => {
      if (v !== null) {
        xs.push(((s + 0.5) * stripWidth) / map.width - 0.5);
        ys.push(v / map.scale);
      }
    });
    const fit = fitParabola(xs, ys);
    const shift = new Float32Array(image.width);
    if (fit) {
      for (let x = 0; x < image.width; x++) {
        const u = x / image.width - 0.5;
        shift[x] = fit[0] * u * u + fit[1] * u + fit[2];
        max = Math.max(max, Math.abs(shift[x]));
      }
    }
    result.push({ y: ((y0 + y1) / 2) / map.scale, shift });
  }
  return { bands: result, max };
}

/**
 * @param {RgbaImage} image
 * @param {DewarpOptions} [options]
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, corrected: boolean }}
 */
export function dewarpPage(image, { minShift = 1.5, ...options } = {}) {
  const { width, height, data } = image;
  const { bands, max } = measureCurvature(image, options);
  if (max < minShift) return { width, height, data: new Uint8ClampedArray(data), corrected: false };
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    // Blend the two bands around this row.
    let b = 0;
    while (b < bands.length - 1 && bands[b + 1].y < y) b++;
    const lo = bands[b];
    const hi = bands[Math.min(b + 1, bands.length - 1)];
    const w = hi === lo || y <= lo.y ? 0 : Math.min(1, (y - lo.y) / (hi.y - lo.y));
    for (let x = 0; x < width; x++) {
      const sy = y + lo.shift[x] * (1 - w) + hi.shift[x] * w;
      const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)));
      const y1 = Math.min(height - 1, y0 + 1);
      const f = Math.max(0, Math.min(1, sy - y0));
      const a = (y0 * width + x) * 4;
      const c = (y1 * width + x) * 4;
      const o = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) out[o + k] = data[a + k] * (1 - f) + data[c + k] * f;
    }
  }
  return { width, height, data: out, corrected: true };
}
