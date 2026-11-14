/**
 * Page detection without AI: find the largest quadrilateral in the image
 * (edges first, then a bright-area threshold as a fallback).
 * Fingers and hands on the page are ignored: outline points lying on skin
 * are dropped before fitting, and each side is refined with a line fit so a
 * corner hidden under a finger is still found.
 * Pure function: takes the OpenCV module and an RGBA image, returns a
 * normalized quad or null. Runs in the OpenCV worker and in Node tests.
 */

import { orderCorners, polygonArea, refineQuad, toNormalized, distance } from './geometry.js';
import { skinMask } from './skin.js';

/** @typedef {import('./geometry.js').Quad} Quad */
/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {{ width: number, height: number, data: Uint8ClampedArray | Uint8Array }} RgbaImage */

/**
 * @typedef {object} DetectOptions
 * @property {number} [maxSide] work on a copy no larger than this (speed)
 * @property {number} [minAreaRatio] smallest page, as a share of the image
 * @property {number} [maxAreaRatio] larger quads are the image border, not a page
 * @property {boolean} [ignoreSkin] drop outline points on fingers and hands
 */

/**
 * @typedef {object} Mask
 * @property {any} mat 8-bit single channel binary image
 * @property {Uint8Array | null} skip pixels to ignore (255), same size, or null
 */

/**
 * @param {any} cv OpenCV.js module
 * @param {RgbaImage} image
 * @param {DetectOptions} [options]
 * @returns {Quad | null} corners in normalized coordinates, or null
 */
export function detectPage(cv, image, {
  maxSide = 500, minAreaRatio = 0.1, maxAreaRatio = 0.95, ignoreSkin = true,
} = {}) {
  /** @type {{ delete(): void }[]} */
  const mats = [];
  /** @template {{ delete(): void }} M @param {M} m @returns {M} */
  const keep = (m) => { mats.push(m); return m; };
  try {
    const small = keep(cv.matFromImageData(image));
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    if (scale < 1) {
      const size = new cv.Size(Math.round(image.width * scale), Math.round(image.height * scale));
      cv.resize(small, small, size, 0, 0, cv.INTER_AREA);
    }
    const w = small.cols;
    const h = small.rows;
    const gray = keep(new cv.Mat());
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

    const skin = ignoreSkin ? skinZone(cv, keep, small, Math.max(w, h)) : null;
    const limits = { min: w * h * minAreaRatio, max: w * h * maxAreaRatio };
    const kernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));

    // 1. Edges: works on most backgrounds.
    const edges = keep(new cv.Mat());
    cv.Canny(gray, edges, 50, 150);
    cv.dilate(edges, edges, kernel);

    // 2. Bright area (page lighter than the background): fallback.
    const bright = keep(new cv.Mat());
    cv.threshold(gray, bright, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(bright, bright, cv.MORPH_OPEN, kernel);

    for (const mask of [edges, bright]) {
      const found = largestQuad(cv, mask, skin, limits) ?? (skin && largestQuad(cv, mask, null, limits));
      if (found) return orderCorners(toNormalized(found, w, h));
    }
    return null;
  } finally {
    for (const m of mats) m.delete();
  }
}

/**
 * Skin pixels, widened a little so the outline of a finger is covered too.
 * Returns null when there is no skin (nothing to ignore).
 * @param {any} cv
 * @param {(m: any) => any} keep
 * @param {any} rgba small RGBA image
 * @param {number} side longest side, to size the margin
 * @returns {Uint8Array | null}
 */
function skinZone(cv, keep, rgba, side) {
  const raw = skinMask({ width: rgba.cols, height: rgba.rows, data: rgba.data });
  const mat = keep(new cv.Mat(rgba.rows, rgba.cols, cv.CV_8UC1));
  mat.data.set(raw);
  // Remove isolated pixels (paper noise), then widen.
  const small = keep(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)));
  cv.morphologyEx(mat, mat, cv.MORPH_OPEN, small);
  if (cv.countNonZero(mat) === 0) return null;
  const grow = Math.max(5, Math.round(side * 0.02)) | 1;
  const wide = keep(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(grow, grow)));
  cv.dilate(mat, mat, wide);
  return new Uint8Array(mat.data);
}

/**
 * Largest convex quadrilateral among the outer contours of a binary mask.
 * @param {any} cv
 * @param {any} mask 8-bit single channel
 * @param {Uint8Array | null} skip pixels whose outline points are ignored (skin)
 * @param {{ min: number, max: number }} limits area bounds in pixels
 * @returns {Point[] | null}
 */
function largestQuad(cv, mask, skip, limits) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const width = mask.cols;
  try {
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    /** @type {Point[] | null} */
    let best = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        const box = cv.boundingRect(contour);
        if (box.width * box.height < limits.min) continue; // too small to hold a page
        /** @type {Point[]} */
        const points = [];
        const d = contour.data32S;
        for (let k = 0; k < d.length; k += 2) {
          if (!skip || skip[d[k + 1] * width + d[k]] === 0) points.push({ x: d[k], y: d[k + 1] });
        }
        if (points.length < 20) continue;
        const quad = quadFromPoints(cv, points, limits, bestArea);
        if (quad) {
          best = quad.corners;
          bestArea = quad.area;
        }
      } finally {
        contour.delete();
      }
    }
    return best;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * Convex hull of the outline points, simplified to 4 corners, then refined.
 * @param {any} cv
 * @param {Point[]} points
 * @param {{ min: number, max: number }} limits
 * @param {number} bestArea only return a quad larger than this
 * @returns {{ corners: Point[], area: number } | null}
 */
function quadFromPoints(cv, points, limits, bestArea) {
  const cloud = cv.matFromArray(points.length, 1, cv.CV_32SC2, points.flatMap((p) => [p.x, p.y]));
  const hull = new cv.Mat();
  try {
    // The hull closes the gaps left by fingers and by removed skin points.
    cv.convexHull(cloud, hull, false, true);
    if (cv.contourArea(hull) < Math.max(limits.min, bestArea)) return null;
    const rough = approxQuad(cv, hull);
    if (!rough) return null;
    const ordered = orderCorners(rough);
    const corners = refineQuad(ordered, points, distance(ordered[0], ordered[2]) * 0.03);
    const area = polygonArea(corners);
    return area >= limits.min && area <= limits.max && area > bestArea ? { corners, area } : null;
  } finally {
    cloud.delete();
    hull.delete();
  }
}

/**
 * Simplify a convex outline until it has 4 corners.
 * @param {any} cv
 * @param {any} hull
 * @returns {Point[] | null}
 */
function approxQuad(cv, hull) {
  const perimeter = cv.arcLength(hull, true);
  const approx = new cv.Mat();
  try {
    for (const factor of [0.02, 0.03, 0.04, 0.05, 0.07, 0.1]) {
      cv.approxPolyDP(hull, approx, factor * perimeter, true);
      if (approx.rows < 4) return null;
      if (approx.rows === 4) {
        const d = approx.data32S;
        return [0, 1, 2, 3].map((i) => ({ x: d[2 * i], y: d[2 * i + 1] }));
      }
    }
    return null;
  } finally {
    approx.delete();
  }
}
