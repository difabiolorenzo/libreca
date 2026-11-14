// Load the local OpenCV.js in Node for pipeline tests. The file is a UMD
// script that needs CommonJS globals, so it is run with new Function().
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { whenReady } from '../../src/lib/opencv-ready.js';

const OPENCV_PATH = fileURLToPath(new URL('../../src/vendor/opencv/opencv.js', import.meta.url));

/** @returns {Promise<boolean>} */
export async function hasOpenCV() {
  try {
    await access(OPENCV_PATH);
    return true;
  } catch {
    return false;
  }
}

/** @type {Promise<any> | null} */
let loading = null;

/** @returns {Promise<any>} the OpenCV.js module */
export function loadOpenCvForTests() {
  loading ??= (async () => {
    const code = await readFile(OPENCV_PATH, 'utf8');
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', '__filename', '__dirname', code)(
      module, module.exports, createRequire(OPENCV_PATH), OPENCV_PATH, '.');
    return whenReady(module.exports);
  })();
  return loading;
}
