/* Module Web Worker that runs OpenCV.js off the main thread, so the camera
 * preview never freezes: library loading, page detection, perspective
 * correction.
 *
 * Protocol: the page posts { id, type, payload }; the worker answers
 * { id, ok: true, result } or { id, ok: false, error, missing }.
 * Images travel as { width, height, data } with transferred buffers. */

import { whenReady, openCvVersion } from './opencv-ready.js';
import { detectPage } from '../pipeline/detect-page.js';
import { warpPage } from '../pipeline/perspective.js';
import { FULL_QUAD, splitQuad } from '../pipeline/geometry.js';
import { laplacianVariance } from '../pipeline/sharpness.js';
import { measureMotion } from '../pipeline/motion.js';
import { pageFingerprint } from '../pipeline/fingerprint.js';
import { fingerCoverage } from '../pipeline/fingers.js';
import { findBinding } from '../pipeline/binding.js';
import { enhancePage } from '../pipeline/enhance.js';

const OPENCV_URL = new URL('../vendor/opencv/opencv.js', import.meta.url);

/** @type {any} */
let cv = null;

/** @type {{ width: number, height: number, data: Uint8ClampedArray } | null} */
let lastDetectFrame = null;

/** Thrown when opencv.js cannot be fetched. */
class MissingError extends Error {}

async function load() {
  let code;
  try {
    const response = await fetch(OPENCV_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    code = await response.text();
  } catch (error) {
    throw new MissingError(String(error));
  }
  // Module workers cannot use importScripts(): run the UMD script in the
  // global scope with an indirect eval. It defines self.cv.
  (0, eval)(code);
  cv = await whenReady(/** @type {any} */ (self).cv);
  const mat = new cv.Mat(2, 2, cv.CV_8UC1); // smoke test
  mat.delete();
  return { version: openCvVersion(cv) };
}

/**
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} image
 * @returns {{ result: object, transfer: Transferable[] }}
 */
const withImage = (image) => ({ result: { image }, transfer: [image.data.buffer] });

/** @type {Record<string, (payload: any) => any>} */
const handlers = {
  load,

  /** Live preview: find the page in a small frame and measure it on the
   * straightened page (sharpness, fingerprint, finger on the text, light,
   * double page and binding), plus the motion since the previous frame. */
  detect: ({ image, measureQuality = true }) => {
    const quad = detectPage(cv, image);
    let sharpness = null;
    let motion = null;
    /** @type {object} */
    let page = {};
    if (measureQuality) {
      if (quad) {
        const straight = warpPage(cv, image, quad, { maxSide: 500 });
        const fingerprint = pageFingerprint(straight);
        sharpness = laplacianVariance(cv, straight);
        page = {
          fingerprint,
          brightness: fingerprint.mean,
          finger: fingerCoverage(straight),
          ...findBinding(straight),
        };
      } else {
        sharpness = laplacianVariance(cv, image);
      }
      if (lastDetectFrame && lastDetectFrame.width === image.width && lastDetectFrame.height === image.height) {
        motion = measureMotion(lastDetectFrame, image);
      } else {
        motion = { meanDelta: 0, movingRatio: 0, score: 0 };
      }
      lastDetectFrame = {
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(image.data),
      };
    }
    return { quad, sharpness, motion, ...page };
  },

  /** Measure sharpness (variance of Laplacian) on an image (or within a quad). */
  sharpness: ({ image, quad, maxSide }) => ({
    variance: laplacianVariance(cv, image, { quad, maxSide }),
  }),

  /** Measure motion between two frames. */
  motion: ({ prev, curr, threshold }) => measureMotion(prev, curr, { threshold }),

  /** Reset state between sessions or orientations. */
  reset: () => {
    lastDetectFrame = null;
    return { ok: true };
  },

  /** Straighten an image with known corners (manual adjustment). */
  warp: ({ image, quad }) => withImage(warpPage(cv, image, quad)),

  /** Capture: detect the page on the full frame (else use the last live
   * detection, else the whole image), then straighten it. With `split`, a
   * double page is cut at the binding into two pages (left first). Each
   * page is then enhanced with `corrections` (see pipeline/enhance.js). */
  process: ({ image, fallback, split = false, corrections }) => {
    const detected = detectPage(cv, image) ?? fallback ?? null;
    const used = detected ?? FULL_QUAD;
    /** @type {any[]} */
    let quads = [used];
    if (split && detected) {
      const { spread, gutter } = findBinding(warpPage(cv, image, used, { maxSide: 800 }));
      if (spread && gutter !== null) quads = splitQuad(used, gutter);
    }
    const pages = quads.map((quad) => {
      const straight = warpPage(cv, image, quad);
      const { applied, ...enhanced } = enhancePage(cv, straight, corrections);
      return { quad, image: straight, enhanced, applied };
    });
    return {
      result: { pages, detected: Boolean(detected), spread: pages.length > 1 },
      transfer: pages.flatMap((p) => [p.image.data.buffer, p.enhanced.data.buffer]),
    };
  },

  /** Enhance a straightened page again (a correction turned on or off). */
  enhance: ({ image, corrections }) => {
    const { applied, ...enhanced } = enhancePage(cv, image, corrections);
    return { result: { image: enhanced, applied }, transfer: [enhanced.data.buffer] };
  },
};

self.onmessage = async (event) => {
  const { id, type, payload } = event.data ?? {};
  try {
    const handler = handlers[type];
    if (!handler) throw new Error(`unknown request: ${type}`);
    if (type !== 'load' && !cv) throw new Error('OpenCV.js is not loaded');
    const answer = await handler(payload ?? {});
    if (answer && 'transfer' in answer) {
      self.postMessage({ id, ok: true, result: answer.result }, { transfer: answer.transfer });
    } else {
      self.postMessage({ id, ok: true, result: answer });
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error), missing: error instanceof MissingError });
  }
};
