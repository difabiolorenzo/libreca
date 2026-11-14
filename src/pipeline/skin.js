/**
 * Skin detection without AI, used to ignore fingers and hands holding the
 * book when looking for the page outline.
 *
 * Colour rule in YCbCr (skin is redder: high Cr, low Cb), made relative to
 * the paper colour so that cream paper or warm lighting is not taken for
 * skin: a pixel is skin only if it is clearly redder than the paper.
 */

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/**
 * @typedef {object} SkinOptions
 * @property {number} [minRedShift] how much redder than the paper (Cr units)
 */

/**
 * @param {RgbaImage} image
 * @param {SkinOptions} [options]
 * @returns {Uint8Array} one byte per pixel: 255 = skin, 0 = not skin
 */
export function skinMask(image, { minRedShift = 12 } = {}) {
  const { width, height, data } = image;
  const count = width * height;
  const y = new Uint8Array(count);
  const cb = new Uint8Array(count);
  const cr = new Uint8Array(count);
  const yHist = new Uint32Array(256);
  for (let i = 0, j = 0; i < count; i++, j += 4) {
    const r = data[j];
    const g = data[j + 1];
    const b = data[j + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    cb[i] = Math.max(0, Math.min(255, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b));
    cr[i] = Math.max(0, Math.min(255, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b));
    yHist[y[i]]++;
  }

  // Paper reference: median chroma of the brightest fifth of the image
  // (the page is usually the largest bright area).
  const brightLimit = percentile(yHist, count, 0.8);
  const crHist = new Uint32Array(256);
  const cbHist = new Uint32Array(256);
  let bright = 0;
  for (let i = 0; i < count; i++) {
    if (y[i] >= brightLimit) {
      crHist[cr[i]]++;
      cbHist[cb[i]]++;
      bright++;
    }
  }
  const paperCr = percentile(crHist, bright, 0.5);
  const paperCb = percentile(cbHist, bright, 0.5);

  const minCr = Math.max(135, paperCr + minRedShift);
  const maxCb = Math.min(135, paperCb + 4);
  const mask = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (y[i] > 40 && cr[i] >= minCr && cr[i] <= 185 && cb[i] >= 70 && cb[i] <= maxCb) mask[i] = 255;
  }
  return mask;
}

/**
 * Value below which `share` of a histogram's samples lie.
 * @param {Uint32Array} hist
 * @param {number} total
 * @param {number} share 0..1
 */
function percentile(hist, total, share) {
  const target = total * share;
  let sum = 0;
  for (let v = 0; v < hist.length; v++) {
    sum += hist[v];
    if (sum >= target) return v;
  }
  return hist.length - 1;
}
