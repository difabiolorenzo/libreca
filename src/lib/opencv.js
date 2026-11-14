/**
 * Load OpenCV.js in a dedicated Web Worker (see opencv-worker.js).
 * The library is served locally from src/vendor/opencv/, never from a CDN.
 */

/**
 * @typedef {{ worker: Worker, version: string }} OpenCvHandle
 */

/** @type {Promise<OpenCvHandle> | null} */
let loading = null;

/** Error thrown when src/vendor/opencv/opencv.js is absent. */
export class OpenCvMissingError extends Error {}

/**
 * @param {number} [timeoutMs] give up after this delay
 * @returns {Promise<OpenCvHandle>}
 */
export function loadOpenCV(timeoutMs = 60000) {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./opencv-worker.js', import.meta.url));
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`timeout after ${timeoutMs} ms`));
    }, timeoutMs);
    worker.onmessage = (event) => {
      const msg = event.data;
      clearTimeout(timer);
      if (msg.type === 'ready') {
        resolve({ worker, version: msg.version });
      } else {
        worker.terminate();
        reject(msg.missing ? new OpenCvMissingError(msg.message) : new Error(msg.message));
      }
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message || 'worker error'));
    };
    worker.postMessage({ type: 'load' });
  });
  loading.catch(() => { loading = null; });
  return loading;
}
