/**
 * Image orientation: a quarter-turn rotation and a horizontal mirror, used
 * for the camera preview and capture, and for each page afterwards.
 * The mirror is applied first, then the rotation (clockwise).
 */

/**
 * @typedef {object} Orientation
 * @property {0 | 90 | 180 | 270} rotation clockwise, in degrees
 * @property {boolean} mirror flipped left to right
 */

/** @type {Readonly<Orientation>} */
export const NO_ORIENTATION = Object.freeze({ rotation: 0, mirror: false });

/**
 * Normalize any angle to a quarter turn in 0..270.
 * @param {number} degrees
 * @returns {Orientation['rotation']}
 */
export function normalizeRotation(degrees) {
  const quarter = Math.round(Number(degrees) / 90) || 0;
  return /** @type {Orientation['rotation']} */ ((((quarter % 4) + 4) % 4) * 90);
}

/**
 * Turn by a quarter: +90 clockwise, -90 counterclockwise.
 * @param {Orientation} orientation
 * @param {number} delta
 * @returns {Orientation}
 */
export function rotate(orientation, delta) {
  return { ...orientation, rotation: normalizeRotation(orientation.rotation + delta) };
}

/**
 * @param {Orientation} orientation
 * @returns {Orientation}
 */
export function toggleMirror(orientation) {
  return { ...orientation, mirror: !orientation.mirror };
}

/**
 * Size of the picture once oriented (sides swap on a quarter turn).
 * @param {number} width
 * @param {number} height
 * @param {Orientation} orientation
 * @returns {{ width: number, height: number }}
 */
export function orientedSize(width, height, { rotation }) {
  return rotation % 180 ? { width: height, height: width } : { width, height };
}

/**
 * Draw a source oriented on a canvas, resized to `width` × `height` before
 * orientation. The canvas is resized to fit the oriented picture.
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasImageSource} source
 * @param {number} width
 * @param {number} height
 * @param {Orientation} orientation
 * @param {CanvasRenderingContext2DSettings} [settings]
 * @returns {CanvasRenderingContext2D}
 */
export function drawOriented(canvas, source, width, height, orientation, settings) {
  const size = orientedSize(width, height, orientation);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', settings));
  ctx.save();
  ctx.translate(size.width / 2, size.height / 2);
  ctx.rotate((orientation.rotation * Math.PI) / 180);
  ctx.scale(orientation.mirror ? -1 : 1, 1);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  ctx.restore();
  return ctx;
}

/**
 * CSS transform showing an element with this orientation.
 * @param {Orientation} orientation
 * @returns {string}
 */
export function orientationTransform({ rotation, mirror }) {
  return `rotate(${rotation}deg)${mirror ? ' scaleX(-1)' : ''}`;
}
