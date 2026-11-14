/* Classic Web Worker that loads OpenCV.js off the main thread, so the
 * camera preview never freezes while the WebAssembly module compiles.
 * Later image processing will run here too. */
/* global cv, importScripts */

const OPENCV_URL = '../vendor/opencv/opencv.js';

/**
 * Wait until the OpenCV runtime is ready. Builds differ: `cv` can be a
 * factory function, a Promise, an Emscripten thenable Module (whose `then`
 * passes itself, so it must not be awaited) or a plain Module object.
 * @returns {Promise<any>}
 */
function whenReady() {
  return new Promise((resolve, reject) => {
    let mod = self.cv;
    if (typeof mod === 'function' && !mod.Mat) mod = mod();
    if (!mod) return reject(new Error('cv is undefined'));
    if (mod.Mat) return resolve(mod);
    if (mod instanceof Promise) return mod.then(resolve, reject);
    if (typeof mod.then === 'function') {
      mod.then((m) => {
        if (m && typeof m.then === 'function') delete m.then;
        resolve(m);
      });
      return undefined;
    }
    mod.onRuntimeInitialized = () => resolve(mod);
    return undefined;
  });
}

self.onmessage = async (event) => {
  if (event.data?.type !== 'load') return;
  try {
    importScripts(OPENCV_URL);
  } catch (error) {
    self.postMessage({ type: 'error', missing: true, message: String(error) });
    return;
  }
  try {
    const mod = await whenReady();
    self.cv = mod;
    const info = mod.getBuildInformation?.() ?? '';
    const version = /OpenCV\s+(\d+\.\d+\.\d+)/.exec(info)?.[1] ?? '?';
    // Smoke test: allocate and free a matrix.
    const mat = new mod.Mat(2, 2, mod.CV_8UC1);
    mat.delete();
    self.postMessage({ type: 'ready', version });
  } catch (error) {
    self.postMessage({ type: 'error', missing: false, message: String(error) });
  }
};
