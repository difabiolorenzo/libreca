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
import { FULL_QUAD } from '../pipeline/geometry.js';

const OPENCV_URL = new URL('../vendor/opencv/opencv.js', import.meta.url);

/** @type {any} */
let cv = null;

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

  /** Live preview: find the page in a small frame. */
  detect: ({ image }) => ({ quad: detectPage(cv, image) }),

  /** Straighten an image with known corners (manual adjustment). */
  warp: ({ image, quad }) => withImage(warpPage(cv, image, quad)),

  /** Capture: detect the page on the full frame (else use the last live
   * detection, else the whole image), then straighten it. */
  process: ({ image, fallback }) => {
    const detected = detectPage(cv, image) ?? fallback ?? null;
    const used = detected ?? FULL_QUAD;
    const out = withImage(warpPage(cv, image, used));
    Object.assign(out.result, { quad: used, detected: Boolean(detected) });
    return out;
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
