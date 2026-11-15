/**
 * OpenCV.js runs in a dedicated module Web Worker (see opencv-worker.js).
 * The library is served locally from src/vendor/opencv/, never from a CDN.
 * This module loads it and forwards requests (detect, warp, process, enhance).
 */

/**
 * @typedef {{ worker: Worker, version: string }} OpenCvHandle
 */

/** @type {Promise<OpenCvHandle> | null} */
let loading = null;
let nextId = 1;
/** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
const pending = new Map();

/** Error thrown when src/vendor/opencv/opencv.js is absent. */
export class OpenCvMissingError extends Error {}

/** @param {Error} error */
function failAll(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

/**
 * @param {Worker} target
 * @param {string} type
 * @param {object} payload
 * @param {Transferable[]} transfer
 * @returns {Promise<any>}
 */
function send(target, type, payload, transfer) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    target.postMessage({ id, type, payload }, transfer);
  });
}

/**
 * @param {number} [timeoutMs] give up loading after this delay
 * @returns {Promise<OpenCvHandle>}
 */
export function loadOpenCV(timeoutMs = 60000) {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const w = new Worker(new URL('./opencv-worker.js', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      w.terminate();
      failAll(new Error(`timeout after ${timeoutMs} ms`));
    }, timeoutMs);
    w.onmessage = (event) => {
      const msg = event.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(msg.missing ? new OpenCvMissingError(msg.error) : new Error(msg.error));
    };
    w.onerror = (event) => {
      event.preventDefault();
      failAll(new Error(event.message || 'worker error'));
    };
    send(w, 'load', {}, []).then(
      ({ version }) => { clearTimeout(timer); resolve({ worker: w, version }); },
      (error) => { clearTimeout(timer); w.terminate(); reject(error); },
    );
  });
  loading.catch(() => { loading = null; });
  return loading;
}

/**
 * Send a request to the OpenCV worker (loads it first if needed).
 * @param {'detect' | 'warp' | 'process' | 'enhance'} type
 * @param {object} payload
 * @param {Transferable[]} [transfer] buffers handed over (no copy)
 * @returns {Promise<any>}
 */
export async function callOpenCV(type, payload, transfer = []) {
  const { worker: w } = await loadOpenCV();
  return send(w, type, payload, transfer);
}
