/**
 * Binding (gutter) detection on a straightened page, to split a double
 * page into its left and right pages.
 *
 * - Double page: the straightened outline is wider than tall (a single
 *   page is portrait, about 0.7; an open book about 1.4).
 * - Binding: in the middle band, the columns without text (inner margins
 *   and fold: little change from one row to the next), and among them the
 *   darkest one (shadow of the fold). Without such columns, the darkest
 *   column of the band, else the middle.
 *
 * Pure function, no OpenCV: runs in the worker and in Node tests.
 */

/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/**
 * @typedef {object} Binding
 * @property {boolean} spread true for a double page
 * @property {number | null} gutter binding position across the page (0..1), null for a single page
 */

/**
 * @typedef {object} BindingOptions
 * @property {number} [minSpreadRatio] width / height from which the page is a double page
 * @property {number} [band] the binding is searched within 0.5 ± band
 */

/**
 * @param {RgbaImage} page straightened page (or double page)
 * @param {BindingOptions} [options]
 * @returns {Binding}
 */
export function findBinding(page, { minSpreadRatio = 1.15, band = 0.2 } = {}) {
  const { width, height } = page;
  if (width / height < minSpreadRatio) return { spread: false, gutter: null };
  return { spread: true, gutter: findGutter(page, { band }) };
}

/**
 * @param {RgbaImage} page
 * @param {{ band?: number }} [options]
 * @returns {number} binding position across the page (0..1)
 */
export function findGutter(page, { band = 0.2 } = {}) {
  const { width, height, data } = page;
  const step = Math.max(1, Math.floor(height / 200));
  const light = new Float64Array(width);
  const energy = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let change = 0;
    let previous = -1;
    let rows = 0;
    for (let y = 0; y < height; y += step) {
      const i = (y * width + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += l;
      if (previous >= 0) change += Math.abs(l - previous);
      previous = l;
      rows++;
    }
    light[x] = sum / rows;
    energy[x] = change / Math.max(1, rows - 1);
  }
  const radius = Math.max(1, Math.round(width * 0.01));
  const lightS = smooth(light, radius);
  const energyS = smooth(energy, radius);

  const from = Math.max(0, Math.floor(width * (0.5 - band)));
  const to = Math.min(width - 1, Math.ceil(width * (0.5 + band)));
  const quietLimit = 0.4 * median(energyS);

  // Runs of columns without text in the band; keep the one nearest the middle.
  /** @type {[number, number] | null} */
  let best = null;
  let bestDistance = Infinity;
  for (let x = from; x <= to; x++) {
    if (energyS[x] > quietLimit) continue;
    let end = x;
    while (end + 1 <= to && energyS[end + 1] <= quietLimit) end++;
    const d = Math.abs((x + end) / 2 - width / 2);
    if (end - x + 1 >= radius && d < bestDistance) {
      best = [x, end];
      bestDistance = d;
    }
    x = end;
  }
  let [start, stop] = best ?? [from, to];
  // Leave out the run's ends, where the smoothing mixes in the text nearby.
  if (best && stop - start > 4 * radius) {
    start += radius;
    stop -= radius;
  }
  let darkest = start;
  let brightest = start;
  for (let x = start; x <= stop; x++) {
    if (lightS[x] < lightS[darkest]) darkest = x;
    if (lightS[x] > lightS[brightest]) brightest = x;
  }
  // No real shadow (flat light): the middle of the run.
  const shadow = lightS[brightest] - lightS[darkest] > 0.03 * lightS[brightest];
  return ((shadow ? darkest : (start + stop) / 2) + 0.5) / width;
}

/**
 * Moving average.
 * @param {Float64Array} values
 * @param {number} radius
 */
function smooth(values, radius) {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) {
      sum += values[k];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

/** @param {Float64Array} values */
function median(values) {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.floor(sorted.length / 2)];
}
