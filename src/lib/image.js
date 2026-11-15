/**
 * Browser image helpers: grab a video frame, encode and decode JPEG.
 */

import { NO_ORIENTATION, drawOriented } from './orientation.js';

/** @typedef {import('./orientation.js').Orientation} Orientation */

/**
 * Copy the current video frame into an ImageData, optionally downscaled,
 * rotated and mirrored.
 * @param {HTMLVideoElement} video
 * @param {number} [maxSide] longest side of the result
 * @param {HTMLCanvasElement} [canvas] reused canvas (live loop)
 * @param {Orientation} [orientation]
 * @returns {ImageData}
 */
export function grabFrame(video, maxSide = Infinity, canvas = document.createElement('canvas'), orientation = NO_ORIENTATION) {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = drawOriented(canvas, video, width, height, orientation, { willReadFrequently: true });
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Re-encode an image file rotated and mirrored.
 * @param {Blob} blob
 * @param {Orientation} orientation
 * @param {number} [quality] 0..1
 * @returns {Promise<Blob>}
 */
export async function orientJpeg(blob, orientation, quality = 0.9) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    drawOriented(canvas, bitmap, bitmap.width, bitmap.height, orientation);
  } finally {
    bitmap.close();
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg', quality);
  });
}

/**
 * Encode RGBA pixels as JPEG. The pixels are copied synchronously, so the
 * caller may transfer `image.data.buffer` right after calling this.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} image
 * @param {number} [quality] 0..1
 * @returns {Promise<Blob>}
 */
export function imageToJpeg(image, quality = 0.9) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const pixels = image instanceof ImageData ? image : new ImageData(image.data, image.width, image.height);
  ctx.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg', quality);
  });
}

/**
 * Decode an image file into RGBA pixels.
 * @param {Blob} blob
 * @returns {Promise<ImageData>}
 */
export async function blobToImageData(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
