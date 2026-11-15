/**
 * Page cleaning: white background, shadows and uneven light removed,
 * contrast raised, then colour, grey or black-and-white output.
 *
 * The paper colour is estimated at low resolution (a dilation wipes out the
 * dark text, a median smooths what is left), then every pixel is divided by
 * it: the paper becomes white, shadows vanish, ink stays dark.
 */

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */
/** @typedef {'color' | 'gray' | 'bw'} ColorMode */

/** @type {readonly ColorMode[]} */
export const COLOR_MODES = ['color', 'gray', 'bw'];

/** Longest side of the image used to estimate the paper. */
const BACKGROUND_SIDE = 256;

/** Luminance above which a cleaned pixel becomes pure white. */
const WHITE_POINT = 235;

/** @param {number} r @param {number} g @param {number} b */
export const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Paper colour at every pixel (RGBA, same size as the image).
 * @param {any} cv OpenCV.js module
 * @param {RgbaImage} image
 * @returns {Uint8Array}
 */
export function estimateBackground(cv, image) {
  const { width, height } = image;
  const scale = Math.min(1, BACKGROUND_SIDE / Math.max(width, height));
  const small = new cv.Size(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  const src = cv.matFromImageData(image);
  const work = new cv.Mat();
  const full = new cv.Mat();
  // About 4 % of the page: wider than a text stroke, narrower than a shadow.
  const k = Math.max(3, Math.round(Math.max(small.width, small.height) * 0.04) | 1);
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k));
  try {
    cv.resize(src, work, small, 0, 0, cv.INTER_AREA);
    cv.dilate(work, work, kernel);
    cv.medianBlur(work, work, k);
    cv.resize(work, full, new cv.Size(width, height), 0, 0, cv.INTER_LINEAR);
    return new Uint8Array(full.data);
  } finally {
    for (const m of [src, work, full, kernel]) m.delete();
  }
}

/**
 * Otsu threshold of a 256-bin histogram.
 * @param {Uint32Array} histogram
 * @returns {number}
 */
export function otsuThreshold(histogram) {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += histogram[i];
    sum += i * histogram[i];
  }
  let weightBack = 0;
  let sumBack = 0;
  let best = 0;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    weightBack += histogram[i];
    if (!weightBack) continue;
    const weightFore = total - weightBack;
    if (!weightFore) break;
    sumBack += i * histogram[i];
    const meanBack = sumBack / weightBack;
    const meanFore = (sum - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

/**
 * @param {any} cv OpenCV.js module
 * @param {RgbaImage} image
 * @param {{ clean?: boolean, color?: ColorMode }} [options] `clean`: white
 *   background, shadows, contrast; `color`: output colours
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function cleanPage(cv, image, { clean = true, color = 'color' } = {}) {
  const { width, height } = image;
  const src = image.data;
  const out = new Uint8ClampedArray(src);
  if (!clean && color === 'color') return { width, height, data: out };

  // Black and white always needs an even background to threshold well.
  if (clean || color === 'bw') {
    const bg = estimateBackground(cv, image);
    // Ink darkest 1 % → black, paper → white.
    const histogram = new Uint32Array(256);
    for (let i = 0; i < src.length; i += 4) {
      for (let c = 0; c < 3; c++) out[i + c] = (src[i + c] * 255) / Math.max(bg[i + c], 1);
      histogram[Math.round(luminance(out[i], out[i + 1], out[i + 2]))]++;
    }
    let black = 0;
    for (let count = 0, limit = (src.length / 4) * 0.01; black < 128; black++) {
      count += histogram[black];
      if (count > limit) break;
    }
    const gain = 255 / Math.max(1, WHITE_POINT - black);
    for (let i = 0; i < out.length; i += 4) {
      for (let c = 0; c < 3; c++) out[i + c] = (out[i + c] - black) * gain;
    }
  }

  if (color === 'color') return { width, height, data: out };

  const histogram = new Uint32Array(256);
  for (let i = 0; i < out.length; i += 4) {
    const y = Math.round(luminance(out[i], out[i + 1], out[i + 2]));
    out[i] = y;
    histogram[y]++;
  }
  const threshold = color === 'bw' ? otsuThreshold(histogram) : -1;
  for (let i = 0; i < out.length; i += 4) {
    const y = threshold < 0 ? out[i] : out[i] > threshold ? 255 : 0;
    out[i] = y;
    out[i + 1] = y;
    out[i + 2] = y;
  }
  return { width, height, data: out };
}
