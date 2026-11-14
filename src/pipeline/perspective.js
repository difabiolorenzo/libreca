/**
 * Perspective correction: straighten the page delimited by a quad into a
 * flat rectangle. Pure function (OpenCV module + RGBA image → RGBA image).
 */

import { orderCorners, quadSize, toPixels } from './geometry.js';

/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {import('./detect-page.js').RgbaImage} RgbaImage */

/**
 * @param {any} cv OpenCV.js module
 * @param {RgbaImage} image
 * @param {readonly Point[]} quad normalized corners (any order)
 * @param {{ maxSide?: number }} [options] cap on the output size
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }}
 */
export function warpPage(cv, image, quad, { maxSide = 4096 } = {}) {
  const corners = toPixels(orderCorners(quad), image.width, image.height);
  let { width, height } = quadSize(corners);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const src = cv.matFromImageData(image);
  const dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
  const matrix = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, matrix, new cv.Size(width, height),
      cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    return { width, height, data: new Uint8ClampedArray(dst.data) };
  } finally {
    for (const m of [src, dst, from, to, matrix]) m.delete();
  }
}
