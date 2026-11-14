/**
 * Wait until an OpenCV.js runtime is ready. Builds differ: the exported
 * value can be a factory function, a Promise, an Emscripten thenable Module
 * (whose `then` passes itself, so it must not be awaited) or a plain Module.
 * Shared by the worker and the Node tests.
 *
 * @param {any} mod value exported by opencv.js
 * @returns {Promise<any>} the module, with `Mat` available
 */
export function whenReady(mod) {
  return new Promise((resolve, reject) => {
    if (typeof mod === 'function' && !mod.Mat) mod = mod();
    if (!mod) return reject(new Error('cv is undefined'));
    if (mod.Mat) return resolve(mod);
    if (mod instanceof Promise) return mod.then(resolve, reject);
    if (typeof mod.then === 'function') {
      mod.then((/** @type {any} */ m) => {
        if (m && typeof m.then === 'function') delete m.then;
        resolve(m);
      });
      return undefined;
    }
    mod.onRuntimeInitialized = () => resolve(mod);
    return undefined;
  });
}

/**
 * Read the version from the build information.
 * @param {any} cv
 * @returns {string}
 */
export function openCvVersion(cv) {
  const info = cv.getBuildInformation?.() ?? '';
  return /OpenCV\s+(\d+\.\d+\.\d+)/.exec(info)?.[1] ?? '?';
}
